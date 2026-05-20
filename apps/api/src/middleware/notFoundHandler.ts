import type { NextFunction, Request, Response } from 'express';

/** Handles all unmatched routes — returns a JSON 404 */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
}
