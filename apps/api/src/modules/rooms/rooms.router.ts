import { Router, type Router as ExpressRouter } from 'express';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate } from '../../middleware/authenticate';

const router: ExpressRouter = Router();

function readParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] ?? '';
  }
  return param ?? '';
}

async function createSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, env.SUPABASE_SIGNED_URL_EXPIRES_SEC);

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

router.get('/', authenticate, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const rooms = await prisma.room.findMany({
    where: {
      OR: [{ presenterId: userId }, { participants: { some: { userId } } }],
    },
    include: {
      deck: {
        select: {
          id: true,
          name: true,
          slides: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({
    data: rooms.map((room) => ({
      roomId: room.id,
      deckId: room.deckId,
      status: room.status,
      createdAt: room.createdAt.toISOString(),
      endedAt: room.endedAt?.toISOString() ?? null,
      deck: {
        deckId: room.deck.id,
        name: room.deck.name,
        slides: room.deck.slides,
      },
    })),
  });
});

router.post('/', authenticate, async (req, res) => {
  const userId = req.user?.id;
  const email = req.user?.email ?? '';
  const deckIdRaw = req.body?.deckId;
  const deckId = typeof deckIdRaw === 'string' ? deckIdRaw : '';

  if (!userId || !deckId) {
    res.status(400).json({ error: 'deckId is required' });
    return;
  }

  await ensureUserRecord({ id: userId, email });

  const deck = await prisma.deck.findUnique({ where: { id: deckId } });
  if (!deck) {
    res.status(404).json({ error: 'Deck not found' });
    return;
  }
  if (deck.ownerId !== userId) {
    res.status(403).json({ error: 'Only deck owner can create rooms' });
    return;
  }

  const room = await prisma.room.create({
    data: {
      deckId,
      presenterId: userId,
      participants: {
        create: {
          userId,
          role: 'presenter',
        },
      },
    },
  });

  res.status(201).json({
    data: {
      roomId: room.id,
      deckId: room.deckId,
      presenterId: room.presenterId,
      status: room.status,
      createdAt: room.createdAt.toISOString(),
    },
  });
});

router.get('/:id', authenticate, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const roomId = readParam(req.params['id']);
  if (!roomId) {
    res.status(400).json({ error: 'Invalid room id' });
    return;
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      deck: {
        select: {
          id: true,
          ownerId: true,
          name: true,
          slides: true,
          storagePath: true,
        },
      },
      participants: {
        where: {
          leftAt: null,
        },
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          leftAt: true,
        },
      },
    },
  });

  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const isParticipant = room.participants.some((p) => p.userId === userId);
  const isDeckOwner = room.deck.ownerId === userId;
  if (!isParticipant && !isDeckOwner) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const signedUrl = await createSignedUrl(room.deck.storagePath);

  res.json({
    data: {
      roomId: room.id,
      deckId: room.deckId,
      presenterId: room.presenterId,
      status: room.status,
      createdAt: room.createdAt.toISOString(),
      endedAt: room.endedAt?.toISOString() ?? null,
      deck: {
        deckId: room.deck.id,
        name: room.deck.name,
        slides: room.deck.slides,
        storagePath: room.deck.storagePath,
        signedUrl,
        signedUrlExpiresIn: env.SUPABASE_SIGNED_URL_EXPIRES_SEC,
      },
      participants: room.participants.map((participant) => ({
        userId: participant.userId,
        role: participant.role,
        joinedAt: participant.joinedAt.toISOString(),
        leftAt: participant.leftAt?.toISOString() ?? null,
      })),
    },
  });
});

router.post('/:id/join', authenticate, async (req, res) => {
  const roomId = readParam(req.params['id']);
  const userId = req.user?.id;
  const email = req.user?.email ?? '';
  if (!roomId || !userId) {
    res.status(400).json({ error: 'Invalid join request' });
    return;
  }

  await ensureUserRecord({ id: userId, email });

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== 'active') {
    res.status(404).json({ error: 'Room not found or inactive' });
    return;
  }

  const role = room.presenterId === userId ? 'presenter' : 'viewer';

  await prisma.roomParticipant.upsert({
    where: {
      roomId_userId: { roomId, userId },
    },
    update: {
      role,
      leftAt: null,
      joinedAt: new Date(),
    },
    create: {
      roomId,
      userId,
      role,
      joinedAt: new Date(),
      leftAt: null,
    },
  });

  res.json({ data: { ok: true } });
});

router.post('/:id/leave', authenticate, async (req, res) => {
  const roomId = readParam(req.params['id']);
  const userId = req.user?.id;
  if (!roomId || !userId) {
    res.status(400).json({ error: 'Invalid leave request' });
    return;
  }

  await prisma.roomParticipant.updateMany({
    where: {
      roomId,
      userId,
      leftAt: null,
    },
    data: {
      leftAt: new Date(),
    },
  });

  res.json({ data: { ok: true } });
});

export { router as roomsRouter };
