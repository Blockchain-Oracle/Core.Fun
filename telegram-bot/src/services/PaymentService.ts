import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { DatabaseService } from './DatabaseService';
import axios from 'axios';

export interface PaymentMethod {
  type: 'crypto' | 'telegram_stars' | 'stripe';
  processor?: string;
  address?: string;
  minimumAmount?: number;
}

export interface PaymentRequest {
  userId: string;
  tier: 'premium' | 'pro';
  amount: number;
  currency: string;
  method: PaymentMethod;
}

export interface PaymentStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
  confirmations?: number;
  error?: string;
}

export class PaymentService {
  private db: DatabaseService;
  private provider: ethers.JsonRpcProvider;
  private paymentWallet?: ethers.Wallet;
  
  // Payment addresses for different tokens
  private readonly PAYMENT_ADDRESSES = {
    mainnet: {
      treasury: process.env.TREASURY_ADDRESS || '0x...', 
      CORE: '0x...', // Native CORE
      USDT: '0x900101d06A7426441Ae63e9AB3B9b0F63Be145F1',
      USDC: '0xa4151B2B3e269645181dCcF2D426cE75fcbDeca9',
    },
    testnet: {
      treasury: process.env.TREASURY_ADDRESS_TESTNET || '0x...',
      CORE: '0x...',
      USDT: '0x900101d06A7426441Ae63e9AB3B9b0F63Be145F1',
      USDC: '0xa4151B2B3e269645181dCcF2D426cE75fcbDeca9',
    }
  };
  
  // Subscription prices in USD
  private readonly PRICES = {
    premium: 9.99,
    pro: 29.99,
  };

  constructor(db: DatabaseService) {
    this.db = db;
    const network = process.env.NETWORK || 'testnet';
    const rpcUrl = network === 'mainnet' 
      ? process.env.CORE_MAINNET_RPC 
      : process.env.CORE_TESTNET_RPC;
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Initialize payment monitoring wallet (read-only)
    if (process.env.PAYMENT_MONITOR_KEY) {
      this.paymentWallet = new ethers.Wallet(process.env.PAYMENT_MONITOR_KEY, this.provider);
    }
  }

  /**
   * Create a payment request for subscription
   */
  async createPaymentRequest(userId: string, tier: 'premium' | 'pro', method: string): Promise<any> {
    const amount = this.PRICES[tier];
    
    switch (method) {
      case 'crypto':
        return this.createCryptoPayment(userId, tier, amount);
      case 'telegram_stars':
        return this.createTelegramStarsPayment(userId, tier, amount);
      case 'stripe':
        return this.createStripePayment(userId, tier, amount);
      default:
        throw new Error('Unsupported payment method');
    }
  }

  /**
   * Create crypto payment request
   */
  private async createCryptoPayment(userId: string, tier: string, amountUSD: number) {
    // Generate unique payment ID
    const paymentId = ethers.id(`${userId}-${tier}-${Date.now()}`).slice(0, 16);
    
    // Get current CORE price
    const corePrice = await this.getCorePrice();
    const amountInCore = amountUSD / corePrice;
    
    // Get payment address
    const network = process.env.NETWORK || 'testnet';
    const paymentAddress = this.PAYMENT_ADDRESSES[network as keyof typeof this.PAYMENT_ADDRESSES].treasury;
    
    // Store payment request in database
    await this.db.createPaymentRequest({
      user_id: userId,
      payment_id: paymentId,
      tier,
      amount: amountInCore,
      currency: 'CORE',
      method: 'crypto',
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    });
    
    // Start monitoring for payment
    this.monitorCryptoPayment(paymentId, userId, tier, amountInCore);
    
    return {
      paymentId,
      address: paymentAddress,
      amount: amountInCore.toFixed(6),
      amountUSD,
      currency: 'CORE',
      expires: 30 * 60, // seconds
      qrCode: this.generatePaymentQR(paymentAddress, amountInCore, 'CORE'),
      memo: paymentId, // Include in transaction for identification
    };
  }

  /**
   * Monitor blockchain for payment
   */
  private async monitorCryptoPayment(
    paymentId: string, 
    userId: string, 
    tier: string, 
    expectedAmount: number
  ) {
    const network = process.env.NETWORK || 'testnet';
    const treasuryAddress = this.PAYMENT_ADDRESSES[network as keyof typeof this.PAYMENT_ADDRESSES].treasury;
    
    // Set up event listener for incoming transactions
    const filter = {
      address: null, // Monitor all transactions
      topics: [
        ethers.id("Transfer(address,address,uint256)"),
        null, // from any
        ethers.zeroPadValue(treasuryAddress, 32), // to treasury
      ]
    };
    
    const checkPayment = async () => {
      try {
        // Check recent blocks for payment
        const currentBlock = await this.provider.getBlockNumber();
        const events = await this.provider.getLogs({
          ...filter,
          fromBlock: currentBlock - 10,
          toBlock: currentBlock,
        });
        
        for (const event of events) {
          // Decode the transaction
          const tx = await this.provider.getTransaction(event.transactionHash);
          if (!tx) continue;
          
          // Check if transaction contains our payment ID in data
          if (tx.data && tx.data.includes(paymentId.slice(2))) {
            // Verify amount
            const value = ethers.formatEther(tx.value);
            if (parseFloat(value) >= expectedAmount * 0.98) { // Allow 2% slippage
              // Payment confirmed!
              await this.confirmPayment(userId, tier, paymentId, tx.hash);
              clearInterval(paymentChecker);
              return;
            }
          }
        }
      } catch (error) {
        logger.error('Error monitoring payment:', error);
      }
    };
    
    // Check every 15 seconds for 30 minutes
    const paymentChecker = setInterval(checkPayment, 15000);
    
    // Stop checking after 30 minutes
    setTimeout(() => {
      clearInterval(paymentChecker);
      this.expirePayment(paymentId);
    }, 30 * 60 * 1000);
  }

  /**
   * Create Telegram Stars payment
   */
  private async createTelegramStarsPayment(userId: string, tier: string, amountUSD: number) {
    // Telegram Stars use their own pricing (100 stars = ~$1)
    const stars = Math.ceil(amountUSD * 100);
    
    const invoice = {
      title: `${tier === 'premium' ? 'Premium' : 'Pro'} Subscription`,
      description: `Monthly subscription to Core Meme Platform ${tier} tier`,
      payload: JSON.stringify({ userId, tier }),
      provider_token: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN,
      currency: 'XTR', // Telegram Stars
      prices: [{ label: 'Subscription', amount: stars }],
      photo_url: 'https://core-meme.io/subscription-image.png',
      need_email: true,
      send_email_to_provider: true,
    };
    
    return invoice;
  }

  /**
   * Create Stripe payment
   */
  private async createStripePayment(userId: string, tier: string, amountUSD: number) {
    // This would integrate with Stripe API
    // For now, returning structure
    return {
      url: 'https://checkout.stripe.com/...',
      sessionId: 'stripe_session_...',
      amount: amountUSD,
    };
  }

  /**
   * Confirm payment and activate subscription
   */
  async confirmPayment(userId: string, tier: string, paymentId: string, txHash?: string) {
    try {
      // Update payment record
      await this.db.updatePaymentStatus(paymentId, 'completed', txHash);
      
      // Activate subscription
      await this.db.updateUserSubscription(userId, tier);
      
      // Create subscription record
      await this.db.createSubscription({
        user_id: userId,
        tier,
        payment_method: 'crypto',
        payment_id: paymentId,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });
      
      logger.info(`Subscription activated for user ${userId}: ${tier} tier`);
      
      // Send confirmation to user (would need bot context)
      // await this.notifyUser(userId, 'subscription_activated', { tier });
      
      return true;
    } catch (error) {
      logger.error('Error confirming payment:', error);
      return false;
    }
  }

  /**
   * Handle Telegram payment callback
   */
  async handleTelegramPayment(payment: any) {
    const payload = JSON.parse(payment.invoice_payload);
    const { userId, tier } = payload;
    
    // Telegram already verified the payment
    await this.confirmPayment(userId, tier, payment.telegram_payment_charge_id);
  }

  /**
   * Get current CORE price in USD
   */
  private async getCorePrice(): Promise<number> {
    try {
      // Would integrate with price oracle or DEX
      // For now, using mock price
      return 0.50; // $0.50 per CORE
    } catch (error) {
      logger.error('Error fetching CORE price:', error);
      return 0.50;
    }
  }

  /**
   * Generate payment QR code
   */
  private generatePaymentQR(address: string, amount: number, currency: string): string {
    // Generate payment URI
    const uri = `ethereum:${address}?value=${amount}&token=${currency}`;
    // Would use QR library to generate actual QR code
    return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(uri)}`;
  }

  /**
   * Expire payment request
   */
  private async expirePayment(paymentId: string) {
    await this.db.updatePaymentStatus(paymentId, 'expired');
    logger.info(`Payment ${paymentId} expired`);
  }

  /**
   * Check subscription status
   */
  async checkSubscriptionStatus(userId: string): Promise<any> {
    const subscription = await this.db.getUserSubscription(userId);
    
    if (!subscription) {
      return { tier: 'free', active: true };
    }
    
    const now = new Date();
    const expiresAt = new Date(subscription.expires_at);
    
    if (expiresAt < now) {
      // Subscription expired
      await this.db.updateUserSubscription(userId, 'free');
      return { tier: 'free', active: false, expired: true };
    }
    
    return {
      tier: subscription.tier,
      active: true,
      expiresAt,
      daysRemaining: Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    };
  }

  /**
   * Process refund
   */
  async processRefund(paymentId: string, reason: string): Promise<boolean> {
    // Would implement refund logic
    // For crypto: might be manual
    // For Telegram Stars: use Telegram API
    // For Stripe: use Stripe API
    
    logger.info(`Processing refund for payment ${paymentId}: ${reason}`);
    return true;
  }
}