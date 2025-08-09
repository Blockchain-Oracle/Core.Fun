import { ethers } from 'ethers';
import { TradeParams, Route, TradingConfig, MEVProtectionConfig } from '../types';
import { logger } from '../utils/logger';

interface MEVThreat {
  type: 'sandwich' | 'frontrun' | 'backrun';
  severity: 'low' | 'medium' | 'high';
  description: string;
  mitigation: string;
}

export class MEVProtection {
  private provider: ethers.Provider;
  private config: TradingConfig;
  private mevConfig: MEVProtectionConfig;

  constructor(provider: ethers.Provider, config: TradingConfig) {
    this.provider = provider;
    this.config = config;
    this.mevConfig = config.mevProtection;
  }

  async detectThreat(params: TradeParams, route: Route): Promise<MEVThreat | null> {
    if (!this.mevConfig.enabled) {
      return null;
    }

    const threats: MEVThreat[] = [];

    // Check for sandwich attack vulnerability
    if (this.isSandwichVulnerable(params, route)) {
      threats.push({
        type: 'sandwich',
        severity: 'high',
        description: 'Trade is vulnerable to sandwich attacks due to high slippage',
        mitigation: 'Use private mempool or reduce trade size'
      });
    }

    // Check for frontrun vulnerability
    if (this.isFrontrunVulnerable(params, route)) {
      threats.push({
        type: 'frontrun',
        severity: 'medium',
        description: 'Trade may be frontrun due to predictable execution',
        mitigation: 'Add random delay or use commit-reveal pattern'
      });
    }

    // Check mempool for suspicious activity
    const mempoolThreat = await this.checkMempool(params);
    if (mempoolThreat) {
      threats.push(mempoolThreat);
    }

    // Return highest severity threat
    return threats.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })[0] || null;
  }

  private isSandwichVulnerable(params: TradeParams, route: Route): boolean {
    // High slippage tolerance makes sandwich attacks profitable
    if (params.slippageTolerance > 5) {
      return true;
    }

    // Large trades relative to liquidity are vulnerable
    if (route.priceImpact > 3) {
      return true;
    }

    return false;
  }

  private isFrontrunVulnerable(params: TradeParams, route: Route): boolean {
    // Trades without deadline are vulnerable
    if (!params.deadline) {
      return true;
    }

    // Trades with predictable gas prices are vulnerable
    if (!params.priorityFee) {
      return true;
    }

    return false;
  }

  private async checkMempool(params: TradeParams): Promise<MEVThreat | null> {
    try {
      // Get pending transactions
      const pendingTxs = await this.getPendingTransactions();
      
      // Look for suspicious patterns
      const suspiciousCount = pendingTxs.filter(tx => 
        this.isSuspiciousTransaction(tx, params)
      ).length;

      if (suspiciousCount > 5) {
        return {
          type: 'sandwich',
          severity: 'high',
          description: `Detected ${suspiciousCount} suspicious transactions in mempool`,
          mitigation: 'Wait for mempool to clear or use private relay'
        };
      }

      if (suspiciousCount > 0) {
        return {
          type: 'frontrun',
          severity: 'medium',
          description: `Detected ${suspiciousCount} potential MEV bots in mempool`,
          mitigation: 'Consider using MEV protection'
        };
      }

      return null;
    } catch (error) {
      logger.debug('Failed to check mempool', { error });
      return null;
    }
  }

  private async getPendingTransactions(): Promise<any[]> {
    // Note: Getting pending transactions requires a node with txpool API
    // This is a simplified implementation
    try {
      const block = await this.provider.getBlock('pending');
      return block?.transactions || [];
    } catch {
      return [];
    }
  }

  private isSuspiciousTransaction(tx: any, params: TradeParams): boolean {
    // Check if transaction targets same token or DEX
    if (tx.to?.toLowerCase() === params.tokenAddress.toLowerCase()) {
      return true;
    }

    // Check if transaction has unusually high gas price
    const avgGasPrice = this.provider.getFeeData().then(data => data.gasPrice);
    if (tx.gasPrice && avgGasPrice) {
      const ratio = Number(tx.gasPrice) / Number(avgGasPrice);
      if (ratio > 1.5) {
        return true;
      }
    }

    return false;
  }

  async protectTransaction(
    tx: ethers.TransactionRequest,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    if (!this.mevConfig.enabled) {
      return signer.sendTransaction(tx);
    }

    // Add MEV protection measures
    if (this.mevConfig.useFlashbots) {
      return this.sendViaFlashbots(tx, signer);
    }

    if (this.mevConfig.privateMempool) {
      return this.sendViaPrivateMempool(tx, signer);
    }

    // Standard transaction with protection
    return this.sendWithProtection(tx, signer);
  }

  private async sendViaFlashbots(
    tx: ethers.TransactionRequest,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    // Flashbots integration would go here
    // For now, fallback to standard send
    logger.info('Flashbots not available, using standard transaction');
    return signer.sendTransaction(tx);
  }

  private async sendViaPrivateMempool(
    tx: ethers.TransactionRequest,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    // Private mempool integration would go here
    // For now, fallback to standard send
    logger.info('Private mempool not available, using standard transaction');
    return signer.sendTransaction(tx);
  }

  private async sendWithProtection(
    tx: ethers.TransactionRequest,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    // Add priority fee for faster inclusion
    if (this.mevConfig.maxPriorityFee) {
      const feeData = await this.provider.getFeeData();
      tx.maxPriorityFeePerGas = BigInt(this.mevConfig.maxPriorityFee);
      tx.maxFeePerGas = (feeData.gasPrice || 0n) + tx.maxPriorityFeePerGas;
    }

    // Add random delay to prevent timing attacks
    if (this.mevConfig.frontRunProtection) {
      const delay = Math.random() * 1000; // 0-1 second random delay
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    return signer.sendTransaction(tx);
  }

  calculateOptimalGasPrice(
    baseGasPrice: bigint,
    urgency: 'low' | 'normal' | 'high'
  ): bigint {
    const priorityFee = BigInt(this.mevConfig.maxPriorityFee);
    
    switch (urgency) {
      case 'high':
        // High priority to avoid MEV
        return baseGasPrice + (priorityFee * 2n);
      case 'normal':
        return baseGasPrice + priorityFee;
      case 'low':
        // Lower priority, accept some MEV risk
        return baseGasPrice + (priorityFee / 2n);
      default:
        return baseGasPrice + priorityFee;
    }
  }
}