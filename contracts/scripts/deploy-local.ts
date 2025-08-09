import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying to local Hardhat node...");
  
  // Get signers
  const [deployer, user1, user2, treasury] = await ethers.getSigners();
  
  console.log("Deployer:", deployer.address);
  console.log("Treasury:", treasury.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);
  
  // Deploy Platform Token
  console.log("\n📄 Deploying Platform Token...");
  const PlatformToken = await ethers.getContractFactory("MemeToken");
  const platformToken = await PlatformToken.deploy(
    deployer.address,
    "Core Meme Platform",
    "CMP",
    ethers.parseEther("100000000"),
    "Platform token",
    "",
    "",
    "",
    ""
  );
  await platformToken.waitForDeployment();
  console.log("✅ Platform Token:", await platformToken.getAddress());
  
  // Enable trading
  await platformToken.enableTrading();
  
  // Deploy Staking
  console.log("\n📄 Deploying Staking...");
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(await platformToken.getAddress());
  await staking.waitForDeployment();
  console.log("✅ Staking:", await staking.getAddress());
  
  // Deploy MemeFactory
  console.log("\n📄 Deploying MemeFactory...");
  const MemeFactory = await ethers.getContractFactory("MemeFactory");
  const factory = await MemeFactory.deploy(treasury.address);
  await factory.waitForDeployment();
  console.log("✅ MemeFactory:", await factory.getAddress());
  
  // Setup initial state
  console.log("\n💰 Setting up initial state...");
  
  // Transfer platform tokens to users
  await platformToken.transfer(user1.address, ethers.parseEther("1000000"));
  await platformToken.transfer(user2.address, ethers.parseEther("1000000"));
  console.log("✅ Transferred 1M CMP to each user");
  
  // Transfer rewards to staking contract
  await platformToken.transfer(await staking.getAddress(), ethers.parseEther("10000000"));
  console.log("✅ Transferred 10M CMP to Staking for rewards");
  
  // Create a test token
  console.log("\n🎨 Creating test meme token...");
  const creationFee = await factory.creationFee();
  await factory.connect(user1).createToken(
    "Test Meme",
    "MEME",
    "A test meme token",
    "https://example.com/image.png",
    "@testmeme",
    "t.me/testmeme",
    "https://testmeme.com",
    { value: creationFee }
  );
  
  const tokens = await factory.getAllTokens();
  console.log("✅ Test token created:", tokens[0]);
  
  // Buy some tokens
  console.log("\n💸 Buying test tokens...");
  await factory.connect(user2).buyToken(tokens[0], 0, { value: ethers.parseEther("0.5") });
  console.log("✅ User2 bought tokens");
  
  const tokenInfo = await factory.getTokenInfo(tokens[0]);
  console.log("\n📊 Token Info:");
  console.log("  Name:", tokenInfo.name);
  console.log("  Symbol:", tokenInfo.symbol);
  console.log("  Creator:", tokenInfo.creator);
  console.log("  Sold:", ethers.formatEther(tokenInfo.sold));
  console.log("  Raised:", ethers.formatEther(tokenInfo.raised), "CORE");
  
  console.log("\n" + "=".repeat(50));
  console.log("🎉 LOCAL DEPLOYMENT COMPLETE!");
  console.log("=".repeat(50));
  console.log("\n📋 Deployed Addresses:");
  console.log("  Platform Token:", await platformToken.getAddress());
  console.log("  Staking:", await staking.getAddress());
  console.log("  MemeFactory:", await factory.getAddress());
  console.log("  Test Token:", tokens[0]);
  console.log("\n💡 You can now interact with contracts locally!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });