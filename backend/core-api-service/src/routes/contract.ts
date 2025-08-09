import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CoreAPIService } from '../services/CoreAPIService';

const router: Router = Router();

const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// GET /api/contract/:address/abi
router.get('/:address/abi', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = AddressSchema.parse(req.params.address);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const abi = await coreAPI.getContractABI(address);
    
    if (!abi) {
      return res.status(404).json({
        success: false,
        error: 'Contract ABI not found',
      });
    }
    
    res.json({
      success: true,
      data: abi,
    });
    return;
  } catch (error) {
    next(error);
  }
});

// POST /api/contract/verify
router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const VerifySchema = z.object({
      address: AddressSchema,
      sourceCode: z.string(),
      contractName: z.string(),
      compilerVersion: z.string(),
      constructorArgs: z.string().optional(),
    });
    
    const data = VerifySchema.parse(req.body);
    const coreAPI = req.app.locals.coreAPI as CoreAPIService;
    
    const success = await coreAPI.verifyContract(
      data.address,
      data.sourceCode,
      data.contractName,
      data.compilerVersion,
      data.constructorArgs || ''
    );
    
    res.json({
      success,
      message: success ? 'Verification submitted successfully' : 'Verification failed',
    });
  } catch (error) {
    next(error);
  }
});

export { router as contractRouter };