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

const STOP = new Set(["buy", "sell", "get", "purchase", "some", "of", "my", "the", "worth", "usdc", "usd", "dollars", "dollar", "bucks", "shares", "share", "stock", "stocks", "token", "tokens", "all", "half", "please", "for", "me", "i", "want", "to", "a", "an", "in", "and", "now", "quarter", "percent", "everything", "entire", "position", "holdings", "them", "it", "this", "one", "on", "at", "price", "market"]);

// Some tickers are everyday English words ("buy $5 of it", "sell on monday", "whatever you like").
// Typed in lower case these are read as words; "IT", "$IT" or "ITc" still find the stock.
const COMMON_WORDS = new Set(["it", "you", "on", "all", "now", "ai", "open", "be", "u", "w", "v", "s", "are", "go", "so",
  "see", "one", "big", "fun", "key", "life", "love", "run", "low", "cash", "good", "best", "well", "next", "real", "safe",
  "free", "home", "hope", "joy", "fast", "fly", "game", "glad", "max", "net", "new", "nice", "pay", "play", "plus", "pro",
  "ride", "save", "spot", "sun", "team", "true", "turn", "wash", "way", "win", "what", "any", "this", "that", "them", "your",
  "with", "at", "by", "or", "if", "is", "am", "do", "has", "can", "dog", "car", "tv", "hd", "eat", "zip", "pick", "like"]);

export function findStock(text: string, stocks: Stock[], contextStock?: Stock): Stock | undefined {
  const raw = text.replace(/[^A-Za-z0-9.$\s]/g, " ").split(/\s+/).filter(Boolean);
  const words = raw.map((w) => w.replace(/^\$/, "").toLowerCase());
  const shouting = text === text.toUpperCase(); // "SELL ALL MY TSLA": capitals tell us nothing
  const byTicker = new Map(stocks.map((s) => [s.ticker.toUpperCase(), s]));
  const bySymbol = new Map(stocks.map((s) => [s.symbol.toUpperCase(), s]));
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const up = w.toUpperCase();
    // Written as "IT" or "$IT" (not "it" or "I"): the user means the ticker.
    const deliberate = w.length > 1 && /[a-z]/.test(w) && (raw[i].startsWith("$") || (!shouting && raw[i].replace(/^\$/, "") === up));
    if (!deliberate && (STOP.has(w) || COMMON_WORDS.has(w))) continue;
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
  // "buy $5 of it" / "sell all of it" on a stock page means the stock on screen.
  if (contextStock && /\b(it|this|this one|this stock|these)\b/i.test(text)) return contextStock;
  return undefined;
}

function guessQuery(text: string): string {
  const w = text.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter((x) => x && !STOP.has(x) && !/^\$?\d/.test(x));
  return w[0] || "";
}

export function parseTradeIntent(text: string, stocks: Stock[], contextStock?: Stock): TradeIntent | null {
  // "$1,000" -> "$1000" so the amount isn't read as $1.
  const original = text.trim().replace(/(\d),(\d{3})\b/g, "$1$2");
  const t = original.toLowerCase();
  const action = /^(please\s+)?(i want to\s+|can you\s+|help me\s+)?(buy|get|purchase)\b/.test(t) ? "buy"
    : /^(please\s+)?(i want to\s+|can you\s+|help me\s+)?sell\b/.test(t) ? "sell" : null;
  if (!action) return null;
  // Questions about HOW to buy/sell are not orders ("how do I buy?" is handled by the explainer).
  if (/\?$/.test(t) && !/\$\s*\d|\d+\s*(usdc|dollars?|usd|%)|\b(half|all)\b/.test(t)) return null;

  const stock = findStock(original, stocks, contextStock);
  if (!stock) {
    const q = guessQuery(t);
    // On a stock page, "sell everything" or "buy $5" with no company named means the stock on screen.
    if (!q && contextStock) return parseTradeIntent(`${text} ${contextStock.symbol}`, stocks);
    return q ? { side: "unknown-stock", query: q, action } : null;
  }

  if (action === "buy") {
    const m = t.match(/\$\s*(\d+(?:\.\d{1,2})?)/) || t.match(/(\d+(?:\.\d{1,2})?)\s*(?:usdc|usd|dollars?|bucks)\b/);
    let usdc = m ? Number(m[1]) : undefined;
    if (usdc === undefined) for (const [w, v] of Object.entries(WORDS)) if (new RegExp(`\\b${w}\\s+(dollars?|usdc|bucks)\\b`).test(t)) usdc = v;
    if (usdc === undefined) return { side: "missing-amount", stock, action };
    return { side: "buy", stock, usdc };
  }

  // Selling "$5 of tesla" is a dollar amount, not 5 tokens. Ask rather than guess.
  if (/\$\s*\d|\d\s*(usdc|usd|dollars?|bucks)\b/.test(t)) return { side: "missing-amount", stock, action };
  if (/\b(all|everything|entire)\b/.test(t)) return { side: "sell", stock, fraction: 1 };
  if (/\bhalf\b/.test(t)) return { side: "sell", stock, fraction: 0.5 };
  if (/\b(a\s+)?quarter\b/.test(t)) return { side: "sell", stock, fraction: 0.25 };
  const pct = t.match(/(\d+(?:\.\d+)?)\s*(%|percent\b|per cent\b)/);
  if (pct) {
    const f = Number(pct[1]) / 100;
    return f > 0 && f <= 1 ? { side: "sell", stock, fraction: f } : { side: "missing-amount", stock, action };
  }
  if (/(^|\s)-\s*\d/.test(t)) return { side: "missing-amount", stock, action };
  const amt = t.match(/\b(\d*\.?\d+)\b/);
  if (amt && Number(amt[1]) > 0) return { side: "sell", stock, tokens: Number(amt[1]) };
  return { side: "missing-amount", stock, action };
}

// ---- Price questions: "what is the price of nvda", "how much is apple", "TSLA price" ----
export type PriceQuestion = { kind: "price"; stock: Stock } | { kind: "price-unknown"; query: string };

const PRICE_WORDS = /\b(price|prices|priced|cost|costs|worth|trading at|trades at|going for|quote|how much (is|are|does|do)|value)\b/i;
// Questions about how prices work, not what a price is right now, go to the explainer instead.
const ABOUT_PRICES = /\b(why|how does|how do|explain|gap|different|differ|dividend|split|night|weekend|official price mean|cost to (buy|sell)|fees?)\b/i;

export function parsePriceQuestion(text: string, stocks: Stock[], contextStock?: Stock): PriceQuestion | null {
  const t = text.trim();
  if (!PRICE_WORDS.test(t) || ABOUT_PRICES.test(t)) return null;
  if (/\b(buy|sell|purchase)\b/i.test(t)) return null; // trade requests are handled by parseTradeIntent
  const stock = findStock(t, stocks);
  if (stock) return { kind: "price", stock };
  // On a stock page, "what's the price?" or "how much is it?" means the stock on screen.
  if (contextStock && /\b(it|this|its|the price|price now|current price|price today)\b/i.test(t)) return { kind: "price", stock: contextStock };
  const QWORDS = new Set(["what", "whats", "what's", "is", "are", "how", "much", "current", "currently", "today", "right", "tell", "show", "check",
    "can", "you", "please", "s", "does", "do", "per", "latest", "live", "on", "base", "of", "the", "now", "price", "cost", "worth", "value", "quote"]);
  const q = t.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).find((w) => w && !QWORDS.has(w) && !STOP.has(w) && !/^\$?\d/.test(w)) || "";
  return q.length >= 2 ? { kind: "price-unknown", query: q } : null;
}
