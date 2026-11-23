import { createConfig, createStorage, http, noopStorage } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, injected } from "wagmi/connectors";

// Some browsers block storage (private modes, embedded frames, strict privacy settings).
// Simply *touching* window.localStorage there throws and would crash the whole app,
// so check it carefully and fall back to "no storage" (the user just reconnects).
function safeLocalStorage() {
  if (typeof window === "undefined") return noopStorage;
  try {
    const s = window.localStorage;
    const k = "__sb_test__";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return noopStorage;
  }
}

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    // Base Account (Coinbase): works on phone and laptop with a passkey, no extension needed.
    baseAccount({ appName: "Stock Buddy" }),
    // Browser wallets such as MetaMask, Rabby or the Coinbase Wallet extension.
    injected({ shimDisconnect: true }),
  ],
  storage: createStorage({ storage: safeLocalStorage() }),
  transports: { [base.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register { config: typeof wagmiConfig }
}
