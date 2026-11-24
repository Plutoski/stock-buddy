"use client";

import { useEffect, useState } from "react";
import type { Stock } from "@/lib/types.ts";
import type { LivePrice } from "@/lib/pricing.ts";
import { gapSentence } from "@/lib/pricing.ts";
import { formatUsd } from "@/lib/explain.ts";
import { isOfficialPriceFrozen, timeAgo } from "@/lib/market.ts";
import { useOrders } from "./OrderContext.tsx";

/** The chat agent's answer to "what is the price of NVDA?": the live trading price on Base, the official price, and the gap. */
export function PriceCard({ stock }: { stock: Stock }) {
  const { live, market, prepare, open } = useOrders();
  const [price, setPrice] = useState<LivePrice | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/prices?tokens=${stock.address}`, { signal: AbortSignal.timeout(20_000) });
        const body = await res.json().catch(() => ({}));
        const p = Array.isArray(body.prices) ? (body.prices as LivePrice[]).find((x) => x.address?.toLowerCase() === stock.address.toLowerCase()) : undefined;
        if (cancelled) return;
        if (!res.ok || !p || !(p.tradingPrice > 0)) throw new Error("There's no live trading price for this stock on Base right now.");
        setPrice(p);
      } catch (e) {
        if (!cancelled) setErr((e as Error).name === "TimeoutError" ? "Getting a live price took too long. Ask again in a moment." : (e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [stock.address, live]);

  const frozen = isOfficialPriceFrozen(stock.navPriceUpdatedAt);
  const official = stock.navPrice;
  const perShare = price && stock.multiplier > 0 ? price.tradingPrice / stock.multiplier : undefined;
  const showPerShare = perShare !== undefined && Math.abs(stock.multiplier - 1) > 0.0005;

  return (
    <div className="bubble assistant trade-card price-card">
      <p><strong>{stock.name} ({stock.symbol}) right now</strong></p>
      {!live && <p className="small">Stock Buddy is showing sample data, so there&apos;s no live price.{official !== undefined ? ` The last official price was ${formatUsd(official)}.` : ""}</p>}
      {live && !price && !err && <p className="muted small">Checking the live price on Base…</p>}
      {err && <p className="error small">{err}{official !== undefined ? ` The official price is ${formatUsd(official)}.` : ""}</p>}
      {price && (
        <>
          <p className="price-big">{formatUsd(price.tradingPrice)} <span className="muted small">per token on Base</span></p>
          <dl>
            <dt>Official price</dt><dd>{official !== undefined ? `${formatUsd(official)}${frozen ? " (frozen)" : ""}` : "Not published"}</dd>
            {official !== undefined && <><dt>Official price updated</dt><dd>{timeAgo(stock.navPriceUpdatedAt)}</dd></>}
            <dt>1 token equals</dt><dd>{stock.multiplier.toLocaleString("en-US", { maximumFractionDigits: 6 })} {stock.ticker} shares</dd>
            {showPerShare && <><dt>Per {stock.ticker} share</dt><dd>about {formatUsd(perShare)}</dd></>}
          </dl>
          {gapSentence(price.gapPct, !frozen) && <p className="small">{gapSentence(price.gapPct, !frozen)}</p>}
        </>
      )}
      {market && !market.isOpen && <p className="muted small">{market.label}.</p>}
      <p className="muted small">Prices change all the time. This isn&apos;t advice.</p>
      <div className="row">
        {live && <button className="btn btn-primary" onClick={() => prepare({ side: "buy", stock, usdc: 5 })}>Buy $5 of {stock.ticker}</button>}
        {open && <button className="btn btn-ghost" onClick={() => open(stock)}>Open {stock.ticker}</button>}
      </div>
    </div>
  );
}
