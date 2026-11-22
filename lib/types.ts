export interface Stock {
  address: `0x${string}`;
  symbol: string;        // e.g. "NVDAc"
  ticker: string;        // e.g. "NVDA"
  name: string;
  decimals: number;
  iconUrl?: string;
  description?: string;
  /** Shares of the real company each token stands for (changes with dividends/splits). */
  multiplier: number;
  /** Official reference value per token in USD (Chainlink-based). Not a live bid/ask. */
  navPrice?: number;
  navPriceUpdatedAt?: string;
  totalSupply?: number;
  pausedFeatures: number[];
  firstMintDate?: string;
}

export interface StocksResponse {
  source: "live" | "sample";
  fetchedAt: string;
  stocks: Stock[];
  note?: string;
}

export interface Quote {
  amountIn: string;      // USDC smallest units
  amountOut: string;     // token smallest units
  amountOutTokens: number;
  pricePerToken: number; // USDC per token implied by the quote
  amountInUsd?: number;
  amountOutUsd?: number;
  gasUsd?: number;
  routerAddress: `0x${string}`;
  routeSummary: unknown;
}
