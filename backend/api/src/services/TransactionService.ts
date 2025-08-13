import { ethers } from 'ethers';
import { createLogger, createRedisClient } from '@core-meme/shared';
import crypto from 'crypto';
import { memeFactoryService } from './MemeFactoryService';

interface TransactionRequest {
  userId: string;
  telegramId: number;
  type: 'createToken' | 'buyToken' | 'sellToken';
  params: any;
}

interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
}

export class TransactionService {
  private provider: ethers.JsonRpcProvider;
  private redis = createRedisClient();
  private logger = createLogger({ service: 'transaction-service' });
  private encryptionSecret: string;
  private pendingTxs: Map<string, any> = new Map();

  constructor() {
    const rpcUrl = process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.encryptionSecret = process.env.ENCRYPTION_SECRET || process.env.SIGNATURE_SECRET || 'default_encryption_secret';
    
    if (!process.env.ENCRYPTION_SECRET) {
      this.logger.warn('ENCRYPTION_SECRET not set, using default (not secure for production)');
    }
  }

  /**
   * Decrypt user's private key
   */
  private async decryptPrivateKey(encryptedKey: string, telegramId: number): Promise<string> {
    try {
      if (!encryptedKey || !encryptedKey.includes(':')) {
        throw new Error('Invalid encrypted key format');
      }

      const algorithm = 'aes-256-cbc';
      const key = crypto
        .createHash('sha256')
        .update(`${this.encryptionSecret}:${telegramId}`)
        .digest();
      
      const parts = encryptedKey.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted key format - expected IV:encrypted format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Validate that the decrypted key looks like a valid private key
      if (!decrypted.startsWith('0x') || decrypted.length !== 66) {
        throw new Error('Decrypted key does not appear to be a valid private key');
      }
      
      return decrypted;
    } catch (error) {
      this.logger.error('Failed to decrypt private key:', error);
      throw new Error(`Failed to decrypt wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's wallet from database
   */
  private async getUserWallet(userId: string, telegramId: number): Promise<ethers.Wallet> {
    try {
      // Get user data from Redis
      const userKey = `user:id:${userId}`;
      const userData = await this.redis.get(userKey);
      
      if (!userData) {
        // Try telegram ID key
        const telegramKey = `user:telegram:${telegramId}`;
        const telegramData = await this.redis.get(telegramKey);
        
        if (!telegramData) {
          throw new Error('User not found');
        }
        
        const user = JSON.parse(telegramData);
        
        if (!user.walletPrivateKey) {
          throw new Error('User wallet not found');
        }
        
        // For users created via Telegram bot, the private key might be stored directly
        // (this is for development - in production, use encrypted storage)
        const privateKey = user.walletPrivateKey.startsWith('0x') 
          ? user.walletPrivateKey 
          : await this.decryptPrivateKey(user.walletPrivateKey, telegramId);
        
        return new ethers.Wallet(privateKey, this.provider);
      }
      
      const user = JSON.parse(userData);
      
      if (!user.walletPrivateKey) {
        throw new Error('User wallet not found');
      }
      
      // Decrypt private key if needed
      const privateKey = user.walletPrivateKey.startsWith('0x') 
        ? user.walletPrivateKey 
        : await this.decryptPrivateKey(user.walletPrivateKey, telegramId);
      
      return new ethers.Wallet(privateKey, this.provider);
    } catch (error) {
      this.logger.error('Error getting user wallet:', error);
      throw error;
    }
  }

  /**
   * Execute a transaction for a user
   */
  async executeTransaction(request: TransactionRequest): Promise<TransactionResult> {
    try {
      // Get user's wallet
      const wallet = await this.getUserWallet(request.userId, request.telegramId);
      
      this.logger.info(`Executing ${request.type} transaction for user ${request.userId}`);
      
      // Build transaction based on type
      let tx: ethers.TransactionRequest;
      
      switch (request.type) {
        case 'createToken':
          tx = await memeFactoryService.buildCreateTokenTx(
            request.params.name,
            request.params.symbol,
            request.params.description || '',
            request.params.imageUrl || '',
            request.params.twitter || '',
            request.params.telegram || '',
            request.params.website || ''
          );
          break;
          
        case 'buyToken':
          tx = await memeFactoryService.buildBuyTokenTx(
            request.params.tokenAddress,
            request.params.coreAmount
          );
          break;
          
        case 'sellToken':
          tx = await memeFactoryService.buildSellTokenTx(
            request.params.tokenAddress,
            request.params.tokenAmount
          );
          break;
          
        default:
          throw new Error(`Unknown transaction type: ${request.type}`);
      }
      
      // Add from address
      tx.from = wallet.address;
      
      // Estimate gas
      const gasEstimate = await wallet.estimateGas(tx);
      tx.gasLimit = gasEstimate * BigInt(120) / BigInt(100); // Add 20% buffer
      
      // Get gas price
      const feeData = await this.provider.getFeeData();
      tx.gasPrice = feeData.gasPrice;
      
      this.logger.info(`Sending transaction: ${request.type}`, {
        from: wallet.address,
        gasLimit: tx.gasLimit?.toString(),
        gasPrice: tx.gasPrice?.toString(),
        value: tx.value?.toString()
      });
      
      // Send transaction
      const txResponse = await wallet.sendTransaction(tx);
      
      // Store pending transaction
      this.pendingTxs.set(txResponse.hash, {
        userId: request.userId,
        type: request.type,
        timestamp: Date.now()
      });
      
      // Wait for confirmation
      const receipt = await txResponse.wait(1);
      
      if (!receipt) {
        throw new Error('Transaction failed - no receipt');
      }
      
      // Remove from pending
      this.pendingTxs.delete(txResponse.hash);
      
      // Store transaction history
      await this.storeTransactionHistory(request.userId, {
        txHash: receipt.hash,
        type: request.type,
        params: request.params,
        status: receipt.status === 1 ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.gasPrice?.toString(),
        timestamp: Date.now()
      });
      
      return {
        success: receipt.status === 1,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.gasPrice?.toString()
      };
      
    } catch (error) {
      this.logger.error('Transaction execution failed:', error);
      
      // Check if it's a revert error and extract reason
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          return {
            success: false,
            error: 'Insufficient CORE balance for transaction'
          };
        }
        
        if (error.message.includes('MemeFactory__')) {
          // Extract specific contract error
          const match = error.message.match(/MemeFactory__(\w+)/);
          if (match) {
            return {
              success: false,
              error: `Contract error: ${match[1].replace(/_/g, ' ')}`
            };
          }
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed'
      };
    }
  }

  /**
   * Store transaction history
   */
  private async storeTransactionHistory(userId: string, txData: any): Promise<void> {
    try {
      const key = `tx:history:${userId}`;
      const history = await this.redis.get(key);
      
      const transactions = history ? JSON.parse(history) : [];
      transactions.unshift(txData);
      
      // Keep only last 100 transactions
      if (transactions.length > 100) {
        transactions.splice(100);
      }
      
      await this.redis.set(key, JSON.stringify(transactions));
      
      // Also store by transaction hash for quick lookup
      await this.redis.setex(
        `tx:${txData.txHash}`,
        86400 * 7, // 7 days
        JSON.stringify({ userId, ...txData })
      );
      
    } catch (error) {
      this.logger.error('Error storing transaction history:', error);
    }
  }

  /**
   * Get user's transaction history
   */
  async getUserTransactionHistory(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const key = `tx:history:${userId}`;
      const history = await this.redis.get(key);
      
      if (!history) {
        return [];
      }
      
      const transactions = JSON.parse(history);
      return transactions.slice(0, limit);
      
    } catch (error) {
      this.logger.error('Error fetching transaction history:', error);
      return [];
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txHash: string): Promise<any> {
    try {
      // Check if it's pending
      if (this.pendingTxs.has(txHash)) {
        return {
          status: 'pending',
          ...this.pendingTxs.get(txHash)
        };
      }
      
      // Check Redis cache
      const cached = await this.redis.get(`tx:${txHash}`);
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Check blockchain
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return { status: 'not_found' };
      }
      
      return {
        status: receipt.status === 1 ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.gasPrice?.toString()
      };
      
    } catch (error) {
      this.logger.error('Error fetching transaction status:', error);
      return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Estimate gas for a transaction
   */
  async estimateGas(request: TransactionRequest): Promise<{ gasLimit: string; gasPrice: string; totalCost: string }> {
    try {
      // Build transaction
      let tx: ethers.TransactionRequest;
      
      switch (request.type) {
        case 'createToken':
          tx = await memeFactoryService.buildCreateTokenTx(
            request.params.name,
            request.params.symbol,
            request.params.description || '',
            request.params.imageUrl || '',
            request.params.twitter || '',
            request.params.telegram || '',
            request.params.website || ''
          );
          break;
          
        case 'buyToken':
          tx = await memeFactoryService.buildBuyTokenTx(
            request.params.tokenAddress,
            request.params.coreAmount
          );
          break;
          
        case 'sellToken':
          tx = await memeFactoryService.buildSellTokenTx(
            request.params.tokenAddress,
            request.params.tokenAmount
          );
          break;
          
        default:
          throw new Error(`Unknown transaction type: ${request.type}`);
      }
      
      // Get user wallet address
      const wallet = await this.getUserWallet(request.userId, request.telegramId);
      tx.from = wallet.address;
      
      // Estimate gas
      const gasEstimate = await this.provider.estimateGas(tx);
      const gasLimit = gasEstimate * BigInt(120) / BigInt(100); // Add 20% buffer
      
      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(0);
      
      // Calculate total cost
      const gasCost = gasLimit * gasPrice;
      const totalCost = gasCost + (tx.value || BigInt(0));
      
      return {
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
        totalCost: ethers.formatEther(totalCost)
      };
      
    } catch (error) {
      this.logger.error('Error estimating gas:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const transactionService = new TransactionService();