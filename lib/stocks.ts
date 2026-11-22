import type { Stock, StocksResponse } from "./types.ts";
import { COINBASE_STOCKS_API } from "./constants.ts";
import { SAMPLE_STOCKS } from "./sample.ts";

interface RawToken {
  contract_address?: string;
  symbol?: string;
  name?: string;
  decimals?: number | string;
  icon_url?: string;
  total_supply?: number;
  multiplier?: number;
  paused_features?: (number | string)[];
  nav_price?: number;
  nav_price_updated_at?: string;
  description?: string;
  first_mint_date?: string;
}

/** "NVDAc" -> "NVDA". Coinbase tokenized stock symbols end in a lowercase "c". */
export function tickerFromSymbol(symbol: string): string {
  return symbol.replace(/c$/, "").toUpperCase();
}

export function normalizeToken(raw: RawToken): Stock | null {
  if (!raw.contract_address || !raw.symbol) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw.contract_address)) return null;
  const multiplier = Number(raw.multiplier);
  return {
    address: raw.contract_address as `0x${string}`,
    symbol: raw.symbol,
    ticker: tickerFromSymbol(raw.symbol),
    name: raw.name || raw.symbol,
    decimals: Number(raw.decimals ?? 18),
    iconUrl: raw.icon_url || undefined,
    description: raw.description || undefined,
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
    navPrice: typeof raw.nav_price === "number" ? raw.nav_price : undefined,
    navPriceUpdatedAt: raw.nav_price_updated_at || undefined,
    totalSupply: typeof raw.total_supply === "number" ? raw.total_supply : undefined,
    pausedFeatures: (raw.paused_features || []).map(Number),
    firstMintDate: raw.first_mint_date || undefined,
  };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchLiveStocks(): Promise<Stock[]> {
  const out: Stock[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ page_size: "500" });
    if (pageToken) params.set("page_token", pageToken);
    const res = await fetchWithTimeout(`${COINBASE_STOCKS_API}/?${params}`, 8000);
    if (!res.ok) throw new Error(`Coinbase API HTTP ${res.status}`);
    const body = (await res.json()) as { tokens?: RawToken[]; next_page_token?: string };
    for (const raw of body.tokens || []) {
      const s = normalizeToken(raw);
      if (s) out.push(s);
    }
    pageToken = body.next_page_token;
    if (!pageToken) break;
  }
  if (out.length === 0) throw new Error("Coinbase API returned no tokens");
  // Biggest, most familiar names first.
  return out.sort((a, b) => (b.totalSupply ?? 0) * (b.navPrice ?? 0) - (a.totalSupply ?? 0) * (a.navPrice ?? 0));
}

let cache: { at: number; data: StocksResponse } | null = null;

export async function getStocks(): Promise<StocksResponse> {
  if (process.env.USE_SAMPLE_DATA === "1") return sample("Sample mode is switched on.");
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  try {
    const stocks = await fetchLiveStocks();
    const data: StocksResponse = { source: "live", fetchedAt: new Date().toISOString(), stocks };
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error("[stocks] live fetch failed, using sample data:", err);
    return sample("Live data couldn't be reached, so this is sample data. Purchases are switched off.");
  }
}

function sample(note: string): StocksResponse {
  return { source: "sample", fetchedAt: new Date().toISOString(), stocks: SAMPLE_STOCKS, note };
}
