import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CoreAPIService } from '../services/CoreAPIService';

const router: Router = Router();

// Validation schemas
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const AmountSchema = z.string().regex(/^\d+(\.\d+)?$/);
const CreateTokenSchema = z.object({
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10),
  description: z.string().max(500),
  image: z.string().url().optional().default(''),
  twitter: z.string().optional().default(''),
  telegram: z.string().optional().default(''),
  website: z.string().url().optional().default('')
});

// GET /api/tokens
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const tokens = await coreAPI.getAllTokens();
    
    // Get info for each token (with pagination in production)
    const tokenInfos = await Promise.all(
      tokens.slice(0, 50).map(async (address) => {
        return await coreAPI.getTokenInfo(address);
      })
    );
    
    res.json({
      success: true,
      data: tokenInfos.filter(t => t !== null),
      total: tokens.length
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tokens/stats
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const stats = await coreAPI.getPlatformStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tokens/:address
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
  } catch (error) {
    next(error);
  }
});

// GET /api/tokens/:address/quote/buy
router.get('/:address/quote/buy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const amount = AmountSchema.parse(req.query.amount as string);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const quote = await coreAPI.getBuyQuote(address, amount);
    
    if (!quote) {
      return res.status(400).json({
        success: false,
        error: 'Unable to calculate quote',
      });
    }
    
    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tokens/:address/quote/sell
router.get('/:address/quote/sell', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const amount = AmountSchema.parse(req.query.amount as string);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const quote = await coreAPI.getSellQuote(address, amount);
    
    if (!quote) {
      return res.status(400).json({
        success: false,
        error: 'Unable to calculate quote',
      });
    }
    
    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tokens/creator/:address
router.get('/creator/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const tokens = await coreAPI.getTokensByCreator(address);
    
    // Get info for each token
    const tokenInfos = await Promise.all(
      tokens.map(async (tokenAddress) => {
        return await coreAPI.getTokenInfo(tokenAddress);
      })
    );
    
    res.json({
      success: true,
      data: tokenInfos.filter(t => t !== null),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tokens/create (for documentation, actual creation happens on-chain)
router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateTokenSchema.parse(req.body);
    
    // This endpoint would typically return the parameters needed for the contract call
    // The actual token creation happens on-chain through the user's wallet
    
    res.json({
      success: true,
      message: 'Call createToken on MemeFactory contract with these parameters',
      contractAddress: '0x04242CfFdEC8F96A46857d4A50458F57eC662cE1',
      method: 'createToken',
      params: {
        name: data.name,
        symbol: data.symbol,
        description: data.description,
        image: data.image,
        twitter: data.twitter,
        telegram: data.telegram,
        website: data.website
      },
      requiredValue: '0.1', // Creation fee in CORE
    });
  } catch (error) {
    next(error);
  }
});

export { router as tokenRouter };