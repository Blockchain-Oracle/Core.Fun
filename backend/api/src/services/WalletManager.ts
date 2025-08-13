import { ethers } from 'ethers';
import CryptoJS from 'crypto-js';
import { DatabaseService } from './DatabaseService';
import { createLogger } from '@core-meme/shared';

interface WalletData {
  address: string;
  privateKey: string;
}

export class WalletManager {
  private logger = createLogger({ service: 'wallet-manager' });
  private database: DatabaseService;
  private encryptionKey: string;

  constructor(database: DatabaseService) {
    this.database = database;
    this.encryptionKey = process.env.ENCRYPTION_SECRET || '';
    
    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_SECRET not set');
    }
  }

  async createWallet(userId: string): Promise<WalletData> {
    try {
      // Generate new wallet
      const wallet = ethers.Wallet.createRandom();
      
      // Encrypt private key
      const encryptedKey = this.encryptPrivateKey(wallet.privateKey);
      
      // Save to database
      await this.database.createWallet({
        userId,
        address: wallet.address.toLowerCase(),
        encryptedPrivateKey: encryptedKey,
      });

      this.logger.info('Wallet created', { userId, address: wallet.address });

      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
      };
    } catch (error) {
      this.logger.error('Failed to create wallet', { error, userId });
      throw error;
    }
  }

  async getWallet(userId: string): Promise<WalletData | null> {
    try {
      const wallet = await this.database.getUserWallet(userId);
      
      if (!wallet) {
        return null;
      }

      // Decrypt private key
      const privateKey = this.decryptPrivateKey(wallet.encryptedPrivateKey);
      
      return {
        address: wallet.address,
        privateKey,
      };
    } catch (error) {
      this.logger.error('Failed to get wallet', { error, userId });
      return null;
    }
  }

  async getWalletWithSigner(userId: string): Promise<ethers.Wallet | null> {
    try {
      const walletData = await this.getWallet(userId);
      
      if (!walletData) {
        // Create wallet if doesn't exist
        const newWallet = await this.createWallet(userId);
        walletData = newWallet;
      }

      // Create wallet with provider
      const provider = new ethers.JsonRpcProvider(
        process.env.CORE_RPC_URL || 'https://rpc.test2.btcs.network'
      );
      const wallet = new ethers.Wallet(walletData.privateKey, provider);
      
      return wallet;
    } catch (error) {
      this.logger.error('Failed to get wallet with signer', { error, userId });
      return null;
    }
  }

  async exportPrivateKey(userId: string): Promise<string | null> {
    try {
      const wallet = await this.getWallet(userId);
      
      if (!wallet) {
        throw new Error('No wallet found');
      }
      
      this.logger.info('Private key exported', { userId });
      return wallet.privateKey;
    } catch (error) {
      this.logger.error('Failed to export private key', { error, userId });
      return null;
    }
  }

  private encryptPrivateKey(privateKey: string): string {
    return CryptoJS.AES.encrypt(privateKey, this.encryptionKey).toString();
  }

  private decryptPrivateKey(encryptedKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}