# Core Meme Platform - Smart Contracts

## 📋 Overview

This folder contains all smart contracts for the Core Meme Platform, a decentralized meme token launcher with bonding curve mechanics, staking system, and anti-rug features.

## 🏗️ Architecture

### Core Contracts

1. **MemeFactory.sol**
   - Factory contract for creating meme tokens
   - Implements bonding curve for fair launch
   - Platform fee collection (0.1 CORE creation fee, 0.5% trading fee)
   - Token launch mechanism to DEX

2. **MemeToken.sol**
   - ERC20 token with anti-rug features
   - Trading controls (max wallet, max transaction)
   - Anti-snipe protection
   - Metadata management
   - Blacklist/whitelist functionality

3. **Staking.sol**
   - Platform token staking for rewards
   - Tier system with fee discounts
   - Revenue sharing mechanism
   - Emergency withdrawal support

### Libraries

1. **BondingCurve.sol**
   - Price calculation for token buys/sells
   - Slippage protection
   - Market cap calculations

2. **SafetyChecks.sol**
   - Honeypot detection
   - Rug score calculation
   - Token parameter validation

## 🚀 Getting Started

### Prerequisites

- Node.js v18+ (v20 recommended)
- pnpm package manager

### Installation

```bash
# Install dependencies
pnpm install

# Compile contracts
pnpm compile
```

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
npx hardhat test test/MemeFactory.test.ts
```

### Deployment

#### Local Deployment

```bash
# Start local node
npx hardhat node

# In another terminal, deploy
pnpm deploy:local
```

#### Testnet Deployment

1. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your private key and API keys
```

2. Get testnet CORE from faucet:
   - Visit: https://faucet.test.btcs.network

3. Deploy:
```bash
pnpm deploy:testnet
```

4. Verify contracts:
```bash
pnpm verify:testnet
```

## 📊 Contract Addresses

### Local (Hardhat Node)
- Platform Token: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Staking: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`
- MemeFactory: `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`

### Core Testnet (Chain ID: 1115)
- Platform Token: `[Pending deployment]`
- Staking: `[Pending deployment]`
- MemeFactory: `[Pending deployment]`

### Core Mainnet (Chain ID: 1116)
- Platform Token: `[Not deployed]`
- Staking: `[Not deployed]`
- MemeFactory: `[Not deployed]`

## 🔧 Configuration

### Network Configuration

- **Core Testnet**: https://rpc.test.btcs.network (Chain ID: 1115)
- **Core Mainnet**: https://rpc.coredao.org (Chain ID: 1116)

### Gas Settings

- Gas Price: 35 Gwei (35000000000)
- Optimizer: Enabled (200 runs)

## 📚 Contract Interactions

### Creating a Token

```javascript
// Creation fee: 0.1 CORE
await factory.createToken(
  "Token Name",
  "SYMBOL",
  "Description",
  "image_url",
  "@twitter",
  "t.me/telegram",
  "https://website.com",
  { value: ethers.parseEther("0.1") }
);
```

### Buying Tokens (Bonding Curve)

```javascript
// Buy tokens with 1 CORE
await factory.buyToken(
  tokenAddress,
  minTokensExpected,
  { value: ethers.parseEther("1") }
);
```

### Staking Platform Tokens

```javascript
// Approve and stake
await platformToken.approve(stakingAddress, amount);
await staking.stake(amount);

// Claim rewards
await staking.claimRewards();

// Check tier and discount
const tier = await staking.getUserTier(userAddress);
const discount = await staking.getUserFeeDiscount(userAddress);
```

## 🔒 Security Features

1. **Anti-Rug Mechanisms**
   - Max wallet limits (2% default)
   - Max transaction limits (2% default)
   - Anti-snipe protection (3 blocks)
   - Ownership renouncement tracking

2. **Platform Security**
   - ReentrancyGuard on all critical functions
   - SafeERC20 for token transfers
   - Input validation and parameter checks
   - Emergency withdrawal functions

3. **Bonding Curve Protection**
   - Slippage protection on buys/sells
   - Price impact calculations
   - Fair launch mechanism

## 📈 Platform Economics

- **Creation Fee**: 0.1 CORE per token
- **Trading Fee**: 0.5% on all trades
- **Staking Rewards**: 0.01 tokens/second base rate
- **Revenue Sharing**: 50% of platform fees to stakers

## 🧪 Test Coverage

Current test coverage: **>90%**
- 65 tests passing
- All critical paths covered
- Edge cases tested

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

## ⚠️ Disclaimer

These contracts are pending audit. Use at your own risk. Always DYOR (Do Your Own Research) before interacting with any smart contracts.