import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '@core-meme/shared';

const logger = createLogger({ service: 'auth-middleware' });
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    telegramId: number;
    username?: string;
    walletAddress?: string;
  };
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided'
      });
      return;
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      (req as AuthRequest).user = {
        id: decoded.userId,
        telegramId: decoded.telegramId,
        username: decoded.username,
        walletAddress: decoded.walletAddress
      };
      
      next();
    } catch (error) {
      logger.error('Invalid token', { error });
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
  } catch (error) {
    logger.error('Authentication error', { error });
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}