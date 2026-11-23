import type { Metadata, Viewport } from "next";
import "@fontsource-variable/funnel-sans";
import "@fontsource-variable/funnel-display";
import "./globals.css";
import { Providers } from "./providers.tsx";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://stock-buddy-gnt7.vercel.app"),
  title: "Stock Buddy: buy tokenized stocks on Base and see the price gap first",
  description:
    "Stock Buddy helps first-time buyers use Coinbase tokenized stocks on Base. It compares the live price with the official one, explains the gap, and prepares trades you approve in your own wallet.",
  openGraph: {
    title: "Stock Buddy",
    description: "Buy tokenized stocks on Base from $1. See the price gap before you pay.",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
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
