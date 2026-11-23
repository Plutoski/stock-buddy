"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Stock } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";

/** A trade with Stock Buddy, in the order it happens. */
export function HowItWorks() {
  const steps = [
    { t: "Say what you want", d: `Type "buy $5 of NVIDIA" in the chat, or pick a stock from the list and enter an amount between $1 and $100.` },
    { t: "Stock Buddy checks the price", d: "It gets a live quote on Base, compares it with Coinbase's official price, and checks whether the US market is open." },
    { t: "You see every number", d: "Stock Buddy shows how many tokens you'd get, how many shares that is, the network fee and the price gap, in plain English." },
    { t: "You approve in your wallet", d: "Your wallet asks you to allow exactly the amount you're spending, then to confirm the swap. Stock Buddy never holds your money." },
  ];
  return (
    <section className="band" id="how" aria-labelledby="how-h">
      <div className="wrap">
        <h2 id="how-h">How a trade works</h2>
        <p className="lede">Selling works the same way. Say "sell half my Tesla" and Stock Buddy prepares the sale for you to approve.</p>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.t}><span className="step-n" aria-hidden>{i + 1}</span><h3>{s.t}</h3><p>{s.d}</p></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---- When the official price moves ----
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function nyNow(): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = Math.max(0, DAYS.indexOf(get("weekday")));
  return { day, hour: (Number(get("hour")) % 24) + Number(get("minute")) / 60 };
}

export function PriceWeek({ market }: { market?: MarketStatus }) {
  const [now, setNow] = useState<{ day: number; hour: number } | null>(null);
  useEffect(() => { setNow(nyNow()); const t = setInterval(() => setNow(nyNow()), 60_000); return () => clearInterval(t); }, []);
  const openFrom = (9.5 / 24) * 100, openTo = (16 / 24) * 100;
  return (
    <section className="band band-alt" id="why" aria-labelledby="why-h">
      <div className="wrap split">
        <div>
          <h2 id="why-h">Why the price you pay can differ from the official one</h2>
          <p>Every tokenized stock has an official price that Coinbase publishes. It follows the real share on the US stock market.</p>
          <p>The token itself trades on Base all the time, including nights and weekends. When the US market is closed, the official price stops moving but people keep buying and selling, so the trading price can move away from it.</p>
          <p>Stock Buddy shows you that difference before you buy, in percent and in dollars. It doesn't tell you whether to buy. It makes sure you know what you're paying.</p>
          {market && <p className="status-line"><span className={`dot ${market.isOpen ? "dot-green" : "dot-amber"}`} aria-hidden /> {market.explanation}</p>}
        </div>
        <figure className="week" aria-label="When the official price updates during a week, in New York time">
          <div className="week-grid">
            {DAYS.map((d, i) => {
              const weekend = i >= 5;
              return (
                <div className="week-row" key={d}>
                  <span className="week-day">{d}</span>
                  <span className={`week-bar ${weekend ? "is-weekend" : ""}`}>
                    {!weekend && <span className="week-open" style={{ left: `${openFrom}%`, width: `${openTo - openFrom}%` }} />}
                    {now && now.day === i && <span className="week-now" style={{ left: `${(now.hour / 24) * 100}%` }} title="Now" />}
                  </span>
                </div>
              );
            })}
            <div className="week-row week-axis" aria-hidden><span /><span className="week-ticks"><span>12 AM</span><span>9:30 AM</span><span>4 PM</span><span>12 AM</span></span></div>
          </div>
          <figcaption className="week-key">
            <span><i className="key key-open" /> Official price updating</span>
            <span><i className="key key-night" /> Updates less often</span>
            <span><i className="key key-frozen" /> Frozen</span>
            <span><i className="key key-now" /> Now</span>
          </figcaption>
          <p className="muted tiny">New York time. US market holidays are frozen too.</p>
        </figure>
      </div>
    </section>
  );
}

/** What one token is, using a real token's numbers when we have them. */
export function WhatYouOwn({ stock }: { stock?: Stock }) {
  const ticker = stock?.ticker ?? "NVDA";
  const symbol = stock?.symbol ?? "NVDAc";
  const mult = stock?.multiplier ?? 1;
  const shares = mult.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return (
    <section className="band" id="own" aria-labelledby="own-h">
      <div className="wrap split split-rev">
        <div className="equation" aria-label={`1 ${symbol} equals ${shares} ${ticker} shares`}>
          <div className="eq-side"><span className="eq-num">1</span><span className="eq-unit">{symbol}</span><span className="muted small">token on Base</span></div>
          <span className="eq-sign" aria-hidden>=</span>
          <div className="eq-side"><span className="eq-num">{shares}</span><span className="eq-unit">{ticker} shares</span><span className="muted small">today's multiplier</span></div>
        </div>
        <div>
          <h2 id="own-h">What you own when you buy</h2>
          <p>Coinbase issues a token for each stock on Base. The token's name ends in a small "c", so NVIDIA's is {symbol}. You can buy part of a token, so $1 is enough to start.</p>
          <p>One token tracks a set number of shares, called the multiplier. When the company pays a dividend, the multiplier grows a little instead of cash arriving in your wallet. Stock splits change it too. The official price is the share price times the multiplier.</p>
          <p>Your tokens stay in your own wallet, like any other token on Base. To turn them back into dollars, you sell them for USDC.</p>
        </div>
      </div>
    </section>
  );
}

export function Safety() {
  const items = [
    { t: "Stock Buddy never holds your money", d: "Trades go straight from your wallet to KyberSwap on Base. Stock Buddy has no account for you and no access to your funds." },
    { t: "Exact approvals only", d: "Your wallet is asked to allow the exact amount of this one trade, never an unlimited amount." },
    { t: "Small amounts", d: "Purchases are limited to $1 to $100, checked in the app and on the server." },
    { t: "No financial advice", d: "Ask whether to buy and Stock Buddy says it can't tell you. It explains prices, gaps and market hours instead." },
    { t: "Every trade is public", d: "Every trade made through Stock Buddy is checked on the Base blockchain and listed with a Basescan link." },
  ];
  return (
    <section className="band band-alt" id="safety" aria-labelledby="safety-h">
      <div className="wrap">
        <h2 id="safety-h">Your money stays in your wallet</h2>
        <ul className="facts-grid">
          {items.map((i) => <li key={i.t}><h3>{i.t}</h3><p>{i.d}</p></li>)}
        </ul>
      </div>
    </section>
  );
}

export function ProofStrip() {
  const { data } = useQuery<{ configured?: boolean; purchases?: number; sales?: number; wallets?: number }>({
    queryKey: ["proof-summary"],
    queryFn: async () => (await fetch("/api/proof", { signal: AbortSignal.timeout(10_000) })).json(),
    staleTime: 60_000,
  });
  const trades = (data?.purchases ?? 0) + (data?.sales ?? 0);
  return (
    <section className="band" aria-labelledby="proof-h">
      <div className="wrap proof-strip">
        <div>
          <h2 id="proof-h">Every trade is checked on Base</h2>
          <p>Stock Buddy reads each trade back from the Base blockchain before it counts it. The builder's own wallets are left out.</p>
        </div>
        {data?.configured && trades > 0 ? (
          <dl className="proof-nums">
            <div><dt>Verified trades</dt><dd>{trades}</dd></div>
            <div><dt>Wallets</dt><dd>{data.wallets}</dd></div>
          </dl>
        ) : null}
        <a className="btn btn-ghost" href="/proof">See verified trades</a>
      </div>
    </section>
  );
}

export function Faq() {
  const qs = [
    { q: "Who can use Stock Buddy?", a: "Coinbase tokenized stocks are for eligible people outside the United States, and some countries are excluded. Check that you're eligible before you buy. Stock Buddy asks you to confirm this on your first visit." },
    { q: "What do I need to start?", a: "A wallet on Base with at least $1 of USDC. If you don't have a wallet, choose Base Account when you connect: it creates one with a passkey in a few seconds. Most wallets also need a few cents of ETH on Base for network fees." },
    { q: "How do I get USDC on Base?", a: "Buy USDC on an exchange you already use, then withdraw it to your wallet address and choose the Base network. The buy panel walks you through it and lets you copy your address." },
    { q: "What does it cost?", a: "Stock Buddy charges nothing. You pay the network fee, usually under one cent, and the trading price on Base, which can be above or below the official price. Stock Buddy shows both before you approve." },
    { q: "Can I sell later?", a: "Yes. Open the stock, choose Sell, and pick 25%, 50%, all, or an exact amount. You get USDC back in the same wallet." },
    { q: "Does Stock Buddy tell me what to buy?", a: "No. It explains what a token is, what it costs right now and how the price gap works. Decisions are yours, and prices can go down as well as up." },
    { q: "Is the chat an AI?", a: `The chat understands requests like "buy $5 of Apple" and "sell all my Tesla", gets live prices, and prepares the order. It answers common questions with fixed answers written in advance, so it doesn't make things up.` },
  ];
  return (
    <section className="band band-alt" id="faq" aria-labelledby="faq-h">
      <div className="wrap faq">
        <h2 id="faq-h">Questions</h2>
        {qs.map((x) => (
          <details key={x.q}><summary>{x.q}</summary><p>{x.a}</p></details>
        ))}
      </div>
    </section>
  );
}
