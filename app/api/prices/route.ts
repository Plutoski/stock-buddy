import { NextRequest, NextResponse } from "next/server";
import { getStocks } from "@/lib/stocks.ts";
import { getLivePrices } from "@/lib/quote.ts";

export const dynamic = "force-dynamic";

const DEFAULT_TOP = 12;
const MAX_TOKENS = 12;

// GET /api/prices                 -> live trading prices for the 20 biggest stocks
// GET /api/prices?tokens=0x..,0x.. -> live trading prices for specific stocks (max 30)
export async function GET(req: NextRequest) {
  const { stocks, source } = await getStocks();
  if (source !== "live") return NextResponse.json({ source, prices: [] });

  const wanted = (req.nextUrl.searchParams.get("tokens") || "")
    .split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, MAX_TOKENS);

  const chosen = wanted.length
    ? stocks.filter((s) => wanted.includes(s.address.toLowerCase()))
    : stocks.filter((s) => s.navPrice !== undefined).slice(0, DEFAULT_TOP);

  const prices = await getLivePrices(chosen);
  return NextResponse.json(
    { source, prices },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
