import { ethers } from 'ethers';
import * as crypto from 'crypto';
import { DatabaseService } from './DatabaseService';
import { createLogger } from '../logger';
import { Wallet } from '../database/types';

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
  private logger = createLogger({ service: 'wallet-service' });
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
      this.logger.warn('ENCRYPTION_SECRET not set, using default (not secure for production)');
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
      
      this.logger.debug(`Decrypting with telegramId: ${telegramId}, IV length: ${iv.length}`);
      
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
      this.logger.error(`TelegramId used: ${telegramId}, EncryptedKey format: ${encryptedKey?.substring(0, 20)}...`);
      throw new Error(`Failed to decrypt wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new wallet for a user
   */
  async createUserWallet(telegramId: number, username?: string): Promise<{ user: any; wallet: Wallet }> {
    try {
      // Generate new wallet
      const wallet = ethers.Wallet.createRandom();
      
      // Encrypt private key
      const encryptedPrivateKey = await this.encryptPrivateKey(
        wallet.privateKey,
        telegramId
      );
      
      // Create user with wallet
      const user = await this.db.createUser({
        telegramId,
        username: username || `user_${telegramId}`,
        walletAddress: wallet.address,
        encryptedPrivateKey,
      });
      
      this.logger.info(`Created wallet ${wallet.address} for user ${user.id}`);
      
      return {
        user,
        wallet: {
          id: user.id,
          userId: user.id,
          name: 'Primary Wallet',
          address: wallet.address,
          type: 'primary',
          encryptedPrivateKey,
          network: 'CORE',
          createdAt: user.createdAt,
        },
      };
    } catch (error) {
      this.logger.error('Failed to create user wallet:', error);
      throw error;
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

    this.logger.info(`Created trading wallet ${wallet.address} for user ${userId}`);

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

      this.logger.info(`Imported wallet ${wallet.address} for user ${userId}`);

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

    this.logger.info(`Added withdraw wallet ${address} for user ${userId}`);

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
   * Get wallet by address
   */
  async getWalletByAddress(address: string): Promise<Wallet | null> {
    return this.db.getWalletByAddress(address);
  }

  /**
   * Get user wallet (for compatibility)
   */
  async getUserWallet(userId: string): Promise<Wallet | null> {
    return this.db.getUserWallet(userId);
  }

  /**
   * Get wallet balance
   */
  async getBalance(address: string): Promise<Balance> {
    try {
      // Get CORE balance
      const balanceWei = await this.provider.getBalance(address);
      const balanceCore = ethers.formatEther(balanceWei);
      
      // Get USD price from price service
      const corePrice = await this.getCorePrice();
      const balanceUsd = parseFloat(balanceCore) * corePrice;

      // Get tracked tokens from user preferences (not balances!)
      // In production, this would fetch user's tracked tokens from database
      const trackedTokens: any[] = [];
      
      // Fetch REAL token balances from Core blockchain
      const tokens = await Promise.all(
        trackedTokens.map(async (token: any) => {
          try {
            // Get real-time balance from Core blockchain
            const tokenContract = new ethers.Contract(
              token.address || token.tokenAddress,
              [
                'function balanceOf(address) view returns (uint256)',
                'function decimals() view returns (uint8)',
                'function symbol() view returns (string)',
                'function name() view returns (string)'
              ],
              this.provider
            );
            
            const [balance, decimals, symbol, name] = await Promise.all([
              tokenContract.balanceOf(address),
              tokenContract.decimals().catch(() => 18),
              tokenContract.symbol().catch(() => 'UNKNOWN'),
              tokenContract.name().catch(() => 'Unknown Token')
            ]);
            
            const formattedBalance = ethers.formatUnits(balance, decimals);
            
            return {
              address: token.address || token.tokenAddress,
              symbol,
              name,
              balance: formattedBalance,
              decimals,
              value: parseFloat(formattedBalance) * (token.priceUsd || 0),
              rawBalance: balance.toString()
            };
          } catch (error) {
            this.logger.warn(`Failed to get balance for token ${token.tokenAddress}:`, error);
            return null;
          }
        })
      ).then(results => results.filter(Boolean) as any[]);

      return {
        core: balanceCore,
        coreAmount: parseFloat(balanceCore),
        usd: balanceUsd.toFixed(2),
        usdAmount: balanceUsd,
        tokens,
      };
    } catch (error) {
      this.logger.error('Failed to get balance:', error);
      throw new Error('Failed to retrieve balance');
    }
  }

  /**
   * Export private key (with security checks)
   */
  async exportPrivateKey(userId: string, walletAddress: string, telegramId: number): Promise<string> {
    let encryptedPrivateKey: string | undefined;
    let walletFound = false;
    let userTelegramId: number | undefined;

    // First, check if this is the user's primary wallet
    const user = await this.db.getUserById(userId);
    if (user && user.walletAddress === walletAddress) {
      encryptedPrivateKey = user.encryptedPrivateKey;
      userTelegramId = user.telegramId;
      walletFound = true;
    } else {
      // Check additional wallets table
      const wallet = await this.db.getWalletByAddress(walletAddress);
      if (wallet && wallet.userId === userId) {
        encryptedPrivateKey = wallet.encryptedPrivateKey;
        // Get the user's telegram ID for decryption
        if (user) {
          userTelegramId = user.telegramId;
        }
        walletFound = true;
      }
    }
    
    if (!walletFound) {
      throw new Error('Wallet not found');
    }

    if (!encryptedPrivateKey) {
      throw new Error('Private key not available for this wallet');
    }

    if (!userTelegramId) {
      throw new Error('Unable to get user telegram ID for decryption');
    }

    this.logger.info(`Attempting to decrypt wallet for user ${userId}, telegramId: ${userTelegramId}`);

    // Decrypt private key using the stored telegram ID
    const privateKey = await this.decryptPrivateKey(
      encryptedPrivateKey,
      userTelegramId
    );

    // Log export action for security
    this.logger.warn(`Private key exported for wallet ${walletAddress} by user ${userId}`);

    return privateKey;
  }

  /**
   * Get wallet with decrypted private key
   */
  async getWalletWithPrivateKey(userId: string, walletAddress: string): Promise<ethers.Wallet> {
    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const privateKey = await this.exportPrivateKey(userId, walletAddress, user.telegramId);
    return new ethers.Wallet(privateKey, this.provider);
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

      this.logger.info(`Transfer successful: ${receipt?.hash}`);

      return receipt?.hash || tx.hash;
    } catch (error: any) {
      this.logger.error('Transfer failed:', error);
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }

  /**
   * Sign transaction
   */
  async signTransaction(userId: string, walletAddress: string, transaction: any): Promise<string> {
    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const privateKey = await this.exportPrivateKey(userId, walletAddress, user.telegramId);
    const wallet = new ethers.Wallet(privateKey, this.provider);
    
    const signedTx = await wallet.signTransaction(transaction);
    return signedTx;
  }

  /**
   * Send signed transaction
   */
  async sendSignedTransaction(signedTx: string): Promise<string> {
    const tx = await this.provider.broadcastTransaction(signedTx);
    const receipt = await tx.wait();
    return receipt?.hash || tx.hash;
  }

  /**
   * Get CORE price in USD from CoinGecko API
   */
  private async getCorePrice(): Promise<number> {
    try {
      // Use CoinGecko API with proper error handling and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd', {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CoreMemeplatform/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();
      const price = data.coredaoorg?.usd;

      if (typeof price === 'number' && price > 0) {
        this.logger.info('Successfully fetched CORE price from CoinGecko', { price });
        return price;
      } else {
        throw new Error('Invalid price data from CoinGecko API');
      }
    } catch (error) {
      this.logger.warn('Failed to fetch CORE price, using fallback:', error);
      return 0.50; // Fallback price
    }
  }

  /**
   * Validate wallet ownership
   */
  async validateWalletOwnership(userId: string, walletAddress: string): Promise<boolean> {
    const wallet = await this.db.getWalletByAddress(walletAddress);
    return wallet?.userId === userId;
  }

  /**
   * Get provider
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }
}