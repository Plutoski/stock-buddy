import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPurchase, summarize, KYBER_ROUTER, TRANSFER_TOPIC, SOURCE_TAG_HEX, type RpcReceipt, type RpcTx } from "../lib/proof.ts";
import type { Stock } from "../lib/types.ts";

const NVDA = "0xb20000000000000000000078ee7ce2fe4908108c";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const POOL = "0x1111111111111111111111111111111111111111";
const BUYER = "0xa11ce0000000000000000000000000000000b0b5";
const topic = (a: string) => "0x" + a.slice(2).padStart(64, "0");
const amount = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
const stocks = [{ address: NVDA, symbol: "NVDAc", ticker: "NVDA", name: "NVIDIA", decimals: 8, multiplier: 1, pausedFeatures: [] }] as unknown as Stock[];

function purchase(over: Partial<{ status: string; input: string; withRouter: boolean; token: string }> = {}) {
  const tx: RpcTx = { hash: "0xabc", from: BUYER, to: KYBER_ROUTER, input: over.input ?? ("0xe21fd0e9" + "00".repeat(40) + SOURCE_TAG_HEX + "00".repeat(8)) };
  const logs = [
    { address: USDC, topics: [TRANSFER_TOPIC, topic(BUYER), topic(KYBER_ROUTER)], data: amount(5_000_000n) },
    { address: over.token ?? NVDA, topics: [TRANSFER_TOPIC, topic(POOL), topic(KYBER_ROUTER)], data: amount(3_738_275n) },
    { address: over.token ?? NVDA, topics: [TRANSFER_TOPIC, topic(KYBER_ROUTER), topic(BUYER)], data: amount(3_738_275n) },
  ];
  if (over.withRouter !== false) logs.push({ address: KYBER_ROUTER, topics: ["0xdeadbeef"], data: "0x" });
  const receipt: RpcReceipt = { status: over.status ?? "0x1", blockNumber: "0x10", transactionHash: "0x" + "ab".repeat(32), logs };
  return { tx, receipt };
}

test("a real Stock Buddy purchase is verified with buyer, stock, amount and USDC paid", () => {
  const { tx, receipt } = purchase();
  const r = verifyPurchase(tx, receipt, stocks);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.record.wallet, BUYER);
  assert.equal(r.record.symbol, "NVDAc");
  assert.ok(Math.abs(r.record.tokens - 0.03738275) < 1e-9);
  assert.equal(r.record.usdcPaid, 5);
});

test("rejected: failed transaction", () => {
  const { tx, receipt } = purchase({ status: "0x0" });
  assert.equal(verifyPurchase(tx, receipt, stocks).ok, false);
});
test("rejected: swap made somewhere else (no stock-buddy label)", () => {
  const { tx, receipt } = purchase({ input: "0xe21fd0e9" + "00".repeat(60) });
  const r = verifyPurchase(tx, receipt, stocks);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /Stock Buddy/);
});
test("rejected: not a KyberSwap swap", () => {
  const { tx, receipt } = purchase({ withRouter: false });
  assert.equal(verifyPurchase(tx, receipt, stocks).ok, false);
});
test("rejected: token that isn't a Coinbase tokenized stock", () => {
  const { tx, receipt } = purchase({ token: "0x9999999999999999999999999999999999999999" });
  assert.equal(verifyPurchase(tx, receipt, stocks).ok, false);
});
test("smart wallets: the label is also found in event data", () => {
  const { tx, receipt } = purchase({ input: "0x765e827f" + "00".repeat(60) });
  receipt.logs.push({ address: KYBER_ROUTER, topics: ["0xc0ffee"], data: "0x" + "00".repeat(32) + SOURCE_TAG_HEX });
  assert.equal(verifyPurchase(tx, receipt, stocks).ok, true);
});

test("summary excludes the builder's own wallets and counts unique buyers", () => {
  const base = { symbol: "NVDAc", tokens: 0.03, usdcPaid: 5, at: "2026-11-23T10:00:00Z" };
  const recs = [
    { ...base, hash: "0x1", wallet: "0xaaa", block: 1 },
    { ...base, hash: "0x2", wallet: "0xaaa", block: 2 },
    { ...base, hash: "0x3", wallet: "0xbbb", block: 3 },
    { ...base, hash: "0x4", wallet: "0xme", block: 4 },
  ];
  const s = summarize(recs, ["0xME"]);
  assert.equal(s.purchases, 3);
  assert.equal(s.wallets, 2);
  assert.equal(s.usdcTotal, 15);
  assert.equal(s.excludedWallets, 1);
  assert.equal(s.records[0].hash, "0x3");
});

test("referrals: wallets that came through a friend's link are counted once, builder wallets left out", async () => {
  const { isRefCode, refCodeFor, shareUrl } = await import("../lib/referral.ts");
  assert.equal(refCodeFor("0xA11cE0000000000000000000000000000000B0B5"), "a11ce0");
  assert.equal(isRefCode("a11ce0"), true);
  assert.equal(isRefCode("A11CE0"), false);
  assert.equal(isRefCode("<script>"), false);
  assert.equal(shareUrl("https://x.app", "BRK.B", "0xA11cE0000000000000000000000000000000B0B5"), "https://x.app/s/BRK.B?r=a11ce0");
  const base = { symbol: "NVDAc", tokens: 0.03, usdcPaid: 5, at: "2026-11-23T10:00:00Z" };
  const s = summarize([
    { ...base, hash: "0x1", wallet: "0xaaa", block: 1, ref: "a11ce0" },
    { ...base, hash: "0x2", wallet: "0xaaa", block: 2, ref: "a11ce0" },
    { ...base, hash: "0x3", wallet: "0xbbb", block: 3 },
    { ...base, hash: "0x4", wallet: "0xme", block: 4, ref: "a11ce0" },
  ], ["0xme"]);
  assert.equal(s.referredWallets, 1);
});
