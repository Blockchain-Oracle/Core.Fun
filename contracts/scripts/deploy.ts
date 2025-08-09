import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Starting deployment...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  // Get account balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "CORE");
  
  // Treasury address (use deployer for now, can be changed later)
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("Treasury address:", treasuryAddress);
  
  // Deploy Platform Token (for staking)
  console.log("\n📄 Deploying Platform Token...");
  const PlatformToken = await ethers.getContractFactory("MemeToken");
  const platformToken = await PlatformToken.deploy(
    deployer.address,
    "Core Meme Platform",
    "CMP",
    ethers.parseEther("100000000"), // 100M supply
    "The official platform token for Core Meme Platform",
    "",
    "",
    "",
    ""
  );
  await platformToken.waitForDeployment();
  const platformTokenAddress = await platformToken.getAddress();
  console.log("✅ Platform Token deployed to:", platformTokenAddress);
  
  // Enable trading for platform token
  await platformToken.enableTrading();
  console.log("✅ Trading enabled for Platform Token");
  
  // Deploy Staking Contract
  console.log("\n📄 Deploying Staking Contract...");
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(platformTokenAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("✅ Staking Contract deployed to:", stakingAddress);
  
  // Deploy MemeFactory
  console.log("\n📄 Deploying MemeFactory...");
  const MemeFactory = await ethers.getContractFactory("MemeFactory");
  const factory = await MemeFactory.deploy(treasuryAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ MemeFactory deployed to:", factoryAddress);
  
  // Transfer some platform tokens to staking contract for rewards
  console.log("\n💰 Setting up staking rewards...");
  const rewardAmount = ethers.parseEther("10000000"); // 10M tokens for rewards
  await platformToken.transfer(stakingAddress, rewardAmount);
  console.log("✅ Transferred", ethers.formatEther(rewardAmount), "CMP to Staking contract");
  
  // Save deployment addresses
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    contracts: {
      platformToken: platformTokenAddress,
      staking: stakingAddress,
      memeFactory: factoryAddress,
      treasury: treasuryAddress
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };
  
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const fileName = `${network.name}-${network.chainId}.json`;
  const filePath = path.join(deploymentsDir, fileName);
  
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n📁 Deployment info saved to: deployments/${fileName}`);
  
  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(50));
  console.log("\n📋 Contract Addresses:");
  console.log("  Platform Token:", platformTokenAddress);
  console.log("  Staking:", stakingAddress);
  console.log("  MemeFactory:", factoryAddress);
  console.log("  Treasury:", treasuryAddress);
  console.log("\n💡 Next Steps:");
  console.log("  1. Verify contracts on Core Scan");
  console.log("  2. Update .env with deployed addresses");
  console.log("  3. Test all functions on testnet");
  console.log("  4. Update IMPLEMENTATION_TASKS.md");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });