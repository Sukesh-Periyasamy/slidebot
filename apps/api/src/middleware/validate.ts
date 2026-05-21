import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

import { Errors } from './errorHandler';

type RequestPart = 'body' | 'params' | 'query';

/**
 * Generic Zod validation middleware factory.
 *
 * @example
 * router.post('/', validate('body', createDeckSchema), handler)
 * router.get('/', validate('query', paginationSchema), handler)
 */
export function validate(part: RequestPart, schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[part]);
      // Replace the original data with the parsed (and coerced) data
      (req as unknown as Record<string, unknown>)[part] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.flatten().fieldErrors as Record<string, string[]>;
        next(Errors.badRequest('Validation failed', details));
      } else {
        next(err);
      }
    }
  };
}
