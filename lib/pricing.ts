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
    return "The trading price on Base matches the official price right now.";
  }
  const dir = gap > 0 ? "above" : "below";
  const pct = Math.abs(gap).toFixed(1);
  const why = marketOpen
    ? "Small gaps happen even while the official price updates, because Base has its own buyers and sellers."
    : "This is common while the official price is frozen, for example at weekends, because people keep trading on Base.";
  const meaning = gap > 0
    ? `Buying now costs about ${pct}% more than the official value.`
    : `Buying now costs about ${pct}% less than the official value. The gap can close in either direction when the US market opens.`;
  return `On Base this token trades ${pct}% ${dir} its official price right now. ${why} ${meaning}`;
}

/** What a seller should know about the price gap, in plain words. Never advice. */
export function sellGapSentence(gap: number | undefined): string | undefined {
  if (gap === undefined || Math.abs(gap) < 1) return undefined;
  const pct = Math.abs(gap).toFixed(1);
  return gap > 0
    ? `This sale would get ${pct}% more per token than the official price. That often happens when the official price is frozen, for example at weekends.`
    : `This sale would get ${pct}% less per token than the official price. That often happens when the official price is frozen, for example at weekends.`;
}
