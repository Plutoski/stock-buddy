"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function short(addr?: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  if (isConnected) {
    return (
      <button className="btn btn-ghost" onClick={() => disconnect()} title="Disconnect wallet">
        <span className="dot dot-green" aria-hidden /> {short(address)}
      </button>
    );
  }

  return (
    <div className="connect" ref={box}>
      <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={isPending}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="menu" role="menu">
          {connectors.map((c) => (
            <button
              key={c.uid}
              role="menuitem"
              className="menu-item"
              onClick={() => { connect({ connector: c }); setOpen(false); }}
            >
              <strong>{c.id === "baseAccount" ? "Base Account" : c.name === "Injected" ? "Browser wallet" : c.name}</strong>
              <span className="muted small">
                {c.id === "baseAccount" ? "Phone or laptop, sign in with a passkey" : "MetaMask, Rabby, Coinbase Wallet extension"}
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="error small">{friendlyError(error.message)}</p>}
    </div>
  );
}

export function friendlyError(msg: string): string {
  if (/rejected|denied|cancel/i.test(msg)) return "You cancelled the request in your wallet. Nothing happened.";
  if (/provider not found|no provider|not installed/i.test(msg)) return "No browser wallet found. Try Base Account instead, which works without an extension.";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH on Base for the network fee, or not enough USDC.";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}
