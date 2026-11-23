// Minimal JSON-RPC client for Base, used by /proof checks and the trade finder.
export const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

export type Rpc = <T>(method: string, params: unknown[]) => Promise<T>;

export const rpc: Rpc = async <T,>(method: string, params: unknown[]): Promise<T> => {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "rpc error");
  return body.result as T;
};
