import { CoreAPIService } from '../CoreAPIService';
import axios from 'axios';
import { createClient } from 'redis';

// Mock dependencies
jest.mock('axios');
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    get: jest.fn(),
    setEx: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  })),
}));

describe('CoreAPIService', () => {
  let service: CoreAPIService;
  let mockAxiosCreate: jest.Mock;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup axios mock
    mockAxiosCreate = jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
      },
    }));
    (axios.create as jest.Mock) = mockAxiosCreate;
    
    // Create service instance
    service = new CoreAPIService({
      network: 'testnet',
      cacheEnabled: false, // Disable cache for tests
    });
  });
  
  afterEach(async () => {
    await service.close();
  });
  
  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('test.btcs.network'),
          timeout: 10000,
        })
      );
    });
    
    it('should use mainnet URL when specified', () => {
      new CoreAPIService({ network: 'mainnet', cacheEnabled: false });
      
      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('coredao.org'),
        })
      );
    });
  });
  
  describe('getTokenInfo', () => {
    it('should fetch token information', async () => {
      const mockTokenData = {
        address: '0x123',
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        totalSupply: '1000000',
      };
      
      const axiosInstance = mockAxiosCreate.mock.results[0].value;
      axiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          status: '1',
          result: mockTokenData,
        },
      });
      
      const result = await service.getTokenInfo('0x123');
      
      expect(axiosInstance.get).toHaveBeenCalledWith('/api', {
        params: {
          module: 'token',
          action: 'getToken',
          contractaddress: '0x123',
        },
      });
      
      expect(result).toEqual(mockTokenData);
    });
    
    it('should return null when token not found', async () => {
      const axiosInstance = mockAxiosCreate.mock.results[0].value;
      axiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          status: '0',
          result: null,
        },
      });
      
      const result = await service.getTokenInfo('0x456');
      
      expect(result).toBeNull();
    });
  });
  
  describe('getTokenHolders', () => {
    it('should fetch token holders', async () => {
      const mockHolders = [
        { address: '0xabc', balance: '1000', percentage: 10 },
        { address: '0xdef', balance: '500', percentage: 5 },
      ];
      
      const axiosInstance = mockAxiosCreate.mock.results[0].value;
      axiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          status: '1',
          result: mockHolders,
        },
      });
      
      const result = await service.getTokenHolders('0x123', 1, 10);
      
      expect(axiosInstance.get).toHaveBeenCalledWith('/api', {
        params: {
          module: 'token',
          action: 'getTokenHolders',
          contractaddress: '0x123',
          page: 1,
          offset: 10,
        },
      });
      
      expect(result).toEqual(mockHolders);
    });
  });
  
  describe('getTokenTransactions', () => {
    it('should fetch token transactions', async () => {
      const mockTransactions = [
        {
          hash: '0xabc',
          from: '0x111',
          to: '0x222',
          value: '1000',
          blockNumber: 12345,
          timestamp: 1234567890,
          status: 1,
        },
      ];
      
      const axiosInstance = mockAxiosCreate.mock.results[0].value;
      axiosInstance.get = jest.fn().mockResolvedValue({
        data: {
          status: '1',
          result: mockTransactions,
        },
      });
      
      const result = await service.getTokenTransactions('0x123');
      
      expect(axiosInstance.get).toHaveBeenCalledWith('/api', {
        params: {
          module: 'account',
          action: 'tokentx',
          contractaddress: '0x123',
          startblock: 0,
          endblock: 99999999,
          page: 1,
          offset: 100,
          sort: 'desc',
        },
      });
      
      expect(result).toEqual(mockTransactions);
    });
  });
  
  describe('caching', () => {
    it('should use cache when enabled', async () => {
      const mockRedisClient = {
        connect: jest.fn(),
        get: jest.fn().mockResolvedValue(JSON.stringify({ cached: true })),
        setEx: jest.fn(),
        quit: jest.fn(),
        on: jest.fn(),
      };
      
      (createClient as jest.Mock).mockReturnValue(mockRedisClient);
      
      const cachedService = new CoreAPIService({
        network: 'testnet',
        cacheEnabled: true,
      });
      
      // Wait for Redis to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const axiosInstance = mockAxiosCreate.mock.results[1].value;
      axiosInstance.get = jest.fn();
      
      const result = await cachedService.getTokenInfo('0x123');
      
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        expect.stringContaining('token:info:testnet:0x123')
      );
      expect(result).toEqual({ cached: true });
      expect(axiosInstance.get).not.toHaveBeenCalled();
      
      await cachedService.close();
    });
  });
});