"use client";

import type { Stock } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";
import { explainStock, formatUsd, sharesPerToken } from "@/lib/explain.ts";
import { timeAgo, isOfficialPriceFrozen } from "@/lib/market.ts";
import { useState } from "react";
import { BuyPanel } from "./BuyPanel.tsx";
import { SellPanel } from "./SellPanel.tsx";
import { Chat } from "./Chat.tsx";
import { StockIcon, GapPill } from "./StockList.tsx";
import { gapSentence, type LivePrice } from "@/lib/pricing.ts";

export function StockDetail({ stock, market, liveData, onBack, livePrice, priceLoading, initialTab = "buy" }: {
  stock: Stock; market: MarketStatus; liveData: boolean; onBack: () => void;
  livePrice?: LivePrice; priceLoading?: boolean; initialTab?: "buy" | "sell";
}) {
  const [tab, setTab] = useState<"buy" | "sell">(initialTab);
  const frozen = isOfficialPriceFrozen(stock.navPriceUpdatedAt);
  const gapText = gapSentence(livePrice?.gapPct, !frozen);
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
        {liveData && (
          <div className="fact">
            <span className="muted small">Trading price on Base now</span>
            <strong className="big">{livePrice ? formatUsd(livePrice.tradingPrice) : priceLoading ? "Checking…" : "Unavailable"}</strong>
            <span className="muted small">{livePrice ? <GapPill price={livePrice} /> : priceLoading ? "Getting a live price" : "No trading route right now"}</span>
          </div>
        )}
        <div className="fact">
          <span className="muted small">1 token equals</span>
          <strong className="big">{sharesPerToken(stock)}</strong>
          <span className="muted small">{stock.ticker} share{stock.multiplier === 1 ? "" : "s"}</span>
        </div>
        <div className="fact">
          <span className="muted small">Price status</span>
          <strong className={`big ${frozen ? "warn-text" : "ok"}`}>{frozen ? "Frozen" : "Updating"}</strong>
          <span className="muted small">{market.label}</span>
        </div>
      </section>

      <section className="card">
        <h3>In plain English</h3>
        {explainStock(stock, market).map((l, i) => <p key={i}>{l}</p>)}
        {gapText && <p className={Math.abs(livePrice?.gapPct ?? 0) >= 2 ? "warn" : ""}>{gapText}</p>}
      </section>

      <div className="detail-grid">
        <div>
          <div className="tabs" role="tablist" aria-label="Buy or sell">
            <button role="tab" aria-selected={tab === "buy"} className={`tab ${tab === "buy" ? "tab-on" : ""}`} onClick={() => setTab("buy")}>Buy</button>
            <button role="tab" aria-selected={tab === "sell"} className={`tab ${tab === "sell" ? "tab-on" : ""}`} onClick={() => setTab("sell")}>Sell</button>
          </div>
          {tab === "buy"
            ? <BuyPanel key={stock.address} stock={stock} liveData={liveData} />
            : <SellPanel key={stock.address} stock={stock} liveData={liveData} />}
        </div>
        <Chat stock={stock} />
      </div>

      <p className="muted tiny mono">Contract: {stock.address}</p>
    </div>
  );
}
