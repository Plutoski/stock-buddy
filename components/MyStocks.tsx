"use client";

import { erc20Abi, formatUnits } from "viem";
import { base } from "wagmi/chains";
import { useAccount, useReadContracts } from "wagmi";
import type { Stock } from "@/lib/types.ts";
import type { LivePrice } from "@/lib/pricing.ts";
import { formatUsd } from "@/lib/explain.ts";
import { StockIcon } from "./StockList.tsx";

export interface Holding { stock: Stock; tokens: number; shares: number; value?: number }

/** Reads the connected wallet's balance of every Coinbase tokenized stock in one batched call. */
export function useHoldings(stocks: Stock[], prices: Map<string, LivePrice>): { holdings: Holding[]; loading: boolean; failed: boolean; refetch: () => void } {
  const { address } = useAccount();
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: address ? stocks.map((s) => ({ address: s.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [address] as const, chainId: base.id })) : [],
    query: { enabled: !!address && stocks.length > 0, refetchInterval: 60_000 },
  });
  const holdings: Holding[] = [];
  data?.forEach((r, i) => {
    if (r.status !== "success" || typeof r.result !== "bigint" || r.result === 0n) return;
    const stock = stocks[i];
    const tokens = Number(formatUnits(r.result, stock.decimals));
    const price = prices.get(stock.address.toLowerCase())?.tradingPrice ?? stock.navPrice;
    holdings.push({ stock, tokens, shares: tokens * stock.multiplier, value: price !== undefined ? tokens * price : undefined });
  });
  holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  // If the wallet read failed (or most balances came back as errors), don't claim the wallet is empty.
  const errors = data?.filter((r) => r.status !== "success").length ?? 0;
  const failed = !!address && (isError || (!!data && data.length > 0 && errors > data.length / 2));
  return { holdings, loading: !!address && isLoading, failed, refetch: () => { refetch(); } };
}

const fmtAmount = (n: number) => n > 0 && n < 0.0001 ? "<0.0001" : n.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function MyStocks({ stocks, prices, onOpen }: { stocks: Stock[]; prices: Map<string, LivePrice>; onOpen: (s: Stock) => void }) {
  const { isConnected } = useAccount();
  const { holdings, loading, failed, refetch } = useHoldings(stocks, prices);
  if (!isConnected) return null;
  const total = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);

  return (
    <section className="card" aria-label="My stocks">
      <div className="chat-head">
        <h3>My stocks</h3>
        {holdings.length > 0 && <span className="muted small">≈ {formatUsd(total)}</span>}
      </div>
      {loading && <p className="muted small">Checking your wallet…</p>}
      {!loading && failed && holdings.length === 0 && (
        <p className="error small">Couldn&apos;t check your wallet just now. <button className="btn btn-link" onClick={refetch}>Try again</button></p>
      )}
      {!loading && !failed && holdings.length === 0 && <p className="muted small">No tokenized stocks in this wallet yet. Pick a company to buy your first one.</p>}
      {holdings.length > 0 && (
        <ul className="holdings">
          {holdings.map((h) => (
            <li key={h.stock.address}>
              <button className="stock-row" onClick={() => onOpen(h.stock)}>
                <StockIcon stock={h.stock} />
                <span className="stock-name">
                  <strong>{h.stock.ticker}</strong>
                  <span className="muted small">{fmtAmount(h.tokens)} {h.stock.symbol} ≈ {fmtAmount(h.shares)} shares</span>
                </span>
                <span className="stock-price"><strong>{h.value !== undefined ? (h.value > 0 && h.value < 0.01 ? "<$0.01" : formatUsd(h.value)) : <span className="muted small">No price yet</span>}</strong><span className="muted tiny">Buy or sell</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted tiny">Values use the live trading price on Base, or the official price if there&apos;s no live price.</p>
    </section>
  );
}
