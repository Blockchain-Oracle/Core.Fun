import { Router, Request, Response } from 'express';
import { CoreAPIService } from '../services/CoreAPIService';

const router: Router = Router();

// GET /health
router.get('/', async (req: Request, res: Response) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    const blockNumber = await coreAPI.getBlockNumber();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      network: process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet',
      blockNumber,
      version: '1.0.0',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Failed to connect to Core network',
    });
  }
});

// GET /health/ready
router.get('/ready', (_req: Request, res: Response) => {
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
  });
});

// GET /health/live
router.get('/live', (_req: Request, res: Response) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };