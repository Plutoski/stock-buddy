// Understands simple trade requests typed into the chat, e.g.
//   "buy $5 of NVIDIA", "get 10 dollars of apple", "buy 25 usdc of tsla"
//   "sell half my google", "sell all my tesla", "sell 25% of META", "sell 0.01 googl"
// It only PREPARES an order. The user always reviews the quote and signs in their own wallet.
import type { Stock } from "./types.ts";

export type TradeIntent =
  | { side: "buy"; stock: Stock; usdc: number }
  | { side: "sell"; stock: Stock; fraction?: number; tokens?: number }
  | { side: "unknown-stock"; query: string; action: "buy" | "sell" }
  | { side: "missing-amount"; stock: Stock; action: "buy" | "sell" };

// Everyday names people use for the big tickers.
const ALIASES: Record<string, string> = {
  google: "GOOGL", alphabet: "GOOGL", nvidia: "NVDA", apple: "AAPL", microsoft: "MSFT", amazon: "AMZN",
  meta: "META", facebook: "META", tesla: "TSLA", netflix: "NFLX", spacex: "SPCX", strategy: "MSTR",
  microstrategy: "MSTR", amd: "AMD", applovin: "APP", sandisk: "SNDK", berkshire: "BRK.B", coinbase: "COIN",
  palantir: "PLTR", broadcom: "AVGO", intel: "INTC", oracle: "ORCL", walmart: "WMT", disney: "DIS",
};

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, five: 5, ten: 10, twenty: 20, "twenty five": 25, fifty: 50, hundred: 100, "a hundred": 100, "one hundred": 100 };

const STOP = new Set(["buy", "sell", "get", "purchase", "some", "of", "my", "the", "worth", "usdc", "usd", "dollars", "dollar", "bucks", "shares", "share", "stock", "stocks", "token", "tokens", "all", "half", "please", "for", "me", "i", "want", "to", "a", "an", "in", "and", "now", "quarter", "percent"]);

export function findStock(text: string, stocks: Stock[]): Stock | undefined {
  const words = text.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter(Boolean);
  const byTicker = new Map(stocks.map((s) => [s.ticker.toUpperCase(), s]));
  const bySymbol = new Map(stocks.map((s) => [s.symbol.toUpperCase(), s]));
  for (const w of words) {
    if (STOP.has(w)) continue;
    const up = w.toUpperCase();
    if (bySymbol.has(up)) return bySymbol.get(up);
    if (byTicker.has(up)) return byTicker.get(up);
    if (ALIASES[w] && byTicker.has(ALIASES[w])) return byTicker.get(ALIASES[w]);
  }
  // Fall back to the first word of the company name ("nvidia", "alphabet", "sandisk").
  for (const w of words) {
    if (STOP.has(w) || w.length < 3 || /^\d/.test(w)) continue;
    const hit = stocks.find((s) => s.name.toLowerCase().split(/[\s,.]+/)[0] === w);
    if (hit) return hit;
  }
  return undefined;
}

function guessQuery(text: string): string {
  const w = text.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter((x) => x && !STOP.has(x) && !/^\$?\d/.test(x));
  return w[0] || "";
}

export function parseTradeIntent(text: string, stocks: Stock[]): TradeIntent | null {
  const t = text.trim().toLowerCase();
  const action = /^(please\s+)?(i want to\s+|can you\s+|help me\s+)?(buy|get|purchase)\b/.test(t) ? "buy"
    : /^(please\s+)?(i want to\s+|can you\s+|help me\s+)?sell\b/.test(t) ? "sell" : null;
  if (!action) return null;
  // Questions about HOW to buy/sell are not orders ("how do I buy?" is handled by the explainer).
  if (/\?$/.test(t) && !/\$\s*\d|\d+\s*(usdc|dollars?|usd|%)|\b(half|all)\b/.test(t)) return null;

  const stock = findStock(t, stocks);
  if (!stock) {
    const q = guessQuery(t);
    return q ? { side: "unknown-stock", query: q, action } : null;
  }

  if (action === "buy") {
    const m = t.match(/\$\s*(\d+(?:\.\d{1,2})?)/) || t.match(/(\d+(?:\.\d{1,2})?)\s*(?:usdc|usd|dollars?|bucks)\b/);
    let usdc = m ? Number(m[1]) : undefined;
    if (usdc === undefined) for (const [w, v] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\s+(dollars?|usdc|bucks)\\b`).test(t)) usdc = v;
    if (usdc === undefined) return { side: "missing-amount", stock, action };
    return { side: "buy", stock, usdc };
  }

  if (/\b(all|everything|entire)\b/.test(t)) return { side: "sell", stock, fraction: 1 };
  if (/\bhalf\b/.test(t)) return { side: "sell", stock, fraction: 0.5 };
  if (/\b(a\s+)?quarter\b/.test(t)) return { side: "sell", stock, fraction: 0.25 };
  const pct = t.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (pct) {
    const f = Number(pct[1]) / 100;
    if (f > 0 && f <= 1) return { side: "sell", stock, fraction: f };
  }
  const amt = t.match(/\b(\d*\.?\d+)\b/);
  if (amt && Number(amt[1]) > 0) return { side: "sell", stock, tokens: Number(amt[1]) };
  return { side: "missing-amount", stock, action };
}
