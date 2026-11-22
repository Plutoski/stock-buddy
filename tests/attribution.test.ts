import { test } from "node:test";
import assert from "node:assert/strict";
import { Attribution } from "ox/erc8021";

test("builder code suffix is appended to calldata and can be read back", async () => {
  process.env.NEXT_PUBLIC_BUILDER_CODE = "bc_stockbuddy";
  const { withAttribution, DATA_SUFFIX } = await import("../lib/attribution.ts?code=1");
  assert.ok(DATA_SUFFIX);
  const calldata = "0x095ea7b3" as const;
  const out = withAttribution(calldata);
  assert.ok(out.startsWith(calldata));
  assert.ok(out.endsWith(DATA_SUFFIX!.slice(2)));
  const parsed = Attribution.fromData(out);
  assert.deepEqual(parsed?.codes, ["bc_stockbuddy"]);
});

test("without a builder code, calldata is unchanged", async () => {
  process.env.NEXT_PUBLIC_BUILDER_CODE = "";
  const { withAttribution } = await import("../lib/attribution.ts?code=0");
  assert.equal(withAttribution("0xabcdef"), "0xabcdef");
});
