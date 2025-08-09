import { ethers } from 'ethers';
import CryptoJS from 'crypto-js';
import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';

interface WalletData {
  address: string;
  privateKey: string;
}

export class WalletManager {
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
        name: 'Primary',
        address: wallet.address.toLowerCase(),
        type: 'primary',
        encryptedPrivateKey: encryptedKey,
        network: 'CORE',
      });

      logger.info('Wallet created', { userId, address: wallet.address });

      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
      };
    } catch (error) {
      logger.error('Failed to create wallet', { error, userId });
      throw error;
    }
  }

  async importWallet(userId: string, privateKey: string): Promise<string> {
    try {
      // Validate private key
      const wallet = new ethers.Wallet(privateKey);
      
      // Encrypt private key
      const encryptedKey = this.encryptPrivateKey(privateKey);
      
      // Save to database
      await this.database.createWallet({
        userId,
        name: 'Imported',
        address: wallet.address.toLowerCase(),
        type: 'primary',
        encryptedPrivateKey: encryptedKey,
        network: 'CORE',
      });

      logger.info('Wallet imported', { userId, address: wallet.address });

      return wallet.address;
    } catch (error) {
      logger.error('Failed to import wallet', { error, userId });
      throw new Error('Invalid private key');
    }
  }

  /**
   * Get wallet data for a user
   */
  async getWallet(userId: number | string): Promise<WalletData | null> {
    try {
      const userIdStr = userId.toString();
      const user = await this.database.getUserById(userIdStr);
      
      if (!user || !user.walletAddress || !user.encryptedPrivateKey) {
        return null;
      }

      // Decrypt private key
      const privateKey = this.decryptPrivateKey(user.encryptedPrivateKey);
      
      return {
        address: user.walletAddress,
        privateKey,
      };
    } catch (error) {
      logger.error('Failed to get wallet', { error, userId });
      return null;
    }
  }

  async getUserWallet(userId: string): Promise<string | null> {
    try {
      const user = await this.database.getUserById(userId);
      return user?.walletAddress || null;
    } catch (error) {
      logger.error('Failed to get user wallet', { error, userId });
      return null;
    }
  }

  async getWalletWithSigner(userId: number | string): Promise<ethers.Wallet | null> {
    try {
      const walletData = await this.getWallet(userId);
      
      if (!walletData) {
        return null;
      }

      // Create wallet with provider
      const provider = new ethers.JsonRpcProvider(
        process.env.CORE_RPC_URL || 'https://rpc.coredao.org'
      );
      const wallet = new ethers.Wallet(walletData.privateKey, provider);
      
      return wallet;
    } catch (error) {
      logger.error('Failed to get wallet with signer', { error, userId });
      return null;
    }
  }

  async exportPrivateKey(userId: string): Promise<string> {
    try {
      const user = await this.database.getUserById(userId);
      
      if (!user || !user.encryptedPrivateKey) {
        throw new Error('No wallet found');
      }

      // Decrypt private key
      const privateKey = this.decryptPrivateKey(user.encryptedPrivateKey);
      
      logger.info('Private key exported', { userId });
      
      return privateKey;
    } catch (error) {
      logger.error('Failed to export private key', { error, userId });
      throw error;
    }
  }

  private encryptPrivateKey(privateKey: string): string {
    return CryptoJS.AES.encrypt(privateKey, this.encryptionKey).toString();
  }

  private decryptPrivateKey(encryptedKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  async rotateEncryption(newKey: string): Promise<void> {
    // Utility method to rotate encryption keys
    try {
      // Get all users
      const users = await this.database.getAllUsers();
      
      for (const user of users) {
        if (user.encryptedPrivateKey) {
          // Decrypt with old key
          const privateKey = this.decryptPrivateKey(user.encryptedPrivateKey);
          
          // Encrypt with new key
          const newEncrypted = CryptoJS.AES.encrypt(privateKey, newKey).toString();
          
          // Update database
          await this.database.updateUserEncryptedKey(user.id, newEncrypted);
        }
      }

      this.encryptionKey = newKey;
      logger.info('Encryption key rotated successfully');
    } catch (error) {
      logger.error('Failed to rotate encryption key', { error });
      throw error;
    }
  }
}