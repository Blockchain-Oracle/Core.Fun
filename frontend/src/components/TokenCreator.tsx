import React, { useState } from 'react';
import { getTradingService } from '../services/TradingService';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

interface TokenCreatorProps {
  onSuccess?: (tokenAddress: string) => void;
  onCancel?: () => void;
}

export const TokenCreator: React.FC<TokenCreatorProps> = ({ onSuccess, onCancel }) => {
  const { isAuthenticated } = useAuth();
  const tradingService = getTradingService();
  
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    description: '',
    image: '',
    twitter: '',
    telegram: '',
    website: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }
    if (!formData.symbol || formData.symbol.length < 2 || formData.symbol.length > 10) {
      newErrors.symbol = 'Symbol must be 2-10 characters';
    }
    if (!formData.symbol.match(/^[A-Z0-9]+$/)) {
      newErrors.symbol = 'Symbol must be uppercase letters and numbers only';
    }
    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be 500 characters or less';
    }
    if (formData.image && !formData.image.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
      newErrors.image = 'Invalid image URL';
    }
    if (formData.twitter && !formData.twitter.match(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+$/i)) {
      newErrors.twitter = 'Invalid Twitter/X URL';
    }
    if (formData.telegram && !formData.telegram.match(/^https?:\/\/(t\.me|telegram\.me)\/.+$/i)) {
      newErrors.telegram = 'Invalid Telegram URL';
    }
    if (formData.website && !formData.website.match(/^https?:\/\/.+$/i)) {
      newErrors.website = 'Invalid website URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'symbol' ? value.toUpperCase() : value
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAuthenticated) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setIsCreating(true);
    
    try {
      // Estimate gas first
      const gasEstimate = await tradingService.estimateCreateTokenGas(formData);
      
      if (gasEstimate) {
        const totalCostCore = parseFloat(gasEstimate.totalCost);
        const confirmCreate = window.confirm(
          `Creating this token will cost approximately ${totalCostCore.toFixed(4)} CORE. Continue?`
        );
        
        if (!confirmCreate) {
          setIsCreating(false);
          return;
        }
      }

      // Create the token
      const result = await tradingService.createToken(formData);
      
      if (result.success && result.tokenAddress) {
        toast.success('Token created successfully!');
        
        // Wait for transaction confirmation
        if (result.txHash) {
          toast.info('Waiting for confirmation...');
          const confirmed = await tradingService.waitForTransaction(result.txHash, 1);
          
          if (confirmed) {
            toast.success('Token confirmed on blockchain!');
            onSuccess?.(result.tokenAddress);
          } else {
            toast.error('Transaction failed or timed out');
          }
        }
      } else {
        toast.error(result.error || 'Failed to create token');
      }
    } catch (error: any) {
      console.error('Token creation error:', error);
      toast.error(error.message || 'Failed to create token');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="token-creator">
      <div className="card">
        <div className="card-header">
          <h2>Create New Meme Token</h2>
          <p className="text-muted">Launch your token with a bonding curve</p>
        </div>
        
        <form onSubmit={handleSubmit} className="card-body">
          <div className="form-section">
            <h3>Basic Information</h3>
            
            <div className="form-group">
              <label htmlFor="name">Token Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Doge Coin"
                className={errors.name ? 'error' : ''}
                disabled={isCreating}
                required
              />
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="symbol">Token Symbol *</label>
              <input
                type="text"
                id="symbol"
                name="symbol"
                value={formData.symbol}
                onChange={handleInputChange}
                placeholder="e.g., DOGE"
                className={errors.symbol ? 'error' : ''}
                disabled={isCreating}
                required
              />
              {errors.symbol && <span className="error-message">{errors.symbol}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Describe your token..."
                rows={4}
                className={errors.description ? 'error' : ''}
                disabled={isCreating}
              />
              {errors.description && <span className="error-message">{errors.description}</span>}
            </div>
          </div>

          <div className="form-section">
            <h3>Media & Links</h3>
            
            <div className="form-group">
              <label htmlFor="image">Image URL</label>
              <input
                type="url"
                id="image"
                name="image"
                value={formData.image}
                onChange={handleInputChange}
                placeholder="https://example.com/logo.png"
                className={errors.image ? 'error' : ''}
                disabled={isCreating}
              />
              {errors.image && <span className="error-message">{errors.image}</span>}
              {formData.image && !errors.image && (
                <div className="image-preview">
                  <img src={formData.image} alt="Token preview" onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }} />
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="twitter">Twitter/X URL</label>
              <input
                type="url"
                id="twitter"
                name="twitter"
                value={formData.twitter}
                onChange={handleInputChange}
                placeholder="https://twitter.com/yourtoken"
                className={errors.twitter ? 'error' : ''}
                disabled={isCreating}
              />
              {errors.twitter && <span className="error-message">{errors.twitter}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="telegram">Telegram URL</label>
              <input
                type="url"
                id="telegram"
                name="telegram"
                value={formData.telegram}
                onChange={handleInputChange}
                placeholder="https://t.me/yourtoken"
                className={errors.telegram ? 'error' : ''}
                disabled={isCreating}
              />
              {errors.telegram && <span className="error-message">{errors.telegram}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="website">Website URL</label>
              <input
                type="url"
                id="website"
                name="website"
                value={formData.website}
                onChange={handleInputChange}
                placeholder="https://yourtoken.com"
                className={errors.website ? 'error' : ''}
                disabled={isCreating}
              />
              {errors.website && <span className="error-message">{errors.website}</span>}
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isCreating || !isAuthenticated}
            >
              {isCreating ? 'Creating Token...' : 'Create Token'}
            </button>
          </div>

          <div className="form-info">
            <p className="text-muted">
              <strong>Note:</strong> Creating a token requires a one-time fee plus gas costs.
              Your token will start with a bonding curve and automatically launch to DEX when
              the target is reached.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TokenCreator;