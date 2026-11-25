"use client";

import { useEffect, useRef, useState } from "react";
import type { Stock } from "@/lib/types.ts";
import { parseTradeIntent, parsePriceQuestion, type TradeIntent } from "@/lib/intent.ts";
import { isAdviceQuestion, ADVICE_REPLY } from "@/lib/explain.ts";
import { useOrders } from "./OrderContext.tsx";
import { TradeCard } from "./TradeCard.tsx";
import { PriceCard } from "./PriceCard.tsx";
import { Logo } from "./Logo.tsx";

interface Msg { role: "user" | "assistant"; content: string; intent?: TradeIntent; price?: Stock }

const GENERAL = [
  "What is a tokenized stock?",
  "Why is the price different at night?",
  "What happens when a dividend is paid?",
  "What does it cost to buy?",
];

export type ChatMsg = Msg;
/** The conversation can live outside the chat, so it survives switching pages or opening a stock. */
export function Chat({ stock, history }: { stock?: Stock; history?: [Msg[], (m: Msg[]) => void] }) {
  const local = useState<Msg[]>([]);
  const [messages, setMessages] = history ?? local;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);
  const { stocks } = useOrders();

  // Start a fresh conversation when the user switches stock.
  // A new stock starts a new conversation; showing the same chat again keeps it.
  const lastStock = useRef(stock?.address);
  useEffect(() => {
    if (lastStock.current === stock?.address) return;
    lastStock.current = stock?.address; setMessages([]); setMode("");
  }, [stock?.address]);
  // Scroll only the chat box (not the whole page) so the newest message is visible.
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, loading]);
  // Trade cards grow when their live quote arrives: keep the newest content (and its button) in view.
  useEffect(() => {
    const el = logRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { el.scrollTop = el.scrollHeight; });
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [messages]);

  const suggestions = stock
    ? [`What is the price of ${stock.ticker}?`, `Buy $5 of ${stock.ticker}`, `What does 1 ${stock.symbol} mean?`, "Why is the price different at night?"]
    : ["What is the price of NVDA?", "Buy $5 of NVIDIA", ...GENERAL];

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    // Advice questions get the refusal right here, with no network call. The server checks again.
    if (isAdviceQuestion(q)) {
      setMessages([...next, { role: "assistant", content: ADVICE_REPLY }]);
      setMode("guard");
      return;
    }
    // Trade requests ("buy $5 of NVIDIA", "sell half my google") are handled right here:
    // the agent researches a live quote and prepares the order.
    {
      const intent = parseTradeIntent(q, stocks, stock);
      if (intent) {
        setMessages([...next, { role: "assistant", content: `[prepared ${intent.side} order]`, intent }]);
        setMode("agent");
        return;
      }
      // Price questions ("what is the price of NVDA?") get the live price, the official price and the gap.
      const pq = parsePriceQuestion(q, stocks, stock);
      if (pq?.kind === "price") {
        setMessages([...next, { role: "assistant", content: `[price of ${pq.stock.ticker}]`, price: pq.stock }]);
        setMode("agent");
        return;
      }
      if (pq?.kind === "price-unknown") {
        setMessages([...next, { role: "assistant", content: `I couldn't find a tokenized stock called "${pq.query}". Try its ticker, like NVDA or AAPL, or search the list.` }]);
        return;
      }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.intent && !m.price), stockAddress: stock?.address }),
      });
      const body = await res.json();
      setMessages([...next, { role: "assistant", content: body.reply || body.error || "Stock Buddy couldn't answer that. Try again, or ask another way." }]);
      if (body.mode) setMode(body.mode);
    } catch {
      setMessages([...next, { role: "assistant", content: "I couldn't connect. Check your internet and try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card chat" aria-label="Ask Stock Buddy">
      <div className="chat-head">
        <span className="agent-id">
          <Logo size={34} />
          <span>
            <h3>Ask Stock Buddy</h3>
            <span className="muted small">Checks live prices and prepares trades. You approve them.</span>
          </span>
        </span>
        {mode && <span className="pill tiny">{mode === "agent" ? "Order ready" : mode === "ai" ? "AI answer" : mode === "guard" ? "No advice" : "Answer"}</span>}
      </div>
      <div className="chat-log" aria-live="polite" ref={logRef}>
        {messages.length === 0 && <p className="chat-empty">Ask for a price, like &quot;what is the price of {stock ? stock.ticker : "NVDA"}?&quot;, or say what you want to do, like &quot;buy $5 of {stock ? stock.ticker : "NVIDIA"}&quot;. You can also ask how {stock ? `${stock.symbol} works` : "tokenized stocks work"}. I don&apos;t give financial advice.</p>}
        {messages.map((m, i) => m.price
          ? <PriceCard key={i} stock={m.price} />
          : m.intent
          ? <TradeCard key={i} intent={m.intent} />
          : <div key={i} className={`bubble ${m.role}`} dir="auto">{m.content}</div>)}
        {loading && <div className="bubble assistant typing">Checking…</div>}
      </div>
      <div className="chips">
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)} disabled={loading}>{s}</button>
        ))}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Ask, or say "buy $5 of NVIDIA"…'
          aria-label="Your question"
          maxLength={1000}
          enterKeyHint="send"
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}>Send</button>
      </form>
    </section>
  );
}
