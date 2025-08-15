const { ethers } = require("ethers");
const axios = require("axios");

// Configuration
const NETWORK = "testnet";
const RPC_URL = "https://rpc.test2.btcs.network";
const PRIVATE_KEY = "96f4c91749c35b74a1642694b53161aa97c46f654bd80aac0e126d3ec2114566";
const FACTORY_ADDRESS = "0x0eeF9597a9B231b398c29717e2ee89eF6962b784";

// Realistic meme token data
const MEME_TOKENS = [
  {
    name: "Doge Core",
    symbol: "DOGEC",
    description: "The OG meme coin reimagined on Core blockchain. Much wow, very fast!",
    image: "https://i.imgur.com/H37kxPH.jpg",
    twitter: "https://twitter.com/dogecoin",
    telegram: "https://t.me/dogecore",
    website: "https://dogecore.fun"
  },
  {
    name: "Pepe Core",
    symbol: "PEPEC",
    description: "The rarest Pepe on Core. Feels good man! 🐸",
    image: "https://i.imgur.com/KJFgfxV.png",
    twitter: "https://twitter.com/pepecoincore",
    telegram: "https://t.me/pepecore",
    website: "https://pepecore.xyz"
  },
  {
    name: "Core Shiba",
    symbol: "CSIB",
    description: "Shiba Inu's best friend on Core Chain. To the moon! 🚀",
    image: "https://i.imgur.com/xUflLRs.jpg",
    twitter: "https://twitter.com/coreshiba",
    telegram: "https://t.me/coreshibainu",
    website: "https://coreshiba.com"
  },
  {
    name: "Moon Cat Core",
    symbol: "MCC",
    description: "Cats always land on their feet... and on the moon! 🐱🌙",
    image: "https://i.imgur.com/rnKvxaB.png",
    twitter: "https://twitter.com/mooncatcore",
    telegram: "https://t.me/mooncatcore",
    website: ""
  },
  {
    name: "Wojak Core",
    symbol: "WOJC",
    description: "I know that feel bro... but on Core we're all gonna make it!",
    image: "https://i.imgur.com/UZLhZzv.jpg",
    twitter: "https://twitter.com/wojakcore",
    telegram: "https://t.me/wojakcore",
    website: "https://wojak.core"
  },
  {
    name: "Chad Core",
    symbol: "CHAD",
    description: "Yes. Simply yes. The alpha meme on Core blockchain.",
    image: "https://i.imgur.com/p8YgHZN.jpg",
    twitter: "https://twitter.com/chadcore",
    telegram: "https://t.me/chadcoreofficial",
    website: ""
  },
  {
    name: "Baby Core Dragon",
    symbol: "BCD",
    description: "A cute dragon protecting the Core ecosystem! 🐉",
    image: "https://i.imgur.com/4VNhbL1.png",
    twitter: "https://twitter.com/babycoredragon",
    telegram: "https://t.me/babycoredragon",
    website: "https://babycoredragon.io"
  },
  {
    name: "Core Hamster",
    symbol: "HAMMY",
    description: "Running on the wheel to power Core blockchain! 🐹⚡",
    image: "https://i.imgur.com/QmZfXNO.jpg",
    twitter: "",
    telegram: "https://t.me/corehamster",
    website: ""
  },
  {
    name: "Rocket Core",
    symbol: "RCORE",
    description: "Fueling the Core ecosystem to Mars and beyond! 🚀",
    image: "https://i.imgur.com/7JKqvML.png",
    twitter: "https://twitter.com/rocketcore",
    telegram: "https://t.me/rocketcore",
    website: "https://rocketcore.space"
  },
  {
    name: "Core Vikings",
    symbol: "VKING",
    description: "Raiding the Core blockchain! Valhalla awaits! ⚔️",
    image: "https://i.imgur.com/TzUBNMx.jpg",
    twitter: "https://twitter.com/corevikings",
    telegram: "https://t.me/corevikings",
    website: ""
  }
];

// Trading patterns for realistic activity (smaller amounts for testnet)
const TRADING_PATTERNS = [
  { action: "buy", amount: "0.01", delay: 2000 },
  { action: "buy", amount: "0.02", delay: 3000 },
  { action: "buy", amount: "0.005", delay: 1500 },
  { action: "buy", amount: "0.03", delay: 4000 },
  { action: "sell", percentage: 25, delay: 5000 },
  { action: "buy", amount: "0.015", delay: 2500 },
  { action: "buy", amount: "0.025", delay: 3500 },
  { action: "sell", percentage: 50, delay: 6000 },
  { action: "buy", amount: "0.008", delay: 2000 },
  { action: "buy", amount: "0.04", delay: 5000 }
];

// Contract ABIs
const FACTORY_ABI = [
  "function createToken(string name, string symbol, string description, string image, string twitter, string telegram, string website) payable returns (address)",
  "function buyToken(address token, uint256 minTokens) payable",
  "function sellToken(address token, uint256 amount, uint256 minETH)",
  "function creationFee() view returns (uint256)",
  "function getTokenInfo(address) view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))",
  "function calculateTokensOut(uint256 currentSold, uint256 ethIn) view returns (uint256)",
  "function calculateETHOut(uint256 currentSold, uint256 tokensIn) view returns (uint256)"
];

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deployToken(factory, tokenData, signer) {
  try {
    console.log(`\n📝 Creating token: ${tokenData.name} (${tokenData.symbol})`);
    
    // Get creation fee
    const creationFee = await factory.creationFee();
    console.log(`  Creation fee: ${ethers.formatEther(creationFee)} CORE`);
    
    // Deploy token
    const tx = await factory.createToken(
      tokenData.name,
      tokenData.symbol,
      tokenData.description,
      tokenData.image,
      tokenData.twitter,
      tokenData.telegram,
      tokenData.website,
      { value: creationFee }
    );
    
    console.log(`  Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    
    // Extract token address from events
    const event = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed?.name === "TokenCreated";
      } catch {
        return false;
      }
    });
    
    if (event) {
      const parsed = factory.interface.parseLog(event);
      const tokenAddress = parsed.args.token;
      console.log(`  ✅ Token deployed at: ${tokenAddress}`);
      return tokenAddress;
    }
    
    return null;
  } catch (error) {
    console.error(`  ❌ Failed to deploy ${tokenData.name}:`, error.message);
    return null;
  }
}

async function buyToken(factory, tokenAddress, amountCore, signer) {
  try {
    // Get token info first
    const tokenInfo = await factory.getTokenInfo(tokenAddress);
    console.log(`  💰 Buying ${tokenInfo.symbol} for ${amountCore} CORE`);
    
    // Calculate expected tokens
    const amountIn = ethers.parseEther(amountCore);
    const expectedTokens = await factory.calculateTokensOut(tokenInfo.sold, amountIn);
    const minTokens = expectedTokens * 95n / 100n; // 5% slippage
    
    // Execute buy
    const tx = await factory.buyToken(tokenAddress, minTokens, { value: amountIn });
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    
    console.log(`  ✅ Bought ~${ethers.formatEther(expectedTokens)} tokens`);
    return true;
  } catch (error) {
    console.error(`  ❌ Buy failed:`, error.message);
    return false;
  }
}

async function sellToken(factory, tokenAddress, percentage, signer) {
  try {
    // Get token balance
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const balance = await token.balanceOf(signer.address);
    
    if (balance === 0n) {
      console.log(`  ⚠️ No tokens to sell`);
      return false;
    }
    
    const sellAmount = balance * BigInt(percentage) / 100n;
    const tokenInfo = await factory.getTokenInfo(tokenAddress);
    
    console.log(`  💸 Selling ${percentage}% of ${tokenInfo.symbol} (${ethers.formatEther(sellAmount)} tokens)`);
    
    // Approve factory to spend tokens
    const approveTx = await token.approve(factory.target, sellAmount);
    await approveTx.wait();
    
    // Calculate minimum ETH out
    const expectedETH = await factory.calculateETHOut(tokenInfo.sold, sellAmount);
    const minETH = expectedETH * 95n / 100n; // 5% slippage
    
    // Execute sell
    const tx = await factory.sellToken(tokenAddress, sellAmount, minETH);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    
    console.log(`  ✅ Sold for ~${ethers.formatEther(expectedETH)} CORE`);
    return true;
  } catch (error) {
    console.error(`  ❌ Sell failed:`, error.message);
    return false;
  }
}

async function simulateTrading(factory, tokenAddresses, signer) {
  console.log("\n🎮 Starting trading simulation...");
  
  for (const pattern of TRADING_PATTERNS) {
    // Pick a random token
    const tokenAddress = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)];
    if (!tokenAddress) continue;
    
    const tokenInfo = await factory.getTokenInfo(tokenAddress);
    console.log(`\n📊 Trading ${tokenInfo.symbol}:`);
    
    if (pattern.action === "buy") {
      await buyToken(factory, tokenAddress, pattern.amount, signer);
    } else if (pattern.action === "sell") {
      await sellToken(factory, tokenAddress, pattern.percentage, signer);
    }
    
    // Wait before next trade
    await sleep(pattern.delay);
  }
}

async function main() {
  console.log("🚀 Core Meme Platform - Token Population Script");
  console.log("================================================");
  
  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
  
  console.log(`\n📍 Network: ${NETWORK}`);
  console.log(`👛 Deployer: ${signer.address}`);
  
  // Check balance
  const balance = await provider.getBalance(signer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} CORE`);
  
  if (balance < ethers.parseEther("0.3")) {
    console.error("\n❌ Insufficient balance! Need at least 0.3 CORE for deployments and trading.");
    console.log("Get testnet CORE from: https://scan.test2.btcs.network/faucet");
    return;
  }
  
  // Deploy tokens
  console.log("\n🎨 Deploying meme tokens...");
  const deployedTokens = [];
  
  // Deploy 2-3 tokens with current balance
  const tokensToDeply = balance > ethers.parseEther("0.4") ? 3 : 2;
  for (let i = 0; i < Math.min(tokensToDeply, MEME_TOKENS.length); i++) {
    const tokenAddress = await deployToken(factory, MEME_TOKENS[i], signer);
    if (tokenAddress) {
      deployedTokens.push(tokenAddress);
    }
    await sleep(3000); // Wait 3 seconds between deployments
  }
  
  console.log(`\n✅ Deployed ${deployedTokens.length} tokens`);
  
  if (deployedTokens.length > 0) {
    // Wait a bit before trading
    console.log("\n⏳ Waiting 10 seconds before starting trading simulation...");
    await sleep(10000);
    
    // Simulate trading
    await simulateTrading(factory, deployedTokens, signer);
  }
  
  console.log("\n🎉 Platform population complete!");
  console.log("Check your frontend to see the new tokens and activity!");
}

// Run the script
main().catch(error => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});