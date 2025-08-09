import { Router, Request, Response, NextFunction } from 'express';
import { CoreAPIService } from '../services/CoreAPIService';
import { ethers } from 'ethers';

const router: Router = Router();

// GET /api/stats/supply
router.get('/supply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const totalSupply = await coreAPI.getTotalSupply();
    
    res.json({
      success: true,
      data: {
        totalSupply,
        totalSupplyCore: ethers.formatEther(totalSupply),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stats/price
router.get('/price', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const price = await coreAPI.getCorePrice();
    
    res.json({
      success: true,
      data: price,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stats/network
router.get('/network', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const [blockNumber, gasPrice, corePrice, totalSupply] = await Promise.all([
      coreAPI.getBlockNumber(),
      coreAPI.getGasPrice(),
      coreAPI.getCorePrice(),
      coreAPI.getTotalSupply(),
    ]);
    
    res.json({
      success: true,
      data: {
        network: process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet',
        chainId: process.env.NODE_ENV === 'production' ? 1116 : 1115,
        blockNumber,
        gasPrice: gasPrice.toString(),
        gasPriceGwei: Number(gasPrice / BigInt(1e9)),
        corePrice,
        totalSupply,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as statsRouter };