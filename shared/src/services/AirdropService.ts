import { ethers } from 'ethers';
import { createLogger } from '../logger';
import { DatabaseService } from './DatabaseService';

const logger = createLogger({ service: 'airdrop-service' });

// CMP Token ABI - only what we need for transfers
const CMP_TOKEN_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export class AirdropService {
  private provider: ethers.JsonRpcProvider;
  private adminWallet: ethers.Wallet;
  private cmpToken: ethers.Contract;
  private db: DatabaseService;
  private readonly AIRDROP_AMOUNT = '1000'; // 1000 CMP tokens
  
  constructor(db: DatabaseService) {
    this.db = db;
    
    // Initialize provider
    const rpcUrl = process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Initialize admin wallet
    const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      throw new Error('ADMIN_PRIVATE_KEY not configured');
    }
    
    // Add 0x prefix if not present
    const formattedKey = adminPrivateKey.startsWith('0x') ? adminPrivateKey : `0x${adminPrivateKey}`;
    this.adminWallet = new ethers.Wallet(formattedKey, this.provider);
    
    // Initialize CMP token contract
    const cmpTokenAddress = process.env.CMP_TOKEN_ADDRESS || '0x26EfC13dF039c6B4E084CEf627a47c348197b655';
    this.cmpToken = new ethers.Contract(cmpTokenAddress, CMP_TOKEN_ABI, this.adminWallet);
    
    logger.info(`AirdropService initialized with admin wallet: ${this.adminWallet.address}`);
  }
  
  /**
   * Send initial CMP airdrop to a user
   */
  async sendInitialAirdrop(userId: string, walletAddress: string): Promise<{
    success: boolean;
    txHash?: string;
    amount?: string;
    error?: string;
  }> {
    try {
      // Validate wallet address
      if (!ethers.isAddress(walletAddress)) {
        return { success: false, error: 'Invalid wallet address' };
      }
      
      // Check if user already claimed
      const user = await this.db.getUserById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      
      if (user.claimed_initial_cmp) {
        return { success: false, error: 'Already claimed initial CMP tokens' };
      }
      
      // Check admin wallet balance
      const adminBalance = await this.cmpToken.balanceOf(this.adminWallet.address);
      const decimals = await this.cmpToken.decimals();
      const airdropAmount = ethers.parseUnits(this.AIRDROP_AMOUNT, decimals);
      
      if (adminBalance < airdropAmount) {
        logger.error(`Insufficient CMP balance in admin wallet. Has: ${ethers.formatUnits(adminBalance, decimals)}, Needs: ${this.AIRDROP_AMOUNT}`);
        return { success: false, error: 'Insufficient tokens in airdrop pool' };
      }
      
      // Send the airdrop
      logger.info(`Sending ${this.AIRDROP_AMOUNT} CMP to ${walletAddress}`);
      const tx = await this.cmpToken.transfer(walletAddress, airdropAmount);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        // Update database
        await this.db.markAirdropClaimed(userId, tx.hash);
        
        logger.info(`Airdrop successful! TX: ${tx.hash}`);
        return {
          success: true,
          txHash: tx.hash,
          amount: this.AIRDROP_AMOUNT
        };
      } else {
        logger.error(`Airdrop transaction failed: ${tx.hash}`);
        return { success: false, error: 'Transaction failed' };
      }
      
    } catch (error: any) {
      logger.error('Airdrop failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to send airdrop'
      };
    }
  }
  
  /**
   * Check user's CMP balance
   */
  async checkCMPBalance(walletAddress: string): Promise<string> {
    try {
      if (!ethers.isAddress(walletAddress)) {
        return '0';
      }
      
      const balance = await this.cmpToken.balanceOf(walletAddress);
      const decimals = await this.cmpToken.decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      logger.error('Failed to check CMP balance:', error);
      return '0';
    }
  }
  
  /**
   * Get tier based on CMP balance
   */
  getTierFromBalance(cmpBalance: number): {
    tier: string;
    tierLevel: number;
    feeDiscount: number;
    benefits: any;
  } {
    if (cmpBalance >= 50000) {
      return {
        tier: 'Platinum',
        tierLevel: 4,
        feeDiscount: 5,
        benefits: {
          copyTradeSlots: 10,
          alertLimit: -1, // Unlimited
          prioritySupport: true,
          revenueShare: true,
          apiAccess: true,
          apy: 25
        }
      };
    } else if (cmpBalance >= 10000) {
      return {
        tier: 'Gold',
        tierLevel: 3,
        feeDiscount: 3,
        benefits: {
          copyTradeSlots: 5,
          alertLimit: 50,
          prioritySupport: true,
          revenueShare: true,
          apiAccess: true,
          apy: 20
        }
      };
    } else if (cmpBalance >= 5000) {
      return {
        tier: 'Silver',
        tierLevel: 2,
        feeDiscount: 2,
        benefits: {
          copyTradeSlots: 3,
          alertLimit: 25,
          prioritySupport: false,
          revenueShare: true,
          apiAccess: false,
          apy: 15
        }
      };
    } else if (cmpBalance >= 1000) {
      return {
        tier: 'Bronze',
        tierLevel: 1,
        feeDiscount: 1,
        benefits: {
          copyTradeSlots: 1,
          alertLimit: 10,
          prioritySupport: false,
          revenueShare: true,
          apiAccess: false,
          apy: 10
        }
      };
    } else {
      return {
        tier: 'Free',
        tierLevel: 0,
        feeDiscount: 0,
        benefits: {
          copyTradeSlots: 0,
          alertLimit: 5,
          prioritySupport: false,
          revenueShare: false,
          apiAccess: false,
          apy: 0
        }
      };
    }
  }
  
  /**
   * Check if airdrop is available for user
   */
  async isAirdropAvailable(userId: string): Promise<boolean> {
    try {
      const user = await this.db.getUserById(userId);
      return user ? !user.claimed_initial_cmp : false;
    } catch (error) {
      logger.error('Failed to check airdrop availability:', error);
      return false;
    }
  }
  
  /**
   * Get admin wallet CMP balance
   */
  async getAirdropPoolBalance(): Promise<string> {
    try {
      const balance = await this.cmpToken.balanceOf(this.adminWallet.address);
      const decimals = await this.cmpToken.decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      logger.error('Failed to get airdrop pool balance:', error);
      return '0';
    }
  }
}

// Export singleton instance
let airdropService: AirdropService | null = null;

export function getAirdropService(db: DatabaseService): AirdropService {
  if (!airdropService) {
    airdropService = new AirdropService(db);
  }
  return airdropService;
}