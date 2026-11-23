import type { Stock } from "./types.ts";
import type { MarketStatus } from "./market.ts";
import { isOfficialPriceFrozen } from "./market.ts";

// Stock Buddy explains; it never recommends. These rules are shared by the
// built-in answers and the AI model's instructions.

const ADVICE_PATTERNS = [
  /\bshould (i|we|you)\b.{0,25}\b(buy|sell|invest|hold|get|keep|dump)\b/i,
  /\b(would|do) you\b.{0,20}\b(buy|sell|invest|hold|recommend|suggest|pick)\b/i,
  /\bwhat would you do\b/i,
  /\b(what|whatever|something|anything|whichever|which one)\b.{0,15}\byou\b.{0,15}\b(like|pick|buy|think|choose|prefer|recommend|would|want)\b/i,
  /\b(recommend|recommendation|suggest)\w*\b/i,
  /\b(is|are|it'?s)\b.{0,30}\b(a )?(good|smart|wise|safe|bad) (buy|investment|time|idea|bet|deal)\b/i,
  /\b(smart|wise|good idea) to (buy|sell|invest)\b/i,
  /\bworth (buying|it|investing|the money)\b/i,
  /\bbuy or sell\b|\bsell or (buy|hold)\b|\bhold or sell\b/i,
  /\b(bullish|bearish|undervalued|overvalued|cheap now|to the moon)\b/i,
  /\bwill .{0,30}\b(go up|go down|rise|fall|moon|crash|pump|drop|recover)\b/i,
  /\b(what|which) (stock|token|one)s?\b.{0,20}\b(buy|invest|pick|choose|best)\b/i,
  /\b(best|top) (stock|token|pick|investment)s?\b/i,
  /\b(price )?(prediction|target|forecast)s?\b/i,
  /\bguarantee/i,
  /\b(deber[ií]a|vale la pena|recomiendas|devrais-je|dois-je|conseilles|vale a pena|devo comprar)\b/i,
];

export function isAdviceQuestion(q: string): boolean {
  return ADVICE_PATTERNS.some((p) => p.test(q));
}

export const ADVICE_REPLY =
  "I can't tell you whether to buy, sell or hold, and I don't predict prices. That would be financial advice. " +
  "I can explain how a stock token works, what you'd own, what a purchase costs right now, and the risks. The decision is yours. " +
  "For personal advice, talk to a licensed financial adviser where you live.";

export function formatUsd(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "unavailable";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });
}

export function sharesPerToken(stock: Stock): string {
  return stock.multiplier.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Plain-language summary card text for one stock. */
export function explainStock(stock: Stock, market: MarketStatus): string[] {
  const lines = [
    `${stock.symbol} is a token on Base that tracks shares of ${stock.name}. Coinbase issues it, and real ${stock.ticker} shares held by a regulated custodian back each token.`,
    `Right now 1 ${stock.symbol} equals ${sharesPerToken(stock)} ${stock.ticker} share${stock.multiplier === 1 ? "" : "s"}. This number grows a little each time the company pays a dividend, so one token is not always exactly one share.`,
  ];
  if (stock.navPrice === undefined) {
    lines.push("Coinbase hasn't published an official price for this token yet, so there is nothing to compare the trading price with.");
  } else {
    lines.push(
      !isOfficialPriceFrozen(stock.navPriceUpdatedAt)
        ? `The official price is ${formatUsd(stock.navPrice)} per token, and it is updating right now.`
        : `The official price is ${formatUsd(stock.navPrice)} per token. It is frozen at its last value${market.isOpen ? "" : " until the US market opens"}, and the trading price on Base can move away from it until then.`,
    );
  }
  if (stock.pausedFeatures.length > 0) {
    lines.push("Some actions for this token are paused right now, which happens during a stock split or dividend. Trades may fail until Coinbase resumes them.");
  }
  return lines;
}

interface Topic { keys: RegExp; answer: (s?: Stock, m?: MarketStatus) => string }

const TOPICS: Topic[] = [
  {
    keys: /\b(what is|what's|explain|mean).{0,20}(tokeni[sz]ed|token|b20)\b|\btokeni[sz]ed stock/i,
    answer: () =>
      "A tokenized stock is a token on the Base blockchain that tracks a real company share. Coinbase holds the real shares with a regulated custodian and issues one token for each. You keep the token in your own wallet. Unlike shares in a brokerage account, you can trade it at any hour, any day.",
  },
  {
    keys: /\bmultipliers?\b|shares? per token|\bone token\b|\b1 \w*token\b|\bmean\b|\b1 [A-Z]+c\b/i,
    answer: (s) =>
      `The multiplier is the number of real shares one token tracks.${s ? ` For ${s.symbol} it is ${sharesPerToken(s)} right now.` : ""} It starts at 1. Each time the company pays a cash dividend, the dividend buys more shares per token, so the multiplier goes up a little. You keep the same number of tokens, and each one is worth slightly more of the company.`,
  },
  {
    keys: /\bdividend/i,
    answer: () =>
      "Dividends don't arrive as cash. When the company pays one, the token's multiplier goes up, so each token tracks slightly more of a share. Your number of tokens stays the same.",
  },
  {
    keys: /\bsplits?\b/i,
    answer: () =>
      "When a company splits its stock, say 1 share into 10, Coinbase updates the multiplier to match. Trading can pause briefly while that happens. Your part of the company stays the same.",
  },
  {
    keys: /\b(closed|weekend|night|after hours|market hours|open|frozen|drift|peg)\b/i,
    answer: (_s, m) =>
      `${m ? m.explanation + " " : ""}The token trades on Base at any hour. The US market trades Monday to Friday, 9:30 AM to 4:00 PM New York time. While it is closed, the official price stops moving, so the price on Base can be higher or lower than it. Gaps are usually bigger at weekends and on holidays.`,
  },
  {
    keys: /\b(fees?|costs?|gas|slippage|price impact|how much|charges?)\b/i,
    answer: () =>
      "Stock Buddy charges nothing. You pay the network fee on Base, usually under one cent, and the trading price, which can be above or below the official price while the US market is closed. The price can also move a little while your trade goes through. Stock Buddy stops the trade if it moves more than 0.5%, and shows the amount you'll receive before you confirm.",
  },
  {
    keys: /\b(risks?|risky|safe|safety|lose|losing|scams?)\b/i,
    answer: () =>
      "The stock price can fall, and you can lose money. While the US market is closed, the price on Base can move away from the real share price. If you lose access to your wallet, nobody can recover it for you. Coinbase can pause some actions, for example during a stock split. These tokens are only for eligible people outside the US. Use only money you can afford to lose.",
  },
  {
    keys: /\b(own|owns|ownership|voting|vote|rights|redeem|redemption|real shares?)\b/i,
    answer: () =>
      "Real shares held by a regulated custodian, separate from Coinbase, back each token one for one. Only approved participants who pass identity checks can swap tokens for the actual shares, so most people buy and sell the token itself on Base.",
  },
  {
    keys: /\b(no usdc|don'?t have (any )?usdc|get usdc|buy usdc|where.{0,15}usdc|fund (my )?wallet|top ?up)\b/i,
    answer: () =>
      "You pay with USDC, a digital dollar worth about $1, on the Base network. Most wallets also need a few cents of ETH on Base for the network fee. " +
      "Buy USDC on an exchange you already use, such as Coinbase, then withdraw it to your wallet address and choose Base as the network. " +
      "Check that the network says Base before you send, or the money may not arrive.",
  },
  {
    keys: /\b(usdc|stablecoin|wallet|base account)\b/i,
    answer: () =>
      "USDC is a digital dollar worth about $1, and it is what you pay with. You need a wallet on Base with some USDC in it. Base Account works on phone and laptop and takes seconds to create with a passkey. MetaMask and other browser wallets work too.",
  },
  {
    keys: /\b(why|how come)\b.{0,40}\b(higher|lower|more|less|different|gap|premium|discount)\b|\b(gap|premium|discount)\b/i,
    answer: (_s, m) =>
      "The official price follows the real US stock market. When that market is closed, at night, at weekends and on holidays, the official price stops moving, but people keep trading the token on Base. " +
      "If buyers on Base pay more than the frozen price, the token trades above it. If they pay less, it trades below. The gap often shrinks when the US market opens, and it can close in either direction. " +
      (m && !m.isOpen ? "The US market is closed right now." : ""),
  },
  {
    keys: /\b(sell|cash out|get my money|withdraw)\b/i,
    answer: () =>
      "You can sell at any time. Say \"sell half my NVDA\" here, or open the stock and choose Sell. You can sell 25%, 50%, all, or an exact amount, and you get USDC back in the same wallet. " +
      "Stock Buddy shows how the sale price compares with the official price before you confirm.",
  },
  {
    keys: /\b(my (stocks|tokens|holdings|portfolio)|what i own|see (my|what))\b/i,
    answer: () =>
      "Connect your wallet and Stock Buddy lists your stocks under My stocks, with the number of shares and today's value. " +
      "Your wallet app shows them too, as names ending in a small c, like NVDAc.",
  },
  {
    keys: /\b(buy|purchase|how do i (get|start))\b/i,
    answer: () =>
      "Say \"buy $5 of NVIDIA\" here, or connect a wallet with USDC on Base, pick a stock and enter an amount from $1 to $100. Review the quote, allow the swap to use that exact amount of USDC, then confirm the purchase in your wallet. Stock Buddy never holds your money.",
  },
  {
    // Case-sensitive "US"/"UK" so words like "tell us" don't match.
    keys: /\b(?:US|USA|UK)\b|\b(?:[Uu]nited [Ss]tates|[Aa]merica|[Ee]ligib\w*|[Cc]ountr(?:y|ies)|[Cc]anada|[Nn]igeria|[Uu]nited [Kk]ingdom|[Ww]here I live)\b/,
    answer: () =>
      "Coinbase tokenized stocks are only for eligible people outside the United States, and some other countries are excluded too. Stock Buddy can't confirm your country. Check Coinbase's terms for where you live before buying.",
  },
];

export function builtInAnswer(question: string, stock?: Stock, market?: MarketStatus): string {
  if (isAdviceQuestion(question)) return ADVICE_REPLY;
  for (const t of TOPICS) if (t.keys.test(question)) return t.answer(stock, market);
  if (stock && market) {
    return explainStock(stock, market).join(" ") +
      " Ask me about multipliers, dividends, market hours, costs or risks.";
  }
  return "I explain how tokenized stocks work and prepare trades. Try \"What is a tokenized stock?\", \"Why is the price different at night?\" or \"buy $5 of NVIDIA\".";
}

export function systemPrompt(stock?: Stock, market?: MarketStatus): string {
  const ctx = [
    market ? `US market status now: ${market.label}. ${market.explanation}` : "",
    stock
      ? `The user is looking at ${stock.symbol} (${stock.name}). Contract ${stock.address}. Multiplier (shares per token): ${sharesPerToken(stock)}. Official reference value per token: ${formatUsd(stock.navPrice)}, last updated ${stock.navPriceUpdatedAt ?? "unknown"}. Paused features: ${stock.pausedFeatures.length ? stock.pausedFeatures.join(", ") : "none"}.`
      : "",
  ].filter(Boolean).join("\n");

  return `You are Stock Buddy, a friendly guide that explains Coinbase tokenized stocks on Base to complete beginners.

Facts you can rely on:
- Coinbase tokenized stocks are B20 tokens on Base, each a claim on real US shares held 1:1 in regulated, segregated custody.
- One token does not always equal one share: the "multiplier" says how many shares one token represents. Cash dividends raise the multiplier instead of paying cash. Splits also update it.
- Tokens trade 24/7 on Base, but the official Chainlink reference price only updates while the US market is open (Mon–Fri 9:30–16:00 New York time) and freezes otherwise, so trading prices can drift from it.
- Holding and trading is permissionless; minting and redeeming is limited to approved participants with KYC. Only eligible people outside the US may use these tokens.
- Purchases in Stock Buddy are paid in USDC, capped at $100, with 0.5% max slippage, and the user signs every step in their own wallet.

Rules:
- Explain, never advise. Do not tell anyone to buy, sell or hold, do not predict prices, and do not rank stocks as better or worse investments. If asked, say kindly that you can't give financial advice and offer to explain how it works instead.
- Use short, plain sentences. No jargon without explaining it. Keep answers under 120 words unless asked for more.
- If you don't know something (like a specific live number not given below), say so rather than guessing.
- Mention a relevant risk when the user talks about buying.

Current context:
${ctx || "No stock selected."}`;
}
