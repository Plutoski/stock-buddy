// US stock market hours, in plain language.
// Tokenized stocks trade 24/7 on Base, but the official (Chainlink) reference price
// only updates while the US market is open. Outside those hours it "freezes".

export type MarketState = "open" | "closed-overnight" | "closed-weekend" | "closed-holiday";

export interface MarketStatus {
  state: MarketState;
  isOpen: boolean;
  /** Short label, e.g. "US market open" */
  label: string;
  /** One-sentence plain-language explanation */
  explanation: string;
  /** Next open (or close, if open) as an ISO timestamp */
  nextChangeAt: string;
  nextChangeLabel: string;
}

const NY = "America/New_York";

// NYSE full-day closures (YYYY-MM-DD, New York date).
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);
// Early closes at 1:00 PM New York time.
const EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

interface NyParts { y: number; m: number; d: number; hh: number; mm: number; weekday: number; date: string }

function nyParts(at: Date): NyParts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(at)) p[part.type] = part.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  return { y, m, d, hh: Number(p.hour), mm: Number(p.minute), weekday, date: `${p.year}-${p.month}-${p.day}` };
}

/** Convert a New York wall-clock time to a real Date. */
export function nyTimeToDate(y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Work out New York's offset from UTC at that moment (handles daylight saving).
  const p = nyParts(new Date(guess));
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  const offset = asUtc - guess;
  return new Date(guess - offset);
}

function isTradingDay(date: string, weekday: number): boolean {
  return weekday >= 1 && weekday <= 5 && !HOLIDAYS.has(date);
}

function closeMinutes(date: string): number {
  return EARLY_CLOSE.has(date) ? 13 * 60 : 16 * 60;
}

function addDays(y: number, m: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), weekday: t.getUTCDay() };
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nextOpen(from: NyParts, includeToday: boolean): Date {
  for (let i = includeToday ? 0 : 1; i < 14; i++) {
    const day = addDays(from.y, from.m, from.d, i);
    if (isTradingDay(ymd(day.y, day.m, day.d), day.weekday)) {
      return nyTimeToDate(day.y, day.m, day.d, 9, 30);
    }
  }
  return nyTimeToDate(from.y, from.m, from.d + 1, 9, 30);
}

export function getMarketStatus(at: Date = new Date()): MarketStatus {
  const p = nyParts(at);
  const minutes = p.hh * 60 + p.mm;
  const trading = isTradingDay(p.date, p.weekday);
  const openMin = 9 * 60 + 30;
  const closeMin = closeMinutes(p.date);

  if (trading && minutes >= openMin && minutes < closeMin) {
    const closeAt = nyTimeToDate(p.y, p.m, p.d, Math.floor(closeMin / 60), closeMin % 60);
    return {
      state: "open",
      isOpen: true,
      label: "US market open",
      explanation:
        "The US stock market is open, so the official reference price is updating and should be close to the trading price.",
      nextChangeAt: closeAt.toISOString(),
      nextChangeLabel: "Closes",
    };
  }

  const reopen = nextOpen(p, trading && minutes < openMin);
  let state: MarketState = "closed-overnight";
  if (HOLIDAYS.has(p.date)) state = "closed-holiday";
  else if (p.weekday === 0 || p.weekday === 6) state = "closed-weekend";

  const why =
    state === "closed-holiday" ? "it's a US market holiday" :
    state === "closed-weekend" ? "it's the weekend in New York" :
    "it's outside New York trading hours (9:30 AM to 4:00 PM)";

  return {
    state,
    isOpen: false,
    label: "US market closed",
    explanation:
      state === "closed-overnight"
        ? `The US market is closed because ${why}. You can still trade the token on Base. The official reference price may update less often until the market reopens, so the trading price can drift away from it.`
        : `The US market is closed because ${why}. You can still trade the token on Base, but the official reference price is frozen at its last value, so the trading price can drift away from it.`,
    nextChangeAt: reopen.toISOString(),
    nextChangeLabel: "Opens",
  };
}

/** "3 hours ago", "2 days ago" */
export function timeAgo(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "unknown";
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Is the reference price old enough that users should be warned? */
export function isPriceStale(updatedAt: string | undefined, market: MarketStatus, now: Date = new Date()): boolean {
  if (!updatedAt) return true;
  const ageH = (now.getTime() - new Date(updatedAt).getTime()) / 3_600_000;
  if (!market.isOpen) return true; // frozen by design while the market is closed
  return ageH > 26; // the feed should refresh at least every ~24h while open
}

/** The official price counts as "frozen" when it hasn't updated for 30+ minutes. */
export const FROZEN_AFTER_MS = 30 * 60_000;
export function isOfficialPriceFrozen(updatedAt: string | undefined, now: Date = new Date()): boolean {
  if (!updatedAt) return true;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > FROZEN_AFTER_MS;
}
