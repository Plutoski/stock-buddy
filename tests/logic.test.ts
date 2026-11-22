import { test } from "node:test";
import assert from "node:assert/strict";
import { getMarketStatus, nyTimeToDate, isPriceStale, timeAgo } from "../lib/market.ts";
import { isAdviceQuestion, builtInAnswer, ADVICE_REPLY, explainStock } from "../lib/explain.ts";
import { normalizeToken, tickerFromSymbol } from "../lib/stocks.ts";
import { SAMPLE_STOCKS } from "../lib/sample.ts";

// ---------- Market hours ----------
test("market open on a normal Tuesday at 11:00 New York", () => {
  const m = getMarketStatus(nyTimeToDate(2026, 11, 24, 11, 0));
  assert.equal(m.state, "open");
  assert.equal(m.isOpen, true);
  assert.equal(new Date(m.nextChangeAt).toISOString(), nyTimeToDate(2026, 11, 24, 16, 0).toISOString());
});

test("market closed overnight, reopens next morning", () => {
  const m = getMarketStatus(nyTimeToDate(2026, 11, 24, 20, 0));
  assert.equal(m.state, "closed-overnight");
  assert.equal(new Date(m.nextChangeAt).toISOString(), nyTimeToDate(2026, 11, 25, 9, 30).toISOString());
});

test("before the opening bell counts as closed and opens the same day", () => {
  const m = getMarketStatus(nyTimeToDate(2026, 11, 24, 8, 0));
  assert.equal(m.isOpen, false);
  assert.equal(new Date(m.nextChangeAt).toISOString(), nyTimeToDate(2026, 11, 24, 9, 30).toISOString());
});

test("weekend: Sunday is closed and reopens Monday", () => {
  const m = getMarketStatus(nyTimeToDate(2026, 11, 22, 16, 0)); // Sunday 22 Nov 2026
  assert.equal(m.state, "closed-weekend");
  assert.equal(new Date(m.nextChangeAt).toISOString(), nyTimeToDate(2026, 11, 23, 9, 30).toISOString());
});

test("Thanksgiving is a holiday; reopens Friday", () => {
  const m = getMarketStatus(nyTimeToDate(2026, 11, 26, 12, 0));
  assert.equal(m.state, "closed-holiday");
  assert.equal(new Date(m.nextChangeAt).toISOString(), nyTimeToDate(2026, 11, 27, 9, 30).toISOString());
});

test("day after Thanksgiving closes early at 1 PM", () => {
  assert.equal(getMarketStatus(nyTimeToDate(2026, 11, 27, 12, 30)).isOpen, true);
  assert.equal(getMarketStatus(nyTimeToDate(2026, 11, 27, 13, 30)).isOpen, false);
});

test("daylight saving: summer 9:30 NY is 13:30 UTC, winter is 14:30 UTC", () => {
  assert.equal(nyTimeToDate(2026, 7, 15, 9, 30).toISOString(), "2026-07-15T13:30:00.000Z");
  assert.equal(nyTimeToDate(2026, 12, 15, 9, 30).toISOString(), "2026-12-15T14:30:00.000Z");
});

test("prices are always flagged stale while the market is closed", () => {
  const closed = getMarketStatus(nyTimeToDate(2026, 11, 22, 12, 0));
  assert.equal(isPriceStale(new Date().toISOString(), closed), true);
  const at = nyTimeToDate(2026, 11, 24, 11, 0);
  const open = getMarketStatus(at);
  assert.equal(isPriceStale(new Date(at.getTime() - 3_600_000).toISOString(), open, at), false);
  assert.equal(isPriceStale(new Date(at.getTime() - 30 * 3_600_000).toISOString(), open, at), true);
});

test("timeAgo reads naturally", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  assert.equal(timeAgo("2026-11-22T11:59:40Z", now), "just now");
  assert.equal(timeAgo("2026-11-22T11:00:00Z", now), "1 hour ago");
  assert.equal(timeAgo("2026-11-19T12:00:00Z", now), "3 days ago");
  assert.equal(timeAgo(undefined, now), "unknown");
});

// ---------- No financial advice ----------
const adviceQs = [
  "Should I buy NVDA?",
  "should i sell my apple tokens",
  "Is Tesla a good investment?",
  "Will nvidia go up tomorrow?",
  "What stock should I buy?",
  "give me a price prediction for META",
  "what's the best stock right now",
];
for (const q of adviceQs) {
  test(`advice is refused: "${q}"`, () => {
    assert.equal(isAdviceQuestion(q), true);
    assert.equal(builtInAnswer(q), ADVICE_REPLY);
  });
}

const okQs = ["What is a tokenized stock?", "How do dividends work?", "What does it cost to buy?", "How do I buy?", "Why is the price different at night?"];
for (const q of okQs) {
  test(`education questions are answered: "${q}"`, () => {
    assert.equal(isAdviceQuestion(q), false);
    const a = builtInAnswer(q);
    assert.notEqual(a, ADVICE_REPLY);
    assert.ok(a.length > 40);
  });
}

test("built-in answers mention the selected stock's multiplier", () => {
  const s = { ...SAMPLE_STOCKS[0], multiplier: 1.0123 };
  assert.match(builtInAnswer("what is the multiplier?", s), /1\.0123/);
});

test("explainStock warns about frozen prices when market is closed", () => {
  const closed = getMarketStatus(nyTimeToDate(2026, 11, 22, 12, 0));
  assert.match(explainStock(SAMPLE_STOCKS[0], closed).join(" "), /frozen/);
});

// ---------- Data handling ----------
test("ticker is derived from Coinbase symbol", () => {
  assert.equal(tickerFromSymbol("NVDAc"), "NVDA");
  assert.equal(tickerFromSymbol("GOOGLc"), "GOOGL");
});

test("normalizeToken accepts a valid record and rejects bad ones", () => {
  const ok = normalizeToken({
    contract_address: "0x" + "a".repeat(40), symbol: "AAPLc", name: "Apple", decimals: "18",
    multiplier: 1.002, nav_price: 230.5, nav_price_updated_at: "2026-11-20T21:00:00Z", paused_features: ["2"],
  });
  assert.ok(ok);
  assert.equal(ok!.ticker, "AAPL");
  assert.equal(ok!.decimals, 18);
  assert.deepEqual(ok!.pausedFeatures, [2]);
  assert.equal(normalizeToken({ symbol: "X" }), null);
  assert.equal(normalizeToken({ contract_address: "0x123", symbol: "X" }), null);
  // A missing or broken multiplier falls back to 1 rather than breaking the maths.
  assert.equal(normalizeToken({ contract_address: "0x" + "b".repeat(40), symbol: "Yc", multiplier: 0 })!.multiplier, 1);
});

test("sample data uses obviously fake addresses", () => {
  for (const s of SAMPLE_STOCKS) assert.match(s.address, /^0x0{30,}/);
});

// Regression: plural words used to fall through to the generic answer.
test("plural questions reach the right topic", () => {
  assert.match(builtInAnswer("What are the risks?"), /lose money/);
  assert.match(builtInAnswer("Are there any fees?"), /network fee/);
  assert.match(builtInAnswer("what about stock splits"), /split/);
  assert.match(builtInAnswer("What does 1 NVDAc mean?", SAMPLE_STOCKS[0]), /how many real shares/);
});

// ---------- Real Coinbase API shapes (seen live on 23 Nov 2026) ----------
import { fetchLiveStocks } from "../lib/stocks.ts";

test("live fetch uses the URL Coinbase accepts (no slash before ?) and handles real records", async () => {
  const seen: string[] = [];
  const realistic = {
    tokens: [
      { contract_address: "0xb2000000000000000000002D0BA3164cc74f58B7", symbol: "GOOGLc", name: "Alphabet Inc. Class A",
        decimals: 8, total_supply: 37248.30223607, multiplier: 1.0003771186767842, nav_price: 269.71567647,
        nav_price_updated_at: "2026-11-20T21:42:19Z", description: "x".repeat(5000) },
      { contract_address: "0xb20000000000000000000006f910a0e7BBD3c168", symbol: "APPc", name: "AppLovin Corporation",
        decimals: 8, total_supply: 66.01157522, multiplier: 1, description: "legal text" }, // no nav_price
      { contract_address: "0xb200000000000000000000000000000000000abc", symbol: "BRK.Bc", name: "Berkshire Hathaway Inc. Class B",
        decimals: 8, total_supply: 10, multiplier: 1, nav_price: 480.1, nav_price_updated_at: "2026-11-20T21:00:00Z" },
    ],
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    seen.push(String(url));
    return new Response(JSON.stringify(realistic), { status: 200 });
  }) as typeof fetch;
  try {
    const stocks = await fetchLiveStocks();
    assert.ok(seen[0].startsWith("https://api.coinbase.com/v1/tokenized-stocks?"), seen[0]);
    assert.ok(!seen[0].includes("/?"));
    assert.equal(stocks.length, 3);
    assert.equal(stocks[0].ticker, "GOOGL"); // biggest market value first
    assert.equal(stocks[0].decimals, 8);
    assert.equal(stocks.find((s) => s.symbol === "APPc")!.navPrice, undefined);
    assert.equal(stocks.find((s) => s.symbol === "BRK.Bc")!.ticker, "BRK.B");
    // Long legal descriptions must not be sent to users' phones.
    assert.ok(JSON.stringify(stocks).length < 2000);
  } finally {
    globalThis.fetch = original;
  }
});

test("a stock without a reference price is explained, not shown as $NaN", () => {
  const closed = getMarketStatus(nyTimeToDate(2026, 11, 22, 12, 0));
  const s = { ...SAMPLE_STOCKS[0], navPrice: undefined };
  const text = explainStock(s, closed).join(" ");
  assert.match(text, /hasn't published/);
  assert.doesNotMatch(text, /NaN|undefined/);
});
