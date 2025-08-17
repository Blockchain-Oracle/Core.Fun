#!/usr/bin/env node

const { ethers } = require('ethers');

// Contract configuration
const CONFIG = {
  rpc: "https://1114.rpc.thirdweb.com",
  contracts: {
    memeFactory: "0x0eeF9597a9B231b398c29717e2ee89eF6962b784",
    staking: "0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa"
  },
  privateKey: "96f4c91749c35b74a1642694b53161aa97c46f654bd80aac0e126d3ec2114566"
};

// Minimal ABIs
const MEME_FACTORY_ABI = [
  "function createToken(string _name, string _symbol, string _description, string _image, string _twitter, string _telegram, string _website) payable",
  "function totalTokensCreated() view returns (uint256)"
];

const STAKING_ABI = [
  "function addRevenue() payable"
];

async function main() {
  console.log("🎯 Adding Activity to Core.Fun Contracts");
  console.log("=========================================");

  const provider = new ethers.JsonRpcProvider(CONFIG.rpc);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Current balance: ${ethers.formatEther(balance)} CORE`);
  
  if (balance < ethers.parseEther("0.01")) {
    console.log("❌ Insufficient balance for transactions");
    return;
  }

  const memeFactory = new ethers.Contract(CONFIG.contracts.memeFactory, MEME_FACTORY_ABI, wallet);
  const staking = new ethers.Contract(CONFIG.contracts.staking, STAKING_ABI, wallet);

  try {
    // Check current tokens created
    const currentTokens = await memeFactory.totalTokensCreated();
    console.log(`📊 Current tokens created: ${currentTokens.toString()}`);

    // Create a demo token if balance allows
    if (balance > ethers.parseEther("0.01")) {
      console.log("\n🎯 Creating demo token...");
      
      const tx = await memeFactory.createToken(
        "HackathonCoin",
        "HACK",
        "Demo token for Core.Fun hackathon showcase! 🚀",
        "https://via.placeholder.com/200x200/ff6b6b/ffffff?text=HACK",
        "https://twitter.com/corefun",
        "https://t.me/core_dot_fun_bot",
        "https://core.fun",
        { value: ethers.parseEther("0.005") }
      );
      
      console.log(`⏳ Transaction: ${tx.hash}`);
      await tx.wait();
      console.log("✅ Demo token created!");
    }

    // Add revenue to staking if we have balance
    const finalBalance = await provider.getBalance(wallet.address);
    if (finalBalance > ethers.parseEther("0.005")) {
      console.log("\n💰 Adding revenue to staking...");
      
      const revenueTx = await staking.addRevenue({ 
        value: ethers.parseEther("0.003") 
      });
      
      console.log(`⏳ Revenue transaction: ${revenueTx.hash}`);
      await revenueTx.wait();
      console.log("✅ Revenue added!");
    }

    const endBalance = await provider.getBalance(wallet.address);
    console.log(`\n💰 Final balance: ${ethers.formatEther(endBalance)} CORE`);
    console.log("🎉 Activity added successfully!");

  } catch (error) {
    console.error("❌ Failed to add activity:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });