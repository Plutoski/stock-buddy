import { NextRequest, NextResponse, after } from "next/server";
import { rpc } from "@/lib/rpc.ts";
import { runScan } from "@/lib/run-scan.ts";
import { getStocks } from "@/lib/stocks.ts";
import { verifyTrade, summarize, type RpcReceipt, type RpcTx } from "@/lib/proof.ts";
import { isRefCode, refCodeFor } from "@/lib/referral.ts";
import { storeConfigured, saveProof, hasProof, listProofs, builtFor, overLimit, addRefIfMissing } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

const EXCLUDE = (process.env.PROOF_EXCLUDE_WALLETS || "").split(",");

// GET /api/proof -> public, verified purchase list and totals (builder's own wallets excluded)
export async function GET() {
  if (!storeConfigured()) {
    return NextResponse.json({ configured: false, purchases: 0, sales: 0, wallets: 0, usdcTotal: 0, usdcReceived: 0, records: [], excludedWallets: 0, referredWallets: 0 });
  }
  // Each visit to /proof also gives the trade finder a chance to run (at most once every 2 minutes).
  after(() => runScan(120).catch((e) => console.error("[proof] background scan failed", e)));
  try {
    const summary = summarize(await listProofs(), EXCLUDE);
    return NextResponse.json({ configured: true, ...summary }, { headers: { "cache-control": "public, s-maxage=30" } });
  } catch (e) {
    console.error("[proof] list failed", e);
    return NextResponse.json({ error: "Couldn't load the trade list." }, { status: 503 });
  }
}

// POST /api/proof { hash } -> reads the transaction from Base and records it if it's a real Stock Buddy purchase
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const hash = String(body?.hash || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: "That isn't a transaction hash." }, { status: 400 });
  if (!storeConfigured()) return NextResponse.json({ error: "Trade proof isn't switched on yet." }, { status: 503 });

  try {
    if (await hasProof(hash)) {
      const ref = body?.ref;
      if (isRefCode(ref)) await addRefIfMissing(hash, ref).catch(() => {});
      return NextResponse.json({ ok: true, already: true });
    }
    // Each check costs two blockchain lookups, so limit how often one visitor can ask.
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (await overLimit(`proof:${ip}`, 30, 600).catch(() => false)) {
      return NextResponse.json({ error: "Too many checks from here. Please try again in a few minutes." }, { status: 429 });
    }
    const [tx, receipt] = await Promise.all([
      rpc<RpcTx | null>("eth_getTransactionByHash", [hash]),
      rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash]),
    ]);
    if (!tx || !receipt) return NextResponse.json({ error: "That transaction isn't confirmed on Base yet. Try again in a minute." }, { status: 404 });
    const { stocks, source } = await getStocks();
    if (source !== "live") return NextResponse.json({ error: "Live stock data isn't available right now. Try again soon." }, { status: 503 });
    // First find who traded (ignoring the "made through Stock Buddy" test), then check that wallet's built swaps.
    const probe = verifyTrade(tx, receipt, stocks, new Date(), () => [], true);
    const built = probe.ok ? await builtFor(probe.record.wallet).catch(() => [] as string[]) : [];
    const result = verifyTrade(tx, receipt, stocks, new Date(), () => built);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
    // Which friend's link brought them (never their own code). Counted on /proof; nobody is paid for it.
    const ref = body?.ref;
    if (isRefCode(ref) && ref !== refCodeFor(result.record.wallet)) result.record.ref = ref;
    await saveProof(result.record);
    return NextResponse.json({ ok: true, record: result.record });
  } catch (e) {
    console.error("[proof] verify failed", e);
    return NextResponse.json({ error: "Couldn't check that transaction right now. Please try again." }, { status: 502 });
  }
}
