"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProofRecord } from "@/lib/proof.ts";
import { BASESCAN_TX } from "@/lib/constants.ts";

interface ProofData {
  configured: boolean;
  purchases: number;
  sales?: number;
  usdcReceived?: number;
  wallets: number;
  usdcTotal: number;
  records: ProofRecord[];
  excludedWallets: number;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function ProofPage() {
  const { data, isLoading, isError, refetch } = useQuery<ProofData>({
    queryKey: ["proof"],
    queryFn: async () => {
      const res = await fetch("/api/proof", { signal: AbortSignal.timeout(15_000) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !Array.isArray(body.records)) throw new Error("unavailable");
      return body;
    },
    refetchInterval: 60_000,
  });

  const [hashInput, setHash] = useState("");
  // Accept a bare hash or a whole Basescan link.
  const hash = (hashInput.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? hashInput).trim();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function addPurchase(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setMsg(null);
    try {
      const res = await fetch("/api/proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash: hash.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't check that transaction.");
      setMsg({ ok: true, text: body.already ? "That trade is already on the list." : "Verified and added. Thank you!" });
      setHash(""); refetch();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/"><span className="logo" aria-hidden>SB</span> Stock Buddy</a>
        <a className="btn btn-ghost" href="/">Back to stocks</a>
      </header>
      <main className="layout proof">
        <section>
          <h1>Proof of real trades</h1>
          <p className="muted">
            Every trade below was checked directly on the Base blockchain. A trade counts only if the transaction succeeded,
            went through KyberSwap, swapped USDC for a Coinbase tokenized stock (or back), and was made through Stock Buddy.
            The builder&apos;s own wallets are left out of the numbers.
          </p>

          {isLoading && <p className="muted">Loading trades…</p>}
          {isError && <p className="error">Couldn&apos;t load the list right now. <button className="btn btn-link" onClick={() => refetch()}>Try again</button></p>}
          {data && !data.configured && <p className="card">The trade log is being set up. Check back soon.</p>}

          {data && data.configured && (
            <>
              <div className="card facts">
                <div className="fact"><span className="muted small">Verified purchases</span><strong className="big">{data.purchases}</strong></div>
                <div className="fact"><span className="muted small">Unique wallets</span><strong className="big">{data.wallets}</strong></div>
                <div className="fact"><span className="muted small">Verified sales</span><strong className="big">{data.sales ?? 0}</strong></div>
                <div className="fact"><span className="muted small">USDC spent on purchases</span><strong className="big">{money(data.usdcTotal)}</strong></div>
              </div>
              {data.excludedWallets > 0 && (
                <p className="muted small">{data.excludedWallets} builder wallet{data.excludedWallets === 1 ? " is" : "s are"} excluded from these numbers.</p>
              )}

              <section className="card">
                <h3>Trades</h3>
                {data.records.length === 0 ? (
                  <p className="muted">No trades yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="proof-table">
                      <thead><tr><th>Wallet</th><th>Type</th><th>Stock</th><th>Amount</th><th>USDC</th><th>Receipt</th></tr></thead>
                      <tbody>
                        {data.records.map((r) => (
                          <tr key={r.hash}>
                            <td className="mono">{short(r.wallet)}</td>
                            <td>{r.side === "sell" ? "Sell" : "Buy"}</td>
                            <td>{r.symbol}</td>
                            <td>{r.tokens.toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                            <td>{r.side === "sell" ? (r.usdcReceived !== undefined ? money(r.usdcReceived) : "–") : (r.usdcPaid !== undefined ? money(r.usdcPaid) : "–")}</td>
                            <td><a href={BASESCAN_TX + r.hash} target="_blank" rel="noreferrer">Basescan ↗</a></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          <section className="card">
            <h3>Traded through Stock Buddy but not listed?</h3>
            <p className="muted small">Paste your transaction hash or Basescan link. We&apos;ll check it on the blockchain before adding it.</p>
            <form className="chat-input" onSubmit={addPurchase}>
              <input value={hashInput} onChange={(e) => setHash(e.target.value)} placeholder="0x… or a Basescan link" aria-label="Transaction hash or Basescan link" spellCheck={false} />
              <button className="btn btn-primary" type="submit" disabled={sending || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())}>
                {sending ? "Checking…" : "Verify"}
              </button>
            </form>
            {msg && <p className={`small ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
          </section>
        </section>
      </main>
    </>
  );
}
