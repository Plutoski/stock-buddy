import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { KYBER_API, DEFAULT_SLIPPAGE_BIPS } from "@/lib/constants.ts";
import { kyberHeaders } from "@/lib/kyber.ts";
import { getStocks } from "@/lib/stocks.ts";
import { USDC_ADDRESS } from "@/lib/constants.ts";
import { storeConfigured, rememberBuilt } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

// POST /api/build { routeSummary, sender }
// Turns a quote into the actual swap transaction the user signs in their wallet.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sender = body?.sender;
  if (!body?.routeSummary || !isAddress(sender)) {
    return NextResponse.json({ error: "Missing quote or wallet address." }, { status: 400 });
  }
  // Only build swaps between USDC and a token on Coinbase's official list.
  const rs = body.routeSummary as { tokenIn?: string; tokenOut?: string };
  const { stocks, source } = await getStocks();
  const isStock = (a: unknown) => stocks.some((s) => s.address.toLowerCase() === String(a || "").toLowerCase());
  const isUsdc = (a: unknown) => String(a || "").toLowerCase() === USDC_ADDRESS.toLowerCase();
  // Buys: USDC -> Coinbase stock. Sells: Coinbase stock -> USDC. Nothing else.
  const allowed = source === "live" && ((isUsdc(rs.tokenIn) && isStock(rs.tokenOut)) || (isStock(rs.tokenIn) && isUsdc(rs.tokenOut)));
  if (!allowed) {
    return NextResponse.json({ error: "That swap isn't allowed. Please get a new quote." }, { status: 400 });
  }
  try {
    const res = await fetch(`${KYBER_API}/route/build`, {
      method: "POST",
      headers: { ...kyberHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        routeSummary: body.routeSummary,
        sender,
        recipient: sender, // tokens always go back to the user's own wallet
        slippageTolerance: DEFAULT_SLIPPAGE_BIPS,
        source: process.env.KYBER_CLIENT_ID || "stock-buddy",
      }),
      cache: "no-store",
    });
    const out = await res.json().catch(() => ({}));
    const data = out?.data;
    if (!res.ok || !data?.data || !data?.routerAddress) {
      return NextResponse.json({ error: "The quote expired or couldn't be prepared. Please get a new quote." }, { status: 502 });
    }
    // Remember this exact swap so /proof can recognise it onchain later (best effort).
    if (storeConfigured()) await rememberBuilt(sender, data.data).catch((e) => console.error("[build] remember failed", e));
    return NextResponse.json({
      to: data.routerAddress,
      data: data.data,
      value: data.transactionValue || "0",
      amountOut: data.amountOut,
    });
  } catch (e) {
    console.error("[build]", e);
    return NextResponse.json({ error: "Couldn't reach the swap service. Please try again." }, { status: 502 });
  }
}
