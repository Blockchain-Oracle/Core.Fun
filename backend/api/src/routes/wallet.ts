import { Router, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import { ethers } from 'ethers';
import { createRedisClient, createLogger } from '@core-meme/shared';

// Extend Express Request type
interface AuthRequest extends Request {
  user?: string | JwtPayload;
}

const router: Router = Router();
const redis = createRedisClient();
const logger = createLogger({ service: 'api-wallet', enableFileLogging: false });

// Initialize provider
const network = process.env.NETWORK || 'testnet';
const rpcUrl = network === 'mainnet' 
  ? process.env.CORE_MAINNET_RPC || 'https://rpc.coredao.org'
  : process.env.CORE_TESTNET_RPC || 'https://rpc.test2.btcs.network';
const provider = new ethers.JsonRpcProvider(rpcUrl);

// Middleware to authenticate requests
async function authenticate(req: Request, res: Response, next: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default_jwt_secret'
    ) as any;
    
    // Check if session exists
    const sessionStr = await redis.get(`session:${decoded.userId}`);
    if (!sessionStr) {
      return res.status(401).json({
        success: false,
        error: 'Session not found',
      });
    }
    
    (req as AuthRequest).user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
}

// Validation schemas
const SendTransactionSchema = z.object({
  to: z.string(),
  amount: z.string(),
  tokenAddress: z.string().optional(),
});

/**
 * Get wallet information
 */
router.get('/wallet/info', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    // Get user data
    const userDataStr = await redis.get(`user:id:${userId}`);
    if (!userDataStr) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }
    
    const userData = JSON.parse(userDataStr);
    
    // Query real blockchain balances
    const coreBalance = await provider.getBalance(userData.walletAddress);
    const coreBalanceFormatted = ethers.formatEther(coreBalance);
    
    // Get CORE price from CoinGecko
    let corePrice = 0.50; // Default fallback
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd');
      const data: any = await response.json();
      corePrice = data.coredaoorg?.usd || 0.50;
    } catch (error) {
      logger.warn('Failed to fetch CORE price:', error);
    }
    
    const coreValueUsd = parseFloat(coreBalanceFormatted) * corePrice;
    
    // Get token balances for known meme tokens
    const tokenBalances: Array<{
      token: string;
      symbol: string;
      balance: string;
      value: number;
    }> = [];
    
    // Check MemeFactory for created tokens by this user
    const factoryAddress = process.env.MEME_FACTORY_ADDRESS;
    if (factoryAddress) {
      try {
        const factoryContract = new ethers.Contract(
          factoryAddress,
          [
            'function getTokensByCreator(address) view returns (address[])',
            'function getTokenInfo(address) view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))'
          ],
          provider
        );
        
        const userTokens = await factoryContract.getTokensByCreator(userData.walletAddress);
        
        for (const tokenAddress of userTokens) {
          try {
            const tokenContract = new ethers.Contract(
              tokenAddress,
              [
                'function balanceOf(address) view returns (uint256)',
                'function symbol() view returns (string)',
                'function decimals() view returns (uint8)'
              ],
              provider
            );
            
            const [balance, symbol, decimals] = await Promise.all([
              tokenContract.balanceOf(userData.walletAddress),
              tokenContract.symbol(),
              tokenContract.decimals()
            ]);
            
            const formattedBalance = ethers.formatUnits(balance, decimals);
            
            // Get token price from bonding curve or DEX
            const tokenInfo = await factoryContract.getTokenInfo(tokenAddress);
            let tokenPrice = 0;
            
            if (!tokenInfo.isLaunched && tokenInfo.sold > 0) {
              // Calculate price from bonding curve
              const basePrice = 0.0001;
              const priceIncrement = 0.0001;
              const step = ethers.parseEther('10000');
              tokenPrice = (basePrice + (priceIncrement * Number(tokenInfo.sold / step))) * corePrice;
            }
            
            tokenBalances.push({
              token: tokenAddress,
              symbol,
              balance: formattedBalance,
              value: parseFloat(formattedBalance) * tokenPrice
            });
          } catch (error) {
            logger.warn(`Failed to get balance for token ${tokenAddress}:`, error);
          }
        }
      } catch (error) {
        logger.warn('Failed to get user tokens from MemeFactory:', error);
      }
    }
    
    const totalValueUsd = coreValueUsd + tokenBalances.reduce((sum, t) => sum + t.value, 0);
    
    const walletInfo = {
      address: userData.walletAddress,
      balance: totalValueUsd.toFixed(2), // USD value
      coreBalance: coreBalanceFormatted,
      coreValueUsd: coreValueUsd.toFixed(2),
      tokenBalances
    };
    
    res.json({
      success: true,
      data: walletInfo,
    });
  } catch (error: any) {
    logger.error('Get wallet info failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet information',
    });
  }
});

/**
 * Export private key
 */
router.post('/wallet/export', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    // Get user data
    const userDataStr = await redis.get(`user:id:${userId}`);
    if (!userDataStr) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }
    
    const userData = JSON.parse(userDataStr);
    
    if (!userData.walletPrivateKey) {
      return res.status(400).json({
        success: false,
        error: 'Private key not available',
      });
    }
    
    res.json({
      success: true,
      data: {
        privateKey: userData.walletPrivateKey,
      },
    });
  } catch (error: any) {
    logger.error('Export private key failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export private key',
    });
  }
});

/**
 * Send transaction
 */
router.post('/wallet/send', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { to, amount, tokenAddress } = SendTransactionSchema.parse(req.body);
    
    // Get user data
    const userDataStr = await redis.get(`user:id:${userId}`);
    if (!userDataStr) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }
    
    const userData = JSON.parse(userDataStr);
    
    // Validate recipient address
    if (!to.startsWith('0x') || to.length !== 42) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient address',
      });
    }
    
    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount',
      });
    }
    
    // Implement real transaction signing and broadcasting
    if (!userData.walletPrivateKey) {
      return res.status(400).json({
        success: false,
        error: 'Private key not available for this wallet',
      });
    }
    
    // Create wallet instance with private key
    const wallet = new ethers.Wallet(userData.walletPrivateKey, provider);
    
    let txHash: string;
    
    if (tokenAddress && tokenAddress !== 'CORE') {
      // Send ERC20 token transaction
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
          'function balanceOf(address) view returns (uint256)'
        ],
        wallet
      );
      
      // Get token decimals
      const decimals = await tokenContract.decimals();
      const transferAmount = ethers.parseUnits(amount, decimals);
      
      // Check balance
      const balance = await tokenContract.balanceOf(userData.walletAddress);
      if (balance < transferAmount) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient token balance',
        });
      }
      
      // Send token transfer transaction
      const tx = await tokenContract.transfer(to, transferAmount);
      txHash = tx.hash;
      
      // Wait for transaction confirmation
      await tx.wait(1);
      
    } else {
      // Send native CORE transaction
      const transferAmount = ethers.parseEther(amount);
      
      // Check balance
      const balance = await provider.getBalance(userData.walletAddress);
      const gasEstimate = await provider.estimateGas({
        to,
        value: transferAmount,
      });
      const feeData = await provider.getFeeData();
      const gasCost = gasEstimate * (feeData.gasPrice || 0n);
      
      if (balance < transferAmount + gasCost) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient balance (including gas fees)',
        });
      }
      
      // Create and send transaction
      const tx = await wallet.sendTransaction({
        to,
        value: transferAmount,
        gasLimit: gasEstimate,
        gasPrice: feeData.gasPrice,
      });
      
      txHash = tx.hash;
      
      // Wait for transaction confirmation
      await tx.wait(1);
    }
    
    logger.info(`Transaction created: ${userData.walletAddress} -> ${to}, amount: ${amount}${tokenAddress ? `, token: ${tokenAddress}` : ''}`);
    
    res.json({
      success: true,
      data: {
        transactionHash: txHash,
      },
    });
  } catch (error: any) {
    logger.error('Send transaction failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Transaction failed',
    });
  }
});

/**
 * Get transaction history
 */
router.get('/wallet/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    // Get user wallet address
    const userDataStr = await redis.get(`user:id:${userId}`);
    if (!userDataStr) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }
    
    const userData = JSON.parse(userDataStr);
    
    // Query blockchain for transaction history
    // Using Core Scan API for transaction history
    const transactions: any[] = [];
    
    try {
      const coreScanUrl = network === 'mainnet'
        ? 'https://openapi.coredao.org/api'
        : 'https://api.test2.btcs.network/api';
      
      const apiKey = process.env.CORE_SCAN_API_KEY || '';
      const params = new URLSearchParams({
        module: 'account',
        action: 'txlist',
        address: userData.walletAddress,
        startblock: '0',
        endblock: '99999999',
        page: '1',
        offset: '20',
        sort: 'desc',
        apikey: apiKey
      });
      
      const response = await fetch(`${coreScanUrl}?${params}`);
      const data: any = await response.json();
      
      if (data.status === '1' && data.result) {
        for (const tx of data.result) {
          transactions.push({
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: ethers.formatEther(tx.value || '0'),
            timestamp: parseInt(tx.timeStamp) * 1000,
            blockNumber: parseInt(tx.blockNumber),
            gasUsed: tx.gasUsed,
            status: tx.txreceipt_status === '1' ? 'success' : 'failed',
            type: tx.from.toLowerCase() === userData.walletAddress.toLowerCase() ? 'sent' : 'received'
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch transaction history:', error);
    }
    
    res.json({
      success: true,
      data: {
        transactions,
        total: 0,
      },
    });
  } catch (error: any) {
    logger.error('Get transactions failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transaction history',
    });
  }
});

export default router;