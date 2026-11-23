"use client";

import { useEffect, useRef, useState } from "react";
import type { Stock } from "@/lib/types.ts";
import { parseTradeIntent, type TradeIntent } from "@/lib/intent.ts";
import { isAdviceQuestion } from "@/lib/explain.ts";
import { useOrders } from "./OrderContext.tsx";
import { TradeCard } from "./TradeCard.tsx";

interface Msg { role: "user" | "assistant"; content: string; intent?: TradeIntent }

const GENERAL = [
  "What is a tokenized stock?",
  "Why is the price different at night?",
  "What happens when a dividend is paid?",
  "What does it cost to buy?",
];

export function Chat({ stock }: { stock?: Stock }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);
  const { stocks } = useOrders();

  // Start a fresh conversation when the user switches stock.
  useEffect(() => { setMessages([]); setMode(""); }, [stock?.address]);
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
    ? [`Buy $5 of ${stock.ticker}`, `What does 1 ${stock.symbol} mean?`, "Why is the price different at night?", "What are the risks?"]
    : ["Buy $5 of NVIDIA", ...GENERAL];

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    // Trade requests ("buy $5 of NVIDIA", "sell half my google") are handled right here:
    // the agent researches a live quote and prepares the order. Advice questions never get here.
    if (!isAdviceQuestion(q)) {
      const intent = parseTradeIntent(q, stocks, stock);
      if (intent) {
        setMessages([...next, { role: "assistant", content: `[prepared ${intent.side} order]`, intent }]);
        setMode("agent");
        return;
      }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.intent), stockAddress: stock?.address }),
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
        <h3>Ask Stock Buddy</h3>
        {mode && <span className="pill small">{mode === "agent" ? "Agent" : mode === "ai" ? "AI answers" : mode === "guard" ? "No advice" : "Built-in answers"}</span>}
      </div>
      <div className="chat-log" aria-live="polite" ref={logRef}>
        {messages.length === 0 && <p className="muted small">Ask anything about how {stock ? `${stock.symbol} works` : "tokenized stocks work"}, or tell me what to do, like &quot;buy $5 of {stock ? stock.ticker : "NVIDIA"}&quot; or &quot;sell half my {stock ? stock.ticker : "Google"}&quot;. I explain and prepare trades. I don&apos;t give advice.</p>}
        {messages.map((m, i) => m.intent
          ? <TradeCard key={i} intent={m.intent} />
          : <div key={i} className={`bubble ${m.role}`} dir="auto">{m.content}</div>)}
        {loading && <div className="bubble assistant typing">Thinking…</div>}
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
