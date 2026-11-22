import { NextRequest, NextResponse } from "next/server";
import { parseUnits, formatUnits, isAddress } from "viem";
import { KYBER_API, USDC_ADDRESS, USDC_DECIMALS, MIN_BUY_USDC, MAX_BUY_USDC } from "@/lib/constants.ts";
import { getStocks } from "@/lib/stocks.ts";
import { kyberHeaders } from "@/lib/kyber.ts";

export const dynamic = "force-dynamic";

// GET /api/quote?token=0x...&usdc=5
// Asks KyberSwap for the best route to swap USDC into the stock token.
export async function GET(req: NextRequest) {
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

  const amountIn = parseUnits(usdc.toFixed(USDC_DECIMALS), USDC_DECIMALS).toString();
  const url = `${KYBER_API}/routes?${new URLSearchParams({ tokenIn: USDC_ADDRESS, tokenOut: stock.address, amountIn, gasInclude: "true" })}`;

  try {
    const res = await fetch(url, { headers: kyberHeaders(), cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    const rs = body?.data?.routeSummary;
    if (!res.ok || !rs?.amountOut) {
      return err("No trading route was found for this stock right now. There may not be enough liquidity. Try a smaller amount or another stock.", 502);
    }
    const amountOutTokens = Number(formatUnits(BigInt(rs.amountOut), stock.decimals));
    return NextResponse.json({
      amountIn,
      amountOut: rs.amountOut,
      amountOutTokens,
      pricePerToken: amountOutTokens > 0 ? usdc / amountOutTokens : 0,
      amountInUsd: num(rs.amountInUsd),
      amountOutUsd: num(rs.amountOutUsd),
      gasUsd: num(rs.gasUsd),
      routerAddress: body.data.routerAddress,
      routeSummary: rs,
    });
  } catch (e) {
    console.error("[quote]", e);
    return err("Couldn't reach the swap service. Please try again in a moment.", 502);
  }
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
