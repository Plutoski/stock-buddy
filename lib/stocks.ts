import type { Stock, StocksResponse } from "./types.ts";
import { COINBASE_STOCKS_API } from "./constants.ts";
import { SAMPLE_STOCKS } from "./sample.ts";
import { storeConfigured, saveStockList, loadStockList } from "./store.ts";

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
    // Note: no slash before "?" — the API rejects ".../tokenized-stocks/?...".
    const res = await fetchWithTimeout(`${COINBASE_STOCKS_API}?${params}`, 10000);
    if (!res.ok) throw new Error(`Coinbase API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
let inflight: Promise<StocksResponse> | null = null;
const FRESH_MS = 60_000;
const STALE_OK_MS = 30 * 60_000; // keep using the last good list for up to 30 min if Coinbase blips
let savedAt = 0;

export async function getStocks(): Promise<StocksResponse> {
  if (process.env.USE_SAMPLE_DATA === "1") return sample("Sample mode is switched on.");
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.data;
  if (inflight) return inflight; // many visitors at once share one Coinbase request
  inflight = (async () => {
    try {
      let stocks: Stock[];
      try { stocks = await fetchLiveStocks(); }
      catch { await new Promise((r) => setTimeout(r, 400)); stocks = await fetchLiveStocks(); } // one retry for a blip
      const data: StocksResponse = { source: "live", fetchedAt: new Date().toISOString(), stocks };
      cache = { at: Date.now(), data };
      // Keep a copy in storage (at most every 10 min) so a fresh server can use it if Coinbase is unreachable.
      if (storeConfigured() && Date.now() - savedAt > 10 * 60_000) {
        savedAt = Date.now();
        saveStockList(JSON.stringify(data)).catch((e) => console.error("[stocks] save failed", e));
      }
      return data;
    } catch (err) {
      console.error("[stocks] live fetch failed:", err);
      if (cache && Date.now() - cache.at < STALE_OK_MS) return cache.data; // last good live data
      if (storeConfigured()) {
        try {
          const saved = await loadStockList();
          const data = saved ? (JSON.parse(saved) as StocksResponse) : null;
          if (data?.source === "live" && Array.isArray(data.stocks) && data.stocks.length) {
            cache = { at: Date.now() - FRESH_MS + 15_000, data }; // retry Coinbase again in ~15 s
            return data;
          }
        } catch (e) { console.error("[stocks] stored list unavailable", e); }
      }
      return sample("Live data couldn't be reached, so this is sample data. Purchases are switched off.");
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function sample(note: string): StocksResponse {
  return { source: "sample", fetchedAt: new Date().toISOString(), stocks: SAMPLE_STOCKS, note };
}
