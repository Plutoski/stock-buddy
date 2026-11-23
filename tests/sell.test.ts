import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTrade, summarize, KYBER_ROUTER, TRANSFER_TOPIC, SWAPPED_TOPIC, SOURCE_TAG_HEX, type RpcReceipt, type RpcTx } from "../lib/proof.ts";
import { sellGapSentence } from "../lib/pricing.ts";
import type { Stock } from "../lib/types.ts";

const NVDA = "0xb20000000000000000000078ee7ce2fe4908108c";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const SMART = "0x456c00000000000000000000000000000000981a";   // a smart wallet (e.g. Base Account)
const BUNDLER = "0xbb00000000000000000000000000000000000001";
const ENTRYPOINT = "0x0000000071727de22e5e9d8baf0edac6f37da032";
const w = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
const n = (v: bigint) => v.toString(16).padStart(64, "0");
const stocks = [{ address: NVDA, symbol: "NVDAc", ticker: "NVDA", name: "NVIDIA", decimals: 8, multiplier: 1, navPrice: 130, pausedFeatures: [] }] as unknown as Stock[];

function swappedLog(src: string, dst: string, receiver: string, spent: bigint, returned: bigint) {
  return { address: KYBER_ROUTER, topics: [SWAPPED_TOPIC], data: "0x" + w(receiver) + w(src) + w(dst) + w(receiver) + n(spent) + n(returned) };
}
const tx = (input: string): RpcTx => ({ hash: "0x1", from: BUNDLER, to: ENTRYPOINT, input });
const receipt = (logs: RpcReceipt["logs"]): RpcReceipt => ({ status: "0x1", blockNumber: "0x20", transactionHash: "0x" + "cd".repeat(32), logs });
const tagged = "0x765e827f" + "00".repeat(40) + SOURCE_TAG_HEX;

test("a sale from a smart wallet is read from KyberSwap's Swapped event", () => {
  const r = verifyTrade(tx(tagged), receipt([swappedLog(NVDA, USDC, SMART, 1_869_137n, 2_500_000n)]), stocks);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.record.side, "sell");
  assert.equal(r.record.wallet, SMART);
  assert.ok(Math.abs(r.record.tokens - 0.01869137) < 1e-9);
  assert.equal(r.record.usdcReceived, 2.5);
});

test("a purchase from a smart wallet is read from the Swapped event too", () => {
  const r = verifyTrade(tx(tagged), receipt([swappedLog(USDC, NVDA, SMART, 1_000_000n, 747_655n)]), stocks);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.record.side, "buy"); assert.equal(r.record.usdcPaid, 1); assert.equal(r.record.wallet, SMART); }
});

test("a swap that isn't USDC <-> stock is rejected", () => {
  const OTHER = "0x9999999999999999999999999999999999999999";
  const r = verifyTrade(tx(tagged), receipt([swappedLog(OTHER, USDC, SMART, 1n, 1n)]), stocks);
  assert.equal(r.ok, false);
});

test("a sale by a normal wallet (no Swapped event) is found from transfers", () => {
  const EOA = "0xa11ce0000000000000000000000000000000b0b5";
  const POOL = "0x1111111111111111111111111111111111111111";
  const t: RpcTx = { hash: "0x2", from: EOA, to: KYBER_ROUTER, input: "0xe21fd0e9" + SOURCE_TAG_HEX };
  const logs = [
    { address: NVDA, topics: [TRANSFER_TOPIC, "0x" + w(EOA), "0x" + w(KYBER_ROUTER)], data: "0x" + n(1_000_000n) },
    { address: NVDA, topics: [TRANSFER_TOPIC, "0x" + w(KYBER_ROUTER), "0x" + w(POOL)], data: "0x" + n(1_000_000n) },
    { address: USDC, topics: [TRANSFER_TOPIC, "0x" + w(POOL), "0x" + w(KYBER_ROUTER)], data: "0x" + n(1_330_000n) },
    { address: USDC, topics: [TRANSFER_TOPIC, "0x" + w(KYBER_ROUTER), "0x" + w(EOA)], data: "0x" + n(1_330_000n) },
    { address: KYBER_ROUTER, topics: ["0xfeed"], data: "0x" },
  ];
  const r = verifyTrade(t, receipt(logs), stocks);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.record.side, "sell"); assert.equal(r.record.wallet, EOA); assert.equal(r.record.usdcReceived, 1.33); }
});

test("summary counts purchases and sales separately", () => {
  const b = { symbol: "NVDAc", tokens: 0.01, at: "x" };
  const s = summarize([
    { ...b, hash: "0x1", wallet: "0xa", side: "buy", usdcPaid: 5, block: 1 },
    { ...b, hash: "0x2", wallet: "0xa", side: "sell", usdcReceived: 2.5, block: 2 },
    { ...b, hash: "0x3", wallet: "0xb", usdcPaid: 1, block: 3 }, // old record without side = buy
  ], []);
  assert.equal(s.purchases, 2);
  assert.equal(s.sales, 1);
  assert.equal(s.wallets, 2);
  assert.equal(s.usdcTotal, 6);
  assert.equal(s.usdcReceived, 2.5);
});

test("seller gap wording is factual, not advice", () => {
  assert.match(sellGapSentence(3.2)!, /3\.2% more per token/);
  assert.match(sellGapSentence(-2)!, /2\.0% less per token/);
  assert.equal(sellGapSentence(0.4), undefined);
  for (const g of [3.2, -2]) assert.doesNotMatch(sellGapSentence(g)!, /should|good time|recommend/i);
});
