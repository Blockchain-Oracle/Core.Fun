import { ethers } from 'ethers';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../utils/logger';

interface Wallet {
  id: string;
  userId: string;
  name: string;
  address: string;
  type: 'primary' | 'trading' | 'withdraw';
  encryptedPrivateKey?: string;
  network: string;
  createdAt: Date;
}

interface Balance {
  core: string;
  coreAmount: number;
  usd: string;
  usdAmount: number;
  tokens?: Array<{
    address: string;
    symbol: string;
    balance: string;
    valueUsd: number;
  }>;
}

export class WalletService {
  private db: DatabaseService;
  private provider: ethers.JsonRpcProvider;
  private encryptionSecret: string;

  constructor(db: DatabaseService) {
    this.db = db;
    this.provider = new ethers.JsonRpcProvider(
      process.env.CORE_RPC_URL || 'https://rpc.coredao.org'
    );
    this.encryptionSecret = process.env.ENCRYPTION_SECRET || 'default_encryption_secret';
    
    if (!process.env.ENCRYPTION_SECRET) {
      logger.warn('ENCRYPTION_SECRET not set, using default (not secure for production)');
    }
  }

  /**
   * Encrypt private key with user-specific encryption
   */
  async encryptPrivateKey(privateKey: string, telegramId: number): Promise<string> {
    // Use AES-256-CBC encryption
    const algorithm = 'aes-256-cbc';
    const key = crypto
      .createHash('sha256')
      .update(`${this.encryptionSecret}:${telegramId}`)
      .digest();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV and encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt private key
   */
  async decryptPrivateKey(encryptedKey: string, telegramId: number): Promise<string> {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto
        .createHash('sha256')
        .update(`${this.encryptionSecret}:${telegramId}`)
        .digest();
      
      const parts = encryptedKey.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt private key:', error);
      throw new Error('Failed to decrypt wallet');
    }
  }

  /**
   * Create a new trading wallet
   */
  async createTradingWallet(userId: string, name: string): Promise<Wallet> {
    // Generate new wallet
    const wallet = ethers.Wallet.createRandom();
    
    // Get user's telegram ID for encryption
    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Encrypt private key
    const encryptedKey = await this.encryptPrivateKey(
      wallet.privateKey,
      user.telegramId
    );

    // Save to database
    const newWallet = await this.db.createWallet({
      userId,
      name,
      address: wallet.address,
      type: 'trading',
      encryptedPrivateKey: encryptedKey,
      network: 'CORE',
      createdAt: new Date(),
    });

    logger.info(`Created trading wallet ${wallet.address} for user ${userId}`);

    return newWallet;
  }

  /**
   * Import existing wallet
   */
  async importWallet(userId: string, name: string, privateKey: string): Promise<Wallet> {
    try {
      // Validate private key
      const wallet = new ethers.Wallet(privateKey);
      
      // Get user's telegram ID for encryption
      const user = await this.db.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if wallet already exists
      const existing = await this.db.getWalletByAddress(wallet.address);
      if (existing && existing.userId === userId) {
        throw new Error('Wallet already imported');
      }

      // Encrypt private key
      const encryptedKey = await this.encryptPrivateKey(
        privateKey,
        user.telegramId
      );

      // Save to database
      const newWallet = await this.db.createWallet({
        userId,
        name,
        address: wallet.address,
        type: 'trading',
        encryptedPrivateKey: encryptedKey,
        network: 'CORE',
        createdAt: new Date(),
      });

      logger.info(`Imported wallet ${wallet.address} for user ${userId}`);

      return newWallet;
    } catch (error: any) {
      if (error.message.includes('invalid private key')) {
        throw new Error('Invalid private key');
      }
      throw error;
    }
  }

  /**
   * Add withdraw wallet (no private key stored)
   */
  async addWithdrawWallet(userId: string, name: string, address: string): Promise<Wallet> {
    // Validate address
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid wallet address');
    }

    // Check if already exists
    const existing = await this.db.getWithdrawWallet(userId, address);
    if (existing) {
      throw new Error('Withdraw address already exists');
    }

    // Save to database
    const wallet = await this.db.createWallet({
      userId,
      name,
      address,
      type: 'withdraw',
      network: 'CORE',
      createdAt: new Date(),
    });

    logger.info(`Added withdraw wallet ${address} for user ${userId}`);

    return wallet;
  }

  /**
   * Get user's primary wallet
   */
  async getPrimaryWallet(userId: string): Promise<Wallet | null> {
    const user = await this.db.getUserById(userId);
    if (!user || !user.walletAddress) {
      return null;
    }

    return {
      id: user.id,
      userId: user.id,
      name: 'Primary Wallet',
      address: user.walletAddress,
      type: 'primary',
      encryptedPrivateKey: user.encryptedPrivateKey,
      network: 'CORE',
      createdAt: user.createdAt,
    };
  }

  /**
   * Get user's trading wallets
   */
  async getTradingWallets(userId: string): Promise<Wallet[]> {
    return this.db.getTradingWallets(userId);
  }

  /**
   * Get user's withdraw wallets
   */
  async getWithdrawWallets(userId: string): Promise<Wallet[]> {
    return this.db.getWithdrawWallets(userId);
  }

  /**
   * Get wallet balance
   */
  async getBalance(address: string): Promise<Balance> {
    try {
      // Get CORE balance
      const balanceWei = await this.provider.getBalance(address);
      const balanceCore = ethers.formatEther(balanceWei);
      
      // Get USD price (mock for now, integrate with price service later)
      const corePrice = await this.getCorePrice();
      const balanceUsd = parseFloat(balanceCore) * corePrice;

      // TODO: Get token balances
      const tokens: any[] = [];

      return {
        core: balanceCore,
        coreAmount: parseFloat(balanceCore),
        usd: balanceUsd.toFixed(2),
        usdAmount: balanceUsd,
        tokens,
      };
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw new Error('Failed to retrieve balance');
    }
  }

  /**
   * Export private key (with security checks)
   */
  async exportPrivateKey(userId: string, walletAddress: string, telegramId: number): Promise<string> {
    // Get wallet
    const wallet = await this.db.getWalletByAddress(walletAddress);
    
    if (!wallet || wallet.userId !== userId) {
      throw new Error('Wallet not found');
    }

    if (!wallet.encryptedPrivateKey) {
      throw new Error('Private key not available for this wallet');
    }

    // Decrypt private key
    const privateKey = await this.decryptPrivateKey(
      wallet.encryptedPrivateKey,
      telegramId
    );

    // Log export action for security
    logger.warn(`Private key exported for wallet ${walletAddress} by user ${userId}`);

    return privateKey;
  }

  /**
   * Transfer funds
   */
  async transfer(
    fromWallet: string,
    toAddress: string,
    amount: string,
    privateKey: string
  ): Promise<string> {
    try {
      // Create wallet instance
      const wallet = new ethers.Wallet(privateKey, this.provider);
      
      // Validate addresses
      if (!ethers.isAddress(toAddress)) {
        throw new Error('Invalid destination address');
      }

      // Parse amount
      const amountWei = ethers.parseEther(amount);

      // Check balance
      const balance = await this.provider.getBalance(fromWallet);
      if (balance < amountWei) {
        throw new Error('Insufficient balance');
      }

      // Estimate gas
      const gasPrice = await this.provider.getFeeData();
      const gasLimit = await wallet.estimateGas({
        to: toAddress,
        value: amountWei,
      });

      // Send transaction
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: amountWei,
        gasLimit,
        gasPrice: gasPrice.gasPrice,
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      logger.info(`Transfer successful: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
    } catch (error: any) {
      logger.error('Transfer failed:', error);
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }

  /**
   * Distribute funds across multiple wallets
   */
  async distributeFunds(
    fromWallet: string,
    toWallets: string[],
    amountPerWallet: string,
    privateKey: string
  ): Promise<string[]> {
    const txHashes: string[] = [];

    for (const toWallet of toWallets) {
      try {
        const txHash = await this.transfer(
          fromWallet,
          toWallet,
          amountPerWallet,
          privateKey
        );
        txHashes.push(txHash);
      } catch (error) {
        logger.error(`Failed to distribute to ${toWallet}:`, error);
      }
    }

    return txHashes;
  }

  /**
   * Consolidate funds from multiple wallets
   */
  async consolidateFunds(
    fromWallets: Array<{ address: string; privateKey: string }>,
    toWallet: string
  ): Promise<string[]> {
    const txHashes: string[] = [];

    for (const fromWallet of fromWallets) {
      try {
        // Get balance
        const balance = await this.getBalance(fromWallet.address);
        
        if (balance.coreAmount > 0.001) { // Min amount to consolidate
          // Leave some for gas
          const amountToSend = (balance.coreAmount * 0.95).toFixed(6);
          
          const txHash = await this.transfer(
            fromWallet.address,
            toWallet,
            amountToSend,
            fromWallet.privateKey
          );
          txHashes.push(txHash);
        }
      } catch (error) {
        logger.error(`Failed to consolidate from ${fromWallet.address}:`, error);
      }
    }

    return txHashes;
  }

  /**
   * Get CORE price in USD (mock for now)
   */
  private async getCorePrice(): Promise<number> {
    // TODO: Integrate with price service
    return 0.5; // Mock price
  }

  /**
   * Validate wallet ownership
   */
  async validateWalletOwnership(userId: string, walletAddress: string): Promise<boolean> {
    const wallet = await this.db.getWalletByAddress(walletAddress);
    return wallet?.userId === userId;
  }
}