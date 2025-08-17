#!/usr/bin/env node

/**
 * Revenue Distribution Script
 * Distributes platform fees to stakers based on their stake proportion
 * This script should be run periodically (e.g., daily or weekly) via cron job
 */

import { ethers } from 'ethers'
import dotenv from 'dotenv'
import { createLogger } from '@core-meme/shared'

dotenv.config()

const logger = createLogger({ service: 'revenue-distribution' })

// Contract ABIs
const STAKING_ABI = [
  'function distributeRevenue() external payable',
  'function totalStaked() view returns (uint256)',
  'function activeStakers() view returns (uint256)',
  'function owner() view returns (address)',
  'event RevenueDistributed(uint256 amount, uint256 timestamp)'
]

const FACTORY_ABI = [
  'function withdrawFees() external',
  'function accumulatedFees() view returns (uint256)',
  'function owner() view returns (address)'
]

// Configuration
const CONFIG = {
  NETWORK: process.env.NETWORK || 'testnet',
  RPC_URL: process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com',
  PRIVATE_KEY: process.env.REVENUE_DISTRIBUTOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || '',
  STAKING_ADDRESS: process.env.STAKING_ADDRESS || '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
  FACTORY_ADDRESS: process.env.MEME_FACTORY_ADDRESS || '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  MIN_DISTRIBUTION_AMOUNT: ethers.parseEther(process.env.MIN_DISTRIBUTION_AMOUNT || '10'), // Min 10 CORE
  DRY_RUN: process.env.DRY_RUN === 'true'
}

class RevenueDistributor {
  private provider: ethers.JsonRpcProvider
  private wallet: ethers.Wallet
  private stakingContract: ethers.Contract
  private factoryContract: ethers.Contract

  constructor() {
    // Initialize provider and wallet
    this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL)
    
    if (!CONFIG.PRIVATE_KEY) {
      throw new Error('REVENUE_DISTRIBUTOR_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY is required')
    }
    
    this.wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, this.provider)
    
    // Initialize contracts
    this.stakingContract = new ethers.Contract(
      CONFIG.STAKING_ADDRESS,
      STAKING_ABI,
      this.wallet
    )
    
    this.factoryContract = new ethers.Contract(
      CONFIG.FACTORY_ADDRESS,
      FACTORY_ABI,
      this.wallet
    )
    
    logger.info('Revenue Distributor initialized', {
      network: CONFIG.NETWORK,
      distributor: this.wallet.address,
      stakingContract: CONFIG.STAKING_ADDRESS,
      factoryContract: CONFIG.FACTORY_ADDRESS
    })
  }

  /**
   * Check if the wallet is authorized to distribute revenue
   */
  async checkAuthorization(): Promise<boolean> {
    try {
      const stakingOwner = await this.stakingContract.owner()
      const factoryOwner = await this.factoryContract.owner()
      
      const isStakingOwner = stakingOwner.toLowerCase() === this.wallet.address.toLowerCase()
      const isFactoryOwner = factoryOwner.toLowerCase() === this.wallet.address.toLowerCase()
      
      if (!isStakingOwner || !isFactoryOwner) {
        logger.error('Wallet is not authorized', {
          wallet: this.wallet.address,
          stakingOwner,
          factoryOwner,
          isStakingOwner,
          isFactoryOwner
        })
        return false
      }
      
      return true
    } catch (error) {
      logger.error('Failed to check authorization:', error)
      return false
    }
  }

  /**
   * Get accumulated fees from MemeFactory
   */
  async getAccumulatedFees(): Promise<bigint> {
    try {
      const fees = await this.factoryContract.accumulatedFees()
      logger.info('Accumulated fees in MemeFactory', {
        amount: ethers.formatEther(fees),
        amountWei: fees.toString()
      })
      return fees
    } catch (error) {
      logger.error('Failed to get accumulated fees:', error)
      return 0n
    }
  }

  /**
   * Withdraw fees from MemeFactory
   */
  async withdrawFactoryFees(): Promise<boolean> {
    try {
      logger.info('Withdrawing fees from MemeFactory...')
      
      if (CONFIG.DRY_RUN) {
        logger.info('[DRY RUN] Would withdraw fees from factory')
        return true
      }
      
      const tx = await this.factoryContract.withdrawFees()
      logger.info('Withdrawal transaction sent', { hash: tx.hash })
      
      const receipt = await tx.wait()
      logger.info('Fees withdrawn successfully', {
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
      })
      
      return true
    } catch (error) {
      logger.error('Failed to withdraw fees:', error)
      return false
    }
  }

  /**
   * Distribute revenue to stakers
   */
  async distributeRevenue(amount: bigint): Promise<boolean> {
    try {
      // Get staking stats
      const totalStaked = await this.stakingContract.totalStaked()
      const activeStakers = await this.stakingContract.activeStakers()
      
      logger.info('Staking statistics', {
        totalStaked: ethers.formatEther(totalStaked),
        activeStakers: activeStakers.toString()
      })
      
      if (activeStakers === 0n) {
        logger.warn('No active stakers, skipping distribution')
        return false
      }
      
      logger.info('Distributing revenue to stakers', {
        amount: ethers.formatEther(amount),
        amountWei: amount.toString()
      })
      
      if (CONFIG.DRY_RUN) {
        logger.info('[DRY RUN] Would distribute revenue', {
          amount: ethers.formatEther(amount),
          activeStakers: activeStakers.toString()
        })
        return true
      }
      
      // Send transaction with value
      const tx = await this.stakingContract.distributeRevenue({
        value: amount
      })
      
      logger.info('Distribution transaction sent', { hash: tx.hash })
      
      const receipt = await tx.wait()
      logger.info('Revenue distributed successfully', {
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber
      })
      
      // Parse events
      for (const log of receipt.logs) {
        try {
          const parsed = this.stakingContract.interface.parseLog({
            topics: log.topics as string[],
            data: log.data
          })
          
          if (parsed?.name === 'RevenueDistributed') {
            logger.info('RevenueDistributed event', {
              amount: ethers.formatEther(parsed.args[0]),
              timestamp: parsed.args[1].toString()
            })
          }
        } catch (e) {
          // Ignore unparseable logs
        }
      }
      
      return true
    } catch (error) {
      logger.error('Failed to distribute revenue:', error)
      return false
    }
  }

  /**
   * Main execution flow
   */
  async execute(): Promise<void> {
    try {
      logger.info('Starting revenue distribution process...')
      
      // Check authorization
      const isAuthorized = await this.checkAuthorization()
      if (!isAuthorized) {
        throw new Error('Wallet is not authorized to distribute revenue')
      }
      
      // Get accumulated fees
      const accumulatedFees = await this.getAccumulatedFees()
      
      if (accumulatedFees < CONFIG.MIN_DISTRIBUTION_AMOUNT) {
        logger.info('Accumulated fees below minimum threshold', {
          accumulated: ethers.formatEther(accumulatedFees),
          minimum: ethers.formatEther(CONFIG.MIN_DISTRIBUTION_AMOUNT)
        })
        return
      }
      
      // Withdraw fees from factory
      const withdrawSuccess = await this.withdrawFactoryFees()
      if (!withdrawSuccess) {
        throw new Error('Failed to withdraw fees from factory')
      }
      
      // Wait for withdrawal to be confirmed
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Get wallet balance (should now have the withdrawn fees)
      const balance = await this.provider.getBalance(this.wallet.address)
      logger.info('Distributor wallet balance', {
        balance: ethers.formatEther(balance)
      })
      
      // Calculate amount to distribute (keep some for gas)
      const gasReserve = ethers.parseEther('0.1') // Keep 0.1 CORE for gas
      const distributionAmount = balance > gasReserve ? balance - gasReserve : 0n
      
      if (distributionAmount < CONFIG.MIN_DISTRIBUTION_AMOUNT) {
        logger.warn('Insufficient balance for distribution', {
          balance: ethers.formatEther(balance),
          required: ethers.formatEther(CONFIG.MIN_DISTRIBUTION_AMOUNT)
        })
        return
      }
      
      // Distribute revenue
      const distributeSuccess = await this.distributeRevenue(distributionAmount)
      if (!distributeSuccess) {
        throw new Error('Failed to distribute revenue')
      }
      
      logger.info('Revenue distribution completed successfully', {
        distributed: ethers.formatEther(distributionAmount),
        network: CONFIG.NETWORK
      })
      
      // Log final stats
      const finalBalance = await this.provider.getBalance(this.wallet.address)
      logger.info('Final distributor balance', {
        balance: ethers.formatEther(finalBalance)
      })
      
    } catch (error) {
      logger.error('Revenue distribution failed:', error)
      process.exit(1)
    }
  }
}

// Main execution
async function main() {
  logger.info('Revenue Distribution Script Started', {
    network: CONFIG.NETWORK,
    dryRun: CONFIG.DRY_RUN
  })
  
  const distributor = new RevenueDistributor()
  await distributor.execute()
  
  logger.info('Revenue Distribution Script Completed')
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Fatal error:', error)
    process.exit(1)
  })
}

export { RevenueDistributor }