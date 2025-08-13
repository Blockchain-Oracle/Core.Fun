import { useState, useEffect, useCallback } from 'react';
import { getTradingService } from '../services/TradingService';
import axios from 'axios';

interface User {
  id: string;
  telegramId: number;
  username?: string;
  walletAddress: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null
  });

  const tradingService = getTradingService();
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  // Initialize auth from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('authUser');
    
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user,
          token: storedToken
        });
        
        // Set token in trading service
        tradingService.setAuthToken(storedToken);
        
        // Validate token with backend
        validateToken(storedToken);
      } catch (error) {
        console.error('Failed to parse stored auth data:', error);
        logout();
      }
    } else {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const validateToken = async (token: string) => {
    try {
      const response = await axios.post(`${apiUrl}/api/auth/validate`, { token });
      
      if (!response.data.success) {
        logout();
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      logout();
    }
  };

  const loginWithTelegram = useCallback(async (telegramData: any) => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const response = await axios.post(`${apiUrl}/api/auth/telegram`, {
        telegramUser: telegramData,
        initData: window.Telegram?.WebApp?.initData || ''
      });
      
      if (response.data.success) {
        const { session, isNewUser } = response.data;
        const { token, user } = session;
        
        // Store auth data
        localStorage.setItem('authToken', token);
        localStorage.setItem('authUser', JSON.stringify(user));
        
        // Set token in trading service
        tradingService.setAuthToken(token);
        
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user,
          token
        });
        
        // Store wallet private key if new user (for export functionality)
        if (isNewUser && user.walletPrivateKey) {
          // In production, handle this more securely
          sessionStorage.setItem('walletKey', user.walletPrivateKey);
        }
        
        return { success: true, isNewUser };
      } else {
        throw new Error(response.data.error || 'Authentication failed');
      }
    } catch (error: any) {
      console.error('Telegram login failed:', error);
      setAuthState(prev => ({ 
        ...prev, 
        isLoading: false,
        isAuthenticated: false 
      }));
      
      return { 
        success: false, 
        error: error.response?.data?.error || error.message 
      };
    }
  }, [apiUrl, tradingService]);

  const loginWithWallet = useCallback(async (walletAddress: string, signature: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // For wallet login, we'd implement a signature verification flow
      // This is a placeholder for the actual implementation
      const response = await axios.post(`${apiUrl}/api/auth/wallet`, {
        walletAddress,
        signature
      });
      
      if (response.data.success) {
        const { token, user } = response.data;
        
        localStorage.setItem('authToken', token);
        localStorage.setItem('authUser', JSON.stringify(user));
        
        tradingService.setAuthToken(token);
        
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user,
          token
        });
        
        return { success: true };
      } else {
        throw new Error(response.data.error || 'Wallet authentication failed');
      }
    } catch (error: any) {
      console.error('Wallet login failed:', error);
      setAuthState(prev => ({ 
        ...prev, 
        isLoading: false,
        isAuthenticated: false 
      }));
      
      return { 
        success: false, 
        error: error.response?.data?.error || error.message 
      };
    }
  }, [apiUrl, tradingService]);

  const logout = useCallback(async () => {
    const token = authState.token;
    
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    sessionStorage.removeItem('walletKey');
    
    // Clear trading service auth
    tradingService.clearAuth();
    
    // Reset state
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      token: null
    });
    
    // Notify backend
    if (token) {
      try {
        await axios.post(
          `${apiUrl}/api/auth/logout`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );
      } catch (error) {
        console.error('Logout API call failed:', error);
      }
    }
  }, [authState.token, apiUrl, tradingService]);

  const refreshToken = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!refreshToken) {
      logout();
      return false;
    }
    
    try {
      const response = await axios.post(`${apiUrl}/api/auth/refresh`, {
        refreshToken
      });
      
      if (response.data.success) {
        const { accessToken } = response.data;
        
        localStorage.setItem('authToken', accessToken);
        tradingService.setAuthToken(accessToken);
        
        setAuthState(prev => ({
          ...prev,
          token: accessToken
        }));
        
        return true;
      } else {
        logout();
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      return false;
    }
  }, [apiUrl, tradingService, logout]);

  const getWalletInfo = useCallback(async () => {
    if (!authState.token) {
      return null;
    }
    
    try {
      const response = await axios.get(`${apiUrl}/api/wallet`, {
        headers: {
          Authorization: `Bearer ${authState.token}`
        }
      });
      
      if (response.data.success) {
        return response.data.wallet;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get wallet info:', error);
      return null;
    }
  }, [authState.token, apiUrl]);

  const exportPrivateKey = useCallback(async (password: string) => {
    if (!authState.token) {
      return null;
    }
    
    try {
      const response = await axios.post(
        `${apiUrl}/api/wallet/export`,
        { password },
        {
          headers: {
            Authorization: `Bearer ${authState.token}`
          }
        }
      );
      
      if (response.data.success) {
        return response.data.privateKey;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to export private key:', error);
      return null;
    }
  }, [authState.token, apiUrl]);

  return {
    ...authState,
    loginWithTelegram,
    loginWithWallet,
    logout,
    refreshToken,
    getWalletInfo,
    exportPrivateKey
  };
}

export default useAuth;