import type { NextFunction, Request, Response } from 'express';

import { supabaseAdmin } from '../config/supabase';
import { Errors } from './errorHandler';

/**
 * Augment Express Request to include authenticated user
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

/**
 * Authentication middleware — verifies Supabase JWT from Authorization header.
 * Sets req.user on success, throws 401 on failure.
 *
 * Usage: router.get('/protected', authenticate, handler)
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw Errors.unauthorized('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw Errors.unauthorized('Invalid or expired token');
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
      role: data.user.role ?? 'authenticated',
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication — sets req.user if token present, but doesn't block.
 * Use for routes that support both auth and anonymous access.
 */
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const token = authHeader.slice(7);
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data.user) {
      req.user = {
        id: data.user.id,
        email: data.user.email ?? '',
        role: data.user.role ?? 'authenticated',
      };
    }
  } catch {
    // Swallow errors for optional auth
  }

  next();
}
