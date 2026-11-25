"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Stock, StocksResponse } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";
import { ConnectButton } from "@/components/ConnectButton.tsx";
import { EligibilityGate } from "@/components/EligibilityGate.tsx";
import { StockList } from "@/components/StockList.tsx";
import { StockDetail } from "@/components/StockDetail.tsx";
import { Chat } from "@/components/Chat.tsx";
import { MyStocks } from "@/components/MyStocks.tsx";
import { Logo } from "@/components/Logo.tsx";
import { GapMeter } from "@/components/landing/GapMeter.tsx";
import { HowItWorks, PriceWeek, WhatYouOwn, Safety, ProofStrip, Faq } from "@/components/landing/Explainers.tsx";
import { OrderContext, type PreparedOrder } from "@/components/OrderContext.tsx";
import type { LivePrice } from "@/lib/pricing.ts";
import { rememberRef } from "@/lib/referral.ts";

type Data = StocksResponse & { market: MarketStatus };

export default function Home() {
  const { data, isLoading, isError, refetch } = useQuery<Data>({
    queryKey: ["stocks"],
    queryFn: async () => {
      const res = await fetch("/api/stocks", { signal: AbortSignal.timeout(20_000) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !Array.isArray(body.stocks) || !body.market) throw new Error("Failed to load stocks");
      return body;
    },
    refetchInterval: 60_000,
  });
  const [selected, setSelected] = useState<Stock | null>(null);
  const [openTab, setOpenTab] = useState<"buy" | "sell">("buy");
  const [order, setOrder] = useState<(PreparedOrder & { n: number }) | null>(null);

  // Live trading prices for the biggest stocks (refreshed every 90s).
  const live = data?.source === "live";
  const fetchPrices = async (url: string): Promise<{ prices: LivePrice[] }> => {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || !Array.isArray(body.prices)) throw new Error("prices unavailable");
    return { prices: body.prices.filter((p: LivePrice) => p && typeof p.address === "string" && Number.isFinite(p.tradingPrice)) };
  };
  const { data: topPrices, isLoading: topLoading } = useQuery<{ prices: LivePrice[] }>({
    queryKey: ["prices", "top"],
    queryFn: () => fetchPrices("/api/prices"),
    // Start straight away, alongside the stock list, instead of waiting for it. (Prices are only shown for live data.)
    enabled: !data || live,
    retry: 1,
    refetchInterval: 90_000,
  });
  // Plus the selected stock, if it isn't one of the top ones.
  const selectedAddr = selected?.address;
  const inTop = !!topPrices?.prices.some((p) => p.address.toLowerCase() === selectedAddr?.toLowerCase());
  const { data: selPrice, isLoading: selLoading } = useQuery<{ prices: LivePrice[] }>({
    queryKey: ["prices", selectedAddr],
    queryFn: () => fetchPrices(`/api/prices?tokens=${selectedAddr}`),
    enabled: live && !!selectedAddr && !topLoading && !inTop,
    retry: 1,
    refetchInterval: 90_000,
  });
  const priceMap = new Map<string, LivePrice>();
  for (const p of [...(topPrices?.prices || []), ...(selPrice?.prices || [])]) priceMap.set(p.address.toLowerCase(), p);

  // Shared links (/s/NVDA?r=…) arrive as /?s=NVDA&r=…: remember who shared it and open that stock.
  const wanted = useRef<string | null>(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      rememberRef(q.get("r"));
      wanted.current = q.get("s")?.toUpperCase() || null;
      if (q.has("s") || q.has("r")) window.history.replaceState(null, "", window.location.pathname);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!wanted.current || !data) return;
    const hit = data.stocks.find((s) => s.ticker === wanted.current || s.symbol.toUpperCase() === wanted.current);
    wanted.current = null;
    if (hit) setSelected(hit);
  }, [data]);

  // Keep the selected stock fresh when data refreshes.
  useEffect(() => {
    if (selected && data) {
      const fresh = data.stocks.find((s) => s.address === selected.address);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [data, selected]);

  // On phones the detail view replaces the list; scroll to top when switching.
  function choose(s: Stock | null, tab: "buy" | "sell" = "buy") {
    setOrder(null);
    setOpenTab(tab);
    setSelected(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  const market = data?.market;
  // The chat agent prepared an order: open that stock's Buy or Sell tab, pre-filled, quote fetched.
  const lastPrepare = useRef(0);
  function prepare(o: PreparedOrder) {
    // A double tap on "Review" must not land a second click on the panel that just opened.
    if (Date.now() - lastPrepare.current < 800) return;
    lastPrepare.current = Date.now();
    setOpenTab(o.side);
    setSelected(o.stock);
    setOrder({ ...o, n: Date.now() }); // the stock page scrolls to the prepared order itself
  }

  const top = data?.stocks.find((s) => s.ticker === "NVDA") ?? data?.stocks[0];

  return (
    <OrderContext.Provider value={{ stocks: data?.stocks ?? [], market, live, prepare, open: (s) => choose(s) }}>
      <EligibilityGate />
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); choose(null); }}>
          <Logo size={30} /> <span>Stock Buddy</span>
        </a>
        <nav className="nav" aria-label="Sections">
          <a href="/#how" onClick={() => setSelected(null)}>How it works</a>
          <a href="/#why" onClick={() => setSelected(null)}>Price gaps</a>
          <a href="/proof">Proof</a>
          <a href="/log">Build log</a>
        </nav>
        <ConnectButton />
      </header>

      {data?.source === "sample" && <div className="banner banner-warn">{data.note}</div>}

      <main>
      {!selected && (
        <section className="hero" aria-label="Introduction">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <h1>Buy tokenized stocks on Base from $1. See the price gap before you pay.</h1>
              <p className="hero-lede">
                Stock Buddy helps first-time buyers use Coinbase's tokenized stocks on Base. Tell it what you want to buy or sell.
                It compares the live price with the official price and explains the difference in plain English. Then it prepares the trade, and you approve it in your own wallet.
              </p>
              <div className="row hero-cta">
                <a className="btn btn-primary btn-lg" href="#stocks">Browse stocks</a>
                <a className="btn btn-ghost btn-lg" href="#ask" onClick={() => setTimeout(() => (document.querySelector("#ask input") as HTMLInputElement | null)?.focus(), 300)}>Ask Stock Buddy</a>
              </div>
              <p className="muted small">Stock Buddy is free. Your money stays in your wallet until you approve a trade. This is not financial advice.</p>
            </div>
            {live && data ? (
              <GapMeter stocks={data.stocks} prices={priceMap} market={market} onOpen={(s) => choose(s)} />
            ) : isLoading ? (
              <GapMeter stocks={[]} prices={priceMap} market={market} onOpen={() => {}} />
            ) : null}
          </div>
        </section>
      )}

      <div id="stocks" className={`layout ${selected ? "has-selection" : "is-home"}`}>
        <aside className="sidebar">
          {!selected && (
            <div className="section-head">
              <h2>Stocks you can buy</h2>
              {market && (
                <p className="status-line small">
                  <span className={`dot ${market.isOpen ? "dot-green" : "dot-amber"}`} aria-hidden />
                  {market.label}. {market.isOpen ? "Official prices are updating." : "Official prices are frozen. Trading on Base continues."}{" "}
                  <span className="muted">{market.nextChangeLabel} {new Date(market.nextChangeAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} your time.</span>
                </p>
              )}
            </div>
          )}
          {isLoading && <p className="muted">Loading stocks…</p>}
          {isError && (
            <p className="error">Couldn't load the stock list. <button className="btn btn-link" onClick={() => refetch()}>Try again</button></p>
          )}
          {data && live && selected && <MyStocks stocks={data.stocks} prices={priceMap} onOpen={(s) => choose(s, "sell")} />}
          {data && <StockList stocks={data.stocks} selected={selected?.address} onSelect={(s) => choose(s)} prices={priceMap} />}
        </aside>

        <section className="content">
          {selected && market ? (
            <StockDetail key={selected.address + openTab + (order?.n ?? "")} initialTab={openTab}
              order={order && order.stock.address === selected.address ? order : undefined} stock={selected} market={market} liveData={live} onBack={() => choose(null)}
              livePrice={priceMap.get(selected.address.toLowerCase())} priceLoading={live && (topLoading || selLoading)} />
          ) : (
            <div className="welcome" id="ask">
              {data && live && <MyStocks stocks={data.stocks} prices={priceMap} onOpen={(s) => choose(s, "sell")} />}
              <Chat />
            </div>
          )}
        </section>
      </div>

      {!selected && (
        <>
          <HowItWorks />
          <PriceWeek market={market} />
          <WhatYouOwn stock={top} />
          <Safety />
          <ProofStrip />
          <Faq />
        </>
      )}
      </main>

      <footer className="footer">
        <div className="wrap footer-grid">
          <div>
            <a className="brand" href="/"><Logo size={26} /> <span>Stock Buddy</span></a>
            <p className="muted small">Built for Base Stocks Maxxing by AJ. The code is public on <a href="https://github.com/Plutoski/stock-buddy" target="_blank" rel="noreferrer">GitHub</a>.</p>
          </div>
          <p className="muted small">
            Stock Buddy is an educational tool. It is not a broker or a financial adviser. Coinbase tokenized stocks are only for eligible people outside the United States.
            Prices can go down as well as up. Prices come from Coinbase and KyberSwap; trades settle on Base.
          </p>
          <nav className="footer-links" aria-label="Footer">
            <a href="/proof">Verified trades</a>
            <a href="/log">Build log</a>
            <a href="/#faq">Questions</a>
            <a href="https://docs.base.org" target="_blank" rel="noreferrer">About Base</a>
          </nav>
        </div>
      </footer>
    </OrderContext.Provider>
  );
}
