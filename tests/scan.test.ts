import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRange, candidateHashes, scanRange, MAX_PER_RUN, MAX_GAP } from "../lib/scan.ts";
import { KYBER_ROUTER, TRANSFER_TOPIC, SWAPPED_TOPIC, SOURCE_TAG_HEX, type ProofRecord } from "../lib/proof.ts";
import type { Stock } from "../lib/types.ts";

const NVDA = "0xb20000000000000000000078ee7ce2fe4908108c";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const W = "0xa11ce0000000000000000000000000000000b0b5";
const OTHER = "0x0be0000000000000000000000000000000000077";
const t = (a: string) => "0x" + a.slice(2).padStart(64, "0");
const w = (a: string) => a.replace(/^0x/, "").padStart(64, "0");
const n = (v: bigint) => v.toString(16).padStart(64, "0");
const stocks = [{ address: NVDA, symbol: "NVDAc", ticker: "NVDA", name: "NVIDIA", decimals: 8, multiplier: 1, pausedFeatures: [] }] as unknown as Stock[];

test("trade finder: block ranges start near the head, never repeat, and catch up in steps", () => {
  assert.deepEqual(nextRange(null, 10_000), { from: 9_700, to: 10_000 });
  assert.deepEqual(nextRange(9_999, 10_000), { from: 10_000, to: 10_000 });
  assert.equal(nextRange(10_000, 10_000), null);
  const r = nextRange(1_000, 1_000_000)!;
  assert.equal(r.from, 1_000_000 - MAX_GAP);
  assert.equal(r.to - r.from + 1, MAX_PER_RUN);
});

test("trade finder: only transactions touching a recent Stock Buddy wallet are candidates", () => {
  const logs = [
    { address: NVDA, topics: [TRANSFER_TOPIC, t(KYBER_ROUTER), t(W)], data: "0x", transactionHash: "0xAA" },
    { address: NVDA, topics: [TRANSFER_TOPIC, t(OTHER), t(KYBER_ROUTER)], data: "0x", transactionHash: "0xbb" },
    { address: NVDA, topics: [TRANSFER_TOPIC, t(W), t(KYBER_ROUTER)], data: "0x", transactionHash: "0xaa" },
  ];
  assert.deepEqual(candidateHashes(logs, new Set([W])), ["0xaa"]);
});

test("trade finder: records a real Stock Buddy buy it finds, and skips ones already recorded", async () => {
  const hash = "0x" + "12".repeat(32);
  const swapped = { address: KYBER_ROUTER, topics: [SWAPPED_TOPIC], data: "0x" + w(W) + w(USDC) + w(NVDA) + w(W) + n(5_000_000n) + n(3_700_000n) };
  const calls: string[] = [];
  const rpc = (async (method: string) => {
    calls.push(method);
    if (method === "eth_getLogs") return [{ address: NVDA, topics: [TRANSFER_TOPIC, t(KYBER_ROUTER), t(W)], data: "0x", transactionHash: hash }];
    if (method === "eth_getTransactionByHash") return { hash, from: W, to: KYBER_ROUTER, input: "0xe21fd0e9" + "00".repeat(30) + SOURCE_TAG_HEX };
    if (method === "eth_getTransactionReceipt") return { status: "0x1", blockNumber: "0x10", transactionHash: hash, logs: [swapped] };
    throw new Error(method);
  }) as never;
  const saved: ProofRecord[] = [];
  const deps = { rpc, stocks, wallets: [W], builtFor: async () => [], hasProof: async (h: string) => saved.some((r) => r.hash === h),
    saveProof: async (r: ProofRecord) => { saved.push(r); return true; } };
  const first = await scanRange(deps, 100, 1_100);
  assert.equal(first.added.length, 1);
  assert.equal(saved[0].wallet, W);
  assert.equal(saved[0].side, "buy");
  assert.equal(calls.filter((c) => c === "eth_getLogs").length, 3); // 1,001 blocks in chunks of 500
  const second = await scanRange(deps, 100, 1_100);
  assert.equal(second.added.length, 0);
});

test("trade finder: no recent Stock Buddy wallets means no blockchain reads", async () => {
  let called = false;
  const res = await scanRange({ rpc: (async () => { called = true; return []; }) as never, stocks, wallets: [],
    builtFor: async () => [], hasProof: async () => false, saveProof: async () => true }, 1, 1000);
  assert.equal(called, false);
  assert.equal(res.candidates, 0);
});

test("trade finder: a refused eth_getLogs range is split and retried", async () => {
  const ranges: string[] = [];
  const rpc = (async (method: string, params: { fromBlock: string; toBlock: string }[]) => {
    const { fromBlock, toBlock } = params[0];
    const size = Number(toBlock) - Number(fromBlock) + 1;
    if (size > 200) throw new Error("query returned more than 10000 results");
    ranges.push(`${Number(fromBlock)}-${Number(toBlock)}`);
    return [];
  }) as never;
  await scanRange({ rpc, stocks, wallets: [W], builtFor: async () => [], hasProof: async () => false, saveProof: async () => true }, 1, 500);
  assert.ok(ranges.length >= 3);
  assert.equal(ranges[0].split("-")[0], "1");
  assert.equal(ranges.at(-1)!.split("-")[1], "500");
});

test("daily stats: trades per UTC day and each wallet counted as new once, on its first day", async () => {
  const { dailyStats } = await import("../lib/daily.ts");
  const now = new Date("2026-11-23T15:00:00Z");
  const s = dailyStats([
    { wallet: "a", at: "2026-11-22T09:00:00Z" }, { wallet: "a", at: "2026-11-22T10:00:00Z" },
    { wallet: "a", at: "2026-11-23T10:00:00Z" }, { wallet: "b", at: "2026-11-23T11:00:00Z" },
    { wallet: "c", at: "2026-10-01T11:00:00Z" },
  ], 3, now);
  assert.deepEqual(s, [
    { day: "2026-11-21", trades: 0, newWallets: 0 },
    { day: "2026-11-22", trades: 2, newWallets: 1 },
    { day: "2026-11-23", trades: 2, newWallets: 1 },
  ]);
});

test("daily stats: records with a missing or broken date are skipped, not fatal", async () => {
  const { dailyStats } = await import("../lib/daily.ts");
  const s = dailyStats([{ wallet: "a" } as never, { wallet: "b", at: 12 } as never, { wallet: "c", at: "2026-11-23T01:00:00Z" }], 1, new Date("2026-11-23T12:00:00Z"));
  assert.deepEqual(s, [{ day: "2026-11-23", trades: 1, newWallets: 1 }]);
});
