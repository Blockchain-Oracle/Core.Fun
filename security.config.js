// Security Configuration for Core Meme Platform

module.exports = {
  // Rate Limiting Configuration
  rateLimiting: {
    // Global rate limit
    global: {
      windowMs: 60 * 1000, // 1 minute
      max: 100, // Max requests per window
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    },
    
    // API endpoints specific limits
    endpoints: {
      '/api/auth/login': {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 login attempts per 15 minutes
        skipSuccessfulRequests: true,
      },
      '/api/trade': {
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 trades per minute
      },
      '/api/token/create': {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // 3 token creations per hour
      },
    },
  },
  
  // CORS Configuration
  cors: {
    origin: function (origin, callback) {
      const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3002',
      ];
      
      // Allow requests with no origin (like mobile apps)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400, // 24 hours
  },
  
  // Helmet Configuration
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  },
  
  // Input Validation Rules
  validation: {
    // Address validation
    address: {
      pattern: /^0x[a-fA-F0-9]{40}$/,
      message: 'Invalid Ethereum address format',
    },
    
    // Transaction hash validation
    txHash: {
      pattern: /^0x[a-fA-F0-9]{64}$/,
      message: 'Invalid transaction hash format',
    },
    
    // Token amount validation
    amount: {
      min: '0.000000000000000001', // 1 wei
      max: '1000000000000000000000000', // 1 million tokens
      message: 'Amount must be between 1 wei and 1 million tokens',
    },
    
    // Username validation
    username: {
      pattern: /^[a-zA-Z0-9_]{3,20}$/,
      message: 'Username must be 3-20 characters, alphanumeric and underscore only',
    },
    
    // Password requirements
    password: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      message: 'Password must be at least 8 characters with uppercase, lowercase, numbers, and special characters',
    },
  },
  
  // API Key Configuration
  apiKeys: {
    // Header name for API key
    headerName: 'X-API-Key',
    
    // Rate limits per API key tier
    tiers: {
      basic: {
        rateLimit: 100, // requests per minute
        dailyLimit: 10000,
      },
      premium: {
        rateLimit: 500,
        dailyLimit: 100000,
      },
      enterprise: {
        rateLimit: 2000,
        dailyLimit: 1000000,
      },
    },
  },
  
  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict',
    },
  },
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-jwt-secret',
    expiresIn: '24h',
    algorithm: 'HS256',
    issuer: 'core-meme-platform',
    audience: 'core-meme-users',
  },
  
  // Blockchain Security
  blockchain: {
    // Maximum gas price (in Gwei)
    maxGasPrice: 100,
    
    // Minimum confirmations for deposits
    minConfirmations: 3,
    
    // Contract interaction limits
    maxContractCallsPerMinute: 20,
    
    // Slippage protection
    maxSlippage: 0.05, // 5%
    defaultSlippage: 0.005, // 0.5%
  },
  
  // WebSocket Security
  websocket: {
    // Maximum connections per IP
    maxConnectionsPerIP: 5,
    
    // Message rate limiting
    maxMessagesPerSecond: 10,
    
    // Maximum message size (bytes)
    maxMessageSize: 1024 * 10, // 10KB
    
    // Connection timeout (ms)
    connectionTimeout: 60000, // 1 minute
    
    // Heartbeat interval (ms)
    heartbeatInterval: 30000, // 30 seconds
  },
  
  // File Upload Security
  fileUpload: {
    // Maximum file size (bytes)
    maxFileSize: 5 * 1024 * 1024, // 5MB
    
    // Allowed file types
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ],
    
    // File extension whitelist
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    
    // Scan for malware (requires external service)
    scanForMalware: true,
  },
  
  // Database Security
  database: {
    // Connection pool limits
    connectionLimit: 10,
    
    // Query timeout (ms)
    queryTimeout: 30000, // 30 seconds
    
    // Enable SQL injection protection
    enableSqlInjectionProtection: true,
    
    // Encrypt sensitive data
    encryptSensitiveData: true,
  },
  
  // Monitoring and Alerting
  monitoring: {
    // Enable security event logging
    enableSecurityLogging: true,
    
    // Alert thresholds
    alerts: {
      failedLoginAttempts: 5, // Alert after 5 failed attempts
      suspiciousActivity: true, // Enable suspicious activity detection
      highValueTransactions: '1000', // Alert for transactions > 1000 CORE
    },
    
    // Log retention (days)
    logRetentionDays: 90,
  },
  
  // IP Filtering
  ipFiltering: {
    // Enable IP whitelist/blacklist
    enabled: false,
    
    // Whitelist (if empty, all IPs are allowed except blacklisted)
    whitelist: [],
    
    // Blacklist
    blacklist: [],
    
    // Cloudflare integration
    trustProxy: true,
  },
  
  // Content Security
  content: {
    // Maximum request body size
    maxBodySize: '10mb',
    
    // Enable request sanitization
    sanitizeInput: true,
    
    // XSS protection
    xssProtection: true,
    
    // SQL injection protection
    sqlInjectionProtection: true,
  },
  
  // Encryption Configuration
  encryption: {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'pbkdf2',
    iterations: 100000,
    saltLength: 32,
    tagLength: 16,
  },
  
  // Two-Factor Authentication
  twoFactor: {
    enabled: true,
    issuer: 'Core Meme Platform',
    window: 2, // Accept codes from 2 time windows
    algorithm: 'SHA256',
    digits: 6,
    period: 30, // seconds
  },
};