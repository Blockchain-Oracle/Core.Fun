import { DexConfig } from '../types';

// Core Mainnet DEX Configurations - Using IcecreamSwap V2 only
export const CORE_MAINNET_DEXES: DexConfig[] = [
  {
    name: 'IcecreamSwap',
    factoryAddress: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f',
    routerAddress: '0xBb5e1777A331ED93E07cF043363e48d320eb96c4',
    initCodeHash: '0x58c1b429d0ffdb4407396ae8118c58fed54898473076d0394163ea2198f7c4a3',
    feePercent: 0.3, // Standard 0.3% for V2
  },
];

// Core Testnet DEX Configurations - Also use IcecreamSwap for consistency
export const CORE_TESTNET_DEXES: DexConfig[] = [
  {
    name: 'IcecreamSwap',
    factoryAddress: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f',
    routerAddress: '0xBb5e1777A331ED93E07cF043363e48d320eb96c4', 
    initCodeHash: '0x58c1b429d0ffdb4407396ae8118c58fed54898473076d0394163ea2198f7c4a3',
    feePercent: 0.3,
  },
];

// Get DEX configurations based on network
export function getDexConfigs(network: 'mainnet' | 'testnet'): DexConfig[] {
  return network === 'mainnet' ? CORE_MAINNET_DEXES : CORE_TESTNET_DEXES;
}

// Get DEX by name
export function getDexByName(name: string, network: 'mainnet' | 'testnet'): DexConfig | undefined {
  const dexes = getDexConfigs(network);
  return dexes.find(dex => dex.name.toLowerCase() === name.toLowerCase());
}

// Get all factory addresses
export function getFactoryAddresses(network: 'mainnet' | 'testnet'): string[] {
  const dexes = getDexConfigs(network);
  return dexes.map(dex => dex.factoryAddress.toLowerCase());
}

// Get all router addresses
export function getRouterAddresses(network: 'mainnet' | 'testnet'): string[] {
  const dexes = getDexConfigs(network);
  return dexes.map(dex => dex.routerAddress.toLowerCase());
}