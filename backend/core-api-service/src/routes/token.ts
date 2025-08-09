import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CoreAPIService } from '../services/CoreAPIService';

const router: Router = Router();

// Validation schemas
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const PaginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('100'),
});

// GET /api/token/:address
router.get('/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const tokenInfo = await coreAPI.getTokenInfo(address);
    
    if (!tokenInfo) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      });
    }
    
    res.json({
      success: true,
      data: tokenInfo,
    });
    return;
  } catch (error) {
    next(error);
  }
});

// GET /api/token/:address/holders
router.get('/:address/holders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const { page, limit } = PaginationSchema.parse(req.query);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const holders = await coreAPI.getTokenHolders(address, page, limit);
    
    res.json({
      success: true,
      data: holders,
      pagination: {
        page,
        limit,
        count: holders.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/token/:address/transactions
router.get('/:address/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const { page, limit } = PaginationSchema.parse(req.query);
    const startBlock = req.query.startBlock ? parseInt(req.query.startBlock as string) : 0;
    const endBlock = req.query.endBlock ? parseInt(req.query.endBlock as string) : 99999999;
    
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const transactions = await coreAPI.getTokenTransactions(
      address,
      startBlock,
      endBlock,
      page,
      limit
    );
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        count: transactions.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/token/:address/price
router.get('/:address/price', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const priceData = await coreAPI.getTokenPrice(address);
    
    if (!priceData) {
      return res.status(404).json({
        success: false,
        error: 'Price data not available',
      });
    }
    
    res.json({
      success: true,
      data: priceData,
    });
    return;
  } catch (error) {
    next(error);
  }
});

export { router as tokenRouter };