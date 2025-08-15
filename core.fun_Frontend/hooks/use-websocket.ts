import { useEffect, useState, useCallback, useRef } from 'react';
import { wsClient, TokenInfo, Trade, PriceUpdate, TokenCreatedEvent } from '@/lib/websocket';
import { useAuth } from './use-auth';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  tokenAddress?: string;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: Error | null;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { autoConnect = true, tokenAddress } = options;
  const { session } = useAuth();
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
  });

  const connectionsRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (wsClient.isConnected()) {
      setState(prev => ({ ...prev, connected: true, connecting: false }));
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));
    
    // Connect with auth token if available
    const token = session?.token;
    wsClient.connect(token);
  }, [session?.token]);

  const disconnect = useCallback(() => {
    wsClient.disconnect();
    setState({ connected: false, connecting: false, error: null });
  }, []);

  const subscribeToToken = useCallback((address: string) => {
    wsClient.subscribeToToken(address);
  }, []);

  const unsubscribeFromToken = useCallback((address: string) => {
    wsClient.unsubscribeFromToken(address);
  }, []);

  const requestTokens = useCallback(() => {
    wsClient.requestTokens();
  }, []);

  const requestTransactions = useCallback(() => {
    wsClient.requestTransactions();
  }, []);

  useEffect(() => {
    const handleConnected = () => {
      setState({ connected: true, connecting: false, error: null });
    };

    const handleDisconnected = () => {
      setState({ connected: false, connecting: false, error: null });
    };

    const handleError = (error: Error) => {
      setState(prev => ({ ...prev, error, connecting: false }));
    };

    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleDisconnected);
    wsClient.on('error', handleError);

    return () => {
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleDisconnected);
      wsClient.off('error', handleError);
    };
  }, []);

  useEffect(() => {
    if (autoConnect && !wsClient.isConnected()) {
      connectionsRef.current++;
      
      // Only connect once per component lifecycle
      if (connectionsRef.current === 1) {
        connect();
      }
    }

    return () => {
      connectionsRef.current--;
      
      // Disconnect when no components are using WebSocket
      if (connectionsRef.current === 0 && wsClient.isConnected()) {
        // Don't disconnect immediately, wait a bit in case another component mounts
        const timer = setTimeout(() => {
          if (connectionsRef.current === 0) {
            disconnect();
          }
        }, 5000);
        
        return () => clearTimeout(timer);
      }
    };
  }, [autoConnect, connect, disconnect]);

  useEffect(() => {
    if (tokenAddress && wsClient.isConnected()) {
      subscribeToToken(tokenAddress);
      
      return () => {
        unsubscribeFromToken(tokenAddress);
      };
    }
  }, [tokenAddress, subscribeToToken, unsubscribeFromToken, state.connected]);

  return {
    ...state,
    connect,
    disconnect,
    subscribeToToken,
    unsubscribeFromToken,
    requestTokens,
    requestTransactions,
    wsClient,
  };
}

// Hook for listening to specific WebSocket events
export function useWebSocketEvent<T = any>(
  eventName: string,
  handler: (data: T) => void,
  deps: any[] = []
) {
  useEffect(() => {
    wsClient.on(eventName, handler);
    
    return () => {
      wsClient.off(eventName, handler);
    };
  }, [eventName, ...deps]);
}

// Hook for token-specific events
export function useTokenWebSocket(tokenAddress?: string) {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [price, setPrice] = useState<PriceUpdate | null>(null);
  const [isLaunched, setIsLaunched] = useState(false);
  
  const { connected } = useWebSocket({ tokenAddress });

  useWebSocketEvent<TokenInfo>('token:info', (data) => {
    if (data.address === tokenAddress) {
      setTokenInfo(data);
      setIsLaunched(data.isLaunched);
    }
  }, [tokenAddress]);

  useWebSocketEvent<Trade & { address: string }>('token:trade', (data) => {
    if (data.address === tokenAddress) {
      setTrades(prev => [data, ...prev].slice(0, 50)); // Keep last 50 trades
    }
  }, [tokenAddress]);

  useWebSocketEvent<PriceUpdate>('price:update', (data) => {
    if (data.address === tokenAddress) {
      setPrice(data);
    }
  }, [tokenAddress]);

  useWebSocketEvent<{ address: string; status: string }>('token:status', (data) => {
    if (data.address === tokenAddress && data.status === 'launched') {
      setIsLaunched(true);
    }
  }, [tokenAddress]);

  useWebSocketEvent<{ address: string; trades: Trade[] }>('token:trades', (data) => {
    if (data.address === tokenAddress) {
      setTrades(data.trades);
    }
  }, [tokenAddress]);

  return {
    connected,
    tokenInfo,
    trades,
    price,
    isLaunched,
  };
}

// Hook for listening to new token creations
export function useNewTokens() {
  const [newTokens, setNewTokens] = useState<TokenCreatedEvent[]>([]);
  
  useWebSocket({ autoConnect: true });

  useWebSocketEvent<TokenCreatedEvent>('token:created', (data) => {
    setNewTokens(prev => [data, ...prev].slice(0, 10)); // Keep last 10 new tokens
  }, []);

  return newTokens;
}

// Hook for user-specific events
export function useUserWebSocket() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [balanceUpdate, setBalanceUpdate] = useState<any>(null);
  const [userTrades, setUserTrades] = useState<any[]>([]);
  
  const { session } = useAuth();
  const { connected, requestTransactions: reqTx } = useWebSocket({ autoConnect: !!session });

  useWebSocketEvent('user:transactions', (data: any[]) => {
    setTransactions(data);
  }, []);

  useWebSocketEvent('user:balance', (data: any) => {
    setBalanceUpdate(data);
  }, []);

  useWebSocketEvent('user:trade', (data: any) => {
    setUserTrades(prev => [data, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (connected && session) {
      reqTx();
    }
  }, [connected, session, reqTx]);

  return {
    connected,
    transactions,
    balanceUpdate,
    userTrades,
  };
}