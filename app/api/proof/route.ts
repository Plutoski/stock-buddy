import { NextRequest, NextResponse } from "next/server";
import { getStocks } from "@/lib/stocks.ts";
import { verifyPurchase, summarize, type RpcReceipt, type RpcTx } from "@/lib/proof.ts";
import { storeConfigured, saveProof, hasProof, listProofs } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const EXCLUDE = (process.env.PROOF_EXCLUDE_WALLETS || "").split(",");

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "rpc error");
  return body.result as T;
}

// GET /api/proof -> public, verified purchase list and totals (builder's own wallets excluded)
export async function GET() {
  if (!storeConfigured()) {
    return NextResponse.json({ configured: false, purchases: 0, wallets: 0, usdcTotal: 0, records: [], excludedWallets: 0 });
  }
  try {
    const summary = summarize(await listProofs(), EXCLUDE);
    return NextResponse.json({ configured: true, ...summary }, { headers: { "cache-control": "public, s-maxage=30" } });
  } catch (e) {
    console.error("[proof] list failed", e);
    return NextResponse.json({ error: "Couldn't load the purchase list right now." }, { status: 503 });
  }
}

// POST /api/proof { hash } -> reads the transaction from Base and records it if it's a real Stock Buddy purchase
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const hash = String(body?.hash || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: "That isn't a transaction hash." }, { status: 400 });
  if (!storeConfigured()) return NextResponse.json({ error: "Purchase proof isn't switched on yet." }, { status: 503 });

  try {
    if (await hasProof(hash)) return NextResponse.json({ ok: true, already: true });
    const [tx, receipt] = await Promise.all([
      rpc<RpcTx | null>("eth_getTransactionByHash", [hash]),
      rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash]),
    ]);
    if (!tx || !receipt) return NextResponse.json({ error: "That transaction isn't confirmed on Base yet. Try again in a minute." }, { status: 404 });
    const { stocks, source } = await getStocks();
    if (source !== "live") return NextResponse.json({ error: "Live stock data isn't available right now. Try again soon." }, { status: 503 });
    const result = verifyPurchase(tx, receipt, stocks);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
    await saveProof(result.record);
    return NextResponse.json({ ok: true, record: result.record });
  } catch (e) {
    console.error("[proof] verify failed", e);
    return NextResponse.json({ error: "Couldn't check that transaction right now. Please try again." }, { status: 502 });
  }
}
