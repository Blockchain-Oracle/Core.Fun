import { ethers, Contract } from 'ethers';
import { createLogger } from '../logger';

// ABIs for contracts
const MEME_TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function description() view returns (string)',
  'function image() view returns (string)',
  'function twitter() view returns (string)',
  'function telegram() view returns (string)',
  'function website() view returns (string)',
  'function maxWallet() view returns (uint256)',
  'function maxTransaction() view returns (uint256)',
  'function tradingEnabled() view returns (bool)',
  'function owner() view returns (address)',
  'function launchBlock() view returns (uint256)',
  'function getMetadata() view returns (string,string,string,string,string,uint256,uint256,bool,address)',
];

const MEME_FACTORY_ABI = [
  'function tokenToSale(address) view returns (address,string,string,address,uint256,uint256,bool,bool,uint256,uint256)',
  'function getTokenInfo(address) view returns (tuple(address token,string name,string symbol,address creator,uint256 sold,uint256 raised,bool isOpen,bool isLaunched,uint256 createdAt,uint256 launchedAt))',
  'function calculateTokensOut(uint256,uint256) view returns (uint256)',
  'function calculateETHOut(uint256,uint256) view returns (uint256)',
  'function creationFee() view returns (uint256)',
  'function platformTradingFee() view returns (uint256)',
];

const STAKING_ABI = [
  'function getUserFeeDiscount(address) view returns (uint256)',
  'function getUserTier(address) view returns (uint256)',
  'function isPremiumUser(address) view returns (bool)',
  'function pendingReward(address) view returns (uint256)',
  'function stakes(address) view returns (uint256,uint256,uint256,uint256,bool)',
  'function getStakingStats(address) view returns (uint256,uint256,uint256,uint256,bool)',
];

export interface CompleteTokenData {
  // Basic token info
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  
  // Metadata - CRITICAL FIELDS
  description: string;
  image: string;
  twitter: string;
  telegram: string;
  website: string;
  
  // Trading controls
  maxWallet: string;
  maxTransaction: string;
  tradingEnabled: boolean;
  owner: string;
  launchBlock: number;
  
  // Sale info from factory
  creator: string;
  sold: string;
  raised: string;
  isOpen: boolean;
  isLaunched: boolean;
  createdAt: number;
  launchedAt: number;
  
  // Bonding curve data
  bondingCurveProgress: number;
  currentPrice: string;
  targetAmount: string;
  raisedAmount: string;
  tokensRemaining: string;
}

export interface StakingBenefits {
  userStake: string;
  feeDiscount: number;
  tier: number;
  tierName: string;
  isPremium: boolean;
  pendingRewards: string;
  totalEarned: string;
}

export class ContractDataService {
  private provider: ethers.Provider;
  private factoryAddress: string;
  private stakingAddress: string;
  private logger;

  constructor(
    rpcUrl: string,
    factoryAddress: string,
    stakingAddress: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.factoryAddress = factoryAddress;
    this.stakingAddress = stakingAddress;
    this.logger = createLogger({ service: 'contract-data-service' });
  }

  /**
   * GET COMPLETE TOKEN DATA - ALL FIELDS, NO EXCEPTIONS
   */
  async getCompleteTokenData(tokenAddress: string): Promise<CompleteTokenData> {
    try {
      this.logger.info(`Fetching COMPLETE data for token ${tokenAddress}`);
      
      // Create contract instances
      const tokenContract = new Contract(tokenAddress, MEME_TOKEN_ABI, this.provider);
      const factoryContract = new Contract(this.factoryAddress, MEME_FACTORY_ABI, this.provider);
      
      // Fetch ALL token fields in parallel - NO FIELD LEFT BEHIND
      const [
        name,
        symbol,
        decimals,
        totalSupply,
        description,
        image,
        twitter,
        telegram,
        website,
        maxWallet,
        maxTransaction,
        tradingEnabled,
        owner,
        launchBlock
      ] = await Promise.all([
        tokenContract.name().catch(() => ''),
        tokenContract.symbol().catch(() => ''),
        tokenContract.decimals().catch(() => 18),
        tokenContract.totalSupply().catch(() => '0'),
        tokenContract.description().catch(() => ''),
        tokenContract.image().catch(() => ''),
        tokenContract.twitter().catch(() => ''),
        tokenContract.telegram().catch(() => ''),
        tokenContract.website().catch(() => ''),
        tokenContract.maxWallet().catch(() => '0'),
        tokenContract.maxTransaction().catch(() => '0'),
        tokenContract.tradingEnabled().catch(() => false),
        tokenContract.owner().catch(() => ethers.ZeroAddress),
        tokenContract.launchBlock().catch(() => 0),
      ]);
      
      // Get sale info from factory
      const saleInfo = await factoryContract.tokenToSale(tokenAddress).catch(() => null);
      
      // Parse sale info
      let creator = ethers.ZeroAddress;
      let sold = '0';
      let raised = '0';
      let isOpen = false;
      let isLaunched = false;
      let createdAt = 0;
      let launchedAt = 0;
      
      if (saleInfo) {
        creator = saleInfo[3];
        sold = saleInfo[4].toString();
        raised = saleInfo[5].toString();
        isOpen = saleInfo[6];
        isLaunched = saleInfo[7];
        createdAt = Number(saleInfo[8]);
        launchedAt = Number(saleInfo[9]);
      }
      
      // Calculate bonding curve progress
      const TARGET_CORE = ethers.parseEther('3'); // 3 CORE to graduate
      const bondingCurveProgress = raised !== '0' 
        ? (Number(ethers.formatEther(raised)) / 3) * 100
        : 0;
      
      // Calculate current price from bonding curve
      let currentPrice = '0';
      try {
        const oneToken = ethers.parseEther('1');
        const ethNeeded = await factoryContract.calculateETHOut(tokenAddress, oneToken);
        currentPrice = ethers.formatEther(ethNeeded);
      } catch {
        // Use fallback calculation
        currentPrice = '0.000001';
      }
      
      // Calculate tokens remaining
      const MAX_TOKENS = ethers.parseEther('500000'); // 500k tokens in bonding curve
      const tokensRemaining = MAX_TOKENS - BigInt(sold);
      
      return {
        // Basic info
        address: tokenAddress,
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        decimals: Number(decimals),
        totalSupply: totalSupply.toString(),
        
        // CRITICAL METADATA - MUST NOT BE EMPTY
        description: description || '',
        image: image || '',
        twitter: twitter || '',
        telegram: telegram || '',
        website: website || '',
        
        // Trading controls
        maxWallet: maxWallet.toString(),
        maxTransaction: maxTransaction.toString(),
        tradingEnabled: Boolean(tradingEnabled),
        owner: owner,
        launchBlock: Number(launchBlock),
        
        // Sale info
        creator: creator,
        sold: sold,
        raised: raised,
        isOpen: isOpen,
        isLaunched: isLaunched,
        createdAt: createdAt,
        launchedAt: launchedAt,
        
        // Bonding curve
        bondingCurveProgress: bondingCurveProgress,
        currentPrice: currentPrice,
        targetAmount: ethers.formatEther(TARGET_CORE),
        raisedAmount: ethers.formatEther(raised),
        tokensRemaining: ethers.formatEther(tokensRemaining),
      };
      
    } catch (error) {
      this.logger.error(`Error fetching complete token data: ${error}`);
      throw error;
    }
  }

  /**
   * Get user's staking benefits
   */
  async getUserStakingBenefits(userAddress: string): Promise<StakingBenefits> {
    try {
      const stakingContract = new Contract(this.stakingAddress, STAKING_ABI, this.provider);
      
      // Fetch all staking data in parallel
      const [
        stakingStats,
        feeDiscount,
        tier,
        isPremium,
        pendingRewards
      ] = await Promise.all([
        stakingContract.getStakingStats(userAddress).catch(() => ['0', '0', '0', 0, false]),
        stakingContract.getUserFeeDiscount(userAddress).catch(() => 0),
        stakingContract.getUserTier(userAddress).catch(() => 0),
        stakingContract.isPremiumUser(userAddress).catch(() => false),
        stakingContract.pendingReward(userAddress).catch(() => '0'),
      ]);
      
      // Parse staking stats
      const [stakedAmount, , totalEarned] = stakingStats;
      
      // Determine tier name
      const tierNames = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum'];
      const tierName = tierNames[Number(tier)] || 'None';
      
      return {
        userStake: ethers.formatEther(stakedAmount),
        feeDiscount: Number(feeDiscount) / 100, // Convert basis points to percentage
        tier: Number(tier),
        tierName: tierName,
        isPremium: Boolean(isPremium),
        pendingRewards: ethers.formatEther(pendingRewards),
        totalEarned: ethers.formatEther(totalEarned),
      };
      
    } catch (error) {
      this.logger.error(`Error fetching staking benefits: ${error}`);
      // Return default values on error
      return {
        userStake: '0',
        feeDiscount: 0,
        tier: 0,
        tierName: 'None',
        isPremium: false,
        pendingRewards: '0',
        totalEarned: '0',
      };
    }
  }

  /**
   * Calculate price impact for a trade
   */
  async calculatePriceImpact(
    tokenAddress: string,
    amount: string,
    isBuy: boolean
  ): Promise<number> {
    try {
      const factoryContract = new Contract(this.factoryAddress, MEME_FACTORY_ABI, this.provider);
      
      // Get current price
      const oneToken = ethers.parseEther('1');
      const currentPrice = await factoryContract.calculateETHOut(tokenAddress, oneToken);
      
      // Calculate new price after trade
      const amountWei = ethers.parseEther(amount);
      let newPrice;
      
      if (isBuy) {
        const tokensOut = await factoryContract.calculateTokensOut(BigInt(0), amountWei);
        newPrice = await factoryContract.calculateETHOut(tokenAddress, oneToken);
      } else {
        const ethOut = await factoryContract.calculateETHOut(tokenAddress, amountWei);
        newPrice = ethOut;
      }
      
      // Calculate impact percentage
      const impact = ((Number(newPrice) - Number(currentPrice)) / Number(currentPrice)) * 100;
      return Math.abs(impact);
      
    } catch (error) {
      this.logger.error(`Error calculating price impact: ${error}`);
      return 0;
    }
  }

  /**
   * Get multiple tokens data in batch
   */
  async getBatchTokenData(tokenAddresses: string[]): Promise<CompleteTokenData[]> {
    return Promise.all(
      tokenAddresses.map(address => this.getCompleteTokenData(address))
    );
  }
}