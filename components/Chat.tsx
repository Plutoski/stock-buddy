"use client";

import { useEffect, useRef, useState } from "react";
import type { Stock } from "@/lib/types.ts";

interface Msg { role: "user" | "assistant"; content: string }

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

  // Start a fresh conversation when the user switches stock.
  useEffect(() => { setMessages([]); setMode(""); }, [stock?.address]);
  // Scroll only the chat box (not the whole page) so the newest message is visible.
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, loading]);

  const suggestions = stock
    ? [`What does 1 ${stock.symbol} mean?`, "Why is the price different at night?", "What are the risks?", "How do I buy?"]
    : GENERAL;

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, stockAddress: stock?.address }),
      });
      const body = await res.json();
      setMessages([...next, { role: "assistant", content: body.reply || body.error || "Sorry, something went wrong." }]);
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
        {mode && <span className="pill small">{mode === "ai" ? "AI answers" : mode === "guard" ? "No advice" : "Built-in answers"}</span>}
      </div>
      <div className="chat-log" aria-live="polite" ref={logRef}>
        {messages.length === 0 && <p className="muted small">Ask anything about how {stock ? `${stock.symbol} works` : "tokenized stocks work"}. I explain, I don't give advice.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
        ))}
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
          placeholder="Type a question…"
          aria-label="Your question"
          maxLength={1000}
          enterKeyHint="send"
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}>Send</button>
      </form>
    </section>
  );
}
