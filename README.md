# Stock Buddy

**Real stocks on Base, explained simply.** Stock Buddy is a plain-language guide and on-ramp for Coinbase tokenized stocks on Base, built for **Base Stocks Maxxing** (Agentic Stock Finance track).

Tokenized stocks are powerful but confusing for first-timers:
- one token doesn't always equal one share (the multiplier changes with dividends and splits),
- the official price freezes when the US market closes, while trading on Base continues 24/7,
- costs (swap price, slippage, network fee) are invisible until it's too late.

Stock Buddy shows all of this in plain English, answers questions in a chat that **explains but never advises**, and lets eligible users make a small, capped first purchase from their own wallet.

## For judges: verify in 2 minutes

| Do this | You'll see |
| --- | --- |
| Open the live app on your phone | Live list of Coinbase tokenized stocks with their reference value and multiplier |
| Tap any stock | "In plain English" explanation, plus whether the official price is updating or frozen right now |
| Ask "Should I buy this?" in the chat | A polite refusal to give advice, with an offer to explain instead |
| Ask "Why is the price different at night?" | A clear explanation of market hours and price drift |
| Connect a wallet and tap "See what I'd get" | A quote showing the trading price vs the official reference, with a warning if they differ by 1% or more |
| Check any Stock Buddy purchase on base.dev | Every transaction carries our ERC-8021 Builder Code |

## Safety by design

- **No custody.** Users sign every step in their own wallet. Tokens go straight back to the user's address.
- **Exact approvals only.** USDC approval is for the exact purchase amount, never unlimited.
- **Small, capped purchases:** $1 to $100, max 0.5% slippage.
- **Official tokens only.** Quotes are only allowed for tokens on Coinbase's tokenized stocks list.
- **No advice.** A hard guard intercepts buy/sell/prediction questions before they reach the AI.
- **Eligibility gate:** users confirm they're 18+, not US persons, and understand the risks.

## How it works

- `GET https://api.coinbase.com/v1/tokenized-stocks`: official token list, multipliers, reference values.
- KyberSwap aggregator on Base: best USDC → stock token route.
- `ox/erc8021`: Builder Code suffix appended to every transaction.
- Next.js 15, wagmi + viem, Base Account (passkey wallet on phone or laptop) and browser wallets.
- AI chat via the Anthropic API (optional). Without a key, built-in answers are used.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # open http://localhost:3000
npm test                     # 29 logic tests
```

## Environment variables

| Name | Required | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_BUILDER_CODE` | Yes, for traction | Your Base Builder Code (base.dev → Settings → Builder Codes) |
| `ANTHROPIC_API_KEY` | Optional | Turns on AI answers in the chat |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-haiku-5-5` |
| `KYBER_CLIENT_ID` | Optional | A short name for your app sent to KyberSwap |
| `USE_SAMPLE_DATA` | No | `1` forces sample data for offline testing |

## Disclaimer

Stock Buddy is an educational tool, not a broker or financial adviser. Coinbase tokenized stocks are available only to eligible persons outside the United States. Prices can go down as well as up.
