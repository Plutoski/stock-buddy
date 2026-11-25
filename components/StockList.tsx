"use client";

import { useState } from "react";
import type { Stock } from "@/lib/types.ts";
import { formatUsd } from "@/lib/explain.ts";
import { gapLevel, gapShort, type LivePrice } from "@/lib/pricing.ts";

export function StockIcon({ stock, size = 36 }: { stock: Stock; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (stock.iconUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={stock.iconUrl} alt="" width={size} height={size} className="icon" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
  }
  return (
    <span className="icon icon-fallback" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {stock.ticker.slice(0, 4)}
    </span>
  );
}

export function GapPill({ price }: { price?: LivePrice }) {
  const label = gapShort(price?.gapPct);
  if (!label) return null;
  const lvl = gapLevel(price?.gapPct);
  return <span className={`pill tiny gap-${lvl}`} title="Live trading price on Base compared with the official price">{label}</span>;
}

export function StockList({ stocks, selected, onSelect, prices }: {
  stocks: Stock[]; selected?: string; onSelect: (s: Stock) => void; prices?: Map<string, LivePrice>;
}) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const query = q.trim().toLowerCase();
  // Stocks with a live price come first. The rest of the 400+ stocks load on request or through
  // search, so the first page draws quickly on a slow connection.
  const ordered = prices && prices.size
    ? [...stocks.filter((s) => prices.has(s.address.toLowerCase())), ...stocks.filter((s) => !prices.has(s.address.toLowerCase()))]
    : stocks;
  const matches = query
    ? stocks.filter((s) => s.name.toLowerCase().includes(query) || s.ticker.toLowerCase().includes(query) || s.symbol.toLowerCase().includes(query))
    : ordered;
  const LIMIT = 40;
  let shown = showAll || query ? matches : matches.slice(0, LIMIT);
  const sel = selected ? matches.find((s) => s.address === selected) : undefined;
  if (sel && !shown.includes(sel)) shown = [...shown, sel];

  return (
    <div className="list">
      <input className="search" placeholder="Search Apple, NVDA, Tesla…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stocks" />
      {shown.length === 0 && <p className="muted">No stocks match "{q}".</p>}
      {shown.length > 0 && <div className="list-cols" aria-hidden><span>Company</span><span>Price on Base</span></div>}
      <ul>
        {shown.map((s) => (
          <li key={s.address}>
            <button className={`stock-row ${selected === s.address ? "active" : ""}`} onClick={() => onSelect(s)}>
              <StockIcon stock={s} />
              <span className="stock-name">
                <strong>{s.ticker}</strong>
                <span className="muted small">{s.name}</span>
              </span>
              <span className="stock-price">
                {(() => {
                  const live = prices?.get(s.address.toLowerCase());
                  if (live) return (<>
                    <strong title="Trading price on Base now">{formatUsd(live.tradingPrice)}</strong>
                    <GapPill price={live} />
                  </>);
                  return <strong>{s.navPrice !== undefined ? formatUsd(s.navPrice) : <span className="muted small">No price yet</span>}</strong>;
                })()}
                {s.pausedFeatures.length > 0 && <span className="pill pill-warn tiny">Paused</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!showAll && !query && matches.length > shown.length && (
        <button className="btn btn-ghost btn-block" onClick={() => setShowAll(true)}>Show all {matches.length} stocks</button>
      )}
    </div>
  );
}
