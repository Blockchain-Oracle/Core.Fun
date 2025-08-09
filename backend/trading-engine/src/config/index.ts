import { TradingConfig } from '../types';
import * as dotenv from 'dotenv';

dotenv.config();

export const config: TradingConfig = {
  network: process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
  
  rpcUrl: process.env.NETWORK === 'mainnet'
    ? process.env.CORE_MAINNET_RPC || 'https://rpc.coredao.org'
    : process.env.CORE_TESTNET_RPC || 'https://rpc.test2.btcs.network',
  
  wsUrl: process.env.NETWORK === 'mainnet'
    ? process.env.CORE_MAINNET_WS
    : process.env.CORE_TESTNET_WS,
  
  memeFactoryAddress: process.env.MEME_FACTORY_ADDRESS,
  
  dexRouters: {
    IcecreamSwap: {
      address: process.env.NETWORK === 'mainnet'
        ? '0xBb5e1777A331ED93E07cF043363e48d320eb96c4'
        : '0x0000000000000000000000000000000000000000', // No testnet
      factory: process.env.NETWORK === 'mainnet'
        ? '0x9E6d21E759A7A288b80eef94E4737D313D31c13f'
        : '0x0000000000000000000000000000000000000000',
      initCodeHash: '0x58c1b429d0ffdb4407396ae8118c58fed54898473076d0394163ea2198f7c4a3'
    },
    ShadowSwap: {
      address: process.env.NETWORK === 'testnet'
        ? '0x524027673879FEDfFE8dD3baE1BF8FDD2Cd1bF13'
        : '0x0000000000000000000000000000000000000000', // Testnet only
      factory: process.env.NETWORK === 'testnet'
        ? '0x6e46ECa8d210C426ca6cA845feb2881Dc8c99426'
        : '0x0000000000000000000000000000000000000000',
      initCodeHash: '0x6eef19478e462b999a9ed867f57d8c87e8e60fb982a9c6b76df387b0c54e5f37'
    }
  },
  
  wcoreAddress: process.env.NETWORK === 'mainnet'
    ? '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f' // WCORE mainnet
    : '0x5c872990530Fe4f7322cA0c302762788e8199Ed0', // WCORE testnet
  
  maxSlippage: 10, // 10% max slippage
  defaultDeadline: 1200, // 20 minutes
  maxGasPrice: '100000000000', // 100 Gwei max
  
  mevProtection: {
    enabled: process.env.MEV_PROTECTION === 'true',
    useFlashbots: false, // Not available on Core
    privateMempool: false,
    maxPriorityFee: '2000000000', // 2 Gwei
    bundleTimeout: 60000, // 1 minute
    frontRunProtection: true,
    backRunProtection: true
  },
  
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    exponentialBackoff: true
  }
};

export function getConfig(): TradingConfig {
  return config;
}

export function validateConfig(): boolean {
  if (!config.rpcUrl) {
    throw new Error('RPC URL is required');
  }
  
  if (!config.wcoreAddress) {
    throw new Error('WCORE address is required');
  }
  
  // Check if at least one DEX is configured
  const activeDexes = Object.values(config.dexRouters).filter(
    dex => dex.address !== '0x0000000000000000000000000000000000000000'
  );
  
  if (activeDexes.length === 0) {
    throw new Error('At least one DEX must be configured');
  }
  
  return true;
}