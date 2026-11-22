import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { KYBER_API, DEFAULT_SLIPPAGE_BIPS } from "@/lib/constants.ts";
import { kyberHeaders } from "@/lib/kyber.ts";

export const dynamic = "force-dynamic";

// POST /api/build { routeSummary, sender }
// Turns a quote into the actual swap transaction the user signs in their wallet.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sender = body?.sender;
  if (!body?.routeSummary || !isAddress(sender)) {
    return NextResponse.json({ error: "Missing quote or wallet address." }, { status: 400 });
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
