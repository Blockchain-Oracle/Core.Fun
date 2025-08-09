/**
 * Configuration for our MemeFactory and related contracts
 * Addresses are loaded from environment variables with placeholders as defaults
 */

export interface ContractConfig {
  name: string;
  address: string;
  deployBlock?: number; // Block number when contract was deployed (for historical sync)
  isActive: boolean; // Whether to monitor this contract
}

export interface PlatformContracts {
  memeFactory?: ContractConfig;
  staking?: ContractConfig;
  treasury?: ContractConfig;
}

// Load addresses from environment with validation
function getContractAddress(envKey: string, defaultValue: string = '0x0000000000000000000000000000000000000000'): string {
  const address = process.env[envKey] || defaultValue;
  // Check if it's a valid address format (not the zero address placeholder)
  const isValidAddress = address !== defaultValue && 
                        address.startsWith('0x') && 
                        address.length === 42;
  return isValidAddress ? address.toLowerCase() : defaultValue;
}

// Check if address is a placeholder
function isPlaceholderAddress(address: string): boolean {
  return address === '0x0000000000000000000000000000000000000000' || 
         address === '0x';
}

// Core Mainnet Platform Contracts
export const CORE_MAINNET_CONTRACTS: PlatformContracts = {
  memeFactory: {
    name: 'MemeFactory',
    address: getContractAddress('MEME_FACTORY_MAINNET'),
    deployBlock: parseInt(process.env.MEME_FACTORY_MAINNET_BLOCK || '0'),
    isActive: !isPlaceholderAddress(getContractAddress('MEME_FACTORY_MAINNET')),
  },
  staking: {
    name: 'Staking',
    address: getContractAddress('STAKING_CONTRACT_MAINNET'),
    deployBlock: parseInt(process.env.STAKING_CONTRACT_MAINNET_BLOCK || '0'),
    isActive: !isPlaceholderAddress(getContractAddress('STAKING_CONTRACT_MAINNET')),
  },
  treasury: {
    name: 'Treasury',
    address: getContractAddress('TREASURY_CONTRACT_MAINNET'),
    deployBlock: parseInt(process.env.TREASURY_CONTRACT_MAINNET_BLOCK || '0'),
    isActive: !isPlaceholderAddress(getContractAddress('TREASURY_CONTRACT_MAINNET')),
  },
};

// Core Testnet Platform Contracts
export const CORE_TESTNET_CONTRACTS: PlatformContracts = {
  memeFactory: {
    name: 'MemeFactory',
    address: getContractAddress('MEME_FACTORY_TESTNET'),
    deployBlock: parseInt(process.env.MEME_FACTORY_TESTNET_BLOCK || '0'),
    isActive: !isPlaceholderAddress(getContractAddress('MEME_FACTORY_TESTNET')),
  },
  staking: {
    name: 'Staking',
    address: getContractAddress('STAKING_CONTRACT_TESTNET'),
    deployBlock: parseInt(process.env.STAKING_CONTRACT_TESTNET_BLOCK || '0'),
    isActive: !isPlaceholderAddress(getContractAddress('STAKING_CONTRACT_TESTNET')),
  },
  treasury: {
    name: 'Treasury',
    address: getContractAddress('TREASURY_CONTRACT_TESTNET'),
    deployBlock: parseInt(process.env.TREASURY_CONTRACT_TESTNET_BLOCK || '0'),
    isActive: !isPlaceholderAddress(getContractAddress('TREASURY_CONTRACT_TESTNET')),
  },
};

// Get platform contracts based on network
export function getPlatformContracts(network: 'mainnet' | 'testnet'): PlatformContracts {
  return network === 'mainnet' ? CORE_MAINNET_CONTRACTS : CORE_TESTNET_CONTRACTS;
}

// Get active contracts only
export function getActiveContracts(network: 'mainnet' | 'testnet'): ContractConfig[] {
  const contracts = getPlatformContracts(network);
  const active: ContractConfig[] = [];
  
  if (contracts.memeFactory?.isActive) {
    active.push(contracts.memeFactory);
  }
  if (contracts.staking?.isActive) {
    active.push(contracts.staking);
  }
  if (contracts.treasury?.isActive) {
    active.push(contracts.treasury);
  }
  
  return active;
}

// Check if MemeFactory is configured
export function isMemeFactoryConfigured(network: 'mainnet' | 'testnet'): boolean {
  const contracts = getPlatformContracts(network);
  return contracts.memeFactory?.isActive || false;
}

// Get MemeFactory address
export function getMemeFactoryAddress(network: 'mainnet' | 'testnet'): string | null {
  const contracts = getPlatformContracts(network);
  if (contracts.memeFactory?.isActive) {
    return contracts.memeFactory.address;
  }
  return null;
}

// Log configuration status
export function logContractConfiguration(network: 'mainnet' | 'testnet'): void {
  const contracts = getPlatformContracts(network);
  
  console.log(`\n📋 Platform Contracts Configuration (${network.toUpperCase()}):`);
  console.log('================================================');
  
  if (contracts.memeFactory) {
    console.log(`MemeFactory: ${contracts.memeFactory.isActive ? '✅' : '❌'} ${
      contracts.memeFactory.isActive ? contracts.memeFactory.address : 'Not configured'
    }`);
  }
  
  if (contracts.staking) {
    console.log(`Staking:     ${contracts.staking.isActive ? '✅' : '❌'} ${
      contracts.staking.isActive ? contracts.staking.address : 'Not configured'
    }`);
  }
  
  if (contracts.treasury) {
    console.log(`Treasury:    ${contracts.treasury.isActive ? '✅' : '❌'} ${
      contracts.treasury.isActive ? contracts.treasury.address : 'Not configured'
    }`);
  }
  
  const activeCount = getActiveContracts(network).length;
  if (activeCount === 0) {
    console.log('\n⚠️  No platform contracts configured. Monitoring will proceed with DEX activity only.');
    console.log('   To monitor MemeFactory, set MEME_FACTORY_MAINNET or MEME_FACTORY_TESTNET in .env\n');
  } else {
    console.log(`\n✅ ${activeCount} platform contract(s) configured for monitoring\n`);
  }
}