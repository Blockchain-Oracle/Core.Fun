// Core blockchain configuration
export const NETWORK_CONFIG = {
  mainnet: {
    chainId: 1116,
    name: 'Core Mainnet',
    rpcUrl: 'https://rpc.coredao.org',
    wsUrl: 'wss://ws.coredao.org',
    explorerUrl: 'https://scan.coredao.org',
    apiUrl: 'https://openapi.coredao.org/api',
    nativeCurrency: {
      name: 'Core',
      symbol: 'CORE',
      decimals: 18,
    },
  },
  testnet: {
    chainId: 1115,
    name: 'Core Testnet',
    rpcUrl: 'https://rpc.test.btcs.network',
    wsUrl: 'wss://ws.test.btcs.network',
    explorerUrl: 'https://scan.test.btcs.network',
    apiUrl: 'https://openapi.test.btcs.network/api',
    nativeCurrency: {
      name: 'Test Core',
      symbol: 'tCORE',
      decimals: 18,
    },
  },
};

// DEX configurations
export const DEX_CONFIGS = {
  SHADOWSWAP: {
    name: 'ShadowSwap',
    routerAddress: {
      mainnet: '0xd15CeE1DEaFBad6C0B3Fd7489677Cc102B141464',
      testnet: '0x0000000000000000000000000000000000000000', // TODO: Add testnet
    },
    factoryAddress: {
      mainnet: '0x966a70A4d3719A6De6a94236532A0167d5246c72',
      testnet: '0x0000000000000000000000000000000000000000', // TODO: Add testnet
    },
  },
  LFGSWAP: {
    name: 'LFGSwap',
    routerAddress: {
      mainnet: '0x52Ada6E8d553E5EaCA196c9D975DB7a76627dc61',
      testnet: '0x0000000000000000000000000000000000000000', // TODO: Add testnet
    },
    factoryAddress: {
      mainnet: '0x834aD494a19F73d65F061205C39b60469945338C',
      testnet: '0x0000000000000000000000000000000000000000', // TODO: Add testnet
    },
  },
  ICECREAMSWAP: {
    name: 'IcecreamSwap',
    routerAddress: {
      mainnet: '0xC5B19E6a5e4806A107B01f246232e65E195D9ae8',
      testnet: '0x0000000000000000000000000000000000000000', // TODO: Add testnet
    },
    factoryAddress: {
      mainnet: '0x9A272D734c5a0d7d84E0a892e891a553e8066dce',
      testnet: '0x0000000000000000000000000000000000000000', // TODO: Add testnet
    },
  },
};

// WCORE addresses
export const WCORE_ADDRESS = {
  mainnet: '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f',
  testnet: '0x5c1e6b2A3BA59858e9E5f2Dd5F90ce9E5e0c69A0', // TODO: Verify
};

// Platform configuration
export const PLATFORM_CONFIG = {
  creationFee: '0.1', // CORE
  tradingFee: 0.005, // 0.5%
  minLiquidity: '0.001', // CORE
  bondingCurve: {
    tokenLimit: '500000', // tokens
    targetRaise: '3', // CORE
    basePrice: '0.0001', // CORE per token
    priceIncrement: '0.0001', // CORE
    step: '10000', // tokens
  },
  subscription: {
    free: {
      name: 'Free',
      price: 0,
      features: [
        'Basic trading bot',
        'View token explorer',
        '1 token launch per month',
      ],
    },
    premium: {
      name: 'Premium',
      price: 10, // USD per month
      features: [
        'All token launch alerts',
        'Advanced analytics',
        'Unlimited token launches',
        'Copy trading',
        'API access',
      ],
    },
    pro: {
      name: 'Pro',
      price: 50, // USD per month
      features: [
        'Everything in Premium',
        'Custom alerts',
        'Whale wallet tracking',
        'Private group access',
        'Priority support',
      ],
    },
  },
};

// Token safety thresholds
export const SAFETY_THRESHOLDS = {
  rugScore: {
    safe: 30,
    warning: 60,
    danger: 80,
  },
  liquidity: {
    minimum: 1000, // USD
    recommended: 10000, // USD
  },
  holders: {
    minimum: 10,
    recommended: 50,
  },
  ownership: {
    maxConcentration: 20, // %
    warningConcentration: 50, // %
  },
};