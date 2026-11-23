"use client";

import { useEffect, useState } from "react";
import type { TradeIntent } from "@/lib/intent.ts";
import { formatUsd } from "@/lib/explain.ts";
import { gapPct, gapSentence } from "@/lib/pricing.ts";
import { isOfficialPriceFrozen } from "@/lib/market.ts";
import { MIN_BUY_USDC, MAX_BUY_USDC } from "@/lib/constants.ts";
import { useOrders } from "./OrderContext.tsx";

interface BuyQuote { amountOutTokens: number; pricePerToken: number; gasUsd?: number }

/** The chat agent's answer to a trade request: live research plus a prepared order to review. */
export function TradeCard({ intent }: { intent: TradeIntent }) {
  const { prepare, live, market } = useOrders();
  const [quote, setQuote] = useState<BuyQuote | null>(null);
  const [err, setErr] = useState("");

  const buyOk = intent.side === "buy" && intent.usdc >= MIN_BUY_USDC && intent.usdc <= MAX_BUY_USDC;

  useEffect(() => {
    if (intent.side !== "buy" || !buyOk || !live) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/quote?token=${intent.stock.address}&usdc=${intent.usdc}`, { signal: AbortSignal.timeout(20_000) });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !(body.amountOutTokens > 0)) throw new Error(body.error || "I couldn't get a live price right now.");
        setQuote(body);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [intent, buyOk, live]);

  if (intent.side === "unknown-stock") {
    return <div className="bubble assistant">I couldn&apos;t find a tokenized stock called &ldquo;{intent.query}&rdquo;. Try its ticker, like NVDA or GOOGL, or search the list.</div>;
  }
  if (intent.side === "missing-amount") {
    return (
      <div className="bubble assistant">
        How much would you like to {intent.action} of {intent.stock.name}?{" "}
        {intent.action === "buy" ? `For example: "buy $5 of ${intent.stock.ticker}" (from $${MIN_BUY_USDC} to $${MAX_BUY_USDC}).` : `For example: "sell half my ${intent.stock.ticker}" or "sell all my ${intent.stock.ticker}".`}
      </div>
    );
  }
  if (!live) return <div className="bubble assistant">Trading is switched off while Stock Buddy is showing sample data.</div>;

  const s = intent.stock;
  const frozen = isOfficialPriceFrozen(s.navPriceUpdatedAt);

  if (intent.side === "buy") {
    if (!buyOk) return <div className="bubble assistant">Purchases in Stock Buddy are between ${MIN_BUY_USDC} and ${MAX_BUY_USDC}. Try an amount in that range.</div>;
    const gap = quote ? gapPct(quote.pricePerToken, s.navPrice) : undefined;
    return (
      <div className="bubble assistant trade-card">
        <p><strong>Here&apos;s what buying {formatUsd(intent.usdc)} of {s.name} looks like right now.</strong></p>
        {!quote && !err && <p className="muted small">Checking live prices on Base…</p>}
        {err && <p className="error small">{err}</p>}
        {quote && (
          <dl>
            <dt>You&apos;d get about</dt><dd>{quote.amountOutTokens.toLocaleString("en-US", { maximumFractionDigits: 6 })} {s.symbol}</dd>
            <dt>That&apos;s roughly</dt><dd>{(quote.amountOutTokens * s.multiplier).toLocaleString("en-US", { maximumFractionDigits: 6 })} {s.ticker} shares</dd>
            <dt>Trading price</dt><dd>{formatUsd(quote.pricePerToken)}</dd>
            <dt>Official price</dt><dd>{formatUsd(s.navPrice)}{frozen ? " (frozen)" : ""}</dd>
            {quote.gasUsd !== undefined && (<><dt>Network fee</dt><dd>{quote.gasUsd < 0.01 ? "under 1¢" : `≈ ${formatUsd(quote.gasUsd)}`}</dd></>)}
          </dl>
        )}
        {quote && gapSentence(gap, !frozen) && <p className="small">{gapSentence(gap, !frozen)}</p>}
        {market && !market.isOpen && <p className="muted small">{market.label}. {frozen ? "The official price is frozen until it updates again." : ""}</p>}
        <p className="muted small">This isn&apos;t advice. You&apos;ll review the final quote and approve it in your own wallet.</p>
        <button className="btn btn-primary" onClick={() => prepare({ side: "buy", stock: s, usdc: intent.usdc })} disabled={!quote}>
          Review and buy
        </button>
      </div>
    );
  }

  const what = intent.fraction !== undefined
    ? (intent.fraction === 1 ? `all of your ${s.symbol}` : `${Math.round(intent.fraction * 100)}% of your ${s.symbol}`)
    : `${intent.tokens} ${s.symbol}`;
  return (
    <div className="bubble assistant trade-card">
      <p><strong>I&apos;ve prepared a sale of {what}.</strong></p>
      <p className="small">Next you&apos;ll see a live quote: how much USDC you&apos;d get, the network fee, and how the price compares with the official one{frozen ? ", which is frozen right now" : ""}.</p>
      <p className="muted small">This isn&apos;t advice. Nothing happens until you approve it in your own wallet.</p>
      <button className="btn btn-primary" onClick={() => prepare({ side: "sell", stock: s, fraction: intent.fraction, tokens: intent.tokens })}>
        Review and sell
      </button>
    </div>
  );
}
