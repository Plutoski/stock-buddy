import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers.tsx";

export const metadata: Metadata = {
  title: "Stock Buddy: tokenized stocks, explained simply",
  description:
    "A plain-language guide to Coinbase tokenized stocks on Base. Understand what you own, why prices drift when markets close, and what a purchase really costs.",
  openGraph: {
    title: "Stock Buddy",
    description: "Tokenized stocks on Base, explained simply.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
