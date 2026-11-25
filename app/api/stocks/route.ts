import { NextResponse } from "next/server";
import { getStocks } from "@/lib/stocks.ts";
import { getMarketStatus } from "@/lib/market.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getStocks();
  // Live lists are cached at Vercel's edge: visitors get a copy instantly (refreshed in the background
  // at most once a minute) instead of waiting for Coinbase on every page load. Sample data is never cached.
  const headers = data.source === "live"
    ? { "cache-control": "public, s-maxage=60, stale-while-revalidate=600" }
    : { "cache-control": "no-store" };
  return NextResponse.json({ ...data, market: getMarketStatus() }, { headers });
}
