#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Contract verification using Core Testnet API
async function verifyContract(contractAddress, contractName, sourceCode, constructorArgs = '') {
  console.log(`🔍 Verifying ${contractName} at ${contractAddress}...`);
  
  const verificationData = {
    action: "verifysourcecode",
    address: contractAddress,
    sourceCode: sourceCode,
    codeformat: "solidity-single-file",
    contractaddress: contractAddress,
    compilerversion: "v0.8.27+commit.40a35a09",
    optimizationUsed: "1",
    runs: 200,
    constructorArguements: constructorArgs,
    licenseType: 1, // MIT License
    module: "contract",
    apikey: "b89faa6a05ab42e980079484e47743c4"
  };

  try {
    const response = await fetch('https://api.test2.btcs.network/api/contracts/verify_source_code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*'
      },
      body: JSON.stringify(verificationData)
    });

    const result = await response.text();
    console.log(`✅ Response for ${contractName}:`, result);
    return result;
  } catch (error) {
    console.error(`❌ Failed to verify ${contractName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🚀 Manual Contract Verification for Core Testnet");
  console.log("================================================");

  // Load deployment info
  const deploymentFile = path.join(__dirname, '../contracts/deployments/coreTestnet-1114.json');
  
  if (!fs.existsSync(deploymentFile)) {
    console.error("❌ Deployment file not found!");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  console.log("📋 Found deployment:", deployment);

  // Read contract source files
  const contractsDir = path.join(__dirname, '../contracts/core');
  
  // Platform Token (MemeToken.sol)
  const memeTokenSource = fs.readFileSync(path.join(contractsDir, 'MemeToken.sol'), 'utf8');
  
  // Staking Contract
  const stakingSource = fs.readFileSync(path.join(contractsDir, 'Staking.sol'), 'utf8');
  
  // MemeFactory
  const memeFactorySource = fs.readFileSync(path.join(contractsDir, 'MemeFactory.sol'), 'utf8');

  console.log("\n🎯 Starting verification process...\n");

  // Verify Platform Token
  const tokenConstructorArgs = [
    deployment.deployer,
    "Core Meme Platform", 
    "CMP",
    "100000000000000000000000000", // 100M tokens with 18 decimals
    "The official platform token for Core Meme Platform",
    "", "", "", ""
  ].join(',');

  await verifyContract(
    deployment.contracts.platformToken,
    "Platform Token (MemeToken)",
    memeTokenSource,
    tokenConstructorArgs
  );

  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  // Verify Staking Contract  
  await verifyContract(
    deployment.contracts.staking,
    "Staking Contract",
    stakingSource,
    deployment.contracts.platformToken
  );

  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  // Verify MemeFactory
  await verifyContract(
    deployment.contracts.memeFactory,
    "MemeFactory",
    memeFactorySource,
    deployment.deployer
  );

  console.log("\n🎉 Manual verification attempts completed!");
  console.log("⏳ It may take a few minutes for verification to process on the explorer.");
  console.log("\n🔗 Check verification status at:");
  console.log(`   Platform Token: https://scan.test2.btcs.network/address/${deployment.contracts.platformToken}`);
  console.log(`   Staking: https://scan.test2.btcs.network/address/${deployment.contracts.staking}`);
  console.log(`   MemeFactory: https://scan.test2.btcs.network/address/${deployment.contracts.memeFactory}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });