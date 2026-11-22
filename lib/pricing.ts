// Live trading price vs the official (frozen or updating) reference price.
// Pure functions only, so they can run on the server, in the browser and in tests.

export interface LivePrice {
  address: string;
  /** USDC per token implied by a small live quote on Base. */
  tradingPrice: number;
  /** Official reference value per token, if Coinbase publishes one. */
  officialPrice?: number;
  /** % difference: positive = trading above official. */
  gapPct?: number;
  checkedAt: string;
}

export function gapPct(trading: number, official?: number): number | undefined {
  if (!official || !Number.isFinite(official) || official <= 0) return undefined;
  if (!trading || !Number.isFinite(trading) || trading <= 0) return undefined;
  return ((trading - official) / official) * 100;
}

export type GapLevel = "inline" | "small" | "large";

/** Under 0.5% is noise; 0.5–2% is worth knowing; 2%+ deserves a warning. */
export function gapLevel(gap: number | undefined): GapLevel | undefined {
  if (gap === undefined) return undefined;
  const a = Math.abs(gap);
  if (a < 0.5) return "inline";
  if (a < 2) return "small";
  return "large";
}

export function gapShort(gap: number | undefined): string | undefined {
  if (gap === undefined) return undefined;
  if (gapLevel(gap) === "inline") return "In line with official";
  return `${gap > 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)}% vs official`;
}

export function gapSentence(gap: number | undefined, marketOpen: boolean): string | undefined {
  if (gap === undefined) return undefined;
  const lvl = gapLevel(gap);
  if (lvl === "inline") {
    return "Right now the trading price on Base is in line with the official price.";
  }
  const dir = gap > 0 ? "higher" : "lower";
  const pct = Math.abs(gap).toFixed(1);
  const why = marketOpen
    ? "Small gaps can happen even while the US market is open, because trading on Base has its own buyers and sellers."
    : "This usually happens while the US market is closed: the official price is frozen, but people keep trading on Base.";
  const meaning = gap > 0
    ? "If you buy now, you pay more than the official price."
    : "If you buy now, you pay less than the official price, but that gap can close either way when the market reopens.";
  return `Right now people on Base are paying ${pct}% ${dir} than the official price. ${why} ${meaning}`;
}
