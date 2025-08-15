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
    chainId: 1114,
    name: 'Core Testnet',
    rpcUrl: 'https://rpc.test2.btcs.network',
    wsUrl: 'wss://ws.test2.btcs.network',
    explorerUrl: 'https://scan.test.btcs.network',
    apiUrl: 'https://openapi.test.btcs.network/api',
    nativeCurrency: {
      name: 'Test Core',
      symbol: 'tCORE',
      decimals: 18,
    },
  },
};

// WCORE addresses (for future DEX integrations after launch)
export const WCORE_ADDRESS = {
  mainnet: '0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f',
  testnet: '0x5c872990530Fe4f7322cA0c302762788e8199Ed0', // Updated from trading config
};

// Platform contract addresses
export const CONTRACT_ADDRESSES = {
  memeFactory: {
    mainnet: '', // To be deployed
    testnet: '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  },
  platformToken: {
    mainnet: '', // To be deployed
    testnet: '0x26EfC13dF039c6B4E084CEf627a47c348197b655',
  },
  staking: {
    mainnet: '', // To be deployed
    testnet: '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
  },
  treasury: {
    mainnet: '', // To be deployed
    testnet: '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a',
  },
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