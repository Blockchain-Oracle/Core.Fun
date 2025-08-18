import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { StoreInitializer } from "@/components/providers/StoreInitializer"
import "../lib/uuid-polyfill"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "core.fun - Meme Token Launchpad",
  description: "Launch and trade meme tokens on Core blockchain.",
  icons: {
    icon: "/Core.FunLogo.png",
    apple: "/Core.FunLogo.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <StoreInitializer>
          {children}
          <Toaster richColors theme="dark" position="top-right" />
        </StoreInitializer>
      </body>
    </html>
  )
}