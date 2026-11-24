import { limit } from "@/lib/ratelimit.ts";
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { MIN_BUY_USDC, MAX_BUY_USDC } from "@/lib/constants.ts";
import { getStocks } from "@/lib/stocks.ts";
import { getKyberQuote } from "@/lib/quote.ts";

export const dynamic = "force-dynamic";

// GET /api/quote?token=0x...&usdc=5
// Asks KyberSwap for the best route to swap USDC into the stock token.
export async function GET(req: NextRequest) {
  const limited = await limit(req, "quote", 60, 60);
  if (limited) return limited;
  const token = req.nextUrl.searchParams.get("token") || "";
  const usdc = Number(req.nextUrl.searchParams.get("usdc") || "0");

  if (!isAddress(token)) return err("That stock address isn't valid.", 400);
  if (!Number.isFinite(usdc) || usdc < MIN_BUY_USDC || usdc > MAX_BUY_USDC) {
    return err(`Amount must be between $${MIN_BUY_USDC} and $${MAX_BUY_USDC}.`, 400);
  }

  // Only allow tokens that are on Coinbase's official tokenized stocks list.
  const { stocks, source } = await getStocks();
  if (source !== "live") return err("Live data isn't available right now, so purchases are switched off.", 503);
  const stock = stocks.find((s) => s.address.toLowerCase() === token.toLowerCase());
  if (!stock) return err("That token isn't on Coinbase's tokenized stocks list.", 400);

  try {
    const q = await getKyberQuote(stock, usdc);
    if (!q) {
      return err("No trading route was found for this stock right now. There may not be enough liquidity. Try a smaller amount or another stock.", 502);
    }
    return NextResponse.json(q);
  } catch (e) {
    console.error("[quote]", e);
    return err("Couldn't reach the swap service. Please try again in a moment.", 502);
  }
}

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
