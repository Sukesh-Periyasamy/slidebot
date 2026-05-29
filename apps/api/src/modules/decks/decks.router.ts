import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate } from '../../middleware/authenticate';
import { validatePptx } from './pptx-validator';
import { extractPptxMetadata } from './pptx-metadata';
import { enqueueConversionJob } from './conversion-queue';

// TODO: Wire up decks controller
const router: ExpressRouter = Router();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

function isPptxExtension(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pptx');
}

function isAcceptedFile(mimetype: string, originalname: string): boolean {
  if (ALLOWED_MIME_TYPES.includes(mimetype)) return true;
  // Accept .pptx extension regardless of reported MIME type (per Requirement 1.2)
  if (isPptxExtension(originalname)) return true;
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAcceptedFile(file.mimetype, file.originalname)) {
      cb(new Error('Please upload a valid PDF or PPTX file.'));
      return;
    }
    cb(null, true);
  },
});

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-');
}

async function createSignedUrl(storagePath: string): Promise<string> {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const expiresIn = env.SUPABASE_SIGNED_URL_EXPIRES_SEC;
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Failed to create signed URL');
  }
  return data.signedUrl;
}

async function ensureUserRecord(user: { id: string; email: string }): Promise<void> {
  await prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email,
      displayName: user.email.split('@')[0] || 'slidebot-user',
    },
    create: {
      id: user.id,
      email: user.email,
      displayName: user.email.split('@')[0] || 'slidebot-user',
    },
  });
}

/**
 * GET /api/v1/decks
 * List all decks the user owns or collaborates on
 */
router.get('/', authenticate, (_req, res) => {
  // TODO: decksService.listDecks(req.user.id)
  res.json({ data: [] });
});

/**
 * POST /api/v1/decks
 * Create a new deck
 */
router.post('/', authenticate, (_req, res) => {
  // TODO: validate body, decksService.createDeck(...)
  res.status(201).json({ data: {} });
});

/**
 * POST /api/v1/decks/upload
 * Upload a PDF or PPTX deck
 */
router.post('/upload', authenticate, (req, res) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      const isLimitError = message.toLowerCase().includes('file too large');
      res.status(400).json({
        error: isLimitError ? 'File is too large. Maximum size is 100MB.' : message,
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Missing file upload' });
      return;
    }

    if (!isAcceptedFile(file.mimetype, file.originalname)) {
      res.status(400).json({ error: 'Please upload a valid PDF or PPTX file.' });
      return;
    }

    const isPptx =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      isPptxExtension(file.originalname);

    void (async () => {
      try {
        const ownerId = req.user?.id;
        const ownerEmail = req.user?.email ?? '';
        if (!ownerId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        if (isPptx) {
          await handlePptxUpload(req, res, file, ownerId, ownerEmail);
        } else {
          await handlePdfUpload(req, res, file, ownerId, ownerEmail);
        }
      } catch (uploadFlowErr) {
        const message =
          uploadFlowErr instanceof Error ? uploadFlowErr.message : 'Unexpected upload failure';
        res.status(500).json({ error: message });
      }
    })();
  });
});

async function handlePdfUpload(
  _req: import('express').Request,
  res: import('express').Response,
  file: Express.Multer.File,
  ownerId: string,
  ownerEmail: string,
): Promise<void> {
  const slides = Math.max(1, Math.ceil(file.size / 180_000));
  const safeName = sanitizeFilename(file.originalname || 'presentation.pdf');
  const deckId = crypto.randomUUID();
  const storagePath = `${ownerId}/${deckId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
    return;
  }

  await ensureUserRecord({ id: ownerId, email: ownerEmail });

  const deck = await prisma.deck.create({
    data: {
      id: deckId,
      ownerId,
      name: file.originalname || 'presentation.pdf',
      storagePath,
      slides,
      sourceType: 'pdf',
    },
  });

  const room = await prisma.room.create({
    data: {
      deckId: deck.id,
      presenterId: ownerId,
      participants: {
        create: {
          userId: ownerId,
          role: 'presenter',
        },
      },
    },
  });

  const signedUrl = await createSignedUrl(storagePath);
  res.status(201).json({
    deckId: deck.id,
    roomId: room.id,
    name: deck.name,
    slides: deck.slides,
    storagePath,
    signedUrl,
    signedUrlExpiresIn: env.SUPABASE_SIGNED_URL_EXPIRES_SEC,
  });
}

async function handlePptxUpload(
  _req: import('express').Request,
  res: import('express').Response,
  file: Express.Multer.File,
  ownerId: string,
  ownerEmail: string,
): Promise<void> {
  // Structural validation using PPTX Validator
  const validationResult = await validatePptx(file.buffer);

  if (!validationResult.valid) {
    res.status(400).json({ error: validationResult.error });
    return;
  }

  // Extract metadata from the PPTX file
  const originalFilename = file.originalname || 'presentation.pptx';
  const filenameWithoutExt = originalFilename.replace(/\.pptx$/i, '');
  const userDisplayName = ownerEmail.split('@')[0] || 'slidebot-user';

  const metadata = extractPptxMetadata(file.buffer, {
    filename: filenameWithoutExt,
    userDisplayName,
  });

  // Upload to Supabase Storage
  const safeName = sanitizeFilename(originalFilename);
  const deckId = crypto.randomUUID();
  const storagePath = `${ownerId}/${deckId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      upsert: false,
    });

  if (uploadError) {
    res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
    return;
  }

  await ensureUserRecord({ id: ownerId, email: ownerEmail });

  // Create Deck record with sourceType: 'pptx'
  const deck = await prisma.deck.create({
    data: {
      id: deckId,
      ownerId,
      name: metadata.title,
      storagePath,
      slides: metadata.slideCount,
      sourceType: 'pptx',
      author: metadata.author,
      conversionStatus: 'pending',
    },
  });

  // Enqueue conversion job for server-side LibreOffice PDF conversion
  await enqueueConversionJob({
    deckId,
    storagePath,
    ownerId,
  });

  const room = await prisma.room.create({
    data: {
      deckId: deck.id,
      presenterId: ownerId,
      participants: {
        create: {
          userId: ownerId,
          role: 'presenter',
        },
      },
    },
  });

  const signedUrl = await createSignedUrl(storagePath);
  res.status(201).json({
    deckId: deck.id,
    roomId: room.id,
    name: deck.name,
    slides: deck.slides,
    sourceType: 'pptx',
    author: metadata.author,
    conversionStatus: 'pending',
    storagePath,
    signedUrl,
    signedUrlExpiresIn: env.SUPABASE_SIGNED_URL_EXPIRES_SEC,
  });
}

/**
 * GET /api/v1/decks/:id
 * Get a single deck with all slides
 */
router.get('/:id', authenticate, (req, res) => {
  void (async () => {
    const rawDeckId = req.params['id'];
    const deckId = Array.isArray(rawDeckId) ? rawDeckId[0] : rawDeckId;
    const userId = req.user?.id;

    if (!deckId || !userId) {
      res.status(400).json({ error: 'Invalid deck request' });
      return;
    }

    const record = await prisma.deck.findUnique({
      where: { id: deckId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        slides: true,
        storagePath: true,
        createdAt: true,
      },
    });

    if (!record) {
      res.status(404).json({ error: 'Deck not found' });
      return;
    }
    if (record.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      const signedUrl = await createSignedUrl(record.storagePath);
      res.json({
        data: {
          deckId: record.id,
          name: record.name,
          slides: record.slides,
          storagePath: record.storagePath,
          signedUrl,
          signedUrlExpiresIn: env.SUPABASE_SIGNED_URL_EXPIRES_SEC,
        },
      });
    } catch (signedUrlError) {
      const message =
        signedUrlError instanceof Error ? signedUrlError.message : 'Failed to resolve deck URL';
      res.status(500).json({ error: message });
    }
  })();
});

/**
 * PATCH /api/v1/decks/:id
 * Update deck metadata
 */
router.patch('/:id', authenticate, (_req, res) => {
  // TODO: decksService.updateDeck(...)
  res.json({ data: {} });
});

/**
 * DELETE /api/v1/decks/:id
 * Delete a deck (owner only)
 */
router.delete('/:id', authenticate, (_req, res) => {
  // TODO: decksService.deleteDeck(...)
  res.status(204).send();
});

/**
 * POST /api/v1/decks/:id/duplicate
 * Duplicate a deck
 */
router.post('/:id/duplicate', authenticate, (_req, res) => {
  // TODO: decksService.duplicateDeck(...)
  res.status(201).json({ data: {} });
});

export { router as decksRouter };
