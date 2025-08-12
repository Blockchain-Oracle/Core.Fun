// Test script for image generation
const { ImageGenerator } = require('./dist/services/ImageGenerator');
const fs = require('fs');
const path = require('path');

async function testImageGeneration() {
  console.log('🎨 Testing image generation with @napi-rs/canvas...\n');
  
  const generator = new ImageGenerator();
  
  try {
    // Test 1: Position Card
    console.log('1️⃣ Generating position card...');
    const positionData = {
      tokenSymbol: 'MEME',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      amount: 1000000,
      currentValue: 1500.5,
      avgBuyPrice: 0.00001234,
      currentPrice: 0.00001567,
      pnl: 500.5,
      pnlPercentage: 27.5,
      id: '1', userId: 'u', tokenName: 'Meme Token', initialInvestment: 1000, firstBuyTime: new Date(), lastUpdateTime: new Date(), trades: 3
    };
    
    const positionImage = await generator.generatePositionCard(positionData);
    fs.writeFileSync(path.join(__dirname, 'test-position.png'), positionImage);
    console.log('✅ Position card saved as test-position.png');
    
    // Test 2: Portfolio Card
    console.log('\n2️⃣ Generating portfolio card...');
    const portfolioPositions = [
      { tokenSymbol: 'MEME1', pnl: 100, pnlPercentage: 15 },
      { tokenSymbol: 'MEME2', pnl: -50, pnlPercentage: -10 },
      { tokenSymbol: 'MEME3', pnl: 200, pnlPercentage: 40 },
    ];
    
    const portfolioImage = await generator.generatePortfolioCard(
      portfolioPositions,
      5000,
      250
    );
    fs.writeFileSync(path.join(__dirname, 'test-portfolio.png'), portfolioImage);
    console.log('✅ Portfolio card saved as test-portfolio.png');
    
    // Test 3: Trade Result
    console.log('\n3️⃣ Generating trade result card...');
    const tradeImage = await generator.generateTradeResult(
      'buy',
      'MEME',
      '1000000',
      '0.00001234',
      '10',
      null
    );
    fs.writeFileSync(path.join(__dirname, 'test-trade.png'), tradeImage);
    console.log('✅ Trade result saved as test-trade.png');
    
    // Test 4: Token Info Card
    console.log('\n4️⃣ Generating token info card...');
    const tokenInfo = {
      symbol: 'MEME',
      name: 'Meme Token',
      price: 0.00001234,
      priceChange24h: 25.5,
      marketCap: 1000000,
      liquidity: 500000,
      volume24h: 100000,
      holders: 1234,
      isHoneypot: false,
      rugScore: 20
    };
    
    const tokenImage = await generator.generateTokenCard(tokenInfo);
    fs.writeFileSync(path.join(__dirname, 'test-token.png'), tokenImage);
    console.log('✅ Token card saved as test-token.png');
    
    // Test 5: P&L Chart
    console.log('\n5️⃣ Generating P&L chart...');
    const pnlData = {
      totalInvested: 1000,
      totalRealized: 1200,
      totalUnrealized: 300,
      totalPnL: 500,
      totalPnLPercentage: 50,
      winRate: 66.7,
      totalTrades: 10,
      winningTrades: 7,
      losingTrades: 3,
      bestTrade: null,
      worstTrade: null,
      dailyPnL: [
        { date: '2024-01-01', realized: 100, unrealized: 50, total: 150, trades: 2 },
        { date: '2024-01-02', realized: -50, unrealized: 30, total: -20, trades: 1 },
        { date: '2024-01-03', realized: 200, unrealized: 100, total: 300, trades: 3 },
        { date: '2024-01-04', realized: 50, unrealized: 20, total: 70, trades: 1 }
      ]
    };
    
    const chartImage = await generator.generatePnLChart(pnlData);
    fs.writeFileSync(path.join(__dirname, 'test-pnl-chart.png'), chartImage);
    console.log('✅ P&L chart saved as test-pnl-chart.png');
    
    console.log('\n🎉 All image generation tests passed successfully!');
    console.log('📁 Generated images are in the telegram-bot directory');
    
  } catch (error) {
    console.error('❌ Error during image generation:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testImageGeneration().catch(console.error);
}