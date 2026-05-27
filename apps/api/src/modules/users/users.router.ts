import { Router } from 'express';
import multer from 'multer';
import { authenticate as requireAuth } from '../../middleware/authenticate';
import { prisma } from '../../config/database';
import { supabaseAdmin } from '../../config/supabase';
import { env } from '../../config/env';

export const usersRouter: Router = Router();

// ── Avatar upload configuration ─────────────────────────────────────────────
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: AVATAR_MAX_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
      return;
    }
    cb(null, true);
  },
});

// Get settings
usersRouter.get('/me/settings', requireAuth, async (req, res) => {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: req.user!.id }
    });
    res.json(settings ? settings.payload : {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
usersRouter.put('/me/settings', requireAuth, async (req, res) => {
  try {
    const { payload } = req.body;
    
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user!.id },
      update: { payload },
      create: {
        userId: req.user!.id,
        payload
      }
    });
    
    res.json(settings.payload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Upload avatar
usersRouter.post('/me/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const userId = req.user!.id;
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'png';
    const storagePath = `avatars/${userId}/avatar.${ext}`;
    const bucket = env.SUPABASE_STORAGE_BUCKET;

    // Upload to Supabase Storage (upsert to overwrite previous avatar)
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      res.status(500).json({ error: 'Failed to upload avatar' });
      return;
    }

    // Get the public URL for the uploaded avatar
    const { data: urlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    const avatarUrl = urlData.publicUrl;

    res.json({ avatarUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Update profile (display name and/or avatar URL)
usersRouter.put('/me/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, avatarUrl } = req.body;

    // Validate that at least one field is provided
    if (displayName === undefined && avatarUrl === undefined) {
      res.status(400).json({ error: 'At least one of displayName or avatarUrl must be provided' });
      return;
    }

    // Validate displayName if provided
    if (displayName !== undefined) {
      if (typeof displayName !== 'string') {
        res.status(400).json({ error: 'displayName must be a string' });
        return;
      }
      const trimmed = displayName.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        res.status(400).json({ error: 'displayName must be between 1 and 100 characters' });
        return;
      }
    }

    // Validate avatarUrl if provided
    if (avatarUrl !== undefined && avatarUrl !== null) {
      if (typeof avatarUrl !== 'string') {
        res.status(400).json({ error: 'avatarUrl must be a string or null' });
        return;
      }
      // Basic URL format validation
      try {
        new URL(avatarUrl);
      } catch {
        res.status(400).json({ error: 'avatarUrl must be a valid URL' });
        return;
      }
    }

    const userId = req.user!.id;

    // Update displayName on User model if provided
    if (displayName !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: { displayName: displayName.trim() },
      });
    }

    // Update avatarUrl on UserProfile model if provided
    if (avatarUrl !== undefined) {
      await prisma.userProfile.upsert({
        where: { userId },
        update: { avatarUrl: avatarUrl || null },
        create: { userId, avatarUrl: avatarUrl || null },
      });
    }

    // Fetch and return the updated profile data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        profile: {
          select: {
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      id: user!.id,
      email: user!.email,
      displayName: user!.displayName,
      avatarUrl: user!.profile?.avatarUrl ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
