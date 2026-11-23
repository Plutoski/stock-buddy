"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { shareUrl } from "@/lib/referral.ts";

/** WhatsApp, X and copy-link buttons for one stock. The link carries the sharer's referral code when connected. */
export function ShareRow({ ticker, message, compact = false }: { ticker: string; message: string; compact?: boolean }) {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = shareUrl(origin, ticker, address);
  const text = `${message} ${url}`;

  async function copy() {
    try { await navigator.clipboard.writeText(url); }
    catch {
      const el = document.createElement("textarea"); el.value = url; document.body.appendChild(el); el.select();
      try { document.execCommand("copy"); } catch { /* nothing else to try */ }
      el.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`row share ${compact ? "share-compact" : ""}`}>
      <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <a className="btn btn-ghost" href={`https://x.com/intent/tweet?text=${encodeURIComponent(text.replace(/\bBase\b/, "@base"))}`} target="_blank" rel="noreferrer">Post on X</a>
      <button className="btn btn-ghost" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
      <span className="sr-only" role="status">{copied ? "Link copied" : ""}</span>
    </div>
  );
}
