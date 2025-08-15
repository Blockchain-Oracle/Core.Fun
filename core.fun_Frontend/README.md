# Core.Fun Frontend

**A Next.js-powered meme token launchpad and trading platform built on Core blockchain**

[![Core Blockchain](https://img.shields.io/badge/Built%20on-Core%20Blockchain-orange?style=for-the-badge)](https://coredao.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.2.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

## 🚀 Overview

Core.Fun is a comprehensive meme token launchpad and trading platform that allows users to create, launch, and trade meme tokens on the Core blockchain. The platform features an intuitive web interface with advanced trading tools, staking rewards, and copy trading functionality.

## ✨ Features

### 🎯 Token Management
- **Token Creation**: Launch custom meme tokens with bonding curve mechanics
- **Token Explorer**: Discover and analyze new and trending tokens
- **Token Trading**: Advanced trading interface with real-time charts
- **Portfolio Tracking**: Monitor your holdings and trading performance

### 💰 Trading & Investment
- **Spot Trading**: Buy and sell tokens with customizable slippage
- **Copy Trading**: Follow successful traders automatically (requires staking)
- **Sniping Tools**: Auto-buy tokens on launch
- **Advanced Charts**: Real-time price data and technical analysis

### 🏆 Staking & Rewards
- **Tier-Based Staking**: Bronze, Silver, Gold, and Platinum tiers
- **APY Rewards**: Earn passive income on staked tokens
- **Fee Discounts**: Reduced trading fees based on tier
- **Copy Trading Slots**: More slots for higher tiers (1-10 slots)

### 🔐 Wallet Integration
- **Multi-Wallet Support**: Connect various wallet providers
- **Secure Storage**: Private key management and export
- **Transaction History**: Complete trading and staking history
- **Balance Tracking**: Real-time balance updates

## 🛠️ Tech Stack

- **Framework**: Next.js 15.2.4 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Radix UI components
- **State Management**: Zustand
- **Blockchain**: Ethers.js for Core blockchain interaction
- **Charts**: Recharts for data visualization
- **Animations**: Framer Motion
- **Real-time**: Socket.IO for live updates

## 🏗️ Project Structure

```
core.fun_Frontend/
├── app/                    # Next.js App Router
│   ├── (dashboard)/       # Dashboard pages
│   │   ├── analytics/     # Analytics dashboard
│   │   ├── create-token/  # Token creation
│   │   ├── explore/       # Token explorer
│   │   ├── portfolio/     # User portfolio
│   │   ├── staking/       # Staking dashboard
│   │   └── wallet/        # Wallet management
│   ├── auth/              # Authentication
│   └── login/             # Login page
├── components/            # Reusable UI components
│   ├── analytics/         # Analytics components
│   ├── auth/              # Authentication components
│   ├── explore/           # Token explorer components
│   ├── layout/            # Layout components
│   ├── staking/           # Staking components
│   ├── trading/           # Trading components
│   ├── wallet/            # Wallet components
│   └── ui/                # Base UI components
├── lib/                   # Utilities and services
│   ├── stores/            # Zustand state stores
│   ├── api-client.ts      # API communication
│   ├── meme-factory.ts    # Smart contract interactions
│   └── utils.ts           # Helper functions
└── hooks/                 # Custom React hooks
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Core blockchain wallet (e.g., MetaMask configured for Core)
- Environment variables configured

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd core.fun_Frontend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure the following variables:
   ```env
   NEXT_PUBLIC_CORE_CHAIN_ID=1114
   NEXT_PUBLIC_CORE_RPC_URL=https://1114.rpc.thirdweb.com
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
   NEXT_PUBLIC_WS_URL=http://localhost:8081
   ```

4. **Run the development server**
   ```bash
   pnpm dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔧 Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

## 🌐 Core Blockchain Integration

The platform is built specifically for the Core blockchain:

- **Chain ID**: 1114 (Core Testnet)
- **RPC URL**: https://1114.rpc.thirdweb.com
- **Native Token**: CORE
- **Smart Contracts**: MemeFactory for token creation and trading

## 📱 Features Deep Dive

### Token Creation
- Custom token metadata (name, symbol, description, image)
- Bonding curve mechanics for fair launch
- Anti-snipe protection
- Liquidity bootstrapping

### Staking System
- **Bronze Tier**: 1,000 CMP minimum, 5% APY, 1 copy slot
- **Silver Tier**: 10,000 CMP minimum, 8% APY, 3 copy slots
- **Gold Tier**: 50,000 CMP minimum, 12% APY, 5 copy slots
- **Platinum Tier**: 100,000 CMP minimum, 15% APY, 10 copy slots

### Copy Trading
- Follow successful traders automatically
- Tier-based slot allocation
- Real-time trade execution
- Performance analytics and leaderboards

## 🔐 Security

- Private key encryption and secure storage
- Transaction signing through connected wallets
- Input validation and sanitization
- Rate limiting and abuse prevention

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Open an issue on GitHub
- Join our Telegram community
- Check the [documentation](docs/)

## 🔗 Links

- [Core Blockchain](https://coredao.org/)
- [Live Platform](https://core.fun)
- [API Documentation](docs/api.md)
- [Telegram Bot](https://t.me/corefunbot)

---

**Built with ❤️ for the Core blockchain ecosystem**