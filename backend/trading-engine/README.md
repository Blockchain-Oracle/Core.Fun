# Trading Engine

Production-ready unified trading engine for Core Meme Platform that seamlessly handles both bonding curve and DEX trading.

## Features

- **Unified Trading Router**: Intelligent routing between bonding curve and DEX
- **Bonding Curve Trading**: Direct integration with MemeFactory contract
- **Multi-DEX Support**: Trade across IcecreamSwap, ShadowSwap, and more
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