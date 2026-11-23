# Stock Buddy

Stock Buddy helps first-time buyers use Coinbase tokenized stocks on Base. You tell it what you want, for example "buy $5 of NVIDIA". It gets a live quote, compares it with Coinbase's official price, explains the difference in plain English, and prepares the trade. You approve every step in your own wallet.

Live app: https://stock-buddy-gnt7.vercel.app
Verified trades: https://stock-buddy-gnt7.vercel.app/proof

Built for Base Stocks Maxxing, Agentic Stock Finance track.

## The problem it solves

Tokenized stocks confuse first-time buyers in three specific ways.

1. One token is not always one share. Each token tracks a number of shares called the multiplier, and the multiplier grows when the company pays a dividend.
2. The official price stops moving when the US market closes, but the token keeps trading on Base at night and at weekends. The price you pay can be several percent above or below the official price.
3. The costs are hard to see before you confirm: the trading price, the price movement during the trade, and the network fee.

Stock Buddy shows each of these before you buy or sell.

## Try it in two minutes

| Do this | What happens |
| --- | --- |
| Open the home page | The price gap meter compares the live trading price of NVDA, TSLA, GOOGL or META with its official price |
| Type "buy $5 of NVIDIA" in the chat | The agent finds the stock, gets a live quote, explains the price gap and whether the US market is open, and prepares the order. "Review and buy" opens it filled in |
| Type "sell half my Google" | The agent prepares a sale of half your GOOGLc and opens the Sell tab with the quote loaded |
| Ask "Should I buy Tesla?" | Stock Buddy says it can't give financial advice and offers to explain prices and risks instead |
| Open any stock | Plain-English facts: what one token equals in shares, the official price, whether it is frozen, and the gap |
| Connect a wallet | My stocks lists your tokenized stocks in shares and dollars |
| Open `/proof` | Every trade made through Stock Buddy, read back from the Base blockchain, with a Basescan link for each. The builder's own wallets are left out |
| Share a stock | WhatsApp, X and copy-link buttons. The link preview shows the live trading price, the official price and the gap |

## How your money stays safe

- Stock Buddy never holds money. Trades go from the user's wallet to the KyberSwap router on Base, and tokens come back to the same wallet.
- Approvals are for the exact amount of one trade, never unlimited.
- Purchases are limited to $1 to $100. The app and the server both check the limit. A trade stops if the price moves more than 0.5%.
- The server only builds swaps between USDC and a token on Coinbase's official list.
- Questions that ask for advice are refused before they reach any model.
- On the first visit, users confirm they are 18 or older, not a US person, and understand the risks.

## How /proof checks a trade

The server reads the transaction and its receipt from a Base RPC. A trade counts only if all of these hold:

- the transaction succeeded and the KyberSwap router emitted its `Swapped` event,
- the swap was USDC for a listed Coinbase stock token, or the other way round,
- the tokens were paid out to the same wallet that made the swap,
- the transaction carries the `stock-buddy` source label, or contains the exact swap calldata Stock Buddy built for that wallet.

Wallets listed in `PROOF_EXCLUDE_WALLETS` are left out of every number. Shared links carry a short code from the sharer's wallet, so `/proof` can count wallets that came from a friend's link. Nobody is paid for referrals.

## How it is built

- Coinbase tokenized stocks API (`GET https://api.coinbase.com/v1/tokenized-stocks`) for the token list, multipliers and official prices.
- KyberSwap aggregator on Base for quotes and swap transactions.
- Next.js 15, React 19, wagmi and viem. Base Account for passkey wallets on phone and laptop, plus browser wallets such as MetaMask.
- Upstash Redis for verified trades and the calldata Stock Buddy built.
- The chat parses trade requests itself and answers common questions with fixed answers. Setting `ANTHROPIC_API_KEY` adds model answers for other questions.
- 84 automated tests cover price gaps, market hours, trade parsing, the advice guard and trade verification.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # open http://localhost:3000
npm test                     # run the automated tests
```

## Environment variables

| Name | Required | What it is |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | For `/proof` | Added when you connect Upstash Redis in Vercel, under Storage |
| `PROOF_EXCLUDE_WALLETS` | For `/proof` | The builder's wallet addresses, separated by commas, left out of the public numbers |
| `BASE_RPC_URL` | No | Base RPC used to check trades. Defaults to https://mainnet.base.org |
| `KYBER_CLIENT_ID` | No | The client name sent to KyberSwap in a header |
| `ANTHROPIC_API_KEY` | No | Adds model answers in the chat |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-haiku-5-5` |
| `NEXT_PUBLIC_BUILDER_CODE` | No | A Base Builder Code (ERC-8021). Not set in the live app |
| `NEXT_PUBLIC_SITE_URL` | No | The public address used in link previews. Defaults to the live app |
| `USE_SAMPLE_DATA` | No | Set to `1` to use sample data without a network |

## Disclaimer

Stock Buddy is an educational tool. It is not a broker or a financial adviser. Coinbase tokenized stocks are only for eligible people outside the United States. Prices can go down as well as up.
