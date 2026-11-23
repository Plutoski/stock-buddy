import { formatUnits, parseUnits } from "viem";
import type { Stock } from "./types.ts";
import { KYBER_API, USDC_ADDRESS, USDC_DECIMALS } from "./constants.ts";
import { kyberHeaders } from "./kyber.ts";
import { gapPct, type LivePrice } from "./pricing.ts";

export interface RawQuote {
  amountIn: string;
  amountOut: string;
  amountOutTokens: number;
  pricePerToken: number;
  amountInUsd?: number;
  amountOutUsd?: number;
  gasUsd?: number;
  routerAddress: `0x${string}`;
  routeSummary: unknown;
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Ask KyberSwap for the best USDC -> stock token route. Returns null if there's no route. */
export async function getKyberQuote(stock: Stock, usdc: number, timeoutMs = 8000): Promise<RawQuote | null> {
  const amountIn = parseUnits(usdc.toFixed(USDC_DECIMALS), USDC_DECIMALS).toString();
  const url = `${KYBER_API}/routes?${new URLSearchParams({ tokenIn: USDC_ADDRESS, tokenOut: stock.address, amountIn, gasInclude: "true" })}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: kyberHeaders(), cache: "no-store", signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    const rs = body?.data?.routeSummary;
    if (!res.ok || !rs?.amountOut) return null;
    const amountOutTokens = Number(formatUnits(BigInt(rs.amountOut), stock.decimals));
    if (!(amountOutTokens > 0)) return null;
    return {
      amountIn,
      amountOut: rs.amountOut,
      amountOutTokens,
      pricePerToken: usdc / amountOutTokens,
      amountInUsd: num(rs.amountInUsd),
      amountOutUsd: num(rs.amountOutUsd),
      gasUsd: num(rs.gasUsd),
      routerAddress: body.data.routerAddress,
      routeSummary: rs,
    };
  } finally {
    clearTimeout(t);
  }
}

// ---- Live trading prices, cached so we don't hammer the swap service ----
const PRICE_PROBE_USDC = 10; // small purchase size used to measure the trading price
const TTL_MS = 90_000;
const cache = new Map<string, { at: number; value: LivePrice | null }>();

export async function getLivePrice(stock: Stock): Promise<LivePrice | null> {
  const key = stock.address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: LivePrice | null = null;
  try {
    const q = await getKyberQuote(stock, PRICE_PROBE_USDC, 4000);
    if (q) {
      value = {
        address: stock.address,
        tradingPrice: q.pricePerToken,
        officialPrice: stock.navPrice,
        gapPct: gapPct(q.pricePerToken, stock.navPrice),
        checkedAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error("[price]", stock.symbol, e);
  }
  // A failure is remembered for ~10s only, so a brief hiccup doesn't hide prices for 90s.
  cache.set(key, { at: value ? Date.now() : Date.now() - TTL_MS + 10_000, value });
  return value;
}

/** Prices for many stocks, a few at a time. */
export async function getLivePrices(stocks: Stock[], concurrency = 6): Promise<LivePrice[]> {
  const out: LivePrice[] = [];
  for (let i = 0; i < stocks.length; i += concurrency) {
    const batch = await Promise.all(stocks.slice(i, i + concurrency).map(getLivePrice));
    for (const p of batch) if (p) out.push(p);
  }
  return out;
}

export interface RawSellQuote {
  amountIn: string;        // stock token smallest units
  amountOut: string;       // USDC smallest units
  tokensIn: number;
  usdcOut: number;
  pricePerToken: number;   // USDC per token this sale would get
  gasUsd?: number;
  routerAddress: `0x${string}`;
  routeSummary: unknown;
}

/** Ask KyberSwap for the best route to swap a stock token back into USDC. */
export async function getKyberSellQuote(stock: Stock, amountInUnits: bigint, timeoutMs = 8000): Promise<RawSellQuote | null> {
  const url = `${KYBER_API}/routes?${new URLSearchParams({ tokenIn: stock.address, tokenOut: USDC_ADDRESS, amountIn: amountInUnits.toString(), gasInclude: "true" })}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: kyberHeaders(), cache: "no-store", signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    const rs = body?.data?.routeSummary;
    if (!res.ok || !rs?.amountOut) return null;
    const tokensIn = Number(formatUnits(amountInUnits, stock.decimals));
    const usdcOut = Number(formatUnits(BigInt(rs.amountOut), USDC_DECIMALS));
    if (!(tokensIn > 0) || !(usdcOut > 0)) return null;
    return {
      amountIn: amountInUnits.toString(),
      amountOut: rs.amountOut,
      tokensIn,
      usdcOut,
      pricePerToken: usdcOut / tokensIn,
      gasUsd: num(rs.gasUsd),
      routerAddress: body.data.routerAddress,
      routeSummary: rs,
    };
  } finally {
    clearTimeout(t);
  }
}
