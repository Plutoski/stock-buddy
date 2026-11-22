import type { Stock } from "./types.ts";

// SAMPLE DATA ONLY. Used when the live Coinbase API can't be reached (e.g. offline testing).
// Prices and addresses here are made up and must never be used for purchases.
const updated = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

const rows: [string, string, number, number][] = [
  ["NVDA", "NVIDIA Corporation", 182.4, 1],
  ["AAPL", "Apple Inc.", 231.1, 1],
  ["MSFT", "Microsoft Corporation", 512.7, 1],
  ["GOOGL", "Alphabet Inc. Class A", 248.3, 1],
  ["AMZN", "Amazon.com, Inc.", 227.9, 1],
  ["META", "Meta Platforms, Inc.", 701.2, 1.0021],
  ["TSLA", "Tesla, Inc.", 412.5, 1],
  ["MSTR", "Strategy Inc.", 301.8, 1],
];

export const SAMPLE_STOCKS: Stock[] = rows.map(([ticker, name, price, multiplier], i) => ({
  address: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
  symbol: `${ticker}c`,
  ticker,
  name,
  decimals: 18,
  multiplier,
  navPrice: Number((price * multiplier).toFixed(2)),
  navPriceUpdatedAt: updated(3 + i),
  totalSupply: 10_000 - i * 900,
  pausedFeatures: [],
}));
