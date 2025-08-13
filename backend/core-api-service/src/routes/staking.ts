import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CoreAPIService } from '../services/CoreAPIService';

const router: Router = Router();

// Validation schemas
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// GET /api/staking/info/:address
router.get('/info/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const stakingInfo = await coreAPI.getStakingInfo(address);
    
    if (!stakingInfo) {
      return res.status(404).json({
        success: false,
        error: 'Staking info not found',
      });
    }
    
    res.json({
      success: true,
      data: stakingInfo,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/staking/pool
router.get('/pool', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const poolInfo = await coreAPI.getStakingPoolInfo();
    
    res.json({
      success: true,
      data: poolInfo,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/staking/tiers
router.get('/tiers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Return tier information (static for now)
    const tiers = [
      {
        level: 1,
        name: 'Bronze',
        minStake: '1000',
        feeDiscount: 100, // 1%
        benefits: ['1% trading fee discount', 'Basic analytics']
      },
      {
        level: 2,
        name: 'Silver',
        minStake: '5000',
        feeDiscount: 200, // 2%
        benefits: ['2% trading fee discount', 'Advanced analytics', 'Priority support']
      },
      {
        level: 3,
        name: 'Gold',
        minStake: '10000',
        feeDiscount: 300, // 3%
        benefits: ['3% trading fee discount', 'Premium analytics', 'VIP support', 'Early access']
      },
      {
        level: 4,
        name: 'Platinum',
        minStake: '50000',
        feeDiscount: 500, // 5%
        benefits: ['5% trading fee discount', 'All features', 'Dedicated support', 'Governance rights']
      }
    ];
    
    res.json({
      success: true,
      data: tiers,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/staking/stake (for documentation)
router.post('/stake', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const amount = z.string().regex(/^\d+(\.\d+)?$/).parse(req.body.amount);
    
    res.json({
      success: true,
      message: 'Call stake function on Staking contract',
      contractAddress: '0x95F1588ef2087f9E40082724F5Da7BAD946969CB',
      method: 'stake',
      params: {
        amount: amount
      },
      note: 'Requires token approval first'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/staking/unstake (for documentation)
router.post('/unstake', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const amount = z.string().regex(/^\d+(\.\d+)?$/).parse(req.body.amount);
    
    res.json({
      success: true,
      message: 'Call unstake function on Staking contract',
      contractAddress: '0x95F1588ef2087f9E40082724F5Da7BAD946969CB',
      method: 'unstake',
      params: {
        amount: amount
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/staking/claim (for documentation)
router.post('/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      message: 'Call claimRewards function on Staking contract',
      contractAddress: '0x95F1588ef2087f9E40082724F5Da7BAD946969CB',
      method: 'claimRewards',
      params: {}
    });
  } catch (error) {
    next(error);
  }
});

export { router as stakingRouter };