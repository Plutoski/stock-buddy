// Onchain proof of Stock Buddy purchases.
// A purchase counts only if the Base transaction itself shows all of this:
//   1. it succeeded,
//   2. the KyberSwap router took part,
//   3. a Coinbase tokenized stock was transferred to the buyer,
//   4. it carries the "stock-buddy" source label that Stock Buddy sends to KyberSwap.
// Nothing here trusts the browser: the server reads the transaction from Base.

import type { Stock } from "./types.ts";

export const KYBER_ROUTER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const SOURCE_TAG_HEX = "73746f636b2d6275646479"; // "stock-buddy"
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

export interface RpcLog { address: string; topics: string[]; data: string }
export interface RpcReceipt { status: string; blockNumber: string; logs: RpcLog[]; transactionHash: string }
export interface RpcTx { hash: string; input: string; from: string; to: string | null }

export interface ProofRecord {
  hash: string;
  wallet: string;          // who received the stock tokens
  symbol: string;
  tokens: number;          // stock tokens received
  usdcPaid?: number;       // USDC the wallet paid, when visible in the logs
  block: number;
  at: string;              // when we verified it
}

export type ProofResult = { ok: true; record: ProofRecord } | { ok: false; reason: string };

const topicToAddress = (t: string) => ("0x" + t.slice(-40)).toLowerCase();

function units(hexValue: string, decimals: number): number {
  const v = BigInt(hexValue === "0x" ? "0x0" : hexValue);
  return Number(v) / 10 ** decimals;
}

export function verifyPurchase(tx: RpcTx, receipt: RpcReceipt, stocks: Stock[], now = new Date()): ProofResult {
  if (receipt.status !== "0x1") return { ok: false, reason: "That transaction didn't succeed." };

  const logs = receipt.logs || [];
  if (!logs.some((l) => l.address.toLowerCase() === KYBER_ROUTER)) {
    return { ok: false, reason: "That transaction isn't a KyberSwap swap." };
  }

  const tagged =
    (tx.input || "").toLowerCase().includes(SOURCE_TAG_HEX) ||
    logs.some((l) => (l.data || "").toLowerCase().includes(SOURCE_TAG_HEX));
  if (!tagged) return { ok: false, reason: "That swap wasn't made through Stock Buddy." };

  const byAddress = new Map(stocks.map((s) => [s.address.toLowerCase(), s]));
  // The stock token transfer that lands in the buyer's wallet (the last hop of the swap).
  const stockIn = logs
    .filter((l) => l.topics?.[0] === TRANSFER_TOPIC && l.topics.length >= 3 && byAddress.has(l.address.toLowerCase()))
    .filter((l) => topicToAddress(l.topics[2]) !== KYBER_ROUTER)
    .pop();
  if (!stockIn) return { ok: false, reason: "No Coinbase tokenized stock was bought in that transaction." };

  const stock = byAddress.get(stockIn.address.toLowerCase())!;
  const wallet = topicToAddress(stockIn.topics[2]);
  const usdcOut = logs.find(
    (l) => l.address.toLowerCase() === USDC && l.topics?.[0] === TRANSFER_TOPIC && l.topics.length >= 3 && topicToAddress(l.topics[1]) === wallet,
  );

  return {
    ok: true,
    record: {
      hash: receipt.transactionHash.toLowerCase(),
      wallet,
      symbol: stock.symbol,
      tokens: units(stockIn.data, stock.decimals),
      usdcPaid: usdcOut ? units(usdcOut.data, 6) : undefined,
      block: Number(BigInt(receipt.blockNumber)),
      at: now.toISOString(),
    },
  };
}

export interface ProofSummary {
  purchases: number;
  wallets: number;
  usdcTotal: number;
  records: ProofRecord[];
  excludedWallets: number;
}

/** Totals for the public page. The builder's own wallets are left out of every number. */
export function summarize(records: ProofRecord[], exclude: string[]): ProofSummary {
  const ex = new Set(exclude.map((w) => w.trim().toLowerCase()).filter(Boolean));
  const counted = records.filter((r) => !ex.has(r.wallet));
  return {
    purchases: counted.length,
    wallets: new Set(counted.map((r) => r.wallet)).size,
    usdcTotal: counted.reduce((sum, r) => sum + (r.usdcPaid ?? 0), 0),
    records: [...counted].sort((a, b) => b.block - a.block),
    excludedWallets: ex.size,
  };
}
