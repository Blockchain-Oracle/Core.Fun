import { createLogger } from '@core-meme/shared';
import { ethers } from 'ethers';
import crypto from 'crypto';

export class WalletService {
  private logger = createLogger({ service: 'wallet-service' });
  private encryptionKey: string;
  
  constructor() {
    // In production, this should be loaded from a secure environment variable
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default_encryption_key_change_in_production';
  }
  
  /**
   * Generate a new wallet
   */
  async generateWallet(): Promise<{
    address: string;
    privateKey: string;
    encryptedPrivateKey: string;
  }> {
    try {
      // Create a new random wallet
      const wallet = ethers.Wallet.createRandom();
      
      // Get wallet details
      const address = wallet.address;
      const privateKey = wallet.privateKey;
      
      // Encrypt private key
      const encryptedPrivateKey = await this.encryptPrivateKey(privateKey, 'default');
      
      return {
        address,
        privateKey,
        encryptedPrivateKey
      };
    } catch (error) {
      this.logger.error('Error generating wallet:', error);
      throw new Error('Failed to generate wallet');
    }
  }
  
  /**
   * Encrypt a private key using a user-specific salt
   */
  async encryptPrivateKey(privateKey: string, userSalt: string | number): Promise<string> {
    try {
      const salt = userSalt.toString();
      const key = crypto.scryptSync(this.encryptionKey, salt, 32);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Store IV with the encrypted data
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      this.logger.error('Error encrypting private key:', error);
      throw new Error('Failed to encrypt private key');
    }
  }
  
  /**
   * Decrypt a private key using a user-specific salt
   */
  async decryptPrivateKey(encryptedPrivateKey: string, userSalt: string | number): Promise<string> {
    try {
      const salt = userSalt.toString();
      const key = crypto.scryptSync(this.encryptionKey, salt, 32);
      
      // Extract IV from the encrypted data
      const parts = encryptedPrivateKey.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted private key format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Error decrypting private key:', error);
      throw new Error('Failed to decrypt private key');
    }
  }
  
  /**
   * Verify that a private key corresponds to an address
   */
  async verifyPrivateKey(privateKey: string, address: string): Promise<boolean> {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return wallet.address.toLowerCase() === address.toLowerCase();
    } catch (error) {
      this.logger.error('Error verifying private key:', error);
      return false;
    }
  }
  
  /**
   * Get wallet balance in CORE and tokens
   */
  async getWalletBalance(address: string): Promise<{
    coreBalance: string;
    tokens: Array<{
      address: string;
      symbol: string;
      balance: string;
    }>;
  }> {
    try {
      const provider = new ethers.JsonRpcProvider(process.env.CORE_RPC_URL);
      
      // Get CORE balance
      const coreBalance = await provider.getBalance(address);
      
      // For a real implementation, we would query token balances from a database or indexer
      // Here we're just returning the CMP token balance as an example
      const cmpTokenAddress = process.env.STAKING_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655';
      const cmpTokenAbi = ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'];
      const cmpToken = new ethers.Contract(cmpTokenAddress, cmpTokenAbi, provider);
      
      const cmpBalance = await cmpToken.balanceOf(address);
      const cmpSymbol = await cmpToken.symbol();
      
      return {
        coreBalance: ethers.formatEther(coreBalance),
        tokens: [
          {
            address: cmpTokenAddress,
            symbol: cmpSymbol,
            balance: ethers.formatEther(cmpBalance)
          }
        ]
      };
    } catch (error) {
      this.logger.error('Error getting wallet balance:', error);
      return {
        coreBalance: '0',
        tokens: []
      };
    }
  }
}
