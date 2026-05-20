import type { Socket } from 'socket.io';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@slidebot/shared-types';

import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../config/logger';
import { getPresenceColor } from '@slidebot/shared-utils';

type SocketMiddleware = (
  socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  next: (err?: Error) => void
) => void;

/**
 * Socket.IO authentication middleware.
 * Verifies the Supabase JWT passed as handshake auth token.
 * Sets socket.data.userId and other user context on success.
 */
export const socketAuthMiddleware: SocketMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth['token'] as string | undefined;

    if (!token) {
      next(new Error('UNAUTHORIZED: Missing auth token'));
      return;
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      next(new Error('UNAUTHORIZED: Invalid or expired token'));
      return;
    }

    const user = data.user;
    const displayName =
      (user.user_metadata as Record<string, string> | undefined)?.['display_name'] ??
      user.email?.split('@')[0] ??
      'Anonymous';
    const avatarUrl =
      (user.user_metadata as Record<string, string> | undefined)?.['avatar_url'] ?? null;

    // Attach user data to socket — available in all handlers
    socket.data = {
      userId: user.id,
      displayName,
      avatarUrl,
      color: getPresenceColor(user.id),
      role: 'viewer',
      currentDeckId: null,
      currentSlideId: null,
    };

    logger.debug({ userId: user.id, socketId: socket.id }, 'Socket authenticated');
    next();
  } catch (err) {
    logger.error({ err }, 'Socket auth middleware error');
    next(new Error('INTERNAL_ERROR'));
  }
};
