import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    // Base Account (Coinbase): works on phone and laptop with a passkey, no extension needed.
    baseAccount({ appName: "Stock Buddy" }),
    // Browser wallets such as MetaMask, Rabby or the Coinbase Wallet extension.
    injected({ shimDisconnect: true }),
  ],
  transports: { [base.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register { config: typeof wagmiConfig }
}
