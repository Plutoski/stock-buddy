// Referral links: stock-buddy…/s/NVDA?r=a11ce0
// A referral code is just the first 6 hex characters of the sharer's wallet, so nothing is stored
// about the sharer. When a friend's trade is verified on /proof, it records which code brought them.
// This only counts visitors; nobody is paid for referrals.

export const isRefCode = (r: unknown): r is string => typeof r === "string" && /^[0-9a-f]{6}$/.test(r);
export const refCodeFor = (wallet: string) => wallet.toLowerCase().replace(/^0x/, "").slice(0, 6);

const KEY = "sb_ref";
const WEEK = 7 * 86400_000;

/** Remember the code from a shared link (for a week). */
export function rememberRef(code: string | null) {
  if (!isRefCode(code)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage blocked */ }
}

/** The code that brought this visitor, unless it is their own. */
export function currentRef(wallet?: string): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as { code?: string; at?: number } | null;
    if (!v || !isRefCode(v.code) || !v.at || Date.now() - v.at > WEEK) return undefined;
    if (wallet && refCodeFor(wallet) === v.code) return undefined;
    return v.code;
  } catch { return undefined; }
}

/** The link someone shares for a stock, carrying their own code when their wallet is connected. */
export function shareUrl(origin: string, ticker: string, wallet?: string) {
  const r = wallet ? `?r=${refCodeFor(wallet)}` : "";
  return `${origin}/s/${encodeURIComponent(ticker)}${r}`;
}
