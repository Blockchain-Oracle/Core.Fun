import React, { useState, useEffect } from 'react';
import { getTradingService } from '../services/TradingService';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

interface TradingPanelProps {
  tokenAddress: string;
  tokenInfo?: {
    name: string;
    symbol: string;
    currentPrice: string;
    sold: string;
    raised: string;
    progress: number;
  };
}

type TradeType = 'buy' | 'sell';

export const TradingPanel: React.FC<TradingPanelProps> = ({ tokenAddress, tokenInfo }) => {
  const { isAuthenticated } = useAuth();
  const tradingService = getTradingService();
  
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [slippage, setSlippage] = useState(5); // 5% default slippage

  // Debounce quote fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (amount && parseFloat(amount) > 0) {
        fetchQuote();
      } else {
        setQuote(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [amount, tradeType, tokenAddress]);

  const fetchQuote = async () => {
    setIsLoadingQuote(true);
    try {
      let quoteResult;
      
      if (tradeType === 'buy') {
        quoteResult = await tradingService.getBuyQuote(tokenAddress, amount);
      } else {
        quoteResult = await tradingService.getSellQuote(tokenAddress, amount);
      }
      
      setQuote(quoteResult);
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      setQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleTrade = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!quote) {
      toast.error('Please wait for quote to load');
      return;
    }

    setIsExecuting(true);
    
    try {
      let result;
      const minReceived = calculateMinReceived(quote.minReceived, slippage);
      
      if (tradeType === 'buy') {
        result = await tradingService.buyToken(tokenAddress, amount, minReceived);
      } else {
        result = await tradingService.sellToken(tokenAddress, amount, minReceived);
      }
      
      if (result.success && result.txHash) {
        toast.success(`${tradeType === 'buy' ? 'Buy' : 'Sell'} order submitted!`);
        
        // Wait for confirmation
        toast.info('Waiting for confirmation...');
        const confirmed = await tradingService.waitForTransaction(result.txHash, 1);
        
        if (confirmed) {
          toast.success('Trade confirmed!');
          setAmount('');
          setQuote(null);
        } else {
          toast.error('Transaction failed or timed out');
        }
      } else {
        toast.error(result.error || 'Trade failed');
      }
    } catch (error: any) {
      console.error('Trade error:', error);
      toast.error(error.message || 'Trade failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const calculateMinReceived = (baseAmount: string, slippagePercent: number): string => {
    const base = parseFloat(baseAmount);
    const minAmount = base * (1 - slippagePercent / 100);
    return minAmount.toFixed(6);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const switchTradeType = () => {
    setTradeType(prev => prev === 'buy' ? 'sell' : 'buy');
    setAmount('');
    setQuote(null);
  };

  return (
    <div className="trading-panel">
      <div className="card">
        <div className="card-header">
          <h3>Trade {tokenInfo?.symbol || 'Token'}</h3>
          {tokenInfo && (
            <div className="token-stats">
              <span>Price: ${tokenInfo.currentPrice}</span>
              <span>Progress: {tokenInfo.progress.toFixed(1)}%</span>
            </div>
          )}
        </div>
        
        <div className="card-body">
          <div className="trade-type-selector">
            <button
              className={`trade-type-btn ${tradeType === 'buy' ? 'active' : ''}`}
              onClick={() => setTradeType('buy')}
              disabled={isExecuting}
            >
              Buy
            </button>
            <button
              className={`trade-type-btn ${tradeType === 'sell' ? 'active' : ''}`}
              onClick={() => setTradeType('sell')}
              disabled={isExecuting}
            >
              Sell
            </button>
          </div>

          <div className="trade-form">
            <div className="input-group">
              <label>
                {tradeType === 'buy' ? 'CORE Amount' : 'Token Amount'}
              </label>
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.0"
                disabled={isExecuting}
              />
              <span className="input-suffix">
                {tradeType === 'buy' ? 'CORE' : tokenInfo?.symbol || 'TOKEN'}
              </span>
            </div>

            <button 
              className="switch-btn" 
              onClick={switchTradeType}
              disabled={isExecuting}
              type="button"
            >
              ⇅
            </button>

            {quote && !isLoadingQuote && (
              <div className="quote-display">
                <div className="quote-row">
                  <span>You will receive:</span>
                  <strong>
                    {quote.tokensOut} {tradeType === 'buy' ? tokenInfo?.symbol || 'TOKEN' : 'CORE'}
                  </strong>
                </div>
                <div className="quote-row">
                  <span>Price per token:</span>
                  <span>{quote.pricePerToken.toFixed(6)} CORE</span>
                </div>
                <div className="quote-row">
                  <span>Price impact:</span>
                  <span className={quote.priceImpact > 5 ? 'warning' : ''}>
                    {quote.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="quote-row">
                  <span>Platform fee:</span>
                  <span>{quote.fee} CORE</span>
                </div>
                <div className="quote-row">
                  <span>Min received ({slippage}% slippage):</span>
                  <span>{calculateMinReceived(quote.minReceived, slippage)}</span>
                </div>
              </div>
            )}

            {isLoadingQuote && (
              <div className="loading-quote">
                <div className="spinner"></div>
                <span>Fetching quote...</span>
              </div>
            )}

            <div className="slippage-settings">
              <label>Slippage Tolerance</label>
              <div className="slippage-options">
                {[1, 3, 5, 10].map(value => (
                  <button
                    key={value}
                    className={`slippage-btn ${slippage === value ? 'active' : ''}`}
                    onClick={() => setSlippage(value)}
                    disabled={isExecuting}
                  >
                    {value}%
                  </button>
                ))}
                <input
                  type="number"
                  value={slippage}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= 50) {
                      setSlippage(val);
                    }
                  }}
                  className="slippage-input"
                  min="0"
                  max="50"
                  step="0.1"
                  disabled={isExecuting}
                />
              </div>
            </div>

            {quote?.priceImpact > 10 && (
              <div className="warning-message">
                ⚠️ High price impact! Consider reducing your trade size.
              </div>
            )}

            <button
              className="trade-btn"
              onClick={handleTrade}
              disabled={!isAuthenticated || isExecuting || !quote || !amount}
            >
              {isExecuting 
                ? 'Processing...' 
                : !isAuthenticated 
                  ? 'Connect Wallet'
                  : tradeType === 'buy' 
                    ? `Buy ${tokenInfo?.symbol || 'Token'}`
                    : `Sell ${tokenInfo?.symbol || 'Token'}`
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingPanel;