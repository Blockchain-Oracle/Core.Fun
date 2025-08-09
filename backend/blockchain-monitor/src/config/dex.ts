import { DexConfig } from '../types';

// Core Mainnet DEX Configurations
export const CORE_MAINNET_DEXES: DexConfig[] = [
  {
    name: 'IcecreamSwap_V2',
    factoryAddress: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f',
    routerAddress: '0xBb5e1777A331ED93E07cF043363e48d320eb96c4',
    initCodeHash: '0x58c1b429d0ffdb4407396ae8118c58fed54898473076d0394163ea2198f7c4a3',
    feePercent: 0.3, // Standard 0.3% for V2
  },
  {
    name: 'IcecreamSwap_V3',
    factoryAddress: '0xa8a3AAD4f592b7f30d6514ee9A863A4cEFF6531D',
    routerAddress: '0xb440626C02be5F62d6D7818486E5ae58a454d26e',
    initCodeHash: '0x0c6b99bf88dc3398a8573e3192de0eb19c858afd9ac36e33030e16c4f569e598',
    feePercent: 0.3, // V3 has multiple fee tiers, this is default
  },
];

// Core Testnet DEX Configurations
export const CORE_TESTNET_DEXES: DexConfig[] = [
  {
    name: 'ShadowSwap',
    factoryAddress: '0xcBc37C5055aC1e10426BC9CE61075bC4915743B1',
    routerAddress: '0x87f40ffec16F18053B494a1C417Fb1d1ce180BC3',
    initCodeHash: '0x0000000000000000000000000000000000000000000000000000000000000000', // Need to verify
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