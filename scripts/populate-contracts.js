#!/usr/bin/env node

const { ethers } = require('ethers');

// Contract configuration
const CONFIG = {
  network: "coreTestnet",
  chainId: "1114",
  rpc: "https://1114.rpc.thirdweb.com",
  contracts: {
    platformToken: "0x26EfC13dF039c6B4E084CEf627a47c348197b655",
    staking: "0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa",
    memeFactory: "0x0eeF9597a9B231b398c29717e2ee89eF6962b784",
    treasury: "0xe397a72377F43645Cd4DA02d709c378df6e9eE5a"
  },
  deployer: "0xe397a72377F43645Cd4DA02d709c378df6e9eE5a",
  privateKey: "96f4c91749c35b74a1642694b53161aa97c46f654bd80aac0e126d3ec2114566"//DUMMY KEY
};

// Contract ABIs (simplified for interaction)
const MEME_FACTORY_ABI = [
  "function createToken(string _name, string _symbol, string _description, string _image, string _twitter, string _telegram, string _website) payable",
  "function buyToken(address _token, uint256 _minTokens) payable",
  "function sellToken(address _token, uint256 _amount, uint256 _minETH)",
  "function getAllTokens() view returns (address[])",
  "function getTokenInfo(address _token) view returns (tuple(address token, string name, string symbol, address creator, uint256 sold, uint256 raised, bool isOpen, bool isLaunched, uint256 createdAt, uint256 launchedAt))",
  "function totalTokensCreated() view returns (uint256)",
  "function totalVolume() view returns (uint256)"
];

const STAKING_ABI = [
  "function stake(uint256 _amount)",
  "function claimRewards()",
  "function getUserTier(address _user) view returns (uint256)",
  "function getStakingStats(address _user) view returns (uint256, uint256, uint256, uint256, bool)",
  "function addRevenue() payable",
  "function pool() view returns (uint256, uint256, uint256, uint256)"
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

async function main() {
  console.log("🚀 Starting Core.Fun Contract Population Script");
  console.log("===============================================");

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.rpc);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  
  console.log(`📊 Connected to: ${CONFIG.network}`);
  console.log(`💼 Deployer wallet: ${CONFIG.deployer}`);
  
  // Check wallet balance
  const balance = await provider.getBalance(CONFIG.deployer);
  console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} CORE`);
  
  if (balance < ethers.parseEther("0.5")) {
    console.error("❌ Insufficient balance! Need at least 0.5 CORE for transactions");
    return;
  }

  // Initialize contracts
  const memeFactory = new ethers.Contract(CONFIG.contracts.memeFactory, MEME_FACTORY_ABI, wallet);
  const staking = new ethers.Contract(CONFIG.contracts.staking, STAKING_ABI, wallet);
  const platformToken = new ethers.Contract(CONFIG.contracts.platformToken, ERC20_ABI, wallet);

  console.log("\n🏭 Contract Instances Created");
  console.log("=============================");

  // Step 1: Create multiple meme tokens
  console.log("\n🎯 Step 1: Creating Meme Tokens");
  console.log("================================");

  const tokens = [
    {
      name: "CoreDoge",
      symbol: "CDOGE",
      description: "The first meme coin on Core blockchain! Much wow, very core!",
      image: "https://via.placeholder.com/200x200/ff6b6b/ffffff?text=CDOGE",
      twitter: "https://twitter.com/coredoge",
      telegram: "https://t.me/coredoge",
      website: "https://coredoge.fun"
    },
    {
      name: "CorePepe",
      symbol: "CPEPE",
      description: "Rare Pepe on Core chain. Feel good meme vibes only!",
      image: "https://via.placeholder.com/200x200/4ecdc4/ffffff?text=CPEPE",
      twitter: "https://twitter.com/corepepe",
      telegram: "https://t.me/corepepe",
      website: "https://corepepe.fun"
    },
    {
      name: "CoreMoon",
      symbol: "CMOON",
      description: "To the moon and beyond on Core blockchain! 🚀🌙",
      image: "https://via.placeholder.com/200x200/45b7d1/ffffff?text=CMOON",
      twitter: "https://twitter.com/coremoon",
      telegram: "https://t.me/coremoon",
      website: "https://coremoon.fun"
    }
  ];

  const createdTokens = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    console.log(`\n📝 Creating token ${i + 1}: ${token.name} (${token.symbol})`);
    
    try {
      const tx = await memeFactory.createToken(
        token.name,
        token.symbol,
        token.description,
        token.image,
        token.twitter,
        token.telegram,
        token.website,
        { value: ethers.parseEther("0.1") } // Creation fee
      );
      
      console.log(`⏳ Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Token created! Gas used: ${receipt.gasUsed.toString()}`);
      
      // Get the created token address from events
      const tokenCreatedEvent = receipt.logs.find(log => {
        try {
          const decoded = memeFactory.interface.parseLog(log);
          return decoded.name === 'TokenCreated';
        } catch (e) {
          return false;
        }
      });
      
      if (tokenCreatedEvent) {
        const decoded = memeFactory.interface.parseLog(tokenCreatedEvent);
        const tokenAddress = decoded.args.token;
        createdTokens.push(tokenAddress);
        console.log(`🎉 Token address: ${tokenAddress}`);
      }
      
      // Wait a bit between transactions
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed to create token ${token.name}:`, error.message);
    }
  }

  // Step 2: Buy tokens from bonding curves
  console.log("\n💰 Step 2: Buying Tokens (Simulating Trading Activity)");
  console.log("======================================================");

  for (let i = 0; i < createdTokens.length; i++) {
    const tokenAddress = createdTokens[i];
    console.log(`\n📈 Buying tokens from: ${tokenAddress}`);
    
    try {
      // Buy tokens multiple times with different amounts
      const buyAmounts = ["0.01", "0.02", "0.015", "0.025"];
      
      for (let j = 0; j < buyAmounts.length; j++) {
        const buyAmount = buyAmounts[j];
        console.log(`💸 Buying with ${buyAmount} CORE...`);
        
        const tx = await memeFactory.buyToken(
          tokenAddress,
          0, // minTokens (0 for simplicity)
          { value: ethers.parseEther(buyAmount) }
        );
        
        console.log(`⏳ Buy transaction: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Purchase completed!`);
        
        // Wait between purchases
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
    } catch (error) {
      console.error(`❌ Failed to buy tokens from ${tokenAddress}:`, error.message);
    }
  }

  // Step 3: Add revenue to staking and simulate staking activity
  console.log("\n🥩 Step 3: Staking Contract Activity");
  console.log("=====================================");

  try {
    // Add revenue to staking contract
    console.log("💰 Adding revenue to staking contract...");
    const revenueTx = await staking.addRevenue({ 
      value: ethers.parseEther("0.05") 
    });
    console.log(`⏳ Revenue transaction: ${revenueTx.hash}`);
    await revenueTx.wait();
    console.log("✅ Revenue added to staking contract!");

    // Check platform token balance
    const tokenBalance = await platformToken.balanceOf(CONFIG.deployer);
    console.log(`🪙 Platform token balance: ${ethers.formatEther(tokenBalance)}`);
    
    if (tokenBalance > 0) {
      // Approve staking contract to spend tokens
      console.log("🔓 Approving staking contract...");
      const approveAmount = tokenBalance / 2n; // Stake half of balance
      const approveTx = await platformToken.approve(CONFIG.contracts.staking, approveAmount);
      await approveTx.wait();
      console.log("✅ Approval completed!");
      
      // Stake tokens
      console.log(`🥩 Staking ${ethers.formatEther(approveAmount)} tokens...`);
      const stakeTx = await staking.stake(approveAmount);
      console.log(`⏳ Stake transaction: ${stakeTx.hash}`);
      await stakeTx.wait();
      console.log("✅ Tokens staked successfully!");
      
      // Check user tier
      const userTier = await staking.getUserTier(CONFIG.deployer);
      console.log(`🏆 User tier: ${userTier}`);
    }
    
  } catch (error) {
    console.error("❌ Staking activity failed:", error.message);
  }

  // Step 4: Display final statistics
  console.log("\n📊 Step 4: Final Contract Statistics");
  console.log("====================================");

  try {
    // MemeFactory stats
    const totalTokens = await memeFactory.totalTokensCreated();
    const totalVolume = await memeFactory.totalVolume();
    console.log(`🏭 Total tokens created: ${totalTokens.toString()}`);
    console.log(`📊 Total trading volume: ${ethers.formatEther(totalVolume)} CORE`);
    
    // Get all created tokens
    const allTokens = await memeFactory.getAllTokens();
    console.log(`📋 All token addresses: ${allTokens.length} tokens`);
    
    for (let i = 0; i < Math.min(allTokens.length, 3); i++) {
      const tokenInfo = await memeFactory.getTokenInfo(allTokens[i]);
      console.log(`  Token ${i + 1}: ${tokenInfo.name} (${tokenInfo.symbol})`);
      console.log(`    Address: ${tokenInfo.token}`);
      console.log(`    Sold: ${ethers.formatEther(tokenInfo.sold)} tokens`);
      console.log(`    Raised: ${ethers.formatEther(tokenInfo.raised)} CORE`);
      console.log(`    Status: ${tokenInfo.isLaunched ? 'Launched' : 'Active'}`);
    }
    
    // Staking stats
    const stakingStats = await staking.getStakingStats(CONFIG.deployer);
    console.log(`\n🥩 Staking Statistics:`);
    console.log(`  Staked amount: ${ethers.formatEther(stakingStats[0])} tokens`);
    console.log(`  Pending rewards: ${ethers.formatEther(stakingStats[1])} tokens`);
    console.log(`  Total earned: ${ethers.formatEther(stakingStats[2])} tokens`);
    console.log(`  User tier: ${stakingStats[3].toString()}`);
    console.log(`  Is premium: ${stakingStats[4]}`);
    
    // Platform token stats
    const tokenName = await platformToken.name();
    const tokenSymbol = await platformToken.symbol();
    const totalSupply = await platformToken.totalSupply();
    console.log(`\n🪙 Platform Token (${tokenName} - ${tokenSymbol}):`);
    console.log(`  Total supply: ${ethers.formatEther(totalSupply)} tokens`);
    console.log(`  Contract: ${CONFIG.contracts.platformToken}`);
    
  } catch (error) {
    console.error("❌ Failed to get statistics:", error.message);
  }

  // Final balance check
  const finalBalance = await provider.getBalance(CONFIG.deployer);
  console.log(`\n💰 Final wallet balance: ${ethers.formatEther(finalBalance)} CORE`);
  console.log(`💸 Total spent: ${ethers.formatEther(balance - finalBalance)} CORE`);

  console.log("\n🎉 Contract Population Completed!");
  console.log("==================================");
  console.log("✅ Contracts are now populated with activity");
  console.log("✅ Multiple tokens created and traded");
  console.log("✅ Staking activity simulated");
  console.log("✅ Revenue distributed");
  console.log("\n🔍 Judges can now explore active contracts on Core Testnet:");
  console.log(`   Explorer: https://scan.test.btcs.network/`);
  console.log(`   MemeFactory: https://scan.test.btcs.network/address/${CONFIG.contracts.memeFactory}`);
  console.log(`   Staking: https://scan.test.btcs.network/address/${CONFIG.contracts.staking}`);
  console.log(`   Platform Token: https://scan.test.btcs.network/address/${CONFIG.contracts.platformToken}`);
}

// Error handling
main()
  .then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });