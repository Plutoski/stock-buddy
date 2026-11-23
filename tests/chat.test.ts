import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdviceQuestion, builtInAnswer, ADVICE_REPLY } from "../lib/explain.ts";
import { isOfficialPriceFrozen } from "../lib/market.ts";

// Advice requests the reviewers found slipping through.
const advice = [
  "buy or sell?", "would you buy apple", "is it smart to buy nvda now", "is nvda worth buying",
  "which stock is best", "do you recommend nvda", "nvda bullish or bearish?", "should we buy",
  "what would you do", "is now a good time to buy nvda", "¿debería comprar tesla?", "dois-je acheter nvidia ?",
];
for (const q of advice) test(`advice refused: ${q}`, () => assert.equal(builtInAnswer(q), ADVICE_REPLY));

// Normal questions must still get answers, not the refusal.
for (const q of ["How do I buy?", "What does it cost to buy?", "Can I sell it later?", "tell us about Tesla"]) {
  test(`not advice: ${q}`, () => assert.equal(isAdviceQuestion(q), false));
}

test("'tell us about Tesla' no longer triggers the US-eligibility answer", () => {
  assert.doesNotMatch(builtInAnswer("tell us about Tesla"), /outside the United States/);
});
test("eligibility questions still work, including Canada", () => {
  assert.match(builtInAnswer("Can I use this in Canada?"), /outside the United States/);
  assert.match(builtInAnswer("Is it allowed in the US?"), /outside the United States/);
});
test("no USDC gets help getting USDC, not buy steps", () => {
  assert.match(builtInAnswer("I don't have USDC"), /Base network/);
});
test("why is the price higher explains the gap", () => {
  assert.match(builtInAnswer("Why is it 3% higher than the official price?"), /premium/);
});
test("selling and holdings questions are answered", () => {
  assert.match(builtInAnswer("Can I sell it later?"), /swapping back to USDC/);
  assert.match(builtInAnswer("how do I see my stocks?"), /wallet/);
});
test("official price counts as frozen only when it hasn't updated for 30+ minutes", () => {
  const now = new Date("2026-11-23T09:06:00Z");
  assert.equal(isOfficialPriceFrozen("2026-11-23T09:05:14Z", now), false); // weekday night, feed still updating
  assert.equal(isOfficialPriceFrozen("2026-11-20T23:42:40Z", now), true);  // since Friday
  assert.equal(isOfficialPriceFrozen(undefined, now), true);
});
