# Trading Engine

Production-ready unified trading engine for Core Meme Platform that seamlessly handles both bonding curve and DEX trading.

## Features

- **Unified Trading Router**: Intelligent routing between bonding curve and DEX
- **Bonding Curve Trading**: Direct integration with MemeFactory contract
- **DEX Integration**: IcecreamSwap V2 integration with optimized routing
- **MEV Protection**: Built-in protection against sandwich attacks and frontrunning
- **Price Impact Calculation**: Real-time price impact and slippage protection
- **Gas Optimization**: Intelligent gas price estimation and optimization
- **Multi-hop Routing**: Find best routes through multiple pools
- **Event-driven Architecture**: Real-time trade status updates

## Installation

```bash
pnpm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure environment variables:
```env
# Network Configuration
NETWORK=testnet  # or mainnet
CORE_TESTNET_RPC=https://rpc.test2.btcs.network
CORE_MAINNET_RPC=https://rpc.coredao.org

# Contract Addresses
MEME_FACTORY_ADDRESS=0x04242CfFdEC8F96A46857d4A50458F57eC662cE1

# IcecreamSwap V2 Configuration
ICECREAM_ROUTER=0xBb5e1777A331ED93E07cF043363e48d320eb96c4
ICECREAM_FACTORY=0x9E6d21E759A7A288b80eef94E4737D313D31c13f
INIT_CODE_HASH=0x58c1b429d0ffdb4407396ae8118c58fed54898473076d0394163ea2198f7c4a3

# WCORE Addresses
WCORE_MAINNET=0x40375C92d9FAf44d2f9db9Bd9ba41a3317a2404f
WCORE_TESTNET=0x5c872990530Fe4f7322cA0c302762788e8199Ed0

# Trading Configuration
MAX_SLIPPAGE=10  # 10% max slippage
DEFAULT_DEADLINE=1200  # 20 minutes
MAX_GAS_PRICE=100000000000  # 100 Gwei max

# MEV Protection
MEV_PROTECTION=true
MAX_PRIORITY_FEE=2000000000  # 2 Gwei
FRONT_RUN_PROTECTION=true
BACK_RUN_PROTECTION=true

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/corememe
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```
NETWORK=testnet
MEME_FACTORY_ADDRESS=0x... # From contract deployment
```

## Usage

### As a Library

```typescript
import { ethers } from 'ethers';
import { UnifiedTradingRouter, TradeParams, TradeType } from '@core-meme-platform/trading-engine';

// Initialize provider
const provider = new ethers.JsonRpcProvider('https://rpc.test2.btcs.network');
const signer = new ethers.Wallet(privateKey, provider);

// Create router
const router = new UnifiedTradingRouter(provider, config);

// Execute a trade
const params: TradeParams = {
  tokenAddress: '0x...',
  type: TradeType.BUY,
  amount: ethers.parseEther('1').toString(),
  slippageTolerance: 2, // 2%
  minAmountOut: '1000000000000000000'
};

const result = await router.executeTrade(params, signer);
console.log('Trade result:', result);
```

### Get Quote

```typescript
// Get best route and quote
const quote = await router.getQuote({
  tokenAddress: '0x...',
  type: TradeType.BUY,
  amount: ethers.parseEther('1').toString(),
  slippageTolerance: 2
});

console.log('Best route:', quote.type);
console.log('Expected output:', quote.amountOut);
console.log('Price impact:', quote.priceImpact);
```

### Token Analysis

```typescript
const tokenState = await router.getTokenState('0x...');
console.log('Token phase:', tokenState.phase);
console.log('Current price:', tokenState.currentPrice);
console.log('Liquidity:', tokenState.liquidity);
```

## Trading Phases

### Bonding Curve Phase
- Tokens are sold through MemeFactory contract
- Linear price increase based on supply sold
- No selling allowed until launch
- Automatic DEX launch at target

### DEX Phase
- Trading on AMM pools (IcecreamSwap, ShadowSwap)
- Full buy/sell functionality
- Multi-hop routing for best prices
- MEV protection enabled

## Architecture

```
UnifiedTradingRouter
├── BondingCurveTrader    # Handles MemeFactory trades
├── DexTrader              # Handles AMM pool trades
├── TokenAnalyzer          # Analyzes token state and phase
├── PriceCalculator        # Calculates prices and impacts
└── MEVProtection          # Protects against MEV attacks
```

## Events

The router emits the following events:

- `trade:initiated` - Trade request received
- `trade:routed` - Best route selected
- `trade:submitted` - Transaction submitted
- `trade:confirmed` - Trade completed successfully
- `trade:failed` - Trade failed
- `mev:detected` - MEV threat detected
- `slippage:warning` - Actual slippage exceeded tolerance

## Running

### Development
```bash
pnpm dev
```

### Production
```bash
pnpm build
pnpm start
```

### Testing
```bash
pnpm test
```

## Error Handling

The engine includes comprehensive error handling:

- `INSUFFICIENT_BALANCE` - Not enough tokens/CORE
- `INSUFFICIENT_LIQUIDITY` - Pool liquidity too low
- `EXCESSIVE_SLIPPAGE` - Slippage exceeds tolerance
- `PRICE_IMPACT_TOO_HIGH` - Trade would move price too much
- `TOKEN_NOT_TRADEABLE` - Token not open for trading
- `ROUTE_NOT_FOUND` - No valid route available

## Security

- MEV protection enabled by default
- Slippage protection on all trades
- Gas price limits to prevent overpaying
- Deadline enforcement on trades
- Private mempool support (when available)

## Performance

- Sub-100ms route calculation
- Caching for token states (10s TTL)
- Parallel DEX quote fetching
- Optimized gas estimation
- Event-driven architecture for real-time updates