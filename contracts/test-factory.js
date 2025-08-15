const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("https://rpc.test2.btcs.network");
const factoryAddress = "0x0eeF9597a9B231b398c29717e2ee89eF6962b784";

const ABI = [
  "function getAllTokens() view returns (address[])",
  "function totalTokensCreated() view returns (uint256)",
  "function creationFee() view returns (uint256)",
  "function platformTradingFee() view returns (uint256)"
];

async function test() {
  const factory = new ethers.Contract(factoryAddress, ABI, provider);
  
  try {
    const tokens = await factory.getAllTokens();
    console.log("Total tokens:", tokens.length);
    console.log("Tokens:", tokens);
    
    const total = await factory.totalTokensCreated();
    console.log("Total created:", total.toString());
    
    const fee = await factory.creationFee();
    console.log("Creation fee:", ethers.formatEther(fee), "CORE");
    
    const tradingFee = await factory.platformTradingFee();
    console.log("Trading fee:", tradingFee.toString(), "basis points");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test();
