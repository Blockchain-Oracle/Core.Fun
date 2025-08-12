const { ImageGenerator } = require('./dist/services/ImageGenerator');
const fs = require('fs');
const path = require('path');

async function testSimple() {
  console.log('Testing simple ImageGenerator output...');
  const gen = new ImageGenerator();

  // Minimal token card sample
  const tokenInfo = {
    symbol: 'MEME',
    name: 'Meme Token',
    price: 0.00001234,
    priceChange24h: 12.34,
    marketCap: 1_250_000,
    liquidity: 520_000,
    volume24h: 95_000,
    holders: 1234,
    isHoneypot: false,
    rugScore: 20,
  };

  const buf = await gen.generateTokenCard(tokenInfo);
  const out = path.join(__dirname, 'test-simple.png');
  fs.writeFileSync(out, buf);
  console.log('✅ Wrote', out, (buf?.length || 0), 'bytes');
}

if (require.main === module) {
  testSimple().catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
}