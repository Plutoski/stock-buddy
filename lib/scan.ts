// The trade finder. A trade made through Stock Buddy is normally recorded when the browser reports it.
// If the visitor closes the tab first, this finds it anyway: it reads stock-token transfers on Base,
// keeps the transactions that involve a wallet Stock Buddy recently built a swap for, and checks each
// one exactly like a submitted hash.
import type { Stock } from "./types.ts";
import { TRANSFER_TOPIC, verifyTrade, type ProofRecord, type RpcReceipt, type RpcTx, type RpcLog } from "./proof.ts";
import type { Rpc } from "./rpc.ts";

const topicAddr = (t?: string) => (t ? ("0x" + t.slice(-40)).toLowerCase() : "");
const hex = (n: number) => "0x" + n.toString(16);

export const CHUNK = 500;          // blocks per eth_getLogs call (about 17 minutes on Base)
export const MAX_PER_RUN = 3000;   // blocks per run (about 100 minutes)
export const MAX_GAP = 86_400;     // about 2 days; built swaps are only remembered that long

/** Which block range to read next, given the last block already read and the chain head. */
export function nextRange(last: number | null, head: number): { from: number; to: number } | null {
  let from = last === null ? head - 300 : last + 1;
  if (head - from > MAX_GAP) from = head - MAX_GAP;
  if (from > head) return null;
  return { from, to: Math.min(head, from + MAX_PER_RUN - 1) };
}

/** Transaction hashes in these logs where a recent Stock Buddy wallet sent or received a stock token. */
export function candidateHashes(logs: RpcLog[] & { transactionHash?: string }[], wallets: Set<string>): string[] {
  const out = new Set<string>();
  for (const l of logs as (RpcLog & { transactionHash?: string })[]) {
    if (l.topics?.[0] !== TRANSFER_TOPIC || !l.transactionHash) continue;
    if (wallets.has(topicAddr(l.topics[1])) || wallets.has(topicAddr(l.topics[2]))) out.add(l.transactionHash.toLowerCase());
  }
  return [...out];
}

export interface ScanDeps {
  rpc: Rpc;
  stocks: Stock[];
  wallets: string[];                       // wallets Stock Buddy built a swap for recently
  builtFor: (wallet: string) => Promise<string[]>;
  hasProof: (hash: string) => Promise<boolean>;
  saveProof: (r: ProofRecord) => Promise<boolean>;
}

export interface ScanResult { from: number; to: number; candidates: number; added: ProofRecord[] }

export async function scanRange(deps: ScanDeps, from: number, to: number): Promise<ScanResult> {
  const result: ScanResult = { from, to, candidates: 0, added: [] };
  const wallets = new Set(deps.wallets.map((w) => w.toLowerCase()));
  if (!wallets.size) return result;
  const addresses = deps.stocks.map((s) => s.address);
  const hashes = new Set<string>();
  // Public RPCs limit how much one eth_getLogs call may return; if a call is refused, split the range.
  const readLogs = async (a: number, b: number, depth = 0): Promise<void> => {
    try {
      const logs = await deps.rpc<(RpcLog & { transactionHash?: string })[]>("eth_getLogs", [{
        fromBlock: hex(a), toBlock: hex(b), address: addresses, topics: [TRANSFER_TOPIC],
      }]);
      for (const h of candidateHashes(logs || [], wallets)) hashes.add(h);
    } catch (e) {
      if (depth >= 4 || b - a < 20) throw e;
      const mid = Math.floor((a + b) / 2);
      await readLogs(a, mid, depth + 1);
      await readLogs(mid + 1, b, depth + 1);
    }
  };
  for (let a = from; a <= to; a += CHUNK) await readLogs(a, Math.min(to, a + CHUNK - 1));
  result.candidates = hashes.size;
  for (const hash of hashes) {
    if (await deps.hasProof(hash)) continue;
    const [tx, receipt] = await Promise.all([
      deps.rpc<RpcTx | null>("eth_getTransactionByHash", [hash]),
      deps.rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash]),
    ]);
    if (!tx || !receipt) continue;
    const probe = verifyTrade(tx, receipt, deps.stocks, new Date(), () => [], true);
    if (!probe.ok) continue;
    const built = await deps.builtFor(probe.record.wallet).catch(() => [] as string[]);
    const res = verifyTrade(tx, receipt, deps.stocks, new Date(), () => built);
    if (res.ok && (await deps.saveProof(res.record))) result.added.push(res.record);
  }
  return result;
}
