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
    enabled: live,
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

  return (
    <OrderContext.Provider value={{ stocks: data?.stocks ?? [], market, live, prepare }}>
      <EligibilityGate />
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); choose(null); }}>
          <span className="logo" aria-hidden>SB</span> Stock Buddy
        </a>
        <ConnectButton />
      </header>

      {data?.source === "sample" && <div className="banner banner-warn">{data.note}</div>}

      {market && (
        <div className={`banner ${market.isOpen ? "banner-ok" : "banner-info"}`}>
          <strong>{market.label}.</strong> {market.isOpen ? "Official prices are updating." : market.state === "closed-overnight" ? "Official prices may update less often. Trading on Base continues 24/7." : "Official prices are frozen. Trading on Base continues 24/7."}{" "}
          <span className="muted">
            {market.nextChangeLabel} {new Date(market.nextChangeAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })} your time.
          </span>
        </div>
      )}

      <main className={`layout ${selected ? "has-selection" : ""}`}>
        <aside className="sidebar">
          {!selected && (
            <section className="hero">
              <h1>Real stocks on Base, explained simply.</h1>
              <p className="muted">
                Pick a company to see what one token really stands for, why its price can drift when markets close, and what a purchase would cost. No jargon, no advice.
              </p>
            </section>
          )}
          {isLoading && <p className="muted">Loading stocks…</p>}
          {isError && (
            <p className="error">Couldn't load stocks. <button className="btn btn-link" onClick={() => refetch()}>Try again</button></p>
          )}
          {data && live && <MyStocks stocks={data.stocks} prices={priceMap} onOpen={(s) => choose(s, "sell")} />}
          {data && <StockList stocks={data.stocks} selected={selected?.address} onSelect={(s) => choose(s)} prices={priceMap} />}
        </aside>

        <section className="content">
          {selected && market ? (
            <StockDetail key={selected.address + openTab + (order?.n ?? "")} initialTab={openTab}
              order={order && order.stock.address === selected.address ? order : undefined} stock={selected} market={market} liveData={live} onBack={() => choose(null)}
              livePrice={priceMap.get(selected.address.toLowerCase())} priceLoading={live && (topLoading || selLoading)} />
          ) : (
            <div className="welcome">
              {market && <p className="card">{market.explanation}</p>}
              <Chat />
            </div>
          )}
        </section>
      </main>

      <footer className="footer muted small">
        Stock Buddy is an educational tool, not a broker or financial adviser. Coinbase tokenized stocks are available only to eligible people outside the United States.
        Prices can go down as well as up. Built for Base Stocks Maxxing. <a href="/proof">See verified trades</a>.
      </footer>
    </OrderContext.Provider>
  );
}
