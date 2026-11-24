import { limit } from "@/lib/ratelimit.ts";
import { NextRequest, NextResponse } from "next/server";
import { getStocks } from "@/lib/stocks.ts";
import { getMarketStatus } from "@/lib/market.ts";
import { builtInAnswer, isAdviceQuestion, ADVICE_REPLY, systemPrompt } from "@/lib/explain.ts";

export const dynamic = "force-dynamic";

interface Msg { role: "user" | "assistant"; content: string }

// POST /api/chat { messages: Msg[], stockAddress?: string }
export async function POST(req: NextRequest) {
  const limited = await limit(req, "chat", 40, 600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const messages: Msg[] = Array.isArray(body?.messages) ? body.messages.slice(-10) : [];
  const last = messages.filter((m) => m.role === "user").pop();
  if (!last || typeof last.content !== "string" || !last.content.trim()) {
    return NextResponse.json({ error: "Please type a question." }, { status: 400 });
  }
  const question = last.content.slice(0, 1000);

  const market = getMarketStatus();
  const { stocks } = await getStocks();
  const stock = body?.stockAddress
    ? stocks.find((s) => s.address.toLowerCase() === String(body.stockAddress).toLowerCase())
    : undefined;

  // Hard guard: never let the model give buy/sell advice.
  if (isAdviceQuestion(question)) return NextResponse.json({ reply: ADVICE_REPLY, mode: "guard" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ reply: builtInAnswer(question, stock, market), mode: "built-in" });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 400,
        system: systemPrompt(stock, market),
        messages: messages
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) })),
      }),
    });
    const out = await res.json();
    const text = Array.isArray(out?.content)
      ? out.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim()
      : "";
    if (!res.ok || !text) throw new Error(out?.error?.message || `HTTP ${res.status}`);
    return NextResponse.json({ reply: text, mode: "ai" });
  } catch (e) {
    console.error("[chat] AI failed, using built-in answer:", e);
    return NextResponse.json({ reply: builtInAnswer(question, stock, market), mode: "built-in" });
  }
}
