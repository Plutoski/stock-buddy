import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getStocks } from "@/lib/stocks.ts";
import { getKyberSellQuote } from "@/lib/quote.ts";

export const dynamic = "force-dynamic";

// GET /api/sell-quote?token=0x...&units=123456  (units = the token's smallest units)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const unitsRaw = req.nextUrl.searchParams.get("units") || "";
  if (!isAddress(token)) return err("That stock address isn't valid.", 400);
  if (!/^[1-9]\d{0,30}$/.test(unitsRaw)) return err("Choose an amount to sell.", 400);

  const { stocks, source } = await getStocks();
  if (source !== "live") return err("Live data isn't available right now, so selling is switched off.", 503);
  const stock = stocks.find((s) => s.address.toLowerCase() === token.toLowerCase());
  if (!stock) return err("That token isn't on Coinbase's tokenized stocks list.", 400);

  try {
    const q = await getKyberSellQuote(stock, BigInt(unitsRaw));
    if (!q) return err("No route was found to sell this right now. Try a smaller amount, or try again later.", 502);
    return NextResponse.json(q);
  } catch (e) {
    console.error("[sell-quote]", e);
    return err("Couldn't reach the swap service. Please try again in a moment.", 502);
  }
}

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
