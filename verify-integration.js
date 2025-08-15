#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔗 Core Meme Platform - Service Integration Verification\n');
console.log('=' .repeat(60));

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let issues = [];
let successes = [];

// 1. Check service configurations
console.log('\n📋 Service Configuration Check:');

const services = [
  {
    name: 'Blockchain Monitor',
    path: './backend/blockchain-monitor',
    config: {
      rpc: 'CORE_RPC_URL',
      factory: '0x0eeF9597a9B231b398c29717e2ee89eF6962b784'
    }
  },
  {
    name: 'Backend API',
    path: './backend/api',
    config: {
      port: 3001,
      redis: 'REDIS_URL',
      postgres: 'DATABASE_URL',
      factory: '0x0eeF9597a9B231b398c29717e2ee89eF6962b784'
    }
  },
  {
    name: 'WebSocket Server',
    path: './backend/websocket',
    config: {
      port: 8081,
      redis: 'REDIS_URL'
    }
  },
  {
    name: 'Telegram Bot',
    path: './telegram-bot',
    config: {
      bot_token: 'TELEGRAM_BOT_TOKEN',
      api_url: 'API_URL'
    }
  }
];

services.forEach(service => {
  console.log(`\n${colors.cyan}${service.name}:${colors.reset}`);
  
  if (fs.existsSync(service.path)) {
    console.log(`  ✅ Directory exists: ${service.path}`);
    successes.push(`${service.name} directory exists`);
    
    // Check for package.json
    const packagePath = path.join(service.path, 'package.json');
    if (fs.existsSync(packagePath)) {
      console.log(`  ✅ package.json found`);
    } else {
      console.log(`  ❌ package.json missing`);
      issues.push(`${service.name}: package.json missing`);
    }
    
    // Check for node_modules
    const modulesPath = path.join(service.path, 'node_modules');
    if (fs.existsSync(modulesPath)) {
      console.log(`  ✅ Dependencies installed`);
    } else {
      console.log(`  ⚠️  Dependencies not installed (run pnpm install)`);
    }
  } else {
    console.log(`  ❌ Directory missing: ${service.path}`);
    issues.push(`${service.name} directory missing`);
  }
});

// 2. Check Docker setup
console.log('\n\n🐳 Docker Configuration:');

if (fs.existsSync('./docker-compose.yml')) {
  console.log('  ✅ docker-compose.yml exists');
  
  const dockerCompose = fs.readFileSync('./docker-compose.yml', 'utf-8');
  
  // Check for required services
  const requiredServices = ['postgres', 'redis', 'api', 'blockchain-monitor', 'websocket', 'telegram-bot'];
  requiredServices.forEach(service => {
    if (dockerCompose.includes(`${service}:`)) {
      console.log(`  ✅ Service defined: ${service}`);
    } else {
      console.log(`  ⚠️  Service not defined: ${service}`);
    }
  });
} else {
  console.log('  ❌ docker-compose.yml missing');
  issues.push('docker-compose.yml missing');
}

// 3. Check environment setup
console.log('\n\n🔐 Environment Configuration:');

if (fs.existsSync('./.env')) {
  console.log('  ✅ .env file exists');
  
  const env = fs.readFileSync('./.env', 'utf-8');
  const requiredVars = [
    'CORE_RPC_URL',
    'MEME_FACTORY_ADDRESS',
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET'
  ];
  
  requiredVars.forEach(varName => {
    if (env.includes(`${varName}=`)) {
      console.log(`  ✅ ${varName} configured`);
    } else {
      console.log(`  ❌ ${varName} missing`);
      issues.push(`Environment variable ${varName} not configured`);
    }
  });
} else {
  console.log('  ⚠️  .env file missing (copy from .env.example)`);
}

// 4. Check smart contract addresses
console.log('\n\n📜 Smart Contract Configuration:');

const contractAddresses = {
  'MemeFactory': '0x0eeF9597a9B231b398c29717e2ee89eF6962b784',
  'Platform Token': '0x26EfC13dF039c6B4E084CEf627a47c348197b655',
  'Staking': '0x3e3EeE193b0F4eae15b32B1Ee222B6B8dFC17ECa',
  'Treasury': '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a'
};

Object.entries(contractAddresses).forEach(([name, address]) => {
  console.log(`  ${name}: ${colors.cyan}${address}${colors.reset}`);
});

// 5. Check service connections
console.log('\n\n🔗 Service Connection Ports:');

const ports = {
  'Backend API': 3001,
  'WebSocket': 8081,
  'Blockchain Monitor': 3003,
  'Telegram Bot': 3004,
  'PostgreSQL': 5432,
  'Redis': 6379
};

Object.entries(ports).forEach(([service, port]) => {
  console.log(`  ${service}: Port ${colors.yellow}${port}${colors.reset}`);
});

// 6. Summary
console.log('\n\n' + '='.repeat(60));
console.log('📊 VERIFICATION SUMMARY\n');

if (issues.length === 0) {
  console.log(`${colors.green}✅ All checks passed! Your integration setup looks good.${colors.reset}`);
  console.log('\nNext steps:');
  console.log('1. Run: docker-compose up -d redis postgres');
  console.log('2. Run: pnpm install (in each service directory)');
  console.log('3. Run: pnpm dev:all (to start all services)');
} else {
  console.log(`${colors.red}❌ Found ${issues.length} issue(s) that need attention:${colors.reset}\n`);
  issues.forEach((issue, i) => {
    console.log(`  ${i + 1}. ${issue}`);
  });
  
  console.log('\nRecommended fixes:');
  if (issues.some(i => i.includes('directory missing'))) {
    console.log('  - Check that all service directories exist');
  }
  if (issues.some(i => i.includes('Environment variable'))) {
    console.log('  - Copy .env.example to .env and configure variables');
  }
  if (issues.some(i => i.includes('package.json'))) {
    console.log('  - Run pnpm install in the root directory');
  }
}

console.log('\n' + '='.repeat(60));