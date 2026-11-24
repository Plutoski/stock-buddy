// USDC on Base mainnet (6 decimals). Users pay for stock tokens in USDC.
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const USDC_DECIMALS = 6;

export const COINBASE_STOCKS_API = "https://api.coinbase.com/v1/tokenized-stocks";
export const KYBER_API = "https://aggregator-api.kyberswap.com/base/api/v1";

// Safety limits for first-time users.
export const MIN_BUY_USDC = 1;
export const MAX_BUY_USDC = 100;
export const DEFAULT_SLIPPAGE_BIPS = 50; // 0.5%

// KyberSwap's swap router on Base. Stock Buddy only ever approves and sends to this address:
// if the swap service returns any other address, the trade is stopped.
export const KYBER_ROUTER_BASE = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
export const isKyberRouter = (a: unknown) => typeof a === "string" && a.toLowerCase() === KYBER_ROUTER_BASE.toLowerCase();

export const BASESCAN_TX = "https://basescan.org/tx/";
