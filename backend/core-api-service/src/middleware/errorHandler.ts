import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '@core-meme/shared';

const logger = createLogger({ 
  service: 'core-api-service',
  enableFileLogging: true
});

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle known API errors
  if (err.message.includes('not found')) {
    res.status(404).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (err.message.includes('unauthorized') || err.message.includes('forbidden')) {
    res.status(403).json({
      success: false,
      error: 'Access denied',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
}