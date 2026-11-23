"use client";

import { useState } from "react";
import type { Stock } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";
import { isOfficialPriceFrozen } from "@/lib/market.ts";
import { formatUsd } from "@/lib/explain.ts";
import type { LivePrice } from "@/lib/pricing.ts";

const PREFERRED = ["NVDA", "AAPL", "TSLA", "GOOGL", "MSFT", "META", "AMZN"];

/** The hero: a live comparison of what a stock trades for on Base and its official price. */
export function GapMeter({ stocks, prices, market, onOpen }: {
  stocks: Stock[]; prices: Map<string, LivePrice>; market?: MarketStatus; onOpen: (s: Stock) => void;
}) {
  const withPrice = PREFERRED
    .map((t) => stocks.find((s) => s.ticker === t))
    .filter((s): s is Stock => !!s && prices.has(s.address.toLowerCase()) && s.navPrice !== undefined)
    .slice(0, 4);
  const [pick, setPick] = useState<string | null>(null);
  const stock = withPrice.find((s) => s.ticker === pick) ?? withPrice[0];

  if (!stock) {
    return (
      <div className="meter meter-loading" aria-live="polite">
        <p className="meter-title">Getting live prices on Base</p>
        <div className="meter-track"><span className="meter-skeleton" /></div>
        <p className="muted small">This takes a few seconds.</p>
      </div>
    );
  }

  const live = prices.get(stock.address.toLowerCase())!;
  const official = stock.navPrice!;
  const gap = live.gapPct ?? ((live.tradingPrice - official) / official) * 100;
  const frozen = isOfficialPriceFrozen(stock.navPriceUpdatedAt);
  // Scale: official price in the middle, room for the gap on either side.
  const span = Math.max(Math.abs(gap) * 1.6, 2);
  const pos = (pct: number) => `${50 + (pct / span) * 45}%`;
  const big = Math.abs(gap) >= 2;
  const dir = gap >= 0 ? "above" : "below";
  const sentence = Math.abs(gap) < 0.5
    ? `${stock.ticker} trades in line with its official price right now.`
    : `${stock.ticker} trades ${Math.abs(gap).toFixed(1)}% ${dir} its official price right now. A $100 purchase would cost about $${Math.abs(gap).toFixed(2)} ${gap > 0 ? "more" : "less"} than the official value.`;

  return (
    <div className="meter">
      <div className="meter-head">
        <p className="meter-title">Live prices on Base</p>
        {withPrice.length > 1 && (
          <div className="meter-pick" role="group" aria-label="Choose a stock">
            {withPrice.map((s) => (
              <button key={s.ticker} className={s.ticker === stock.ticker ? "on" : ""} aria-pressed={s.ticker === stock.ticker}
                onClick={() => setPick(s.ticker)}>{s.ticker}</button>
            ))}
          </div>
        )}
      </div>

      <p className={`meter-gap ${big ? "meter-gap-big" : ""}`}>
        {gap >= 0 ? "+" : "−"}{Math.abs(gap).toFixed(1)}%
      </p>
      <p className="meter-sentence">{sentence}</p>

      <div className="meter-track" aria-hidden>
        <span className={`meter-band ${big ? "band-big" : ""}`}
          style={{ left: gap >= 0 ? pos(0) : pos(gap), width: `${(Math.abs(gap) / span) * 45}%` }} />
        <span className="meter-mark mark-official" style={{ left: pos(0) }} />
        <span className="meter-mark mark-live" style={{ left: pos(gap) }}><span className="pulse" /></span>
      </div>

      <dl className="meter-prices">
        <div>
          <dt>Trading price on Base</dt>
          <dd>{formatUsd(live.tradingPrice)}</dd>
          <dd className="muted small">Updates at any hour, any day</dd>
        </div>
        <div>
          <dt>Official price</dt>
          <dd>{formatUsd(official)}</dd>
          <dd className={`small ${frozen ? "warn-text" : "ok"}`}>{frozen ? "Frozen until the US market opens" : "Updating with the US market"}</dd>
        </div>
      </dl>

      <div className="meter-foot">
        <span className="muted small">{market?.label ?? ""}</span>
        <button className="btn btn-primary" onClick={() => onOpen(stock)}>Open {stock.name.split(/[\s,]/)[0]}</button>
      </div>
    </div>
  );
}
