import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CoreAPIService } from '../services/CoreAPIService';

const router: Router = Router();

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// GET /api/price/:token
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = AddressSchema.parse(req.params.token);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const priceData = await coreAPI.getTokenPrice(token);
    
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

// GET /api/price/gas
router.get('/network/gas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const gasPrice = await coreAPI.getGasPrice();
    
    res.json({
      success: true,
      data: {
        gasPrice: gasPrice.toString(),
        gasPriceGwei: Number(gasPrice / BigInt(1e9)),
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as priceRouter };