import { run } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 Starting contract verification...");
  
  // Get network name
  const network = await ethers.provider.getNetwork();
  const deploymentFile = path.join(__dirname, `../deployments/${network.name}-${network.chainId}.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error("❌ Deployment file not found. Please deploy contracts first.");
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const { contracts, treasury } = deployment;
  
  console.log("\n📋 Contracts to verify:");
  console.log("  Platform Token:", contracts.platformToken);
  console.log("  Staking:", contracts.staking);
  console.log("  MemeFactory:", contracts.memeFactory);
  
  // Verify Platform Token
  console.log("\n1️⃣ Verifying Platform Token...");
  try {
    await run("verify:verify", {
      address: contracts.platformToken,
      constructorArguments: [
        deployment.deployer,
        "Core Meme Platform",
        "CMP",
        ethers.parseEther("100000000"),
        "The official platform token for Core Meme Platform",
        "",
        "",
        "",
        ""
      ],
    });
    console.log("✅ Platform Token verified!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Platform Token already verified");
    } else {
      console.error("❌ Failed to verify Platform Token:", error.message);
    }
  }
  
  // Verify Staking Contract
  console.log("\n2️⃣ Verifying Staking Contract...");
  try {
    await run("verify:verify", {
      address: contracts.staking,
      constructorArguments: [contracts.platformToken],
    });
    console.log("✅ Staking Contract verified!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Staking Contract already verified");
    } else {
      console.error("❌ Failed to verify Staking Contract:", error.message);
    }
  }
  
  // Verify MemeFactory
  console.log("\n3️⃣ Verifying MemeFactory...");
  try {
    await run("verify:verify", {
      address: contracts.memeFactory,
      constructorArguments: [treasury],
    });
    console.log("✅ MemeFactory verified!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ MemeFactory already verified");
    } else {
      console.error("❌ Failed to verify MemeFactory:", error.message);
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("🎉 VERIFICATION COMPLETE!");
  console.log("=".repeat(50));
  
  const scanUrl = network.chainId === 1114n 
    ? "https://scan.test2.btcs.network"
    : "https://scan.coredao.org";
    
  console.log("\n🔗 View contracts on Core Scan:");
  console.log(`  Platform Token: ${scanUrl}/address/${contracts.platformToken}`);
  console.log(`  Staking: ${scanUrl}/address/${contracts.staking}`);
  console.log(`  MemeFactory: ${scanUrl}/address/${contracts.memeFactory}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });