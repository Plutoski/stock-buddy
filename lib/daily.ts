// Trades and new wallets per UTC day, for the chart on /proof.
export interface DayStat { day: string; trades: number; newWallets: number }

export function dailyStats(records: { wallet: string; at: string }[], days = 14, now = new Date()): DayStat[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const keys = Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  const trades = new Map(keys.map((k) => [k, 0]));
  const firstDay = new Map<string, string>(); // wallet -> first day it traded
  for (const r of records) {
    // A record without a usable date is left out of the chart rather than breaking the page.
    const k = typeof r?.at === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.at) ? r.at.slice(0, 10) : "";
    if (!k || typeof r.wallet !== "string") continue;
    if (trades.has(k)) trades.set(k, trades.get(k)! + 1);
    const prev = firstDay.get(r.wallet);
    if (!prev || k < prev) firstDay.set(r.wallet, k);
  }
  const newWallets = new Map(keys.map((k) => [k, 0]));
  for (const k of firstDay.values()) if (newWallets.has(k)) newWallets.set(k, newWallets.get(k)! + 1);
  return keys.map((day) => ({ day, trades: trades.get(day)!, newWallets: newWallets.get(day)! }));
}
