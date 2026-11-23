"use client";

import type { Stock } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";
import { explainStock, formatUsd, sharesPerToken } from "@/lib/explain.ts";
import { timeAgo, isOfficialPriceFrozen } from "@/lib/market.ts";
import { useEffect, useRef, useState } from "react";
import type { PreparedOrder } from "./OrderContext.tsx";
import { BuyPanel } from "./BuyPanel.tsx";
import { SellPanel } from "./SellPanel.tsx";
import { Chat } from "./Chat.tsx";
import { ShareRow } from "./ShareRow.tsx";
import { StockIcon, GapPill } from "./StockList.tsx";
import { gapSentence, type LivePrice } from "@/lib/pricing.ts";

export function StockDetail({ stock, market, liveData, onBack, livePrice, priceLoading, initialTab = "buy", order }: {
  stock: Stock; market: MarketStatus; liveData: boolean; onBack: () => void;
  livePrice?: LivePrice; priceLoading?: boolean; initialTab?: "buy" | "sell"; order?: PreparedOrder;
}) {
  const [tab, setTab] = useState<"buy" | "sell">(initialTab);
  const tradeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!order) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => {
      tradeRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      tradeRef.current?.focus({ preventScroll: true }); // keyboard users land on the order too
    }, 50);
    return () => clearTimeout(t);
  }, [order]);
  const frozen = isOfficialPriceFrozen(stock.navPriceUpdatedAt);
  const gapText = gapSentence(livePrice?.gapPct, !frozen);
  return (
    <div className="detail">
      <button className="btn btn-link back" onClick={onBack}>Back to all stocks</button>
      <header className="detail-head">
        <StockIcon stock={stock} size={48} />
        <div>
          <h1>{stock.name}</h1>
          <p className="muted">{stock.symbol}, a token on Base</p>
        </div>
      </header>

      <section className="card facts">
        <div className="fact">
          <span className="muted small">Official price</span>
          <strong className="big">{stock.navPrice !== undefined ? formatUsd(stock.navPrice) : "Not published yet"}</strong>
          <span className="muted small">{stock.navPrice !== undefined ? `per token, updated ${timeAgo(stock.navPriceUpdatedAt)}` : "Coinbase hasn't published one for this token"}</span>
        </div>
        {liveData && (
          <div className="fact">
            <span className="muted small">Trading on Base</span>
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
        <h2>In plain English</h2>
        {explainStock(stock, market).map((l, i) => <p key={i}>{l}</p>)}
        {gapText && <p className={Math.abs(livePrice?.gapPct ?? 0) >= 2 ? "warn" : ""}>{gapText}</p>}
      </section>

      <div className="detail-grid">
        <div ref={tradeRef} tabIndex={-1} style={{ scrollMarginTop: 84, outline: "none" }}>
          {order && (
            <p className="prepared" role="status">
              Prepared by Stock Buddy: {order.side === "buy"
                ? `buy $${order.usdc} of ${stock.ticker}`
                : `sell ${order.fraction !== undefined ? (order.fraction === 1 ? "all" : `${Math.round(order.fraction * 100)}%`) : order.tokens} of your ${stock.symbol}`}. Check the quote, then approve in your wallet.
            </p>
          )}
          <div className="tabs" role="tablist" aria-label="Buy or sell">
            <button role="tab" aria-selected={tab === "buy"} className={`tab ${tab === "buy" ? "tab-on" : ""}`} onClick={() => setTab("buy")}>Buy</button>
            <button role="tab" aria-selected={tab === "sell"} className={`tab ${tab === "sell" ? "tab-on" : ""}`} onClick={() => setTab("sell")}>Sell</button>
          </div>
          {tab === "buy"
            ? <BuyPanel key={stock.address} stock={stock} liveData={liveData} presetUsdc={order?.side === "buy" ? order.usdc : undefined} />
            : <SellPanel key={stock.address} stock={stock} liveData={liveData}
                presetFraction={order?.side === "sell" ? order.fraction : undefined} presetTokens={order?.side === "sell" ? order.tokens : undefined} />}
        </div>
        <Chat stock={stock} />
      </div>

      <section className="card share-card">
        <h2>Share {stock.ticker}</h2>
        <p className="muted small">Send a friend this stock with its live price gap. The preview shows the trading and official prices.</p>
        <ShareRow ticker={stock.ticker} compact
          message={`${stock.name} as a token on Base: Stock Buddy shows the live price next to the official one before you buy. You can start with $1:`} />
      </section>

      <p className="muted tiny mono">Contract: {stock.address}</p>
    </div>
  );
}
