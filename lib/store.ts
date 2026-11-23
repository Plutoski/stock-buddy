// Tiny storage layer for verified purchases, using Upstash Redis over its REST API.
// On Vercel: Storage > Create > Upstash (Redis) > connect to this project. That adds
// KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN) automatically.
import type { ProofRecord } from "./proof.ts";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const KEY = "stockbuddy:proofs";

export const storeConfigured = () => Boolean(URL_ && TOKEN);

async function redis(cmd: (string | number)[], timeoutMs = 2500): Promise<unknown> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs), // a slow store must never hold up a trade
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`storage error: ${body.error || res.status}`);
  return body.result;
}

/** Save once per transaction hash (saving the same hash again changes nothing). */
export async function saveProof(r: ProofRecord): Promise<boolean> {
  const added = await redis(["HSETNX", KEY, r.hash, JSON.stringify(r)]);
  return Number(added) === 1;
}

export async function hasProof(hash: string): Promise<boolean> {
  return Number(await redis(["HEXISTS", KEY, hash])) === 1;
}

export async function listProofs(): Promise<ProofRecord[]> {
  const flat = (await redis(["HGETALL", KEY])) as string[] | null;
  const out: ProofRecord[] = [];
  for (let i = 1; flat && i < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i])); } catch { /* skip a corrupt entry */ }
  }
  return out;
}

/** Simple fixed-window limit: true if this key has made more than `max` calls in `windowSec`. */
export async function overLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const n = Number(await redis(["INCR", `stockbuddy:rl:${key}`], 1500));
  if (n === 1) await redis(["EXPIRE", `stockbuddy:rl:${key}`, windowSec], 1500).catch(() => {});
  return n > max;
}

// ---- Last good list of stocks (so a cold server never falls back to sample data) ----
const STOCKS_KEY = "stockbuddy:stocks";
export async function saveStockList(json: string): Promise<void> { await redis(["SET", STOCKS_KEY, json, "EX", 7 * 86400], 1500); }
export async function loadStockList(): Promise<string | null> { return (await redis(["GET", STOCKS_KEY], 1500)) as string | null; }

// ---- Swaps that Stock Buddy itself built ----
// When /api/build prepares a swap, we remember its exact calldata for the sender.
// A trade then counts as "made through Stock Buddy" if its onchain input contains that calldata
// (for normal wallets it IS the input; for smart wallets it sits inside the bundled call).
const builtKey = (wallet: string) => `stockbuddy:built:${wallet.toLowerCase()}`;

export async function rememberBuilt(wallet: string, calldata: string): Promise<void> {
  const key = builtKey(wallet);
  // One round trip (Upstash's /pipeline endpoint) instead of three.
  const res = await fetch(URL_.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify([["LPUSH", key, calldata.toLowerCase().replace(/^0x/, "")], ["LTRIM", key, 0, 19], ["EXPIRE", key, 172800]]),
    cache: "no-store",
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`storage error: ${res.status}`);
}

export async function builtFor(wallet: string): Promise<string[]> {
  return ((await redis(["LRANGE", builtKey(wallet), 0, 19])) as string[] | null) || [];
}
