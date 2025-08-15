'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Loader2, 
  AlertTriangle, 
  CheckCircle2,
  Image as ImageIcon,
  Link,
  Twitter,
  MessageCircle,
  Globe,
  Info,
  X
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/lib/stores'

interface TokenFormData {
  name: string
  symbol: string
  description: string
  imageUrl: string
  twitter: string
  telegram: string
  website: string
}

export function TokenCreationForm() {
  const { user, isAuthenticated } = useAuthStore()
  const address = user?.walletAddress
  const isConnected = isAuthenticated
  const [formData, setFormData] = useState<TokenFormData>({
    name: '',
    symbol: '',
    description: '',
    imageUrl: '',
    twitter: '',
    telegram: '',
    website: ''
  })
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imageError, setImageError] = useState<boolean>(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ txHash: string; tokenAddress: string } | null>(null)
  const [validationErrors, setValidationErrors] = useState<Partial<TokenFormData>>({})

  const handleInputChange = (field: keyof TokenFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }

    // Handle image URL preview
    if (field === 'imageUrl') {
      setImageError(false)
      if (value) {
        // Basic URL validation
        try {
          const url = new URL(value)
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            setImagePreview(value)
          } else {
            setImageError(true)
          }
        } catch {
          setImageError(true)
          setImagePreview('')
        }
      } else {
        setImagePreview('')
      }
    }
  }

  const validateForm = (): boolean => {
    const errors: Partial<TokenFormData> = {}

    if (!formData.name || formData.name.length < 3) {
      errors.name = 'Name must be at least 3 characters'
    }
    if (!formData.symbol || formData.symbol.length < 2 || formData.symbol.length > 10) {
      errors.symbol = 'Symbol must be 2-10 characters'
    }
    if (!formData.description || formData.description.length < 10) {
      errors.description = 'Description must be at least 10 characters'
    }
    
    // Optional URL validations
    if (formData.twitter && !formData.twitter.match(/^https?:\/\/(www\.)?twitter\.com\/.+/)) {
      errors.twitter = 'Invalid Twitter URL'
    }
    if (formData.telegram && !formData.telegram.match(/^https?:\/\/(t\.me|telegram\.me)\/.+/)) {
      errors.telegram = 'Invalid Telegram URL'
    }
    if (formData.website && !formData.website.match(/^https?:\/\/.+/)) {
      errors.website = 'Invalid website URL'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!isConnected) {
      setError('Please connect your wallet')
      return
    }

    if (!validateForm()) {
      setError('Please fix the validation errors')
      return
    }

    setIsCreating(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await apiClient.createToken({
        name: formData.name,
        symbol: formData.symbol.toUpperCase(),
        description: formData.description,
        imageUrl: formData.imageUrl,
        twitter: formData.twitter,
        telegram: formData.telegram,
        website: formData.website
      })

      if (response.success && response.txHash) {
        setSuccess({
          txHash: response.txHash,
          tokenAddress: response.tokenAddress || ''
        })
        // Reset form
        setFormData({
          name: '',
          symbol: '',
          description: '',
          imageUrl: '',
          twitter: '',
          telegram: '',
          website: ''
        })
        setImagePreview('')
      } else {
        throw new Error(response.error || 'Failed to create token')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create token')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Create Your Meme Token</CardTitle>
        <CardDescription>
          Launch your token on the Core Chain with automatic liquidity and bonding curve
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Success Message */}
        {success && (
          <Alert className="mb-6 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
            <CheckCircle2 className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-orange-700 dark:text-orange-400">
              Token created successfully!
              <div className="mt-2 space-y-1">
                <div className="text-sm">
                  Transaction: <a href={`https://scan.test.btcs.network/tx/${success.txHash}`} target="_blank" rel="noopener noreferrer" className="underline">{success.txHash.slice(0, 10)}...</a>
                </div>
                {success.tokenAddress && (
                  <div className="text-sm">
                    Token Address: <code className="bg-black/10 dark:bg-white/10 px-1 rounded">{success.tokenAddress}</code>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="media">Media & Links</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="name">Token Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Doge Killer"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                disabled={isCreating}
              />
              {validationErrors.name && (
                <p className="text-sm text-red-500">{validationErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol">Token Symbol *</Label>
              <Input
                id="symbol"
                placeholder="e.g., DOGEK"
                value={formData.symbol}
                onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                maxLength={10}
                disabled={isCreating}
              />
              {validationErrors.symbol && (
                <p className="text-sm text-red-500">{validationErrors.symbol}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe your token and its purpose..."
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={4}
                disabled={isCreating}
              />
              {validationErrors.description && (
                <p className="text-sm text-red-500">{validationErrors.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {formData.description.length}/500 characters
              </p>
            </div>
          </TabsContent>

          <TabsContent value="media" className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Token Image URL</Label>
              <div className="flex gap-2">
                <Input
                  id="imageUrl"
                  placeholder="https://example.com/image.png"
                  value={formData.imageUrl}
                  onChange={(e) => handleInputChange('imageUrl', e.target.value)}
                  disabled={isCreating}
                  className="flex-1"
                />
                {imagePreview && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      handleInputChange('imageUrl', '')
                      setImagePreview('')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Enter a direct URL to your token image (PNG, JPG, GIF)
              </p>
            </div>

            {/* Image Preview */}
            {imagePreview && !imageError && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <p className="text-sm font-medium mb-2">Image Preview:</p>
                <div className="relative w-32 h-32 mx-auto">
                  <img
                    src={imagePreview}
                    alt="Token preview"
                    className="w-full h-full object-cover rounded-lg"
                    onError={() => {
                      setImageError(true)
                      setImagePreview('')
                    }}
                  />
                </div>
              </div>
            )}

            {imageError && formData.imageUrl && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load image. Please check the URL is correct and publicly accessible.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="twitter">
                <Twitter className="inline h-4 w-4 mr-1" />
                Twitter URL
              </Label>
              <Input
                id="twitter"
                placeholder="https://twitter.com/yourtoken"
                value={formData.twitter}
                onChange={(e) => handleInputChange('twitter', e.target.value)}
                disabled={isCreating}
              />
              {validationErrors.twitter && (
                <p className="text-sm text-red-500">{validationErrors.twitter}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegram">
                <MessageCircle className="inline h-4 w-4 mr-1" />
                Telegram URL
              </Label>
              <Input
                id="telegram"
                placeholder="https://t.me/yourtoken"
                value={formData.telegram}
                onChange={(e) => handleInputChange('telegram', e.target.value)}
                disabled={isCreating}
              />
              {validationErrors.telegram && (
                <p className="text-sm text-red-500">{validationErrors.telegram}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">
                <Globe className="inline h-4 w-4 mr-1" />
                Website URL
              </Label>
              <Input
                id="website"
                placeholder="https://yourtoken.com"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                disabled={isCreating}
              />
              {validationErrors.website && (
                <p className="text-sm text-red-500">{validationErrors.website}</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="review" className="space-y-4 mt-6">
            <div className="space-y-4">
              <h3 className="font-semibold">Review Your Token</h3>
              
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-4">
                  {imagePreview && !imageError ? (
                    <img
                      src={imagePreview}
                      alt={formData.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <h4 className="font-semibold text-lg">{formData.name || 'Token Name'}</h4>
                    <Badge variant="secondary">{formData.symbol || 'SYMBOL'}</Badge>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Description:</p>
                  <p className="text-sm mt-1">{formData.description || 'No description provided'}</p>
                </div>

                <div className="pt-2 border-t space-y-2">
                  {formData.twitter && (
                    <div className="flex items-center gap-2 text-sm">
                      <Twitter className="h-4 w-4" />
                      <a href={formData.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        Twitter
                      </a>
                    </div>
                  )}
                  {formData.telegram && (
                    <div className="flex items-center gap-2 text-sm">
                      <MessageCircle className="h-4 w-4" />
                      <a href={formData.telegram} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        Telegram
                      </a>
                    </div>
                  )}
                  {formData.website && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4" />
                      <a href={formData.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        Website
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Creation Fee:</strong> 0.1 CORE + gas fees
                  <br />
                  <strong>Initial Supply:</strong> 1,000,000 tokens
                  <br />
                  <strong>Bonding Curve:</strong> Automatic price discovery
                </AlertDescription>
              </Alert>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={isCreating || !isConnected}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Token...
                  </>
                ) : (
                  'Create Token'
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}