const { ethers } = require("ethers");

// Configuration
const RPC_URL = "https://1114.rpc.thirdweb.com";
const PRIVATE_KEY = "96f4c91749c35b74a1642694b53161aa97c46f654bd80aac0e126d3ec2114566";
const FACTORY_ADDRESS = "0x0eeF9597a9B231b398c29717e2ee89eF6962b784";

// Contract ABIs
const FACTORY_ABI = [
  "function getAllTokens() view returns (address[])",
  "function buyToken(address token, uint256 minTokens) payable",
  "function sellToken(address token, uint256 amount, uint256 minETH)",
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

async function buyToken(factory, tokenAddress, amountCore, signer) {
  try {
    const tokenInfo = await factory.getTokenInfo(tokenAddress);
    console.log(`  💰 Buying ${tokenInfo.symbol} for ${amountCore} CORE`);
    
    const amountIn = ethers.parseEther(amountCore);
    const expectedTokens = await factory.calculateTokensOut(tokenInfo.sold, amountIn);
    const minTokens = expectedTokens * 95n / 100n; // 5% slippage
    
    const tx = await factory.buyToken(tokenAddress, minTokens, { value: amountIn });
    console.log(`  Tx: ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`  ✅ Bought successfully!`);
      return true;
    }
  } catch (error) {
    console.error(`  ❌ Buy failed:`, error.message);
  }
  return false;
}

async function sellToken(factory, tokenAddress, percentage, signer) {
  try {
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
    const balance = await token.balanceOf(signer.address);
    
    if (balance === 0n) {
      console.log(`  ⚠️ No tokens to sell`);
      return false;
    }
    
    const sellAmount = balance * BigInt(percentage) / 100n;
    const tokenInfo = await factory.getTokenInfo(tokenAddress);
    
    console.log(`  💸 Selling ${percentage}% of ${tokenInfo.symbol}`);
    
    // Approve
    const approveTx = await token.approve(factory.target, sellAmount);
    await approveTx.wait();
    
    // Calculate minimum ETH
    const expectedETH = await factory.calculateETHOut(tokenInfo.sold, sellAmount);
    const minETH = expectedETH * 95n / 100n;
    
    const tx = await factory.sellToken(tokenAddress, sellAmount, minETH);
    console.log(`  Tx: ${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`  ✅ Sold successfully!`);
      return true;
    }
  } catch (error) {
    console.error(`  ❌ Sell failed:`, error.message);
  }
  return false;
}

async function main() {
  console.log("🎮 Core Meme Trading Simulator");
  console.log("================================");
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
  
  console.log(`👛 Trader: ${signer.address}`);
  
  const balance = await provider.getBalance(signer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} CORE\n`);
  
  // Get all tokens
  const tokens = await factory.getAllTokens();
  if (tokens.length === 0) {
    console.log("❌ No tokens found!");
    return;
  }
  
  console.log(`Found ${tokens.length} tokens to trade\n`);
  
  // Trading loop
  let round = 1;
  while (true) {
    console.log(`\n📊 Trading Round ${round}`);
    console.log("=================");
    
    // Pick random token
    const tokenAddress = tokens[Math.floor(Math.random() * tokens.length)];
    const tokenInfo = await factory.getTokenInfo(tokenAddress);
    console.log(`Selected: ${tokenInfo.name} (${tokenInfo.symbol})`);
    
    // Random action
    const action = Math.random() > 0.6 ? "sell" : "buy";
    
    if (action === "buy") {
      // Random buy amount (0.005 - 0.02 CORE)
      const amount = (0.005 + Math.random() * 0.015).toFixed(4);
      await buyToken(factory, tokenAddress, amount, signer);
    } else {
      // Random sell percentage (10-50%)
      const percentage = Math.floor(10 + Math.random() * 40);
      await sellToken(factory, tokenAddress, percentage, signer);
    }
    
    // Check balance periodically
    if (round % 5 === 0) {
      const newBalance = await provider.getBalance(signer.address);
      console.log(`\n💰 Current balance: ${ethers.formatEther(newBalance)} CORE`);
      
      if (newBalance < ethers.parseEther("0.05")) {
        console.log("\n⚠️ Low balance! Stopping simulation.");
        break;
      }
    }
    
    // Wait 5-15 seconds between trades
    const delay = 5000 + Math.floor(Math.random() * 10000);
    console.log(`\n⏳ Waiting ${delay/1000} seconds...`);
    await sleep(delay);
    
    round++;
  }
}

main().catch(error => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});