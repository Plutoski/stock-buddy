"use client";

import type { Stock } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";
import { explainStock, formatUsd, sharesPerToken } from "@/lib/explain.ts";
import { timeAgo } from "@/lib/market.ts";
import { BuyPanel } from "./BuyPanel.tsx";
import { Chat } from "./Chat.tsx";
import { StockIcon } from "./StockList.tsx";

export function StockDetail({ stock, market, liveData, onBack }: {
  stock: Stock; market: MarketStatus; liveData: boolean; onBack: () => void;
}) {
  return (
    <div className="detail">
      <button className="btn btn-link back" onClick={onBack}>← All stocks</button>
      <header className="detail-head">
        <StockIcon stock={stock} size={48} />
        <div>
          <h2>{stock.name}</h2>
          <p className="muted">{stock.symbol} · token on Base</p>
        </div>
      </header>

      <section className="card facts">
        <div className="fact">
          <span className="muted small">Official reference value</span>
          <strong className="big">{stock.navPrice !== undefined ? formatUsd(stock.navPrice) : "Not published yet"}</strong>
          <span className="muted small">{stock.navPrice !== undefined ? `per token · updated ${timeAgo(stock.navPriceUpdatedAt)}` : "Coinbase hasn't published one for this token"}</span>
        </div>
        <div className="fact">
          <span className="muted small">1 token equals</span>
          <strong className="big">{sharesPerToken(stock)}</strong>
          <span className="muted small">{stock.ticker} share{stock.multiplier === 1 ? "" : "s"}</span>
        </div>
        <div className="fact">
          <span className="muted small">Price status</span>
          <strong className={`big ${market.isOpen ? "ok" : "warn-text"}`}>{market.isOpen ? "Updating" : "Frozen"}</strong>
          <span className="muted small">{market.label}</span>
        </div>
      </section>

      <section className="card">
        <h3>In plain English</h3>
        {explainStock(stock, market).map((l, i) => <p key={i}>{l}</p>)}
      </section>

      <div className="detail-grid">
        <BuyPanel stock={stock} liveData={liveData} />
        <Chat stock={stock} />
      </div>

      <p className="muted tiny mono">Contract: {stock.address}</p>
    </div>
  );
}
