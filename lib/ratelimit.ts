// Per-visitor rate limits for endpoints that call outside services (KyberSwap, the Base RPC, an AI model).
// They stop one visitor from flooding those services and getting Stock Buddy blocked for everyone.
// If storage is down or not set up, requests are allowed: a limit must never break trading.
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { storeConfigured, overLimit } from "./store.ts";

export function visitorKey(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Returns a 429 response if this visitor made more than `max` calls to `name` in `windowSec`, otherwise null. */
export async function limit(req: NextRequest, name: string, max: number, windowSec: number): Promise<NextResponse | null> {
  if (!storeConfigured()) return null;
  const over = await overLimit(`${name}:${visitorKey(req)}`, max, windowSec).catch(() => false);
  return over ? NextResponse.json({ error: "Too many requests from here. Wait a minute and try again." }, { status: 429, headers: { "retry-after": String(windowSec) } }) : null;
}
