import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CoreAPIService } from '../services/CoreAPIService';
import { ethers } from 'ethers';

const router: Router = Router();

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const PaginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  offset: z.string().regex(/^\d+$/).transform(Number).default('100'),
  startBlock: z.string().regex(/^\d+$/).transform(Number).optional(),
  endBlock: z.string().regex(/^\d+$/).transform(Number).optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

// GET /api/account/:address/balance
router.get('/:address/balance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const balance = await coreAPI.getProvider().getBalance(address);
    
    res.json({
      success: true,
      data: {
        address,
        balance: balance.toString(),
        balanceCore: ethers.formatEther(balance),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/account/balances (multiple addresses)
router.get('/balances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addresses = z.array(AddressSchema).parse(
      (req.query.addresses as string).split(',')
    );
    
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    const balances = await coreAPI.getBalanceMulti(addresses);
    
    res.json({
      success: true,
      data: balances,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/account/:address/transactions
router.get('/:address/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const params = PaginationSchema.parse(req.query);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const transactions = await coreAPI.getNormalTransactions(
      address,
      params.startBlock || 0,
      params.endBlock || 99999999,
      params.page,
      params.offset,
      params.sort
    );
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: params.page,
        offset: params.offset,
        count: transactions.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/account/:address/internal-transactions
router.get('/:address/internal-transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const params = PaginationSchema.parse(req.query);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const transactions = await coreAPI.getInternalTransactions(
      address,
      params.startBlock || 0,
      params.endBlock || 99999999,
      params.page,
      params.offset
    );
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: params.page,
        offset: params.offset,
        count: transactions.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/account/:address/token-transactions
router.get('/:address/token-transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const params = PaginationSchema.parse(req.query);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const transactions = await coreAPI.getTokenTransactions(
      address,
      params.startBlock || 0,
      params.endBlock || 99999999,
      params.page,
      params.offset
    );
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: params.page,
        offset: params.offset,
        count: transactions.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/account/:address/nonce
router.get('/:address/nonce', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const nonce = await coreAPI.getTransactionCount(address);
    
    res.json({
      success: true,
      data: {
        address,
        nonce,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/account/:address/analytics
router.get('/:address/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const analytics = await coreAPI.getAccountAnalytics(address);
    
    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
});

export { router as accountRouter };