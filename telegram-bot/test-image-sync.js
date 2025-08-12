const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

console.log('Testing @napi-rs/canvas...');

try {
  const width = 200;
  const height = 200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#1E2341');
  grad.addColorStop(1, '#0A0E27');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Text
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#00D87A';
  ctx.fillText('Core', 10, 30);
  ctx.fillStyle = '#FF3B69';
  ctx.fillText('Meme', 10, 60);

  const buffer = canvas.toBuffer('image/png');
  const out = path.join(__dirname, 'test-sync.png');
  fs.writeFileSync(out, buffer);
  console.log('✅ Image saved as', out, buffer.length, 'bytes');
  process.exit(0);
} catch (err) {
  console.error('Error creating image:', err);
  process.exit(1);
}