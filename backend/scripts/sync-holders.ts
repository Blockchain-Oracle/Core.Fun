#!/usr/bin/env ts-node

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { db } from '../api/src/db';

// Load environment variables
dotenv.config({ path: '../../.env' });

// Simple logger
const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args)
};

// MemeToken ABI (minimal Transfer event)
const MemeTokenABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Blockchain provider
const provider = new ethers.JsonRpcProvider(
  process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com'
);

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  created_at: string;
  block_number?: number;
}

interface TransferEvent {
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

async function getTokens(): Promise<TokenInfo[]> {
  try {
    const tokens = await db('tokens')
      .select('address', 'name', 'symbol', 'created_at')
      .orderBy('created_at', 'desc');
    
    logger.info(`Found ${tokens.length} tokens in database`);
    return tokens;
  } catch (error) {
    logger.error('Failed to fetch tokens:', error);
    return [];
  }
}

async function getTransferEvents(tokenAddress: string, fromBlock: number = 0): Promise<TransferEvent[]> {
  try {
    logger.info(`Fetching Transfer events for ${tokenAddress} from block ${fromBlock}`);
    
    const tokenContract = new ethers.Contract(tokenAddress, MemeTokenABI, provider);
    const currentBlock = await provider.getBlockNumber();
    
    const events: TransferEvent[] = [];
    const batchSize = 5000; // Process 5000 blocks at a time to avoid RPC limits
    
    for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += batchSize) {
      const endBlock = Math.min(startBlock + batchSize - 1, currentBlock);
      
      try {
        const filter = tokenContract.filters.Transfer();
        const logs = await tokenContract.queryFilter(filter, startBlock, endBlock);
        
        if (logs.length > 0) {
          logger.info(`Found ${logs.length} Transfer events in blocks ${startBlock}-${endBlock}`);
        }
        
        for (const log of logs) {
          if (log.args) {
            events.push({
              from: log.args[0],
              to: log.args[1],
              value: log.args[2].toString(),
              tokenAddress: tokenAddress,
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
              logIndex: log.index
            });
          }
        }
      } catch (error) {
        logger.warn(`Error fetching events for blocks ${startBlock}-${endBlock}:`, error);
      }
    }
    
    logger.info(`Total Transfer events found: ${events.length}`);
    return events;
  } catch (error) {
    logger.error(`Failed to fetch Transfer events for ${tokenAddress}:`, error);
    return [];
  }
}

async function processTransferEvents(events: TransferEvent[]): Promise<void> {
  if (events.length === 0) return;
  
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const tokenAddress = events[0].tokenAddress.toLowerCase();
  
  // Track all unique addresses and their final balances
  const balances: Map<string, bigint> = new Map();
  
  // Process events chronologically to calculate final balances
  const sortedEvents = events.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.logIndex - b.logIndex;
  });
  
  logger.info(`Processing ${sortedEvents.length} Transfer events chronologically`);
  
  for (const event of sortedEvents) {
    const from = event.from.toLowerCase();
    const to = event.to.toLowerCase();
    const value = BigInt(event.value);
    
    // Update sender balance (if not mint)
    if (from !== ZERO_ADDRESS.toLowerCase()) {
      const currentBalance = balances.get(from) || 0n;
      const newBalance = currentBalance - value;
      if (newBalance > 0n) {
        balances.set(from, newBalance);
      } else {
        balances.delete(from); // Remove if balance is 0
      }
    }
    
    // Update receiver balance (if not burn)
    if (to !== ZERO_ADDRESS.toLowerCase()) {
      const currentBalance = balances.get(to) || 0n;
      balances.set(to, currentBalance + value);
    }
  }
  
  // Filter out zero balances and prepare data for database
  const holders = Array.from(balances.entries())
    .filter(([_, balance]) => balance > 0n)
    .map(([address, balance]) => ({
      token_address: tokenAddress,
      address: address,
      balance: balance.toString(),
      last_updated: new Date(),
      first_seen: new Date()
    }));
  
  logger.info(`Final holder count: ${holders.length}`);
  
  if (holders.length > 0) {
    // Store holder balances in database
    await db.transaction(async (trx: any) => {
      // Clear existing holders for this token
      await trx('token_holders')
        .where({ token_address: tokenAddress })
        .delete();
      
      // Insert new holder data
      for (const holder of holders) {
        await trx('token_holders')
          .insert(holder)
          .onConflict(['token_address', 'address'])
          .merge({
            balance: holder.balance,
            last_updated: holder.last_updated
          });
      }
      
      // Update holder count in tokens table
      await trx('tokens')
        .where({ address: tokenAddress })
        .update({ holders_count: holders.length });
      
      // Store transfer events for audit
      const eventRecords = sortedEvents.slice(-1000).map(e => ({
        token_address: e.tokenAddress.toLowerCase(),
        from_address: e.from.toLowerCase(),
        to_address: e.to.toLowerCase(),
        value: e.value,
        block_number: e.blockNumber,
        transaction_hash: e.transactionHash,
        log_index: e.logIndex,
        timestamp: new Date()
      }));
      
      if (eventRecords.length > 0) {
        await trx('transfer_events')
          .insert(eventRecords)
          .onConflict(['transaction_hash', 'log_index'])
          .ignore();
      }
    });
    
    logger.info(`✅ Updated ${holders.length} holders for token ${tokenAddress}`);
  }
}

async function syncTokenHolders(token: TokenInfo): Promise<void> {
  try {
    logger.info(`\n📊 Syncing holders for ${token.symbol} (${token.address})`);
    
    // Determine from which block to start
    // If token was created recently, start from creation, otherwise last 10000 blocks
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // Last 10k blocks
    
    // Fetch Transfer events
    const events = await getTransferEvents(token.address, fromBlock);
    
    // Process events to calculate holder balances
    await processTransferEvents(events);
    
  } catch (error) {
    logger.error(`Failed to sync holders for ${token.symbol}:`, error);
  }
}

async function main() {
  logger.info('🚀 Starting holder synchronization...');
  
  try {
    // Check database connection
    await db.raw('SELECT 1');
    logger.info('✅ Database connected');
    
    // Check blockchain connection
    const blockNumber = await provider.getBlockNumber();
    logger.info(`✅ Connected to blockchain at block ${blockNumber}`);
    
    // Get all tokens
    const tokens = await getTokens();
    
    if (tokens.length === 0) {
      logger.warn('No tokens found in database');
      process.exit(0);
    }
    
    // Sync holders for each token
    for (const token of tokens) {
      await syncTokenHolders(token);
    }
    
    // Get summary
    const summary = await db('tokens')
      .select('name', 'symbol', 'holders_count')
      .where('holders_count', '>', 0)
      .orderBy('holders_count', 'desc');
    
    logger.info('\n📈 Holder Summary:');
    summary.forEach((t: any) => {
      logger.info(`  ${t.symbol}: ${t.holders_count} holders`);
    });
    
    logger.info('\n✅ Holder synchronization complete!');
    
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

// Run the script
if (require.main === module) {
  main();
}