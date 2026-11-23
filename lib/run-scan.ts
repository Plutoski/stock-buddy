// Runs the trade finder once: reads new blocks since the last run and records any Stock Buddy trades.
import { getStocks } from "./stocks.ts";
import { rpc } from "./rpc.ts";
import { nextRange, scanRange, type ScanResult } from "./scan.ts";
import { storeConfigured, tryLock, getScanBlock, setScanBlock, recentBuilders, builtFor, hasProof, saveProof } from "./store.ts";

export type RunOutcome = { ran: false; reason: string } | ({ ran: true; wallets: number } & ScanResult);

export async function runScan(lockSeconds = 90): Promise<RunOutcome> {
  if (!storeConfigured()) return { ran: false, reason: "storage not configured" };
  if (!(await tryLock("scan", lockSeconds))) return { ran: false, reason: "already ran recently" };
  const head = Number(BigInt(await rpc<string>("eth_blockNumber", [])));
  const range = nextRange(await getScanBlock(), head);
  if (!range) return { ran: false, reason: "no new blocks" };
  const wallets = await recentBuilders();
  const { stocks, source } = await getStocks();
  if (source !== "live") return { ran: false, reason: "live stock list unavailable" };
  const result = await scanRange({ rpc, stocks, wallets, builtFor, hasProof, saveProof }, range.from, range.to);
  await setScanBlock(range.to);
  return { ran: true, wallets: wallets.length, ...result };
}
