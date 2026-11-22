import { NextResponse } from "next/server";
import { getStocks } from "@/lib/stocks.ts";
import { getMarketStatus } from "@/lib/market.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getStocks();
  return NextResponse.json({ ...data, market: getMarketStatus() });
}
