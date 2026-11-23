"use client";

import { currentRef } from "@/lib/referral.ts";
import { ShareRow } from "./ShareRow.tsx";
import { useEffect, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from "viem";
import { base } from "wagmi/chains";
import {
  useAccount, useBalance, useReadContract, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt,
} from "wagmi";
import type { Quote, Stock } from "@/lib/types.ts";
import { USDC_ADDRESS, USDC_DECIMALS, MIN_BUY_USDC, MAX_BUY_USDC, BASESCAN_TX } from "@/lib/constants.ts";
import { withAttribution, BUILDER_CODE } from "@/lib/attribution.ts";
import { formatUsd } from "@/lib/explain.ts";
import { ConnectButton, friendlyError } from "./ConnectButton.tsx";

type Step = "idle" | "quoting" | "quoted" | "approving" | "building" | "buying" | "done";

export function priceGapPct(trade: number, reference?: number): number | undefined {
  if (!reference || !trade) return undefined;
  return ((trade - reference) / reference) * 100;
}

export function BuyPanel({ stock, liveData, presetUsdc }: { stock: Stock; liveData: boolean; presetUsdc?: number }) {
  // The wallet's REAL network. (wagmi's useChainId() falls back to the app's own chain
  // when the wallet is on a network the app doesn't know, which hid the problem.)
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain, switchChainAsync, isPending: switching } = useSwitchChain();
  const onBase = walletChainId === base.id;
  async function ensureBase() {
    if (onBase) return;
    await switchChainAsync({ chainId: base.id });
  }

  const [amount, setAmount] = useState(presetUsdc !== undefined ? String(presetUsdc) : "5");
  const autoQuote = useRef(presetUsdc !== undefined); // the chat agent prepared this order: fetch its quote right away
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [agree, setAgree] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();

  const { sendTransactionAsync } = useSendTransaction();
  const busy = useRef(false);      // blocks double/triple clicks on Approve and Buy
  const quoteSeq = useRef(0);      // ignores quote answers that arrive after the user changed something

  const usdc = Number(amount);
  const amountValid = Number.isFinite(usdc) && usdc >= MIN_BUY_USDC && usdc <= MAX_BUY_USDC;

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined, chainId: base.id, query: { enabled: !!address },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: "allowance",
    args: address && quote ? [address, quote.routerAddress] : undefined, chainId: base.id,
    query: { enabled: !!address && !!quote },
  });

  const { data: ethBalance } = useBalance({ address, chainId: base.id, query: { enabled: !!address } });
  const [copied, setCopied] = useState(false);
  const [proofState, setProofState] = useState<"idle" | "saved" | "failed">("idle");

  const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash, chainId: base.id });
  const buyReceipt = useWaitForTransactionReceipt({ hash: txHash, chainId: base.id });

  // Reset when the stock or amount changes, so an old quote is never used.
  useEffect(() => { quoteSeq.current++; setQuote(null); setStep("idle"); setError(""); setAgree(false); setTxHash(undefined); setApproveHash(undefined); }, [stock.address]);
  useEffect(() => {
    quoteSeq.current++;
    if (step === "quoted" || step === "quoting") { setQuote(null); setStep("idle"); }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [amount]);

  useEffect(() => {
    if (!autoQuote.current || !liveData || !isConnected || !onBase || step !== "idle" || quote) return;
    autoQuote.current = false;
    getQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData, isConnected, onBase, step, quote]);
  useEffect(() => { if (approveReceipt.isSuccess) { refetchAllowance(); setStep("quoted"); } }, [approveReceipt.isSuccess, refetchAllowance]);
  useEffect(() => { if (buyReceipt.isSuccess) { setStep("done"); refetchBalance(); } }, [buyReceipt.isSuccess, refetchBalance]);
  // After a successful purchase, ask the server to verify it onchain and add it to the public /proof list.
  useEffect(() => {
    if (!buyReceipt.isSuccess || !txHash) return;
    let cancelled = false;
    (async () => {
      for (const wait of [1500, 5000, 15000]) {
        await new Promise((r) => setTimeout(r, wait));
        if (cancelled) return;
        try {
          const res = await fetch("/api/proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash: txHash, ref: currentRef(address) }) });
          if (res.ok) { setProofState("saved"); return; }
          if (res.status === 422 || res.status === 400) break; // not a countable purchase; don't retry
        } catch { /* try again */ }
      }
      if (!cancelled) setProofState("failed");
    })();
    return () => { cancelled = true; };
  }, [buyReceipt.isSuccess, txHash]);
  useEffect(() => {
    if (buyReceipt.data && buyReceipt.data.status === "reverted") {
      setError("The purchase didn't go through, so your USDC wasn't spent. Prices may have moved. Get a new quote and try again.");
      setStep("idle"); setQuote(null);
    } else if (buyReceipt.isError) {
      // We couldn't read the result. The purchase may still have worked, so never claim it didn't.
      setError("We couldn't confirm the result yet. Check your receipt on Basescan before trying again.");
    }
  }, [buyReceipt.isError, buyReceipt.data]);
  useEffect(() => {
    if (approveReceipt.isError || (approveReceipt.data && approveReceipt.data.status === "reverted")) {
      setError("The approval didn't go through. Nothing was spent. Please try again.");
      setApproveHash(undefined); setStep("quoted");
    }
  }, [approveReceipt.isError, approveReceipt.data]);

  if (!liveData) {
    return (
      <section className="card">
        <h3>Buy {stock.symbol}</h3>
        <p className="muted">Purchases are switched off while Stock Buddy is showing sample data.</p>
      </section>
    );
  }

  const balance = usdcBalance !== undefined ? Number(formatUnits(usdcBalance, USDC_DECIMALS)) : undefined;
  const needed = amountValid ? parseUnits(usdc.toFixed(USDC_DECIMALS), USDC_DECIMALS) : 0n;
  const needsApproval = quote && allowance !== undefined ? allowance < BigInt(quote.amountIn) : true;
  const notEnough = balance !== undefined && amountValid && balance < usdc;
  const noUsdc = balance !== undefined && balance < MIN_BUY_USDC;
  const noEth = ethBalance !== undefined && ethBalance.value === 0n;
  async function copyAddress() {
    try { await navigator.clipboard.writeText(address || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }
  const gap = quote ? priceGapPct(quote.pricePerToken, stock.navPrice) : undefined;
  const quotedUsdc = quote ? Number(formatUnits(BigInt(quote.amountIn), USDC_DECIMALS)) : 0;

  async function getQuote() {
    const seq = ++quoteSeq.current;
    setError(""); setQuote(null); setStep("quoting");
    try {
      const res = await fetch(`/api/quote?token=${stock.address}&usdc=${usdc}`, { signal: AbortSignal.timeout(20_000) });
      const body = await res.json().catch(() => ({}));
      if (seq !== quoteSeq.current) return; // the user changed stock or amount meanwhile
      if (!res.ok) throw new Error(body.error || "The price service is busy. Please try again in a moment.");
      const ok = typeof body.amountIn === "string" && typeof body.amountOut === "string" && body.amountOutTokens > 0
        && typeof body.routerAddress === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.routerAddress);
      if (!ok) throw new Error("The price service sent an unexpected answer. Please try again.");
      setQuote(body as Quote); setStep("quoted");
    } catch (e) {
      if (seq !== quoteSeq.current) return;
      const msg = (e as Error).name === "TimeoutError" ? "Getting a price took too long. Please try again." : (e as Error).message;
      setError(msg); setStep("idle");
    }
  }

  async function approve() {
    if (!quote || busy.current) return;
    busy.current = true;
    setError(""); setStep("approving");
    try {
      await ensureBase();
      // Approve ONLY the exact amount for this purchase, never unlimited.
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.routerAddress, BigInt(quote.amountIn)] });
      const hash = await sendTransactionAsync({ to: USDC_ADDRESS, data: withAttribution(data), chainId: base.id });
      setApproveHash(hash);
    } catch (e) {
      setError(friendlyError((e as Error).message)); setStep("quoted");
    } finally {
      busy.current = false;
    }
  }

  async function buy() {
    if (!quote || !address || busy.current) return;
    busy.current = true;
    setError(""); setStep("building");
    try {
      const res = await fetch("/api/build", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ routeSummary: quote.routeSummary, sender: address }),
      });
      const tx = await res.json().catch(() => ({}));
      if (!res.ok || !tx.to || !tx.data) throw new Error(tx.error || "Couldn't prepare the purchase. Please get a new quote.");
      if (tx.to?.toLowerCase() !== quote.routerAddress.toLowerCase()) throw new Error("Safety check failed: the swap address changed. Please get a new quote.");
      setStep("buying");
      await ensureBase();
      const hash = await sendTransactionAsync({ to: tx.to, data: withAttribution(tx.data), value: BigInt(tx.value || 0), chainId: base.id });
      setTxHash(hash);
    } catch (e) {
      setError(friendlyError((e as Error).message)); setStep("quoted");
    } finally {
      busy.current = false;
    }
  }

  const shareMsg = `I just bought ${stock.ticker} as a token on Base with Stock Buddy. It showed me the price gap before I paid. You can start with $1:`;

  return (
    <section className="card buy" aria-label={`Buy ${stock.symbol}`}>
      <h3>Buy {stock.symbol}</h3>

      {!isConnected ? (
        <>
          <p className="muted">To buy, you need a wallet with USDC on Base. No wallet yet? Choose Base Account: it creates one in seconds with a passkey. Stock Buddy never holds your money.</p>
          <ConnectButton />
        </>
      ) : !onBase ? (
        <>
        <p className="muted small">Your wallet is on a different network. Stock Buddy only works on Base.</p>
        <button className="btn btn-primary" onClick={() => switchChain({ chainId: base.id })} disabled={switching}>
          {switching ? "Switching…" : "Switch to Base network"}
        </button>
        </>
      ) : step === "done" && txHash ? (
        <div className="success">
          <p><strong>Done!</strong> You bought about {quote?.amountOutTokens.toLocaleString("en-US", { maximumFractionDigits: 6 })} {stock.symbol}.</p>
          <p className="small"><a href={BASESCAN_TX + txHash} target="_blank" rel="noreferrer">View your receipt on Basescan ↗</a></p>
          {proofState === "saved" && <p className="small">Verified and added to the <a href="/proof">public list</a>.</p>}
          {proofState === "failed" && <p className="small muted">We couldn&apos;t add it to the <a href="/proof">public list</a> yet. You can paste your receipt link there later.</p>}
          <p className="small muted">Tell a friend. Your link shows {stock.ticker}&apos;s live price gap, and /proof counts friends who trade through it.</p>
          <ShareRow ticker={stock.ticker} message={shareMsg} />
          <div className="row">
            <button className="btn btn-ghost" onClick={() => { setStep("idle"); setQuote(null); setTxHash(undefined); setApproveHash(undefined); setAgree(false); }}>Buy more</button>
          </div>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Amount in USDC (${MIN_BUY_USDC} to ${MAX_BUY_USDC})</span>
            <div className="amount">
              <span aria-hidden>$</span>
              <input inputMode="decimal" value={amount} onChange={(e) => {
                const raw = e.target.value;
                const v = /^\d{0,3}(\.\d{0,2})?$/.test(raw) ? raw : raw.replace(/usdc|\$|,|\s/gi, "");
                if (/^\d{0,3}(\.\d{0,2})?$/.test(v)) setAmount(v);
              }} aria-label="Amount in USDC" disabled={step === "quoting" || (!!quote && step !== "quoted")} />
            </div>
          </label>
          <div className="chips">
            {["5", "10", "25"].map((v) => (
              <button key={v} className={`chip ${amount === v ? "chip-on" : ""}`} onClick={() => setAmount(v)} disabled={step === "quoting" || (!!quote && step !== "quoted")}>${v}</button>
            ))}
          </div>
          {balance !== undefined && <p className="muted small">Your USDC on Base: {formatUsd(balance)}</p>}
          {noUsdc && (
            <div className="helper" role="note">
              <strong>No USDC yet? Here&apos;s how to get some.</strong>
              <ol>
                <li>Buy USDC on Coinbase or another exchange you use (1 USDC ≈ $1).</li>
                <li>Send it to your wallet address below and choose the <strong>Base</strong> network. Other networks won&apos;t arrive here.</li>
                <li>Come back here. Your balance updates by itself.</li>
              </ol>
              <div className="addr-row">
                <span className="addr">{address}</span>
                <button className="btn btn-ghost small" onClick={copyAddress}>{copied ? "Copied" : "Copy address"}</button>
              </div>
            </div>
          )}
          {noEth && !noUsdc && (
            <p className="helper small" role="note">
              Your wallet has no ETH on Base for the network fee (usually under 1 cent). Some wallets, like Base Account, may cover it for you. Otherwise, send a tiny amount of ETH on the Base network to this wallet first.
            </p>
          )}
          {!amountValid && amount !== "" && <p className="error small">Choose an amount between ${MIN_BUY_USDC} and ${MAX_BUY_USDC}.</p>}
          {notEnough && !noUsdc && <p className="error small">You don't have enough USDC on Base for this amount.</p>}

          {!quote && (
            <button className="btn btn-primary btn-block" onClick={getQuote} disabled={!amountValid || step === "quoting" || !!notEnough}>
              {step === "quoting" ? "Getting the best price…" : "See what I'd get"}
            </button>
          )}

          {quote && (
            <div className="quote">
              <dl>
                <dt>You pay</dt><dd>{formatUsd(quotedUsdc)} USDC</dd>
                <dt>You get (about)</dt><dd>{quote.amountOutTokens.toLocaleString("en-US", { maximumFractionDigits: 6 })} {stock.symbol}</dd>
                <dt>That's roughly</dt><dd>{(quote.amountOutTokens * stock.multiplier).toLocaleString("en-US", { maximumFractionDigits: 6 })} {stock.ticker} shares</dd>
                <dt>Trading price now</dt><dd>{formatUsd(quote.pricePerToken)} per token</dd>
                <dt>Official price</dt><dd>{formatUsd(stock.navPrice)} per token</dd>
                {quote.gasUsd !== undefined && (<><dt>Network fee (est.)</dt><dd>{quote.gasUsd < 0.01 ? "under 1¢" : formatUsd(quote.gasUsd)}</dd></>)}
              </dl>
              {gap !== undefined && Math.abs(gap) >= 1 && (
                <p className="warn small">
                  The trading price is {Math.abs(gap).toFixed(1)}% {gap > 0 ? "higher" : "lower"} than the official reference. This often happens when the US market is closed. You'd be paying the trading price.
                </p>
              )}
              <p className="muted small">Max price movement allowed: 0.5%. If the price moves more, the purchase cancels and you keep your USDC.</p>
              <label className="check">
                <input type="checkbox" checked={agree} onChange={() => setAgree(!agree)} />
                <span>I've read the quote. I understand this isn't advice and the value can go down.</span>
              </label>

              {needsApproval ? (
                <button className="btn btn-primary btn-block" onClick={approve} disabled={!agree || step === "approving"}>
                  {step === "approving" ? (approveHash ? "Waiting for confirmation…" : "Check your wallet…") : `Step 1 of 2: Let the swap use ${formatUsd(quotedUsdc)} USDC`}
                </button>
              ) : (
                <button className="btn btn-primary btn-block" onClick={buy} disabled={!agree || step === "building" || step === "buying" || needed === 0n}>
                  {step === "building" ? "Preparing…" : step === "buying" ? (txHash ? "Confirming on Base…" : "Check your wallet…") : `${approveHash ? "Step 2 of 2: " : ""}Buy ${stock.symbol}`}
                </button>
              )}
              <button className="btn btn-link small" onClick={getQuote} disabled={step !== "quoted"}>Refresh quote</button>
            </div>
          )}
        </>
      )}

      {error && <p className="error small" role="alert">{error}</p>}
      {txHash && step !== "done" && (
        <p className="small"><a href={BASESCAN_TX + txHash} target="_blank" rel="noreferrer">View this transaction on Basescan ↗</a></p>
      )}
      {!BUILDER_CODE && process.env.NODE_ENV !== "production" && <p className="muted tiny">Developer note: no Builder Code set, so purchases won't be attributed.</p>}
    </section>
  );
}
