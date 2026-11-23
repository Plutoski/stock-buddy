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
import { GapMeter } from "./landing/GapMeter.tsx";

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
        <StockIcon stock={stock} size={52} />
        <div className="detail-title">
          <h1>{stock.name}</h1>
          <p className="muted">{stock.symbol}, a token on Base that tracks {stock.ticker} shares</p>
        </div>
        {liveData && livePrice && (
          <div className="detail-price">
            <strong>{formatUsd(livePrice.tradingPrice)}</strong>
            <GapPill price={livePrice} />
          </div>
        )}
      </header>

      {liveData && stock.navPrice !== undefined && (livePrice || priceLoading) && (
        <GapMeter stocks={[stock]} prices={new Map(livePrice ? [[stock.address.toLowerCase(), livePrice]] : [])} market={market} single={stock} />
      )}

      <dl className="stat-row facts">
        <div className="fact">
          <dt>Official price</dt>
          <dd className="big">{stock.navPrice !== undefined ? formatUsd(stock.navPrice) : "Not published"}</dd>
          <dd className="muted small">{stock.navPrice !== undefined ? `Updated ${timeAgo(stock.navPriceUpdatedAt)}` : "Coinbase hasn't published one yet"}</dd>
        </div>
        {liveData && !livePrice && (
          <div className="fact">
            <dt>Trading on Base</dt>
            <dd className="big">{priceLoading ? "Checking" : "Unavailable"}</dd>
            <dd className="muted small">{priceLoading ? "Getting a live price" : "No trading route right now"}</dd>
          </div>
        )}
        <div className="fact">
          <dt>1 token equals</dt>
          <dd className="big">{sharesPerToken(stock)}</dd>
          <dd className="muted small">{stock.ticker} share{stock.multiplier === 1 ? "" : "s"}</dd>
        </div>
        <div className="fact">
          <dt>Price status</dt>
          <dd className={`big ${frozen ? "warn-text" : "ok"}`}>{frozen ? "Frozen" : "Updating"}</dd>
          <dd className="muted small">{market.label}</dd>
        </div>
      </dl>

      <section className="card plain">
        <h2>In plain English</h2>
        {explainStock(stock, market).map((l, i) => <p key={i}>{l}</p>)}
        {gapText && <p>{gapText}</p>}
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
