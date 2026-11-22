"use client";

import { useState } from "react";
import type { Stock } from "@/lib/types.ts";
import { formatUsd } from "@/lib/explain.ts";

export function StockIcon({ stock, size = 36 }: { stock: Stock; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (stock.iconUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={stock.iconUrl} alt="" width={size} height={size} className="icon" onError={() => setBroken(true)} />;
  }
  return (
    <span className="icon icon-fallback" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {stock.ticker.slice(0, 4)}
    </span>
  );
}

export function StockList({ stocks, selected, onSelect }: {
  stocks: Stock[]; selected?: string; onSelect: (s: Stock) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = query
    ? stocks.filter((s) => s.name.toLowerCase().includes(query) || s.ticker.toLowerCase().includes(query) || s.symbol.toLowerCase().includes(query))
    : stocks;

  return (
    <div className="list">
      <input className="search" placeholder="Search Apple, NVDA, Tesla…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stocks" />
      {shown.length === 0 && <p className="muted">No stocks match “{q}”.</p>}
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
                <strong>{s.navPrice !== undefined ? formatUsd(s.navPrice) : <span className="muted small">No price yet</span>}</strong>
                {s.pausedFeatures.length > 0 && <span className="pill pill-warn tiny">Paused</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
