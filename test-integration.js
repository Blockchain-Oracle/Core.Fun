#!/usr/bin/env node

/**
 * Integration Test Script for Core Meme Platform
 * Tests the connection between blockchain-monitor, WebSocket server, and Telegram bot
 */

const Redis = require('ioredis');
const WebSocket = require('ws');
const { randomBytes } = require('crypto');

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:3003';

// Create Redis client
const redis = new Redis(REDIS_URL);

// Create WebSocket client
let ws;

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WEBSOCKET_URL);
    
    ws.on('open', () => {
      console.log('✅ Connected to WebSocket server');
      resolve();
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 Received:', message);
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      reject(error);
    });
    
    ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
    });
  });
}

async function subscribeToChannels() {
  console.log('📡 Subscribing to channels...');
  
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'alerts'
  }));
  
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'tokens'
  }));
  
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'trades',
    params: { tokens: ['*'] }
  }));
  
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'prices',
    params: { tokens: ['*'] }
  }));
}

async function simulateAlert() {
  console.log('\n🚨 Simulating alert from blockchain-monitor...');
  
  const alert = {
    id: `test-alert-${Date.now()}`,
    type: 'WHALE_ACTIVITY',
    severity: 'HIGH',
    tokenAddress: '0x1234567890123456789012345678901234567890',
    message: '🐋 Whale trade detected: $50,000',
    data: {
      valueUSD: 50000,
      priceImpact: 5.2
    },
    timestamp: Date.now()
  };
  
  await redis.publish('websocket:alerts', JSON.stringify(alert));
  console.log('✅ Alert published to Redis');
}

async function simulateNewToken() {
  console.log('\n🆕 Simulating new token event...');
  
  const token = {
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    name: 'Test Meme Token',
    symbol: 'TEST',
    decimals: 18,
    totalSupply: '1000000000000000000000000',
    liquidityUSD: 5000,
    securityScore: 85,
    timestamp: Date.now()
  };
  
  await redis.publish('websocket:new_token', JSON.stringify(token));
  console.log('✅ New token event published to Redis');
}

async function simulateTrade() {
  console.log('\n💱 Simulating trade event...');
  
  const trade = {
    transactionHash: '0x' + randomBytes(32).toString('hex'),
    tokenAddress: '0x1234567890123456789012345678901234567890',
    tokenSymbol: 'TEST',
    type: 'BUY',
    trader: '0x9876543210987654321098765432109876543210',
    amountIn: '1000000000000000000',
    amountOut: '5000000000000000000000',
    valueUSD: 15000,
    priceImpact: 2.5,
    timestamp: Date.now()
  };
  
  await redis.publish('websocket:trade', JSON.stringify(trade));
  console.log('✅ Trade event published to Redis');
}

async function simulatePriceUpdate() {
  console.log('\n📊 Simulating price update...');
  
  const priceUpdate = {
    tokenAddress: '0x1234567890123456789012345678901234567890',
    price: 0.0012,
    priceChange24h: 15.5,
    volume24h: 250000,
    liquidity: 100000,
    timestamp: Date.now()
  };
  
  await redis.publish('websocket:price_update', JSON.stringify(priceUpdate));
  console.log('✅ Price update published to Redis');
}

async function runTests() {
  console.log('🚀 Starting integration tests...\n');
  
  try {
    // Connect to WebSocket
    await connectWebSocket();
    
    // Subscribe to channels
    await subscribeToChannels();
    
    // Wait for subscription confirmations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run simulations
    await simulateAlert();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await simulateNewToken();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await simulateTrade();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await simulatePriceUpdate();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log('- WebSocket connection: ✅');
    console.log('- Channel subscriptions: ✅');
    console.log('- Alert simulation: ✅');
    console.log('- New token simulation: ✅');
    console.log('- Trade simulation: ✅');
    console.log('- Price update simulation: ✅');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (ws) ws.close();
    redis.disconnect();
  }
}

// Run tests
runTests().catch(console.error);