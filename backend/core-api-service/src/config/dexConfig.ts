// Core Blockchain DEX Configuration

export const DEX_CONFIG = {
  // Core mainnet chain ID: 1116
  // Core testnet chain ID: 1115
  
  mainnet: {
    // IceCreamSwap V2 (Confirmed from docs)
    IceCreamSwap: {
      factory: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f',
      router: '0xBb5e1777A331ED93E07cF043363e48d320eb96c4',
      initCodeHash: '0xf52888d456dc5a5a37fd2ffeee852cf88bffe68e0f579c67b093d04db005b857',
    },
    
    // ShadowSwap (Uniswap V2 fork)
    ShadowSwap: {
      factory: '0x7Bbbb6abaD521dE677aBe089C85b29e3b2021496',
      router: '0x5C517Ef8cC0c7131f72Dc38391D7b06fE5382A1e',
      initCodeHash: '0x4f9ab19cf73e7a54c9ec5e0f5e7134cd8ccb1c2e47e8e7f0e0e8e7e8e7e8e7e8', // Placeholder
    },
    
    // CoreX DEX
    CoreX: {
      factory: '0x8663F73Ac70009A7EbB7642ddc4Cc9a5e9Af5667',
      router: '0x5B5390Ad531F088230d6f3D62ceDF434FBCa8847',
      initCodeHash: '0x6f9ab19cf73e7a54c9ec5e0f5e7134cd8ccb1c2e47e8e7f0e0e8e7e8e7e8e7e9', // Placeholder
    },
    
    // Common token addresses
    tokens: {
      WCORE: '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f', // Wrapped CORE
      USDT: '0x900101d06A7426441Ae63e9AB3B9b0F63Be145F1',  // USDT on Core
      USDC: '0xa4151B2B3e269645181dCcF2D426cE75fcbDeca9',  // USDC on Core
      WBTC: '0x4d7E825f80bDf85e913E0DD2A2D54927e9dE1594',  // WBTC on Core
      WETH: '0x5dF2c31D3dd4E2aE1134C53d2d282fE86D1f84dA',  // WETH on Core
      ICE: '0xc0E49f8C615d3d4c245970F6Dc528E4A47d69a44',   // IceCreamSwap token
    },
  },
  
  testnet: {
    // IceCreamSwap V2 on testnet
    IceCreamSwap: {
      factory: '0x9E6d21E759A7A288b80eef94E4737D313D31c13f', // Same as mainnet
      router: '0xBb5e1777A331ED93E07cF043363e48d320eb96c4',
      initCodeHash: '0xf52888d456dc5a5a37fd2ffeee852cf88bffe68e0f579c67b093d04db005b857',
    },
    
    // Test tokens on Core testnet
    tokens: {
      WCORE: '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f',
      USDT: '0x900101d06A7426441Ae63e9AB3B9b0F63Be145F1',
      USDC: '0xa4151B2B3e269645181dCcF2D426cE75fcbDeca9',
    },
  },
  
  // Common ABI fragments for Uniswap V2 style DEXes
  abis: {
    factory: [
      'function getPair(address tokenA, address tokenB) view returns (address pair)',
      'function allPairs(uint256) view returns (address)',
      'function allPairsLength() view returns (uint256)',
      'function createPair(address tokenA, address tokenB) returns (address pair)',
    ],
    
    router: [
      'function factory() view returns (address)',
      'function WETH() view returns (address)',
      'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
      'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)',
      'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
      'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
      'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
      'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
      'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
      'function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[] amounts)',
    ],
    
    pair: [
      'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
      'function token0() view returns (address)',
      'function token1() view returns (address)',
      'function totalSupply() view returns (uint256)',
      'function balanceOf(address owner) view returns (uint256)',
      'function kLast() view returns (uint256)',
      'function sync()',
      'function skim(address to)',
      'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
      'event Sync(uint112 reserve0, uint112 reserve1)',
    ],
    
    erc20: [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function totalSupply() view returns (uint256)',
      'function balanceOf(address owner) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
    ],
  },
  
  // Price calculation helpers
  priceCalculation: {
    // Standard slippage tolerances
    defaultSlippage: 0.005, // 0.5%
    maxSlippage: 0.05,      // 5%
    
    // Liquidity thresholds
    minLiquidityUSD: 1000,  // Minimum $1000 liquidity to consider valid
    
    // Volume estimation multipliers (volume as % of liquidity)
    volumeMultipliers: {
      IceCreamSwap: 0.1,    // 10% daily volume
      ShadowSwap: 0.15,     // 15% daily volume
      CoreX: 0.12,          // 12% daily volume
    },
  },
};

// Helper function to get DEX config for network
export function getDexConfig(network: 'mainnet' | 'testnet') {
  return DEX_CONFIG[network];
}

// Helper function to get all DEX names
export function getAllDexNames(): string[] {
  return ['IceCreamSwap', 'ShadowSwap', 'CoreX'];
}

// Helper function to validate token address
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}