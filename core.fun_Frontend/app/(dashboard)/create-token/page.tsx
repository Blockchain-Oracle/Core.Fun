'use client'

import { useState } from 'react'
import { CreateTokenHero, CreateTokenButton } from '@/components/token/CreateTokenButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Zap, 
  Shield, 
  TrendingUp, 
  Users, 
  Coins,
  CheckCircle,
  ArrowRight
} from 'lucide-react'

const features = [
  {
    icon: Zap,
    title: 'Instant Launch',
    description: 'Deploy your token in minutes without any coding knowledge required'
  },
  {
    icon: Shield,
    title: 'Secure & Audited',
    description: 'Built-in anti-rug protection and security features for safe trading'
  },
  {
    icon: TrendingUp,
    title: 'Bonding Curve',
    description: 'Automated market making with fair launch price discovery'
  },
  {
    icon: Users,
    title: 'Community Ready',
    description: 'Social features and tools to build your token community'
  }
]

const steps = [
  {
    step: '01',
    title: 'Token Details',
    description: 'Enter your token name, symbol, and description'
  },
  {
    step: '02',
    title: 'Set Parameters',
    description: 'Configure supply, liquidity, and social links'
  },
  {
    step: '03',
    title: 'Review & Deploy',
    description: 'Confirm details and deploy to Core blockchain'
  },
  {
    step: '04',
    title: 'Go Live',
    description: 'Your token is live and ready for trading!'
  }
]

const benefits = [
  'No coding skills required',
  'Fair launch bonding curve',
  'Anti-rug protection built-in',
  'Automatic liquidity provision',
  'Community building tools',
  'Social media integration'
]

export default function CreateTokenPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/60 backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-center justify-between p-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center ring-1 ring-orange-500/30">
                  <Zap className="h-5 w-5 text-orange-400" />
                </div>
                Create Token
              </h1>
              <p className="text-sm text-white/50 mt-1">Launch your own meme token on Core blockchain</p>
            </div>
            
            <Badge variant="outline" className="border-orange-500/30 text-orange-400">
              Fair Launch
            </Badge>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl p-4 space-y-12">
        {/* Hero Section */}
        <div className="py-8">
          <CreateTokenHero />
        </div>

        {/* Features Grid */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Why Choose Our Platform?</h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Built for creators, designed for success. Launch your token with confidence using our 
              battle-tested infrastructure.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
                <CardHeader className="pb-3">
                  <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center mb-3">
                    <feature.icon className="w-6 h-6 text-orange-400" />
                  </div>
                  <CardTitle className="text-lg text-white">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-white/60">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Simple 4-step process to launch your token and start building your community.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center relative">
                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-orange-500/50 to-transparent transform -translate-y-1/2 z-0" />
                )}
                
                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center mx-auto mb-4 ring-2 ring-orange-500/30">
                    <span className="text-orange-400 font-bold text-lg">{step.step}</span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-white/60">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits & Pricing */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Benefits */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-xl flex items-center">
                  <CheckCircle className="w-5 h-5 mr-2 text-orange-400" />
                  What You Get
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <CheckCircle className="w-4 h-4 text-orange-400 shrink-0" />
                      <span className="text-sm">{benefit}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/30">
              <CardHeader>
                <CardTitle className="text-xl flex items-center">
                  <Coins className="w-5 h-5 mr-2 text-orange-400" />
                  Launch Cost
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span>Creation Fee</span>
                    <span className="font-semibold">0.1 CORE</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Minimum Liquidity</span>
                    <span className="font-semibold">0.5+ CORE</span>
                  </div>
                  <Separator className="bg-white/10" />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total (Minimum)</span>
                    <span className="text-orange-400">0.6 CORE</span>
                  </div>
                </div>
                
                <div className="text-xs text-white/60 space-y-1">
                  <p>• Creation fee covers deployment and verification</p>
                  <p>• Higher liquidity = better price stability</p>
                  <p>• All fees are transparent and fixed</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center py-12">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">Ready to Launch Your Token?</h2>
            <p className="text-white/60 mb-8">
              Join thousands of creators who have successfully launched their tokens on our platform.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <CreateTokenButton 
                size="lg" 
                className="px-8 py-3 text-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
              >
                <Zap className="w-5 h-5 mr-2" />
                Launch Your Token
              </CreateTokenButton>
              
              <div className="flex items-center text-sm text-white/60">
                <Shield className="w-4 h-4 mr-1" />
                Secure & Audited
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}