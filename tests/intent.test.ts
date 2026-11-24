import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTradeIntent, findStock } from "../lib/intent.ts";
import { isAdviceQuestion } from "../lib/explain.ts";
import type { Stock } from "../lib/types.ts";

const mk = (ticker: string, name: string) => ({ address: "0x" + ticker.padEnd(40, "0").slice(0, 40), symbol: ticker + "c", ticker, name, decimals: 8, multiplier: 1, pausedFeatures: [] }) as unknown as Stock;
const stocks = [mk("NVDA", "NVIDIA Corporation"), mk("GOOGL", "Alphabet Inc. Class A"), mk("AAPL", "Apple Inc."), mk("TSLA", "Tesla, Inc."), mk("BRK.B", "Berkshire Hathaway Inc. Class B"), mk("SNDK", "Sandisk Corporation")];

const buy = (t: string) => { const r = parseTradeIntent(t, stocks); return r && r.side === "buy" ? `${r.stock.ticker}:${r.usdc}` : JSON.stringify(r && r.side); };
const sell = (t: string) => { const r = parseTradeIntent(t, stocks); return r && r.side === "sell" ? `${r.stock.ticker}:${r.fraction ?? "t" + r.tokens}` : JSON.stringify(r && r.side); };

test("buy requests", () => {
  assert.equal(buy("buy $5 of NVIDIA"), "NVDA:5");
  assert.equal(buy("buy $1 of NVDA"), "NVDA:1");
  assert.equal(buy("Buy 10 dollars of apple"), "AAPL:10");
  assert.equal(buy("get 25 usdc of tsla"), "TSLA:25");
  assert.equal(buy("buy $2.50 of google"), "GOOGL:2.5");
  assert.equal(buy("buy five dollars of tesla"), "TSLA:5");
  assert.equal(buy("buy $5 of NVDAc"), "NVDA:5");
  assert.equal(buy("buy $3 of sandisk"), "SNDK:3");
  assert.equal(buy("please buy $4 of berkshire"), "BRK.B:4");
});
test("sell requests", () => {
  assert.equal(sell("sell half my google"), "GOOGL:0.5");
  assert.equal(sell("sell all my tesla"), "TSLA:1");
  assert.equal(sell("sell 25% of NVDA"), "NVDA:0.25");
  assert.equal(sell("sell 0.01 googl"), "GOOGL:t0.01");
  assert.equal(sell("sell a quarter of my apple"), "AAPL:0.25");
});
test("missing pieces are reported, not guessed", () => {
  assert.equal(parseTradeIntent("buy nvidia", stocks)?.side, "missing-amount");
  const u = parseTradeIntent("buy $5 of zzzcorp", stocks);
  assert.equal(u?.side, "unknown-stock");
});
test("questions and advice are not orders", () => {
  assert.equal(parseTradeIntent("How do I buy?", stocks), null);
  assert.equal(parseTradeIntent("what is a tokenized stock", stocks), null);
  assert.equal(parseTradeIntent("tell us about Tesla", stocks), null);
  assert.equal(isAdviceQuestion("should I buy $5 of NVIDIA"), true);   // guard runs before intents
  assert.equal(isAdviceQuestion("buy $5 of NVIDIA"), false);
});
test("finds stocks by ticker, symbol, alias or company name", () => {
  assert.equal(findStock("nvidia", stocks)?.ticker, "NVDA");
  assert.equal(findStock("GOOGLc", stocks)?.ticker, "GOOGL");
  assert.equal(findStock("alphabet", stocks)?.ticker, "GOOGL");
  assert.equal(findStock("brk.b", stocks)?.ticker, "BRK.B");
});

test("round 2: amounts, percent, English-word tickers and the stock on screen", () => {
  const mk = (t: string, n: string) => ({ ticker: t, symbol: t + "c", name: n, address: "0x" + t, decimals: 8, multiplier: 1, pausedFeatures: [] });
  const S = [...stocks, mk("YOU", "Clear Secure"), mk("IT", "Gartner"), mk("ALL", "Allstate")] as unknown as typeof stocks;
  const nv = S.find((s) => s.ticker === "NVDA")!;
  const f = (t: string, ctx?: typeof nv) => { const r = parseTradeIntent(t, S, ctx); return r ? `${r.side}:${"stock" in r ? r.stock.ticker : ""}:${r.side === "buy" ? r.usdc : r.side === "sell" ? (r.fraction ?? "t" + r.tokens) : ""}` : "null"; };
  assert.equal(f("sell 25 percent of nvidia"), "sell:NVDA:0.25");
  assert.equal(f("sell $5 of nvidia"), "missing-amount:NVDA:");
  assert.equal(f("sell 150% of nvidia"), "missing-amount:NVDA:");
  assert.equal(f("buy $1,000 of nvda"), "buy:NVDA:1000");
  assert.equal(f("buy $5 of whatever you like").startsWith("buy:YOU"), false);
  assert.equal(f("buy $5 of IT"), "buy:IT:5");
  assert.equal(f("SELL ALL MY NVDA"), "sell:NVDA:1");
  assert.equal(f("buy $5 of it", nv), "buy:NVDA:5");
  assert.equal(f("sell everything", nv), "sell:NVDA:1");
  assert.equal(f("buy $5 of zzzcorp", nv), "unknown-stock::");
});

test("price questions: find the stock, leave how-prices-work questions to the explainer", async () => {
  const { parsePriceQuestion } = await import("../lib/intent.ts");
  const { isAdviceQuestion } = await import("../lib/explain.ts");
  const nv = stocks.find((s) => s.ticker === "NVDA")!;
  const f = (t: string, ctx?: typeof nv) => { const r = parsePriceQuestion(t, stocks, ctx); return r ? (r.kind === "price" ? r.stock.ticker : "unknown:" + r.query) : "null"; };
  assert.equal(f("what is the price of nvda"), "NVDA");
  assert.equal(f("What's the price of NVIDIA?"), "NVDA");
  assert.equal(f("how much is google"), "GOOGL");
  assert.equal(f("TSLA price"), "TSLA");
  assert.equal(f("what is the price of xyzcorp"), "unknown:xyzcorp");
  assert.equal(f("how much is it", nv), "NVDA");
  assert.equal(f("why is the price different at night?"), "null");
  assert.equal(f("What does it cost to buy?"), "null");
  assert.equal(f("what's the price gap"), "null");
  assert.equal(f("buy $5 of nvda"), "null");
  assert.equal(isAdviceQuestion("is nvda a good price?"), true);
  assert.equal(isAdviceQuestion("is tesla cheap right now?"), true);
  assert.equal(isAdviceQuestion("what is the price of nvda"), false);
});
