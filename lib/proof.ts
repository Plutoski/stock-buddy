// Onchain proof of Stock Buddy purchases.
// A purchase counts only if the Base transaction itself shows all of this:
//   1. it succeeded,
//   2. the KyberSwap router took part,
//   3. a Coinbase tokenized stock was transferred to the buyer,
//   4. it carries the "stock-buddy" source label, or contains the exact swap Stock Buddy built for that wallet,
//   5. the swap paid out to the same wallet that made it.
// Nothing here trusts the browser: the server reads the transaction from Base.

import type { Stock } from "./types.ts";

export const KYBER_ROUTER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const SOURCE_TAG_HEX = "73746f636b2d6275646479"; // "stock-buddy"
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

export interface RpcLog { address: string; topics: string[]; data: string }
export interface RpcReceipt { status: string; blockNumber: string; logs: RpcLog[]; transactionHash: string }
export interface RpcTx { hash: string; input: string; from: string; to: string | null }

export const SWAPPED_TOPIC = "0xd6d4f5681c246c9f42c203e287975af1601f8df8035a9251f79aab5c8f09e2f8";

export interface ProofRecord {
  hash: string;
  side?: "buy" | "sell";   // older records (before selling existed) are buys
  wallet: string;          // the buyer or seller
  symbol: string;
  tokens: number;          // stock tokens bought or sold
  usdcPaid?: number;       // buys: USDC paid
  usdcReceived?: number;   // sells: USDC received
  block: number;
  at: string;              // when we verified it
}

export type ProofResult = { ok: true; record: ProofRecord } | { ok: false; reason: string };

const topicToAddress = (t: string) => ("0x" + t.slice(-40)).toLowerCase();
const word = (data: string, i: number) => data.slice(2 + i * 64, 2 + (i + 1) * 64);
const wordAddress = (data: string, i: number) => ("0x" + word(data, i).slice(24)).toLowerCase();
const wordUnits = (data: string, i: number, decimals: number) => Number(BigInt("0x" + word(data, i))) / 10 ** decimals;

function units(hexValue: string, decimals: number): number {
  const v = BigInt(hexValue === "0x" ? "0x0" : hexValue);
  return Number(v) / 10 ** decimals;
}

/** Checks a Base transaction and returns what Stock Buddy trade it was, if any. */
export function verifyTrade(tx: RpcTx, receipt: RpcReceipt, stocks: Stock[], now = new Date(),
  builtFor?: (wallet: string) => string[], skipSourceCheck = false): ProofResult {
  if (receipt.status !== "0x1") return { ok: false, reason: "That transaction didn't succeed." };

  const logs = receipt.logs || [];
  const routerLogs = logs.filter((l) => l.address.toLowerCase() === KYBER_ROUTER);
  if (!routerLogs.length) return { ok: false, reason: "That transaction isn't a KyberSwap swap." };

  const input = (tx.input || "").toLowerCase();
  // The label counts in the transaction input or in the router's own events (KyberSwap logs its
  // client data); never in other logs, which any contract the sender controls could write.
  const tagged = input.includes(SOURCE_TAG_HEX) || routerLogs.some((l) => (l.data || "").toLowerCase().includes(SOURCE_TAG_HEX));
  // Was this swap made through Stock Buddy? Either KyberSwap's source label is visible onchain,
  // or the transaction contains the exact swap Stock Buddy built for this wallet.
  const builtMatch = (wallet: string) =>
    (builtFor?.(wallet) || []).some((c) => c.length > 64 && input.includes(c.toLowerCase().replace(/^0x/, "")));
  const fromStockBuddy = (wallet: string) => skipSourceCheck || tagged || builtMatch(wallet);
  const notOurs: ProofResult = { ok: false, reason: "That swap wasn't made through Stock Buddy." };

  const byAddress = new Map(stocks.map((s) => [s.address.toLowerCase(), s]));
  const base = { hash: receipt.transactionHash.toLowerCase(), block: Number(BigInt(receipt.blockNumber)), at: now.toISOString() };

  // 1. Best source: KyberSwap's own Swapped event (works for normal and smart wallets).
  //    Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)
  const swapped = routerLogs.find((l) => l.topics?.[0] === SWAPPED_TOPIC && (l.data || "").length >= 2 + 6 * 64);
  if (swapped) {
    const d = swapped.data;
    const sender = wordAddress(d, 0), src = wordAddress(d, 1), dst = wordAddress(d, 2), receiver = wordAddress(d, 3);
    // Stock Buddy always swaps to the wallet that sent the swap. A swap paid out to some other
    // address isn't ours, and would otherwise let one wallet pose as many.
    if (sender !== receiver) return { ok: false, reason: "That swap paid out to a different wallet." };
    if (!fromStockBuddy(receiver)) return notOurs;
    if (src === USDC && byAddress.has(dst)) {
      const stock = byAddress.get(dst)!;
      return { ok: true, record: { ...base, side: "buy", wallet: receiver, symbol: stock.symbol,
        tokens: wordUnits(d, 5, stock.decimals), usdcPaid: wordUnits(d, 4, 6) } };
    }
    if (byAddress.has(src) && dst === USDC) {
      const stock = byAddress.get(src)!;
      return { ok: true, record: { ...base, side: "sell", wallet: receiver, symbol: stock.symbol,
        tokens: wordUnits(d, 4, stock.decimals), usdcReceived: wordUnits(d, 5, 6) } };
    }
    return { ok: false, reason: "That swap wasn't between USDC and a Coinbase tokenized stock." };
  }

  // 2. Fallback from token transfers, anchored on the signer when the wallet called the router directly.
  const transfers = logs.filter((l) => l.topics?.[0] === TRANSFER_TOPIC && l.topics.length >= 3);
  const signer = (tx.to || "").toLowerCase() === KYBER_ROUTER ? (tx.from || "").toLowerCase() : "";
  if (signer && !fromStockBuddy(signer)) return notOurs;
  if (signer) {
    const stockIn = transfers.find((l) => byAddress.has(l.address.toLowerCase()) && topicToAddress(l.topics[2]) === signer);
    const stockOut = transfers.find((l) => byAddress.has(l.address.toLowerCase()) && topicToAddress(l.topics[1]) === signer);
    const usdcOut = transfers.find((l) => l.address.toLowerCase() === USDC && topicToAddress(l.topics[1]) === signer);
    const usdcIn = transfers.find((l) => l.address.toLowerCase() === USDC && topicToAddress(l.topics[2]) === signer);
    if (stockIn) {
      const stock = byAddress.get(stockIn.address.toLowerCase())!;
      return { ok: true, record: { ...base, side: "buy", wallet: signer, symbol: stock.symbol,
        tokens: units(stockIn.data, stock.decimals), usdcPaid: usdcOut ? units(usdcOut.data, 6) : undefined } };
    }
    if (stockOut && usdcIn) {
      const stock = byAddress.get(stockOut.address.toLowerCase())!;
      return { ok: true, record: { ...base, side: "sell", wallet: signer, symbol: stock.symbol,
        tokens: units(stockOut.data, stock.decimals), usdcReceived: units(usdcIn.data, 6) } };
    }
  }

  // 3. Last resort for purchases: the final stock transfer that leaves the router.
  const stockIn = transfers
    .filter((l) => byAddress.has(l.address.toLowerCase()) && topicToAddress(l.topics[1]) === KYBER_ROUTER)
    .pop();
  if (!stockIn) return { ok: false, reason: "No Coinbase tokenized stock was bought or sold in that transaction." };
  const stock = byAddress.get(stockIn.address.toLowerCase())!;
  const wallet = topicToAddress(stockIn.topics[2]);
  // Without a Swapped event the receiver can't be tied to the sender, so only the exact
  // swap Stock Buddy built for this wallet counts here.
  if (!skipSourceCheck && !builtMatch(wallet)) return notOurs;
  const usdcOut = transfers.find((l) => l.address.toLowerCase() === USDC && topicToAddress(l.topics[1]) === wallet);
  return { ok: true, record: { ...base, side: "buy", wallet, symbol: stock.symbol,
    tokens: units(stockIn.data, stock.decimals), usdcPaid: usdcOut ? units(usdcOut.data, 6) : undefined } };
}

/** Kept for existing callers and tests. */
export const verifyPurchase = verifyTrade;

export interface ProofSummary {
  purchases: number;
  sales: number;
  wallets: number;
  usdcTotal: number;      // USDC spent on purchases
  usdcReceived: number;   // USDC received from sales
  records: ProofRecord[];
  excludedWallets: number;
}

/** Totals for the public page. The builder's own wallets are left out of every number. */
export function summarize(records: ProofRecord[], exclude: string[]): ProofSummary {
  const ex = new Set(exclude.map((w) => w.trim().toLowerCase()).filter(Boolean));
  const counted = records.filter((r) => !ex.has(r.wallet));
  const buys = counted.filter((r) => (r.side ?? "buy") === "buy");
  const sells = counted.filter((r) => r.side === "sell");
  return {
    purchases: buys.length,
    sales: sells.length,
    wallets: new Set(counted.map((r) => r.wallet)).size,
    usdcTotal: buys.reduce((sum, r) => sum + (r.usdcPaid ?? 0), 0),
    usdcReceived: sells.reduce((sum, r) => sum + (r.usdcReceived ?? 0), 0),
    records: [...counted].sort((a, b) => b.block - a.block),
    excludedWallets: ex.size,
  };
}
