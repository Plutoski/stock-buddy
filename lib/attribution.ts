import { Attribution } from "ox/erc8021";

// Base Builder Codes (ERC-8021): appending this suffix to every transaction's
// calldata tells Base that the transaction came from Stock Buddy, so it counts
// as our onchain traction in Stocks Maxxing.
const CODE = (process.env.NEXT_PUBLIC_BUILDER_CODE || "").trim();

export const BUILDER_CODE = CODE;
export const DATA_SUFFIX: `0x${string}` | undefined = CODE
  ? (Attribution.toDataSuffix({ codes: [CODE] }) as `0x${string}`)
  : undefined;

/** Append the builder-code suffix to calldata. */
export function withAttribution(data: `0x${string}`): `0x${string}` {
  if (!DATA_SUFFIX) return data;
  return `${data}${DATA_SUFFIX.slice(2)}` as `0x${string}`;
}
