import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getStocks } from "@/lib/stocks.ts";
import { getLivePrice } from "@/lib/quote.ts";

export const dynamic = "force-dynamic";

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// GET /api/og?t=NVDA -> 1200x630 preview card used when a Stock Buddy link is shared (WhatsApp, X, Telegram…)
export async function GET(req: NextRequest) {
  const t = (req.nextUrl.searchParams.get("t") || "").toUpperCase().slice(0, 12);
  let name = "Real stocks on Base", ticker = "", trading: number | undefined, official: number | undefined;
  try {
    const { stocks, source } = await getStocks();
    const stock = source === "live" ? stocks.find((s) => s.ticker === t) : undefined;
    if (stock) {
      name = stock.name; ticker = stock.ticker; official = stock.navPrice;
      const p = await Promise.race([getLivePrice(stock), new Promise<null>((r) => setTimeout(() => r(null), 3500))]);
      trading = p?.tradingPrice;
    }
  } catch { /* fall back to the generic card */ }
  const gap = trading !== undefined && official ? ((trading - official) / official) * 100 : undefined;
  const gapText = gap === undefined ? "" : Math.abs(gap) < 0.5 ? "In line with the official price"
    : `${Math.abs(gap).toFixed(1)}% ${gap > 0 ? "above" : "below"} the official price`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: 64, background: "linear-gradient(135deg, #0052ff 0%, #002a85 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", width: 64, height: 64, borderRadius: 16, background: "#fff", color: "#0052ff",
            alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>SB</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>Stock Buddy</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: ticker ? 76 : 70, fontWeight: 800, lineHeight: 1.05 }}>
            {ticker ? `${ticker} on Base` : "Real stocks on Base, explained simply"}
          </div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.85 }}>{ticker ? name : "Own a piece of NVIDIA, Apple and more from $1"}</div>
          {trading !== undefined && (
            <div style={{ display: "flex", gap: 28, fontSize: 36, marginTop: 10 }}>
              <div style={{ display: "flex" }}>Trading {usd(trading)}</div>
              {official !== undefined && <div style={{ display: "flex", opacity: 0.8 }}>Official {usd(official)}</div>}
            </div>
          )}
          {gapText && (
            <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 6, padding: "8px 20px", borderRadius: 999,
              background: gap !== undefined && Math.abs(gap) >= 2 ? "#ffd166" : "rgba(255,255,255,0.18)",
              color: gap !== undefined && Math.abs(gap) >= 2 ? "#3a2a00" : "#fff", fontSize: 30, fontWeight: 600 }}>{gapText}</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, opacity: 0.9 }}>
          <div style={{ display: "flex" }}>See the price gap before you buy. Start with $1.</div>
          <div style={{ display: "flex" }}>Not financial advice</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
