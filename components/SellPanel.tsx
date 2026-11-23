"use client";

import { useEffect, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { base } from "wagmi/chains";
import { useAccount, useReadContract, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from "wagmi";
import type { Stock } from "@/lib/types.ts";
import { BASESCAN_TX } from "@/lib/constants.ts";
import { withAttribution } from "@/lib/attribution.ts";
import { formatUsd } from "@/lib/explain.ts";
import { gapPct, sellGapSentence } from "@/lib/pricing.ts";
import { ConnectButton, friendlyError } from "./ConnectButton.tsx";

type Step = "idle" | "quoting" | "quoted" | "approving" | "building" | "selling" | "done";

interface SellQuote {
  amountIn: string;
  amountOut: string;
  tokensIn: number;
  usdcOut: number;
  pricePerToken: number;
  gasUsd?: number;
  routerAddress: `0x${string}`;
  routeSummary: unknown;
}

const fmtTokens = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

export function SellPanel({ stock, liveData, presetFraction, presetTokens }: { stock: Stock; liveData: boolean; presetFraction?: number; presetTokens?: number }) {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain, switchChainAsync, isPending: switching } = useSwitchChain();
  const onBase = walletChainId === base.id;
  const ensureBase = async () => { if (!onBase) await switchChainAsync({ chainId: base.id }); };

  const [amount, setAmount] = useState(presetTokens !== undefined ? String(presetTokens) : "");
  const preset = useRef(presetFraction !== undefined || presetTokens !== undefined);
  const pendingFraction = useRef(presetFraction);
  const [quote, setQuote] = useState<SellQuote | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [agree, setAgree] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [proofState, setProofState] = useState<"idle" | "saved" | "failed">("idle");
  const busy = useRef(false);
  const quoteSeq = useRef(0);
  const { sendTransactionAsync } = useSendTransaction();

  const { data: rawBalance, refetch: refetchBalance } = useReadContract({
    address: stock.address, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: base.id, query: { enabled: !!address },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: stock.address, abi: erc20Abi, functionName: "allowance",
    args: address && quote ? [address, quote.routerAddress] : undefined, chainId: base.id,
    query: { enabled: !!address && !!quote },
  });
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash, chainId: base.id });
  const sellReceipt = useWaitForTransactionReceipt({ hash: txHash, chainId: base.id });

  useEffect(() => {
    quoteSeq.current++;
    if (step === "quoted" || step === "quoting") { setQuote(null); setStep("idle"); }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [amount]);
  // Orders prepared by the chat agent: fill in the amount once the balance is known, then fetch the quote.
  useEffect(() => {
    if (pendingFraction.current === undefined || rawBalance === undefined) return;
    const f = pendingFraction.current; pendingFraction.current = undefined;
    const part = f >= 1 ? rawBalance : (rawBalance * BigInt(Math.round(f * 10000))) / 10000n;
    if (part > 0n) setAmount(formatUnits(part, stock.decimals));
    else preset.current = false;
  }, [rawBalance, stock.decimals]);
  useEffect(() => {
    if (!preset.current || pendingFraction.current !== undefined || !liveData || !isConnected || !onBase || step !== "idle" || quote || !amount) return;
    preset.current = false;
    getQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, liveData, isConnected, onBase, step, quote]);
  useEffect(() => { if (approveReceipt.isSuccess) { refetchAllowance(); setStep("quoted"); } }, [approveReceipt.isSuccess, refetchAllowance]);
  useEffect(() => {
    if (approveReceipt.isError || (approveReceipt.data && approveReceipt.data.status === "reverted")) {
      setError("The approval didn't go through. Nothing was sold. Please try again.");
      setApproveHash(undefined); setStep("quoted");
    }
  }, [approveReceipt.isError, approveReceipt.data]);
  useEffect(() => { if (sellReceipt.isSuccess) { setStep("done"); refetchBalance(); } }, [sellReceipt.isSuccess, refetchBalance]);
  useEffect(() => {
    if (sellReceipt.data && sellReceipt.data.status === "reverted") {
      setError("The sale didn't go through, so you still have your tokens. Prices may have moved. Get a new quote and try again.");
      setStep("idle"); setQuote(null);
    } else if (sellReceipt.isError) {
      setError("We couldn't confirm the result yet. Check your receipt on Basescan before trying again.");
    }
  }, [sellReceipt.isError, sellReceipt.data]);
  // Record the sale on the public /proof page after the server checks it onchain.
  useEffect(() => {
    if (!sellReceipt.isSuccess || !txHash) return;
    let cancelled = false;
    (async () => {
      for (const wait of [1500, 5000, 15000]) {
        await new Promise((r) => setTimeout(r, wait));
        if (cancelled) return;
        try {
          const res = await fetch("/api/proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash: txHash }) });
          if (res.ok) { setProofState("saved"); return; }
          if (res.status === 422 || res.status === 400) break;
        } catch { /* try again */ }
      }
      if (!cancelled) setProofState("failed");
    })();
    return () => { cancelled = true; };
  }, [sellReceipt.isSuccess, txHash]);

  if (!liveData) {
    return <section className="card"><h3>Sell {stock.symbol}</h3><p className="muted">Selling is switched off while Stock Buddy is showing sample data.</p></section>;
  }

  const held = rawBalance !== undefined ? Number(formatUnits(rawBalance, stock.decimals)) : undefined;
  let units = 0n;
  try { units = amount ? parseUnits(amount, stock.decimals) : 0n; } catch { units = 0n; }
  const tooMuch = rawBalance !== undefined && units > rawBalance;
  const amountValid = units > 0n && !tooMuch;
  const needsApproval = quote && allowance !== undefined ? allowance < BigInt(quote.amountIn) : true;
  const gap = quote ? gapPct(quote.pricePerToken, stock.navPrice) : undefined;
  const gapText = sellGapSentence(gap);
  const locked = step === "quoting" || (!!quote && step !== "quoted");

  function setFraction(f: number) {
    if (!rawBalance) return;
    const part = f === 1 ? rawBalance : (rawBalance * BigInt(Math.round(f * 100))) / 100n;
    setAmount(formatUnits(part, stock.decimals));
  }

  async function getQuote() {
    const seq = ++quoteSeq.current;
    setError(""); setQuote(null); setStep("quoting");
    try {
      const res = await fetch(`/api/sell-quote?token=${stock.address}&units=${units.toString()}`, { signal: AbortSignal.timeout(20_000) });
      const body = await res.json().catch(() => ({}));
      if (seq !== quoteSeq.current) return;
      if (!res.ok) throw new Error(body.error || "The price service is busy. Please try again in a moment.");
      const ok = typeof body.amountIn === "string" && body.amountIn === units.toString() && body.usdcOut > 0
        && typeof body.routerAddress === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.routerAddress);
      if (!ok) throw new Error("The price service sent an unexpected answer. Please try again.");
      setQuote(body as SellQuote); setStep("quoted");
    } catch (e) {
      if (seq !== quoteSeq.current) return;
      setError((e as Error).name === "TimeoutError" ? "Getting a price took too long. Please try again." : (e as Error).message);
      setStep("idle");
    }
  }

  async function approve() {
    if (!quote || busy.current) return;
    busy.current = true; setError(""); setStep("approving");
    try {
      await ensureBase();
      // Approve ONLY the exact number of tokens being sold, never unlimited.
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.routerAddress, BigInt(quote.amountIn)] });
      setApproveHash(await sendTransactionAsync({ to: stock.address, data: withAttribution(data), chainId: base.id }));
    } catch (e) {
      setError(friendlyError((e as Error).message)); setStep("quoted");
    } finally { busy.current = false; }
  }

  async function sell() {
    if (!quote || !address || busy.current) return;
    busy.current = true; setError(""); setStep("building");
    try {
      const res = await fetch("/api/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ routeSummary: quote.routeSummary, sender: address }) });
      const tx = await res.json().catch(() => ({}));
      if (!res.ok || !tx.to || !tx.data) throw new Error(tx.error || "Couldn't prepare the sale. Please get a new quote.");
      if (tx.to.toLowerCase() !== quote.routerAddress.toLowerCase()) throw new Error("Safety check failed: the swap address changed. Please get a new quote.");
      setStep("selling");
      await ensureBase();
      setTxHash(await sendTransactionAsync({ to: tx.to, data: withAttribution(tx.data), value: BigInt(tx.value || 0), chainId: base.id }));
    } catch (e) {
      setError(friendlyError((e as Error).message)); setStep("quoted");
    } finally { busy.current = false; }
  }

  return (
    <section className="card buy" aria-label={`Sell ${stock.symbol}`}>
      <h3>Sell {stock.symbol}</h3>
      {!isConnected ? (
        <><p className="muted">Connect the wallet that holds your {stock.symbol} to sell it for USDC.</p><ConnectButton /></>
      ) : !onBase ? (
        <>
          <p className="muted small">Your wallet is on a different network. Stock Buddy only works on Base.</p>
          <button className="btn btn-primary" onClick={() => switchChain({ chainId: base.id })} disabled={switching}>{switching ? "Switching…" : "Switch to Base network"}</button>
        </>
      ) : step === "done" && txHash ? (
        <div className="success">
          <p><strong>Sold!</strong> You received about {formatUsd(quote?.usdcOut)} USDC.</p>
          <p className="small"><a href={BASESCAN_TX + txHash} target="_blank" rel="noreferrer">View your receipt on Basescan ↗</a></p>
          {proofState === "saved" && <p className="small">Verified and added to the <a href="/proof">public list</a>.</p>}
          {proofState === "failed" && <p className="small muted">We couldn&apos;t add it to the <a href="/proof">public list</a> yet. You can paste your receipt link there later.</p>}
          <button className="btn btn-ghost" onClick={() => { setStep("idle"); setQuote(null); setTxHash(undefined); setApproveHash(undefined); setAgree(false); setAmount(""); }}>Done</button>
        </div>
      ) : held !== undefined && held === 0 ? (
        <p className="muted">You don&apos;t hold any {stock.symbol} in this wallet yet.</p>
      ) : (
        <>
          {held !== undefined && (
            <p className="muted small">You hold {fmtTokens(held)} {stock.symbol} (about {fmtTokens(held * stock.multiplier)} {stock.ticker} shares).</p>
          )}
          <label className="field">
            <span>Amount of {stock.symbol} to sell</span>
            <div className="amount">
              <input inputMode="decimal" value={amount} placeholder="0.0" aria-label={`Amount of ${stock.symbol} to sell`} disabled={locked}
                onChange={(e) => { const v = e.target.value.trim(); if (/^\d*(\.\d{0,8})?$/.test(v)) setAmount(v); }} />
              <span className="muted small">{stock.symbol}</span>
            </div>
          </label>
          <div className="chips">
            {[[0.25, "25%"], [0.5, "50%"], [1, "All"]].map(([f, label]) => (
              <button key={label} className="chip" onClick={() => setFraction(f as number)} disabled={locked || !rawBalance}>{label}</button>
            ))}
          </div>
          {tooMuch && <p className="error small">That&apos;s more than you hold.</p>}

          {!quote && (
            <button className="btn btn-primary btn-block" onClick={getQuote} disabled={!amountValid || step === "quoting"}>
              {step === "quoting" ? "Getting the best price…" : "See what I'd get"}
            </button>
          )}

          {quote && (
            <div className="quote">
              <dl>
                <dt>You sell</dt><dd>{fmtTokens(quote.tokensIn)} {stock.symbol}</dd>
                <dt>You get (about)</dt><dd>{formatUsd(quote.usdcOut)} USDC</dd>
                <dt>Price per token</dt><dd>{formatUsd(quote.pricePerToken)}</dd>
                <dt>Official reference</dt><dd>{formatUsd(stock.navPrice)} per token</dd>
                {quote.gasUsd !== undefined && (<><dt>Network fee (est.)</dt><dd>{formatUsd(quote.gasUsd)}</dd></>)}
              </dl>
              {gapText && <p className="warn small">{gapText}</p>}
              <p className="muted small">Max price movement allowed: 0.5%. If the price moves more, the sale cancels and you keep your tokens.</p>
              <label className="check">
                <input type="checkbox" checked={agree} onChange={() => setAgree(!agree)} />
                <span>I&apos;ve read the quote. I understand this isn&apos;t advice.</span>
              </label>
              {needsApproval ? (
                <button className="btn btn-primary btn-block" onClick={approve} disabled={!agree || step === "approving"}>
                  {step === "approving" ? (approveHash ? "Waiting for confirmation…" : "Check your wallet…") : `Step 1 of 2: Let the swap use ${fmtTokens(quote.tokensIn)} ${stock.symbol}`}
                </button>
              ) : (
                <button className="btn btn-primary btn-block" onClick={sell} disabled={!agree || step === "building" || step === "selling"}>
                  {step === "building" ? "Preparing…" : step === "selling" ? (txHash ? "Confirming on Base…" : "Check your wallet…") : `${approveHash ? "Step 2 of 2: " : ""}Sell for ${formatUsd(quote.usdcOut)} USDC`}
                </button>
              )}
              <button className="btn btn-link small" onClick={getQuote} disabled={step !== "quoted"}>Refresh quote</button>
            </div>
          )}
        </>
      )}
      {error && <p className="error small" role="alert">{error}</p>}
      {txHash && step !== "done" && <p className="small"><a href={BASESCAN_TX + txHash} target="_blank" rel="noreferrer">View this transaction on Basescan ↗</a></p>}
    </section>
  );
}
