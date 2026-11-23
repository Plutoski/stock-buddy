// Tiny storage layer for verified purchases, using Upstash Redis over its REST API.
// On Vercel: Storage > Create > Upstash (Redis) > connect to this project. That adds
// KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN) automatically.
import type { ProofRecord } from "./proof.ts";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const KEY = "stockbuddy:proofs";

export const storeConfigured = () => Boolean(URL_ && TOKEN);

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
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

// ---- Swaps that Stock Buddy itself built ----
// When /api/build prepares a swap, we remember its exact calldata for the sender.
// A trade then counts as "made through Stock Buddy" if its onchain input contains that calldata
// (for normal wallets it IS the input; for smart wallets it sits inside the bundled call).
const builtKey = (wallet: string) => `stockbuddy:built:${wallet.toLowerCase()}`;

export async function rememberBuilt(wallet: string, calldata: string): Promise<void> {
  const key = builtKey(wallet);
  await redis(["LPUSH", key, calldata.toLowerCase().replace(/^0x/, "")]);
  await redis(["LTRIM", key, 0, 19]);
  await redis(["EXPIRE", key, 172800]);
}

export async function builtFor(wallet: string): Promise<string[]> {
  return ((await redis(["LRANGE", builtKey(wallet), 0, 19])) as string[] | null) || [];
}
