'use client'

import { useState, useEffect } from 'react'
import { useAuthStore, useStakingStore, useTreasuryStore } from '@/lib/stores'
import { apiClient } from '@/lib/api'
import { ethers } from 'ethers'

// Constants
const MIN_LIQUIDITY = 0.1 // Minimum 0.1 CORE for initial liquidity
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { 
  Loader2, 
  Plus, 
  AlertTriangle, 
  Coins,
  DollarSign,
  Users,
  Zap,
  Check,
  X
} from 'lucide-react'
import { formatNumber } from '@/lib/data-transform'

interface TokenCreatorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface TokenParams {
  name: string
  symbol: string
  description: string
  imageUrl: string // CRITICAL: MUST HAVE IMAGE
  website?: string
  twitter?: string
  telegram?: string
  initialSupply: string
  liquidityCore: string
}

// Get actual fee based on staking tier
const getCreationFee = (stakingTier?: string) => {
  const baseFee = 0.1 // Base creation fee in CORE
  if (!stakingTier || stakingTier === 'Free') return baseFee
  
  // Apply staking discount
  const discounts: Record<string, number> = {
    'Bronze': 0.099,
    'Silver': 0.098,
    'Gold': 0.097,
    'Platinum': 0.095
  }
  return discounts[stakingTier] || baseFee
}

const TOKEN_SUPPLY = 1000000000 // 1B total supply (standard)
const GRADUATION_TARGET = 3 // 3 CORE raised to graduate

export function TokenCreatorModal({ open, onOpenChange }: TokenCreatorModalProps) {
  const { user, isAuthenticated, session } = useAuthStore()
  const { status: stakingStatus } = useStakingStore()
  const { calculateFee } = useTreasuryStore()
  const wallet = user?.walletAddress
  const [params, setParams] = useState<TokenParams>({
    name: '',
    symbol: '',
    description: '',
    imageUrl: '', // CRITICAL FIELD
    website: '',
    twitter: '',
    telegram: '',
    initialSupply: '1000000',
    liquidityCore: '0.1'
  })
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [step, setStep] = useState(1) // 1: Form, 2: Review, 3: Success

  const handleInputChange = (field: keyof TokenParams, value: string) => {
    setParams(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const validateForm = (): boolean => {
    if (!params.name.trim()) {
      setError('Token name is required')
      return false
    }
    if (!params.symbol.trim()) {
      setError('Token symbol is required')
      return false
    }
    if (params.symbol.length > 10) {
      setError('Token symbol must be 10 characters or less')
      return false
    }
    if (!params.description.trim()) {
      setError('Token description is required')
      return false
    }
    // CRITICAL: IMAGE IS REQUIRED
    if (!params.imageUrl.trim()) {
      setError('Token image URL is required')
      return false
    }
    if (params.imageUrl && !params.imageUrl.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|svg|webp)/i)) {
      setError('Please provide a valid image URL (jpg, png, gif, svg, or webp)')
      return false
    }
    if (!params.initialSupply || parseFloat(params.initialSupply) <= 0) {
      setError('Initial supply must be greater than 0')
      return false
    }
    if (!params.liquidityCore || parseFloat(params.liquidityCore) < MIN_LIQUIDITY) {
      setError(`Initial liquidity must be at least ${MIN_LIQUIDITY} CORE`)
      return false
    }

    const creationFee = getCreationFee(stakingStatus?.tier)
    const totalCoreNeeded = creationFee + parseFloat(params.liquidityCore)
    
    if (coreBalance < totalCoreNeeded) {
      setError(`Insufficient CORE balance. You need ${totalCoreNeeded.toFixed(3)} CORE total (${creationFee} creation fee + ${params.liquidityCore} liquidity)`)
      return false
    }

    return true
  }

  const handleContinue = () => {
    if (validateForm()) {
      setStep(2)
    }
  }

  const handleCreateToken = async () => {
    if (!validateForm()) return
    if (!isAuthenticated || !session?.token) {
      setError('Please connect your wallet first')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Prepare token creation parameters
      const createTokenParams = {
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        imageUrl: params.imageUrl, // CRITICAL - Required for token display
        twitter: params.twitter || '',
        telegram: params.telegram || '',
        website: params.website || ''
      }
      
      console.log('Creating token with params:', createTokenParams)
      
      // Call API to create token through smart contract
      const response = await apiClient.createToken(createTokenParams, session.token)
      
      if (response.success && response.data) {
        setSuccess(`Token created successfully! Transaction: ${response.data.txHash}`)
        setStep(3)
        
        // TODO: Navigate to token page after creation
        // router.push(`/token/${tokenAddress}`)
      } else {
        throw new Error(response.error || 'Failed to create token')
      }
      
    } catch (err: any) {
      console.error('Token creation error:', err)
      setError(err.message || 'Failed to create token. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setParams({
      name: '',
      symbol: '',
      description: '',
      imageUrl: '', // Reset image URL
      website: '',
      twitter: '',
      telegram: '',
      initialSupply: '1000000',
      liquidityCore: '0.1'
    })
    setImagePreview(null)
    setError(null)
    setSuccess(null)
    setStep(1)
    onOpenChange(false)
  }

  // Get wallet balance
  const [coreBalance, setCoreBalance] = useState(0)
  useEffect(() => {
    const fetchBalance = async () => {
      if (wallet) {
        const response = await apiClient.getWalletBalance(wallet)
        if (response.success && response.data) {
          setCoreBalance(parseFloat(response.data.balance.core))
        }
      }
    }
    fetchBalance()
  }, [wallet])
  
  const creationFee = getCreationFee(stakingStatus?.tier)
  const totalCoreNeeded = creationFee + parseFloat(params.liquidityCore || '0')
  const hasInsufficientBalance = coreBalance < totalCoreNeeded

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Plus className="w-5 h-5 mr-2" />
            Create New Token
          </DialogTitle>
          <DialogDescription>
            Launch your own meme token on Core blockchain
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center space-x-4 mb-6">
          <div className={`flex items-center ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
              step >= 1 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
            }`}>
              {step > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <span className="ml-2 text-sm">Details</span>
          </div>
          
          <div className={`w-8 h-0.5 ${step >= 2 ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
          
          <div className={`flex items-center ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
              step >= 2 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
            }`}>
              {step > 2 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <span className="ml-2 text-sm">Review</span>
          </div>
          
          <div className={`w-8 h-0.5 ${step >= 3 ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
          
          <div className={`flex items-center ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
              step >= 3 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
            }`}>
              {step > 3 ? <Check className="w-4 h-4" /> : '3'}
            </div>
            <span className="ml-2 text-sm">Deploy</span>
          </div>
        </div>

        {/* Step 1: Token Details Form */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="font-semibold">Basic Information</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Token Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Doge Coin"
                    value={params.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol *</Label>
                  <Input
                    id="symbol"
                    placeholder="e.g., DOGE"
                    value={params.symbol}
                    onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                    maxLength={10}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your token and its purpose..."
                  value={params.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                />
              </div>
              
              {/* CRITICAL: IMAGE URL FIELD - MANDATORY */}
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Token Image URL * (Required)</Label>
                <div className="space-y-2">
                  <Input
                    id="imageUrl"
                    placeholder="https://example.com/token-image.png"
                    value={params.imageUrl}
                    onChange={(e) => {
                      handleInputChange('imageUrl', e.target.value)
                      setImagePreview(e.target.value)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide a direct URL to your token image (jpg, png, gif, svg, or webp)
                  </p>
                  {/* Image Preview */}
                  {params.imageUrl && (
                    <div className="mt-2">
                      <Label>Preview:</Label>
                      <div className="mt-1 relative w-32 h-32 border rounded-lg overflow-hidden">
                        <img 
                          src={params.imageUrl} 
                          alt="Token preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder.svg'
                            setError('Failed to load image. Please check the URL.')
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Social Links */}
            <div className="space-y-4">
              <h3 className="font-semibold">Social Links (Optional)</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    placeholder="https://yourtoken.com"
                    value={params.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="twitter">Twitter</Label>
                  <Input
                    id="twitter"
                    placeholder="https://twitter.com/yourtoken"
                    value={params.twitter}
                    onChange={(e) => handleInputChange('twitter', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="telegram">Telegram</Label>
                  <Input
                    id="telegram"
                    placeholder="https://t.me/yourtoken"
                    value={params.telegram}
                    onChange={(e) => handleInputChange('telegram', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Token Economics */}
            <div className="space-y-4">
              <h3 className="font-semibold">Token Economics</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supply">Initial Supply *</Label>
                  <Input
                    id="supply"
                    type="number"
                    placeholder="1000000"
                    value={params.initialSupply}
                    onChange={(e) => handleInputChange('initialSupply', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="liquidity">Initial Liquidity (CORE) *</Label>
                  <Input
                    id="liquidity"
                    type="number"
                    step="0.1"
                    placeholder="1.0"
                    value={params.liquidityCore}
                    onChange={(e) => handleInputChange('liquidityCore', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum: {MIN_LIQUIDITY} CORE
                  </p>
                </div>
              </div>
            </div>

            {/* Cost Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Cost Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Creation Fee</span>
                  <div className="text-right">
                    {stakingStatus?.tier && stakingStatus.tier !== 'Free' ? (
                      <>
                        <span className="line-through text-muted-foreground text-sm mr-2">
                          {0.1} CORE
                        </span>
                        <span>{creationFee} CORE</span>
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {stakingStatus.feeDiscount}% off
                        </Badge>
                      </>
                    ) : (
                      <span>{creationFee} CORE</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>Initial Liquidity</span>
                  <span>{params.liquidityCore || '0'} CORE</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total Required</span>
                  <span>{totalCoreNeeded.toFixed(3)} CORE</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Your Balance</span>
                  <span>{formatNumber(coreBalance)} CORE</span>
                </div>
                {stakingStatus?.tier === 'Free' && (
                  <Alert className="mt-2">
                    <AlertDescription className="text-xs">
                      Stake CMP tokens to unlock fee discounts up to 5%
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Balance Warning */}
            {hasInsufficientBalance && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Insufficient CORE balance. You need {totalCoreNeeded.toFixed(1)} CORE to create this token.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">Review Token Details</h3>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Coins className="w-5 h-5 mr-2" />
                  {params.name} ({params.symbol})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{params.description}</p>
                
                {(params.website || params.twitter || params.telegram) && (
                  <div className="flex flex-wrap gap-2">
                    {params.website && <Badge variant="outline">Website</Badge>}
                    {params.twitter && <Badge variant="outline">Twitter</Badge>}
                    {params.telegram && <Badge variant="outline">Telegram</Badge>}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Initial Supply</p>
                    <p className="font-semibold">{formatNumber(parseFloat(params.initialSupply))} {params.symbol}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Initial Liquidity</p>
                    <p className="font-semibold">{params.liquidityCore} CORE</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Once created, token details cannot be changed. 
                Please review carefully before proceeding.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-orange-600" />
            </div>
            
            <div>
              <h3 className="font-semibold text-lg">Token Created Successfully!</h3>
              <p className="text-muted-foreground mt-1">
                Your token has been deployed to the Core blockchain
              </p>
            </div>

            {success && (
              <Alert className="text-left">
                <AlertDescription className="font-mono text-sm break-all">
                  {success}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">What's next?</p>
              <ul className="text-sm space-y-1">
                <li>• Your token will appear in the marketplace</li>
                <li>• Trading will be available immediately</li>
                <li>• Share with your community to build momentum</li>
              </ul>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleContinue}
                disabled={hasInsufficientBalance}
              >
                Continue
              </Button>
            </>
          )}
          
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button 
                onClick={handleCreateToken}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Token...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Create Token
                  </>
                )}
              </Button>
            </>
          )}
          
          {step === 3 && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}