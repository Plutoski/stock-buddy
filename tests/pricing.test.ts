import { test } from "node:test";
import assert from "node:assert/strict";
import { gapPct, gapLevel, gapShort, gapSentence } from "../lib/pricing.ts";
import { getLivePrice } from "../lib/quote.ts";
import { SAMPLE_STOCKS } from "../lib/sample.ts";

test("real NVIDIA example: $133.75 trading vs $129.82 official is about +3.0%", () => {
  const g = gapPct(133.7515, 129.8248)!;
  assert.ok(Math.abs(g - 3.02) < 0.05, String(g));
  assert.equal(gapLevel(g), "large");
  assert.equal(gapShort(g), "+3.0% vs official");
});

test("gap levels and labels", () => {
  assert.equal(gapLevel(0.3), "inline");
  assert.equal(gapShort(-0.2), "In line with official");
  assert.equal(gapLevel(-1.2), "small");
  assert.equal(gapShort(-1.24), "−1.2% vs official");
  assert.equal(gapLevel(-5), "large");
});

test("missing or broken prices give no gap instead of NaN", () => {
  assert.equal(gapPct(100, undefined), undefined);
  assert.equal(gapPct(100, 0), undefined);
  assert.equal(gapPct(0, 100), undefined);
  assert.equal(gapPct(NaN, 100), undefined);
  assert.equal(gapShort(undefined), undefined);
  assert.equal(gapSentence(undefined, false), undefined);
});

test("gap sentence explains direction and the closed-market reason", () => {
  const above = gapSentence(3.02, false)!;
  assert.match(above, /3\.0% above/);
  assert.match(above, /frozen/);
  assert.match(above, /3\.0% more than the official value/);
  const below = gapSentence(-2.5, true)!;
  assert.match(below, /2\.5% below/);
  assert.match(below, /updates/);
  assert.match(gapSentence(0.1, true)!, /matches the official price/);
});

test("live price comes from a $10 KyberSwap quote and is cached", async () => {
  const stock = { ...SAMPLE_STOCKS[0], address: "0xb20000000000000000000078ee7ce2fE4908108C" as `0x${string}`, decimals: 8, navPrice: 129.8248 };
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls++;
    assert.match(String(url), /aggregator-api\.kyberswap\.com\/base\/api\/v1\/routes\?/);
    assert.match(String(url), /amountIn=10000000/); // $10 in USDC units
    // 10 USDC -> 0.0747655 tokens  => ~$133.75 per token
    return new Response(JSON.stringify({ data: { routeSummary: { amountOut: "7476550" }, routerAddress: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5" } }));
  }) as typeof fetch;
  try {
    const p = await getLivePrice(stock);
    assert.ok(p);
    assert.ok(Math.abs(p!.tradingPrice - 133.75) < 0.05, String(p!.tradingPrice));
    assert.ok(Math.abs(p!.gapPct! - 3.02) < 0.05);
    await getLivePrice(stock);
    assert.equal(calls, 1, "second call should be served from cache");
  } finally {
    globalThis.fetch = original;
  }
});

test("no route means no price (not an error)", async () => {
  const stock = { ...SAMPLE_STOCKS[1], address: "0xb2000000000000000000000000000000000000ff" as `0x${string}` };
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ code: 4008, message: "route not found" }), { status: 400 })) as typeof fetch;
  try {
    assert.equal(await getLivePrice(stock), null);
  } finally {
    globalThis.fetch = original;
  }
});
