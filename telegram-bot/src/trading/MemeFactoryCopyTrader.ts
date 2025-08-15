import { ethers } from 'ethers';
import { DatabaseService, StakingPosition } from '@core-meme/shared';
import { createLogger } from '@core-meme/shared';
import { ContractDataService } from '@core-meme/shared';

// Staking tier-based copy trade slot limits
const TIER_LIMITS = {
  0: { slots: 0, name: 'None' },      // No staking = no copy trading
  1: { slots: 1, name: 'Bronze' },    // 1,000+ CMP tokens
  2: { slots: 3, name: 'Silver' },    // 5,000+ CMP tokens
  3: { slots: 5, name: 'Gold' },      // 10,000+ CMP tokens
  4: { slots: 10, name: 'Platinum' }  // 50,000+ CMP tokens
};

// MemeFactory contract ABI (only events and functions we need)
const MEME_FACTORY_ABI = [
  'event TokenPurchased(address indexed token, address indexed buyer, uint256 amount, uint256 cost, uint256 timestamp)',
  'event TokenSold(address indexed token, address indexed seller, uint256 amount, uint256 proceeds, uint256 timestamp)',
  'function buyToken(address _token, uint256 _minTokens) external payable',
  'function sellToken(address _token, uint256 _amount, uint256 _minETH) external',
  'function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) public pure returns (uint256)',
  'function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) public pure returns (uint256)',
  'function getTokenInfo(address _token) external view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))'
];

export interface CopyTradeSettings {
  userId: string;
  targetWallet: string;  // The wallet address to copy trades from
  enabled: boolean;
  copyBuys: boolean;
  copySells: boolean;
  maxAmountPerTrade: number;  // Max CORE to spend per trade
  percentageOfWallet: number; // Percentage of user's balance to use
  minTokenAge: number;        // Minimum hours since token creation
  maxSlippage: number;        // Max slippage percentage
  blacklistedTokens: string[];
  whitelistedTokens: string[];
  stopLoss?: number;          // Optional stop loss percentage
  takeProfit?: number;        // Optional take profit percentage
  createdAt: Date;
  updatedAt?: Date;
}

export interface WalletStats {
  address: string;
  totalTrades: number;
  winRate: number;
  avgProfit: number;
  totalProfit: number;
  pnl30d: number;
  pnl7d: number;
  pnl24h: number;
  riskScore: number;
  lastActivity: Date;
  followers: number;
  isVerified: boolean;
  topTokens: Array<{
    token: string;
    profit: number;
    trades: number;
  }>;
}

export interface CopiedTrade {
  id: string;
  userId: string;
  targetWallet: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  type: 'buy' | 'sell';
  originalAmount: number;     // Original trade amount in CORE/tokens
  copiedAmount: number;       // Our copy amount in CORE/tokens
  originalTxHash: string;
  copiedTxHash?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  reason?: string;
  gasUsed?: string;
  estimatedProfit?: number;
  createdAt: Date;
  completedAt?: Date;
}

interface MonitoredWallet {
  address: string;
  followers: Set<string>;  // Set of userIds following this wallet
  lastBlock: number;
  stats?: WalletStats;
}

export class MemeFactoryCopyTrader {
  private logger = createLogger({ service: 'memefactory-copytrader' });
  private db: DatabaseService;
  private provider: ethers.JsonRpcProvider;
  private wsProvider?: ethers.WebSocketProvider;
  private contractService: ContractDataService;
  private memeFactory: ethers.Contract;
  private monitoredWallets: Map<string, MonitoredWallet> = new Map();
  private userWallets: Map<string, ethers.Wallet> = new Map();
  private isMonitoring: boolean = false;
  private pollInterval?: NodeJS.Timeout;

  constructor(db: DatabaseService) {
    this.db = db;
    
    const rpcUrl = process.env.CORE_RPC_URL || 'https://rpc.coredao.org';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Try to establish WebSocket connection for real-time monitoring
    const wsUrl = process.env.CORE_WS_URL;
    if (wsUrl) {
      try {
        this.wsProvider = new ethers.WebSocketProvider(wsUrl);
        this.logger.info('WebSocket provider connected for real-time monitoring');
      } catch (error) {
        this.logger.warn('WebSocket connection failed, falling back to polling', error);
      }
    }
    
    // Initialize MemeFactory contract
    const factoryAddress = process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784';
    this.memeFactory = new ethers.Contract(
      factoryAddress,
      MEME_FACTORY_ABI,
      this.provider
    );
    
    // Initialize contract service for additional data
    this.contractService = new ContractDataService(
      rpcUrl,
      factoryAddress,
      process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa'
    );
  }

  /**
   * Start copy trading for a user following a specific wallet
   */
  async startCopyTrading(settings: Partial<CopyTradeSettings>): Promise<CopyTradeSettings> {
    try {
      // Validate wallet address
      if (!settings.targetWallet || !ethers.isAddress(settings.targetWallet)) {
        throw new Error('Invalid target wallet address');
      }

      const targetWallet = settings.targetWallet.toLowerCase();
      const userId = settings.userId!;

      // Check user's staking tier for copy slot limits
      const slots = await this.getUserCopySlots(userId);
      if (slots.usedSlots >= slots.maxSlots) {
        throw new Error(
          `Copy slot limit reached. ${slots.tierName} tier allows ${slots.maxSlots} slots. ` +
          `Stake more CMP tokens to unlock more slots.`
        );
      }

      // Check if already copying this wallet
      const existing = await this.db.getCopyTradeSettings(userId, targetWallet);
      if (existing && existing.enabled) {
        throw new Error('Already copying this wallet');
      }

      // Analyze wallet performance
      const stats = await this.analyzeWallet(targetWallet);
      
      // Warn about high risk wallets
      if (stats.riskScore > 80) {
        this.logger.warn(`High risk wallet detected: ${targetWallet} (score: ${stats.riskScore})`);
      }

      // Create full settings with defaults
      const fullSettings: CopyTradeSettings = {
        userId,
        targetWallet,
        enabled: true,
        copyBuys: settings.copyBuys ?? true,
        copySells: settings.copySells ?? true,
        maxAmountPerTrade: settings.maxAmountPerTrade ?? 1, // 1 CORE default
        percentageOfWallet: settings.percentageOfWallet ?? 10, // 10% of balance default
        minTokenAge: settings.minTokenAge ?? 1, // 1 hour minimum age
        maxSlippage: settings.maxSlippage ?? 15, // 15% max slippage
        blacklistedTokens: settings.blacklistedTokens ?? [],
        whitelistedTokens: settings.whitelistedTokens ?? [],
        stopLoss: settings.stopLoss,
        takeProfit: settings.takeProfit,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save settings to database
      await this.db.saveCopyTradeSettings(fullSettings);

      // Start monitoring this wallet
      await this.addWalletToMonitor(targetWallet, userId);

      this.logger.info(
        `Started copy trading ${targetWallet} for user ${userId} ` +
        `(${slots.usedSlots + 1}/${slots.maxSlots} slots used)`
      );

      return fullSettings;
    } catch (error) {
      this.logger.error('Failed to start copy trading:', error);
      throw error;
    }
  }

  /**
   * Stop copy trading for a user
   */
  async stopCopyTrading(userId: string, targetWallet: string): Promise<void> {
    try {
      const wallet = targetWallet.toLowerCase();
      
      // Disable in database
      await this.db.updateCopyTradeSettings({
        userId,
        targetWallet: wallet,
        enabled: false,
        updatedAt: new Date()
      });

      // Remove from monitoring if no other users are following
      await this.removeWalletFromMonitor(wallet, userId);

      this.logger.info(`Stopped copy trading ${wallet} for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to stop copy trading:', error);
      throw error;
    }
  }

  /**
   * Add a wallet to the monitoring list
   */
  private async addWalletToMonitor(walletAddress: string, userId: string): Promise<void> {
    const address = walletAddress.toLowerCase();
    
    if (this.monitoredWallets.has(address)) {
      // Add user to existing monitored wallet
      const wallet = this.monitoredWallets.get(address)!;
      wallet.followers.add(userId);
    } else {
      // Create new monitored wallet
      const currentBlock = await this.provider.getBlockNumber();
      this.monitoredWallets.set(address, {
        address,
        followers: new Set([userId]),
        lastBlock: currentBlock
      });
    }

    // Start monitoring if not already running
    if (!this.isMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * Remove a wallet from monitoring
   */
  private async removeWalletFromMonitor(walletAddress: string, userId: string): Promise<void> {
    const address = walletAddress.toLowerCase();
    const wallet = this.monitoredWallets.get(address);
    
    if (wallet) {
      wallet.followers.delete(userId);
      
      // Remove wallet if no more followers
      if (wallet.followers.size === 0) {
        this.monitoredWallets.delete(address);
        
        // Stop monitoring if no wallets left
        if (this.monitoredWallets.size === 0) {
          this.stopMonitoring();
        }
      }
    }
  }

  /**
   * Start monitoring all wallets
   */
  private startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.logger.info('Starting wallet monitoring...');

    // Use WebSocket if available, otherwise poll
    if (this.wsProvider) {
      this.setupRealtimeMonitoring();
    } else {
      this.setupPollingMonitoring();
    }
  }

  /**
   * Setup real-time monitoring via WebSocket
   */
  private setupRealtimeMonitoring(): void {
    if (!this.wsProvider) return;

    // Listen for all TokenPurchased events
    this.memeFactory.on('TokenPurchased', async (
      token: string,
      buyer: string,
      amount: bigint,
      cost: bigint,
      timestamp: bigint,
      event: ethers.EventLog
    ) => {
      const buyerAddress = buyer.toLowerCase();
      
      // Check if this buyer is being monitored
      if (this.monitoredWallets.has(buyerAddress)) {
        await this.handleWalletTrade(buyerAddress, {
          type: 'buy',
          token: token.toLowerCase(),
          amount: amount.toString(),
          cost: cost.toString(),
          timestamp: Number(timestamp),
          txHash: event.transactionHash,
          blockNumber: event.blockNumber
        });
      }
    });

    // Listen for all TokenSold events
    this.memeFactory.on('TokenSold', async (
      token: string,
      seller: string,
      amount: bigint,
      proceeds: bigint,
      timestamp: bigint,
      event: ethers.EventLog
    ) => {
      const sellerAddress = seller.toLowerCase();
      
      // Check if this seller is being monitored
      if (this.monitoredWallets.has(sellerAddress)) {
        await this.handleWalletTrade(sellerAddress, {
          type: 'sell',
          token: token.toLowerCase(),
          amount: amount.toString(),
          proceeds: proceeds.toString(),
          timestamp: Number(timestamp),
          txHash: event.transactionHash,
          blockNumber: event.blockNumber
        });
      }
    });

    this.logger.info('Real-time monitoring started via WebSocket');
  }

  /**
   * Setup polling-based monitoring (fallback)
   */
  private setupPollingMonitoring(): void {
    // Poll every 3 seconds
    this.pollInterval = setInterval(async () => {
      try {
        await this.pollForTrades();
      } catch (error) {
        this.logger.error('Polling error:', error);
      }
    }, 3000);

    this.logger.info('Polling-based monitoring started');
  }

  /**
   * Poll for new trades from monitored wallets
   */
  private async pollForTrades(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    
    for (const [address, wallet] of this.monitoredWallets) {
      if (currentBlock <= wallet.lastBlock) continue;
      
      try {
        // Get logs for TokenPurchased events from this wallet
        const purchaseFilter = {
          address: this.memeFactory.target,
          topics: [
            ethers.id('TokenPurchased(address,address,uint256,uint256,uint256)'),
            null, // token (any)
            ethers.zeroPadValue(address, 32) // buyer must be our monitored wallet
          ],
          fromBlock: wallet.lastBlock + 1,
          toBlock: currentBlock
        };
        
        const purchaseLogs = await this.provider.getLogs(purchaseFilter);
        
        for (const log of purchaseLogs) {
          const parsed = this.memeFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data
          });
          
          if (parsed) {
            await this.handleWalletTrade(address, {
              type: 'buy',
              token: parsed.args[0].toLowerCase(),
              amount: parsed.args[2].toString(),
              cost: parsed.args[3].toString(),
              timestamp: Number(parsed.args[4]),
              txHash: log.transactionHash,
              blockNumber: log.blockNumber
            });
          }
        }
        
        // Get logs for TokenSold events from this wallet
        const sellFilter = {
          address: this.memeFactory.target,
          topics: [
            ethers.id('TokenSold(address,address,uint256,uint256,uint256)'),
            null, // token (any)
            ethers.zeroPadValue(address, 32) // seller must be our monitored wallet
          ],
          fromBlock: wallet.lastBlock + 1,
          toBlock: currentBlock
        };
        
        const sellLogs = await this.provider.getLogs(sellFilter);
        
        for (const log of sellLogs) {
          const parsed = this.memeFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data
          });
          
          if (parsed) {
            await this.handleWalletTrade(address, {
              type: 'sell',
              token: parsed.args[0].toLowerCase(),
              amount: parsed.args[2].toString(),
              proceeds: parsed.args[3].toString(),
              timestamp: Number(parsed.args[4]),
              txHash: log.transactionHash,
              blockNumber: log.blockNumber
            });
          }
        }
        
        // Update last processed block
        wallet.lastBlock = currentBlock;
      } catch (error) {
        this.logger.error(`Error polling wallet ${address}:`, error);
      }
    }
  }

  /**
   * Handle a detected trade from a monitored wallet
   */
  private async handleWalletTrade(walletAddress: string, trade: any): Promise<void> {
    const wallet = this.monitoredWallets.get(walletAddress);
    if (!wallet) return;
    
    this.logger.info(`Detected ${trade.type} from ${walletAddress}:`, {
      token: trade.token,
      amount: ethers.formatEther(trade.amount),
      value: ethers.formatEther(trade.cost || trade.proceeds || '0')
    });

    // Process copy trades for all followers
    const promises: Promise<void>[] = [];
    
    for (const userId of wallet.followers) {
      promises.push(this.processCopyTrade(userId, walletAddress, trade));
    }
    
    // Execute all copy trades in parallel
    await Promise.allSettled(promises);
  }

  /**
   * Process and execute a copy trade for a specific user
   */
  private async processCopyTrade(userId: string, targetWallet: string, trade: any): Promise<void> {
    try {
      // Get user's copy settings
      const settings = await this.db.getCopyTradeSettings(userId, targetWallet);
      if (!settings || !settings.enabled) return;

      // Check if we should copy this type of trade
      if (trade.type === 'buy' && !settings.copyBuys) return;
      if (trade.type === 'sell' && !settings.copySells) return;

      // Check whitelist/blacklist
      if (settings.whitelistedTokens.length > 0 && 
          !settings.whitelistedTokens.includes(trade.token)) {
        this.logger.debug(`Token ${trade.token} not in whitelist for user ${userId}`);
        return;
      }
      
      if (settings.blacklistedTokens.includes(trade.token)) {
        this.logger.debug(`Token ${trade.token} is blacklisted for user ${userId}`);
        return;
      }

      // Check token age if required
      if (settings.minTokenAge > 0) {
        const tokenInfo = await this.memeFactory.getTokenInfo(trade.token);
        const tokenAge = (Date.now() / 1000 - Number(tokenInfo.createdAt)) / 3600; // hours
        
        if (tokenAge < settings.minTokenAge) {
          this.logger.debug(`Token ${trade.token} too new (${tokenAge.toFixed(1)}h < ${settings.minTokenAge}h)`);
          return;
        }
      }

      // Get user's wallet
      const user = await this.db.getUserById(userId);
      if (!user || !user.privateKey) {
        this.logger.error(`User ${userId} wallet not found`);
        return;
      }

      // Decrypt private key and create wallet
        const decryptedKey = await this.db.decryptPrivateKey(user.privateKey, user.telegramId);
        const userWallet = new ethers.Wallet(decryptedKey, this.provider);

      // Calculate copy amount based on settings
      const copyAmount = await this.calculateCopyAmount(
        userWallet.address,
        settings,
        trade
      );

      if (copyAmount <= 0) {
        this.logger.debug(`Copy amount too small for user ${userId}`);
        return;
      }

      // Create copy trade record
      const copyTrade: CopiedTrade = {
        id: `${userId}-${trade.txHash}-${Date.now()}`,
        userId,
        targetWallet,
        tokenAddress: trade.token,
        type: trade.type,
        originalAmount: parseFloat(ethers.formatEther(trade.amount)),
        copiedAmount: copyAmount,
        originalTxHash: trade.txHash,
        status: 'pending',
        createdAt: new Date()
      };

      // Save pending trade
      await this.db.saveCopiedTrade(copyTrade);

      // Execute the trade
      copyTrade.status = 'executing';
      
      if (trade.type === 'buy') {
        await this.executeBuyTrade(userWallet, trade.token, copyAmount, settings.maxSlippage, copyTrade);
      } else {
        await this.executeSellTrade(userWallet, trade.token, copyAmount, settings.maxSlippage, copyTrade);
      }

    } catch (error) {
      this.logger.error(`Failed to process copy trade for user ${userId}:`, error);
    }
  }

  /**
   * Execute a buy trade on MemeFactory
   */
  private async executeBuyTrade(
    wallet: ethers.Wallet,
    token: string,
    amountCore: number,
    maxSlippage: number,
    copyTrade: CopiedTrade
  ): Promise<void> {
    try {
      // Get expected tokens out
      const tokenInfo = await this.memeFactory.getTokenInfo(token);
      const expectedTokens = await this.memeFactory.calculateTokensOut(
        tokenInfo.sold,
        ethers.parseEther(amountCore.toString())
      );
      
      // Apply slippage
      const minTokens = (expectedTokens * BigInt(100 - maxSlippage)) / BigInt(100);
      
      // Connect wallet to contract
      const connectedFactory = this.memeFactory.connect(wallet);
      
      // Execute buy
      const tx = await connectedFactory.buyToken(
        token,
        minTokens,
        {
          value: ethers.parseEther(amountCore.toString()),
          gasLimit: 300000
        }
      );
      
      this.logger.info(`Buy transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Update copy trade record
      copyTrade.status = 'completed';
      copyTrade.copiedTxHash = receipt.hash;
      copyTrade.gasUsed = receipt.gasUsed.toString();
      copyTrade.completedAt = new Date();
      
      await this.db.updateCopiedTrade(copyTrade);
      
      // Save to trades table
      await this.db.saveTrade({
        userId: copyTrade.userId,
        walletAddress: wallet.address,
        tokenAddress: token,
        type: 'buy',
        amountCore,
        amountToken: parseFloat(ethers.formatEther(expectedTokens)),
        price: amountCore / parseFloat(ethers.formatEther(expectedTokens)),
        txHash: receipt.hash,
        status: 'completed'
      });
      
      this.logger.info(`Copy buy completed for user ${copyTrade.userId}: ${receipt.hash}`);
      
    } catch (error) {
      this.logger.error('Buy execution failed:', error);
      
      copyTrade.status = 'failed';
      copyTrade.reason = error.message;
      copyTrade.completedAt = new Date();
      
      await this.db.updateCopiedTrade(copyTrade);
      throw error;
    }
  }

  /**
   * Execute a sell trade on MemeFactory
   */
  private async executeSellTrade(
    wallet: ethers.Wallet,
    token: string,
    amountTokens: number,
    maxSlippage: number,
    copyTrade: CopiedTrade
  ): Promise<void> {
    try {
      // Get expected CORE out
      const tokenInfo = await this.memeFactory.getTokenInfo(token);
      const tokensToSell = ethers.parseEther(amountTokens.toString());
      const expectedCore = await this.memeFactory.calculateETHOut(
        tokenInfo.sold,
        tokensToSell
      );
      
      // Apply slippage
      const minCore = (expectedCore * BigInt(100 - maxSlippage)) / BigInt(100);
      
      // Connect wallet to contract
      const connectedFactory = this.memeFactory.connect(wallet);
      
      // Check token balance
      const tokenContract = new ethers.Contract(
        token,
        ['function balanceOf(address) view returns (uint256)'],
        wallet
      );
      const balance = await tokenContract.balanceOf(wallet.address);
      
      if (balance < tokensToSell) {
        throw new Error(`Insufficient token balance: ${ethers.formatEther(balance)} < ${amountTokens}`);
      }
      
      // Execute sell
      const tx = await connectedFactory.sellToken(
        token,
        tokensToSell,
        minCore,
        {
          gasLimit: 300000
        }
      );
      
      this.logger.info(`Sell transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Update copy trade record
      copyTrade.status = 'completed';
      copyTrade.copiedTxHash = receipt.hash;
      copyTrade.gasUsed = receipt.gasUsed.toString();
      copyTrade.completedAt = new Date();
      
      await this.db.updateCopiedTrade(copyTrade);
      
      // Save to trades table
      await this.db.saveTrade({
        userId: copyTrade.userId,
        walletAddress: wallet.address,
        tokenAddress: token,
        type: 'sell',
        amountCore: parseFloat(ethers.formatEther(expectedCore)),
        amountToken: amountTokens,
        price: parseFloat(ethers.formatEther(expectedCore)) / amountTokens,
        txHash: receipt.hash,
        status: 'completed'
      });
      
      this.logger.info(`Copy sell completed for user ${copyTrade.userId}: ${receipt.hash}`);
      
    } catch (error) {
      this.logger.error('Sell execution failed:', error);
      
      copyTrade.status = 'failed';
      copyTrade.reason = error.message;
      copyTrade.completedAt = new Date();
      
      await this.db.updateCopiedTrade(copyTrade);
      throw error;
    }
  }

  /**
   * Calculate the amount to copy based on user settings
   */
  private async calculateCopyAmount(
    userAddress: string,
    settings: CopyTradeSettings,
    trade: any
  ): Promise<number> {
    try {
      // Get user's CORE balance
      const balance = await this.provider.getBalance(userAddress);
      const balanceCore = parseFloat(ethers.formatEther(balance));
      
      // Calculate based on percentage of wallet
      let amount = (balanceCore * settings.percentageOfWallet) / 100;
      
      // Apply max amount per trade limit
      amount = Math.min(amount, settings.maxAmountPerTrade);
      
      // For sells, check token balance
      if (trade.type === 'sell') {
        const tokenContract = new ethers.Contract(
          trade.token,
          ['function balanceOf(address) view returns (uint256)'],
          this.provider
        );
        const tokenBalance = await tokenContract.balanceOf(userAddress);
        const tokenBalanceFormatted = parseFloat(ethers.formatEther(tokenBalance));
        
        // Use smaller of calculated amount or actual balance
        amount = Math.min(amount, tokenBalanceFormatted);
      }
      
      // Ensure minimum viable amount (0.01 CORE for buys)
      if (trade.type === 'buy' && amount < 0.01) return 0;
      
      return amount;
    } catch (error) {
      this.logger.error('Failed to calculate copy amount:', error);
      return 0;
    }
  }

  /**
   * Analyze a wallet's trading performance
   */
  async analyzeWallet(walletAddress: string): Promise<WalletStats> {
    try {
      const address = walletAddress.toLowerCase();
      
      // Check cache
      if (this.monitoredWallets.has(address)) {
        const wallet = this.monitoredWallets.get(address)!;
        if (wallet.stats && 
            (Date.now() - wallet.stats.lastActivity.getTime()) < 600000) { // 10 min cache
          return wallet.stats;
        }
      }

      // Get historical trades from database
      const trades = await this.db.getWalletTrades(address, 30); // Last 30 days
      
      // Calculate metrics
      const now = Date.now();
      const trades24h = trades.filter(t => now - new Date(t.timestamp).getTime() < 86400000);
      const trades7d = trades.filter(t => now - new Date(t.timestamp).getTime() < 7 * 86400000);
      const trades30d = trades;
      
      // Calculate PnL
      const calculatePnL = (trades: any[]) => {
        return trades.reduce((sum, t) => {
          if (t.type === 'sell') {
            return sum + (t.amountCore || 0);
          } else {
            return sum - (t.amountCore || 0);
          }
        }, 0);
      };
      
      const pnl24h = calculatePnL(trades24h);
      const pnl7d = calculatePnL(trades7d);
      const pnl30d = calculatePnL(trades30d);
      
      // Calculate win rate
      const profitableTrades = trades.filter(t => t.profit > 0).length;
      const winRate = trades.length > 0 ? (profitableTrades / trades.length) * 100 : 0;
      
      // Calculate average profit
      const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
      const avgProfit = trades.length > 0 ? totalProfit / trades.length : 0;
      
      // Calculate risk score (0-100, lower is better)
      let riskScore = 0;
      if (winRate < 30) riskScore += 30;
      if (avgProfit < 0) riskScore += 30;
      if (trades.length < 10) riskScore += 20; // Too few trades to judge
      if (pnl30d < 0) riskScore += 20;
      
      // Get top traded tokens
      const tokenProfits = new Map<string, { profit: number; trades: number }>();
      for (const trade of trades) {
        const existing = tokenProfits.get(trade.tokenAddress) || { profit: 0, trades: 0 };
        existing.profit += trade.profit || 0;
        existing.trades += 1;
        tokenProfits.set(trade.tokenAddress, existing);
      }
      
      const topTokens = Array.from(tokenProfits.entries())
        .map(([token, data]) => ({ token, ...data }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);
      
      // Get follower count
      const followers = await this.db.getWalletFollowersCount(address);
      
      const stats: WalletStats = {
        address,
        totalTrades: trades.length,
        winRate,
        avgProfit,
        totalProfit,
        pnl24h,
        pnl7d,
        pnl30d,
        riskScore,
        lastActivity: trades.length > 0 ? new Date(trades[0].timestamp) : new Date(),
        followers,
        isVerified: trades.length > 50 && winRate > 40,
        topTokens
      };
      
      // Cache stats
      if (this.monitoredWallets.has(address)) {
        this.monitoredWallets.get(address)!.stats = stats;
      }
      
      return stats;
    } catch (error) {
      this.logger.error('Failed to analyze wallet:', error);
      
      // Return default stats on error
      return {
        address: walletAddress,
        totalTrades: 0,
        winRate: 0,
        avgProfit: 0,
        totalProfit: 0,
        pnl24h: 0,
        pnl7d: 0,
        pnl30d: 0,
        riskScore: 100,
        lastActivity: new Date(),
        followers: 0,
        isVerified: false,
        topTokens: []
      };
    }
  }

  /**
   * Get user's available copy slots based on staking tier
   */
  private async getUserCopySlots(userId: string): Promise<{
    tierLevel: number;
    tierName: string;
    maxSlots: number;
    usedSlots: number;
  }> {
    try {
      // Get user's staking position
      const stakingPosition = await this.db.getUserStakingPosition(userId);
      
      let tierLevel = 0;
      if (stakingPosition && parseFloat(stakingPosition.amountStaked) > 0) {
        const staked = parseFloat(stakingPosition.amountStaked);
        
        if (staked >= 50000) tierLevel = 4;      // Platinum
        else if (staked >= 10000) tierLevel = 3; // Gold  
        else if (staked >= 5000) tierLevel = 2;  // Silver
        else if (staked >= 1000) tierLevel = 1;  // Bronze
      }
      
      // Get current copy trade settings
      const activeSettings = await this.db.getUserActiveCopyTrades(userId);
      const usedSlots = activeSettings.filter(s => s.enabled).length;
      
      return {
        tierLevel,
        tierName: TIER_LIMITS[tierLevel].name,
        maxSlots: TIER_LIMITS[tierLevel].slots,
        usedSlots
      };
    } catch (error) {
      this.logger.error('Failed to get user copy slots:', error);
      return {
        tierLevel: 0,
        tierName: 'None',
        maxSlots: 0,
        usedSlots: 0
      };
    }
  }

  /**
   * Get list of top traders to copy
   */
  async getTopTraders(limit: number = 10): Promise<WalletStats[]> {
    try {
      // Get top performing wallets from database
      const topWallets = await this.db.getTopTradingWallets(limit);
      
      // Analyze each wallet
      const stats: WalletStats[] = [];
      for (const wallet of topWallets) {
        const walletStats = await this.analyzeWallet(wallet.address);
        stats.push(walletStats);
      }
      
      // Sort by 30d PnL
      return stats.sort((a, b) => b.pnl30d - a.pnl30d);
    } catch (error) {
      this.logger.error('Failed to get top traders:', error);
      return [];
    }
  }

  /**
   * Get user's copy trading history
   */
  async getUserCopyHistory(userId: string, limit: number = 50): Promise<CopiedTrade[]> {
    try {
      return await this.db.getUserCopiedTrades(userId, limit);
    } catch (error) {
      this.logger.error('Failed to get copy history:', error);
      return [];
    }
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    this.isMonitoring = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    
    // Remove all event listeners
    this.memeFactory.removeAllListeners();
    
    this.logger.info('Wallet monitoring stopped');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopMonitoring();
    
    if (this.wsProvider) {
      await this.wsProvider.destroy();
    }
    
    this.monitoredWallets.clear();
    this.userWallets.clear();
  }
}