"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Stock, StocksResponse } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";
import { ConnectButton } from "@/components/ConnectButton.tsx";
import { EligibilityGate } from "@/components/EligibilityGate.tsx";
import { StockList } from "@/components/StockList.tsx";
import { StockDetail } from "@/components/StockDetail.tsx";
import { Chat } from "@/components/Chat.tsx";

type Data = StocksResponse & { market: MarketStatus };

export default function Home() {
  const { data, isLoading, isError, refetch } = useQuery<Data>({
    queryKey: ["stocks"],
    queryFn: async () => {
      const res = await fetch("/api/stocks");
      if (!res.ok) throw new Error("Failed to load stocks");
      return res.json();
    },
    refetchInterval: 60_000,
  });
  const [selected, setSelected] = useState<Stock | null>(null);

  // Keep the selected stock fresh when data refreshes.
  useEffect(() => {
    if (selected && data) {
      const fresh = data.stocks.find((s) => s.address === selected.address);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [data, selected]);

  // On phones the detail view replaces the list; scroll to top when switching.
  function choose(s: Stock | null) {
    setSelected(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  const market = data?.market;

  return (
    <>
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
          <strong>{market.label}.</strong> {market.isOpen ? "Official prices are updating." : "Official prices are frozen; trading on Base continues 24/7."}{" "}
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
          {data && <StockList stocks={data.stocks} selected={selected?.address} onSelect={choose} />}
        </aside>

        <section className="content">
          {selected && market ? (
            <StockDetail stock={selected} market={market} liveData={data?.source === "live"} onBack={() => choose(null)} />
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
        Prices can go down as well as up. Built for Base Stocks Maxxing.
      </footer>
    </>
  );
}
