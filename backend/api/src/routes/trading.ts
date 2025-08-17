import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { authenticate } from '../middleware/auth';
import { WalletManager } from '../services/WalletManager';
import { DatabaseService } from '@core-meme/shared';
import { createLogger } from '@core-meme/shared';

const router: Router = Router();
const logger = createLogger({ service: 'trading-api' });

// Contract addresses
const CONTRACTS = {
  memeFactory: '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  staking: '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
  platformToken: '0x26EfC13dF039c6B4E084CEf627a47c348197b655'
};

// ABIs
const MEMEFACTORY_ABI = [
  'function buyToken(address _token, uint256 _minTokens) external payable',
  'function sellToken(address _token, uint256 _amount, uint256 _minETH) external',
  'function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) external pure returns (uint256)',
  'function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) external pure returns (uint256)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))',
  'function creationFee() external view returns (uint256)',
  'function createToken(string _name, string _symbol, string _description, string _image, string _twitter, string _telegram, string _website) external payable'
];

const STAKING_ABI = [
  'function getUserFeeDiscount(address _user) external view returns (uint256)'
];

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// Initialize services
const database = new DatabaseService();
const walletManager = new WalletManager(database);
const provider = new ethers.JsonRpcProvider(
  process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com'
);

const factoryContract = new ethers.Contract(
  CONTRACTS.memeFactory,
  MEMEFACTORY_ABI,
  provider
);

const stakingContract = new ethers.Contract(
  CONTRACTS.staking,
  STAKING_ABI,
  provider
);

/**
 * POST /api/trading/buy
 * Buy tokens through MemeFactory bonding curve
 */
router.post('/buy', authenticate, async (req: Request, res: Response) => {
  try {
    const { tokenAddress, amountCore, slippage = 5 } = req.body;
    const userId = (req as any).user.id;

    // Validate input
    if (!tokenAddress || !amountCore) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // Get user's wallet
    const wallet = await walletManager.getWalletWithSigner(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found'
      });
    }

    // Check token status
    const tokenInfo = await factoryContract.getTokenInfo(tokenAddress);
    if (!tokenInfo.isOpen) {
      return res.status(400).json({
        success: false,
        error: tokenInfo.isLaunched ? 'Token already launched' : 'Token sale closed'
      });
    }

    // Calculate expected tokens out
    const amountIn = ethers.parseEther(amountCore.toString());
    const tokensOut = await factoryContract.calculateTokensOut(
      tokenInfo.sold,
      amountIn
    );
    
    // Apply slippage
    const minTokensOut = tokensOut * BigInt(100 - slippage) / 100n;

    // Check for fee discount from staking
    const feeDiscount = await stakingContract.getUserFeeDiscount(wallet.address);
    
    logger.info('Executing buy transaction', {
      userId,
      tokenAddress,
      amountCore,
      expectedTokens: ethers.formatEther(tokensOut),
      feeDiscount: Number(feeDiscount)
    });

    // Execute buy transaction
    const factoryWithSigner = factoryContract.connect(wallet) as any;
    const tx = await factoryWithSigner.buyToken(
      tokenAddress,
      minTokensOut,
      {
        value: amountIn,
        gasLimit: 300000
      }
    );

    // Wait for confirmation
    const receipt = await tx.wait();
    
    if (!receipt || receipt.status === 0) {
      throw new Error('Transaction failed');
    }

    // Parse events to get actual amounts
    const purchaseEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = factoryContract.interface.parseLog(log);
        return parsed?.name === 'TokenPurchased';
      } catch {
        return false;
      }
    });

    let actualTokens = tokensOut;
    let actualCost = amountIn;
    
    if (purchaseEvent) {
      const parsed = factoryContract.interface.parseLog(purchaseEvent);
      actualTokens = parsed?.args.amount;
      actualCost = parsed?.args.cost;
    }

    // Save transaction to database
    await database.saveTrade({
      userId,
      tokenAddress,
      type: 'buy',
      amountCore: Number(ethers.formatEther(actualCost)),
      amountToken: Number(ethers.formatEther(actualTokens)),
      price: Number(ethers.formatEther(actualCost)) / Number(ethers.formatEther(actualTokens)),
      txHash: receipt.hash,
      status: 'completed'
    });

    res.json({
      success: true,
      data: {
        txHash: receipt.hash,
        amountToken: ethers.formatEther(actualTokens),
        amountCore: ethers.formatEther(actualCost),
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber
      }
    });

  } catch (error: any) {
    logger.error('Buy transaction failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Transaction failed'
    });
  }
});

/**
 * POST /api/trading/sell
 * Sell tokens back to MemeFactory bonding curve
 */
router.post('/sell', authenticate, async (req: Request, res: Response) => {
  try {
    const { tokenAddress, amount, percentage, slippage = 5 } = req.body;
    const userId = (req as any).user.id;

    // Validate input
    if (!tokenAddress || (!amount && !percentage)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // Get user's wallet
    const wallet = await walletManager.getWalletWithSigner(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found'
      });
    }

    // Get token contract
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get user's token balance
    const balance = await tokenContract.balanceOf(wallet.address);
    if (balance === 0n) {
      return res.status(400).json({
        success: false,
        error: 'No tokens to sell'
      });
    }

    // Calculate amount to sell
    let amountToSell: bigint;
    if (percentage) {
      amountToSell = balance * BigInt(percentage) / 100n;
    } else {
      amountToSell = ethers.parseEther(amount.toString());
      if (amountToSell > balance) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient token balance'
        });
      }
    }

    // Check token status
    const tokenInfo = await factoryContract.getTokenInfo(tokenAddress);
    if (tokenInfo.isLaunched) {
      return res.status(400).json({
        success: false,
        error: 'Token already launched, cannot sell back to bonding curve'
      });
    }

    // Calculate expected ETH out
    const ethOut = await factoryContract.calculateETHOut(
      tokenInfo.sold,
      amountToSell
    );
    
    // Apply slippage
    const minEthOut = ethOut * BigInt(100 - slippage) / 100n;

    // Check token approval
    const allowance = await tokenContract.allowance(wallet.address, CONTRACTS.memeFactory);
    if (allowance < amountToSell) {
      const approveTx = await tokenContract.approve(CONTRACTS.memeFactory, amountToSell);
      await approveTx.wait();
      logger.info('Token approval completed');
    }

    // Execute sell transaction
    const factoryWithSigner = factoryContract.connect(wallet) as any;
    const tx = await factoryWithSigner.sellToken(
      tokenAddress,
      amountToSell,
      minEthOut,
      {
        gasLimit: 300000
      }
    );

    // Wait for confirmation
    const receipt = await tx.wait();
    
    if (!receipt || receipt.status === 0) {
      throw new Error('Transaction failed');
    }

    // Parse events to get actual amounts
    const sellEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = factoryContract.interface.parseLog(log);
        return parsed?.name === 'TokenSold';
      } catch {
        return false;
      }
    });

    let actualTokens = amountToSell;
    let actualProceeds = ethOut;
    
    if (sellEvent) {
      const parsed = factoryContract.interface.parseLog(sellEvent);
      actualTokens = parsed?.args.amount;
      actualProceeds = parsed?.args.proceeds;
    }

    // Save transaction to database
    await database.saveTrade({
      userId,
      tokenAddress,
      type: 'sell',
      amountCore: Number(ethers.formatEther(actualProceeds)),
      amountToken: Number(ethers.formatEther(actualTokens)),
      price: Number(ethers.formatEther(actualProceeds)) / Number(ethers.formatEther(actualTokens)),
      txHash: receipt.hash,
      status: 'completed'
    });

    res.json({
      success: true,
      data: {
        txHash: receipt.hash,
        amountToken: ethers.formatEther(actualTokens),
        amountCore: ethers.formatEther(actualProceeds),
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber
      }
    });

  } catch (error: any) {
    logger.error('Sell transaction failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Transaction failed'
    });
  }
});

/**
 * POST /api/trading/create-token
 * Create a new meme token
 */
router.post('/create-token', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, symbol, description, image, twitter, telegram, website } = req.body;
    const userId = (req as any).user.id;

    // Validate input
    if (!name || !symbol || !description) {
      return res.status(400).json({
        success: false,
        error: 'Name, symbol, and description are required'
      });
    }

    // Get user's wallet
    const wallet = await walletManager.getWalletWithSigner(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found'
      });
    }

    // Get creation fee
    const creationFee = await factoryContract.creationFee();
    
    // Check balance
    const balance = await provider.getBalance(wallet.address);
    if (balance < creationFee) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. Need ${ethers.formatEther(creationFee)} CORE for creation fee`
      });
    }

    logger.info('Creating token', {
      userId,
      name,
      symbol,
      creationFee: ethers.formatEther(creationFee)
    });

    // Execute token creation
    const factoryWithSigner = factoryContract.connect(wallet) as any;
    const tx = await factoryWithSigner.createToken(
      name,
      symbol,
      description || '',
      image || '',
      twitter || '',
      telegram || '',
      website || '',
      {
        value: creationFee,
        gasLimit: 500000
      }
    );

    // Wait for confirmation
    const receipt = await tx.wait();
    
    if (!receipt || receipt.status === 0) {
      throw new Error('Transaction failed');
    }

    // Parse TokenCreated event to get token address
    const createdEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = factoryContract.interface.parseLog(log);
        return parsed?.name === 'TokenCreated';
      } catch {
        return false;
      }
    });

    let tokenAddress = '';
    if (createdEvent) {
      const parsed = factoryContract.interface.parseLog(createdEvent);
      tokenAddress = parsed?.args.token;
    }

    // Save token creation to database
    await database.saveToken({
      address: tokenAddress,
      name,
      symbol,
      description,
      creator: wallet.address
    });

    res.json({
      success: true,
      data: {
        tokenAddress,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber
      }
    });

  } catch (error: any) {
    logger.error('Token creation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Token creation failed'
    });
  }
});

/**
 * GET /api/trading/quote
 * Get price quote for buy/sell
 */
router.get('/quote', authenticate, async (req: Request, res: Response) => {
  try {
    const { tokenAddress, type, amount } = req.query;

    if (!tokenAddress || !type || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    const tokenInfo = await factoryContract.getTokenInfo(tokenAddress as string);
    
    if (!tokenInfo.token || tokenInfo.token === ethers.ZeroAddress) {
      return res.status(404).json({
        success: false,
        error: 'Token not found'
      });
    }

    let quote;
    if (type === 'buy') {
      const amountIn = ethers.parseEther(amount as string);
      const tokensOut = await factoryContract.calculateTokensOut(
        tokenInfo.sold,
        amountIn
      );
      
      quote = {
        type: 'buy',
        amountIn: ethers.formatEther(amountIn),
        amountOut: ethers.formatEther(tokensOut),
        pricePerToken: Number(amount) / Number(ethers.formatEther(tokensOut)),
        priceImpact: calculatePriceImpact(tokenInfo.sold, amountIn, 'buy')
      };
    } else {
      const amountIn = ethers.parseEther(amount as string);
      const ethOut = await factoryContract.calculateETHOut(
        tokenInfo.sold,
        amountIn
      );
      
      quote = {
        type: 'sell',
        amountIn: ethers.formatEther(amountIn),
        amountOut: ethers.formatEther(ethOut),
        pricePerToken: Number(ethers.formatEther(ethOut)) / Number(amount),
        priceImpact: calculatePriceImpact(tokenInfo.sold, amountIn, 'sell')
      };
    }

    res.json({
      success: true,
      data: quote
    });

  } catch (error: any) {
    logger.error('Quote calculation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Quote calculation failed'
    });
  }
});

/**
 * GET /api/trading/history
 * Get user's trading history
 */
router.get('/history', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { limit = 50, offset = 0 } = req.query;

    const trades = await database.getUserTrades(userId, Number(limit), Number(offset));

    res.json({
      success: true,
      data: trades
    });

  } catch (error: any) {
    logger.error('Failed to get trading history', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get trading history'
    });
  }
});

// Helper function to calculate price impact
function calculatePriceImpact(currentSold: bigint, amount: bigint, type: 'buy' | 'sell'): number {
  // Simplified price impact calculation
  // In production, this should use the actual bonding curve formula
  const supplyChange = Number(ethers.formatEther(amount));
  const currentSupply = Number(ethers.formatEther(currentSold));
  
  if (currentSupply === 0) return 0;
  
  const impactPercent = (supplyChange / currentSupply) * 100;
  return type === 'buy' ? impactPercent : -impactPercent;
}

export default router;