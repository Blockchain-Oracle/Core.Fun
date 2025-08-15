import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '@core-meme/shared';

const logger = createLogger({ service: 'auth-middleware' });

export interface AuthUser {
  id: string;
  telegramId: number;
  username?: string;
  walletAddress?: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret', (err: any, decoded: any) => {
      if (err) {
        logger.warn('Invalid token:', err);
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      // Attach user to request
      (req as any).user = decoded;
      next();
    });
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}