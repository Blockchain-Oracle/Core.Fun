import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const CORE_SCAN_API_KEY = process.env.CORE_SCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true,
      forking: {
        url: "https://rpc.coredao.org",
        enabled: false,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      allowUnlimitedContractSize: true,
    },
    coreTestnet: {
      url: process.env.CORE_TESTNET_RPC || "https://1114.rpc.thirdweb.com",
      chainId: 1114,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 35000000000,
    },
    coreMainnet: {
      url: process.env.CORE_MAINNET_RPC || "https://rpc.coredao.org",
      chainId: 1116,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 35000000000,
    },
  },
  etherscan: {
    apiKey: {
      core: CORE_SCAN_API_KEY,
      coreTestnet: CORE_SCAN_API_KEY,
    },
    customChains: [
      {
        network: "core",
        chainId: 1116,
        urls: {
          apiURL: "https://openapi.coredao.org/api",
          browserURL: "https://scan.coredao.org",
        },
      },
      {
        network: "coreTestnet",
        chainId: 1114,
        urls: {
          apiURL: "https://api.test2.btcs.network/api",
          browserURL: "https://scan.test2.btcs.network",
        },
      },
    ],
  },
  paths: {
    sources: "./core",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
  },
};

export default config;