import { NextResponse } from "next/server";
import { runScan } from "@/lib/run-scan.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/scan: run the trade finder once. Safe to call often: a lock lets at most one run
// through every minute, and each run only reads blocks it hasn't read before.
// A GitHub Actions schedule (.github/workflows/find-trades.yml) calls this every 10 minutes.
export async function GET() {
  try {
    const out = await runScan(55);
    return NextResponse.json(out.ran
      ? { ran: true, from: out.from, to: out.to, wallets: out.wallets, candidates: out.candidates, added: out.added.map((r) => r.hash) }
      : out);
  } catch (e) {
    console.error("[scan] failed", e);
    return NextResponse.json({ ran: false, reason: "scan failed" }, { status: 502 });
  }
}
