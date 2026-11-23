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
  "I can't tell you whether to buy, sell or hold anything, or predict prices. That's financial advice, and I'm an explainer, not an adviser. " +
  "What I can do is explain how a stock token works, what you'd actually own, what a purchase would cost, and the risks, so you can decide for yourself. " +
  "If you're unsure, speak to a licensed financial adviser where you live.";

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
    `${stock.symbol} is a token on Base that stands for shares of ${stock.name}. Each token is backed by real ${stock.ticker} shares held by a regulated custodian.`,
    `Right now 1 ${stock.symbol} = ${sharesPerToken(stock)} ${stock.ticker} share${stock.multiplier === 1 ? "" : "s"}. That number can grow over time when dividends are paid, so one token doesn't always equal exactly one share.`,
  ];
  if (stock.navPrice === undefined) {
    lines.push("Coinbase hasn't published an official reference value for this token yet, so compare the trading price carefully before buying.");
  } else {
    lines.push(
      !isOfficialPriceFrozen(stock.navPriceUpdatedAt)
        ? `The official reference value is ${formatUsd(stock.navPrice)} per token, and it's updating right now.`
        : `The official reference value is ${formatUsd(stock.navPrice)} per token, but it's frozen at its last value${market.isOpen ? "" : " until the US market reopens"}. The trading price on Base can move away from it in the meantime.`,
    );
  }
  if (stock.pausedFeatures.length > 0) {
    lines.push("Heads up: some actions for this token are paused right now, for example during a stock split or dividend. Transfers or trades may fail until it's resumed.");
  }
  return lines;
}

interface Topic { keys: RegExp; answer: (s?: Stock, m?: MarketStatus) => string }

const TOPICS: Topic[] = [
  {
    keys: /\b(what is|what's|explain|mean).{0,20}(tokeni[sz]ed|token|b20)\b|\btokeni[sz]ed stock/i,
    answer: () =>
      "A tokenized stock is a digital token that stands for a real share of a company. Coinbase buys and holds the real shares with a regulated custodian, then issues a matching token on the Base blockchain. Holding the token gives you a claim on the share, and you keep it in your own wallet. Unlike a normal brokerage account, you can trade it 24/7 and use it in other apps on Base.",
  },
  {
    keys: /\bmultipliers?\b|shares? per token|\bone token\b|\b1 \w*token\b|\bmean\b|\b1 [A-Z]+c\b/i,
    answer: (s) =>
      `The multiplier tells you how many real shares one token stands for.${s ? ` For ${s.symbol} it's ${sharesPerToken(s)} right now.` : ""} It starts at 1 and goes up slightly whenever the company pays a cash dividend, because the dividend is reinvested into more shares per token instead of being paid out in cash. Your number of tokens stays the same, but each token is worth a little more of the company.`,
  },
  {
    keys: /\bdividend/i,
    answer: () =>
      "You don't receive dividends as cash. When the company pays a dividend, the token's multiplier goes up, so each token you hold stands for slightly more of a share. Your token count doesn't change, but what each token is worth does.",
  },
  {
    keys: /\bsplits?\b/i,
    answer: () =>
      "When a company splits its stock (for example 1 share becomes 10), the multiplier is updated to match. Some actions may be paused briefly while it's processed. Your share of the company stays the same, it's just divided differently.",
  },
  {
    keys: /\b(closed|weekend|night|after hours|market hours|open|frozen|drift|peg)\b/i,
    answer: (_s, m) =>
      `${m ? m.explanation + " " : ""}The token trades 24/7 on Base, but the real US market only trades Monday to Friday, 9:30 AM to 4:00 PM New York time. When the market is closed, the official reference price stops updating, so the price you trade at on Base can be higher or lower than it. Gaps are often bigger over weekends and holidays.`,
  },
  {
    keys: /\b(fees?|costs?|gas|slippage|price impact|how much|charges?)\b/i,
    answer: () =>
      "A purchase has three costs. First, a small network fee (gas), usually a few cents on Base. Second, the swap price, which can differ from the official reference value, especially when the US market is closed. Third, slippage, a small price movement while your trade goes through. Stock Buddy caps slippage at 0.5% and shows you the exact amount you'll receive before you confirm.",
  },
  {
    keys: /\b(risks?|risky|safe|safety|lose|losing|scams?)\b/i,
    answer: () =>
      "The main risks are: the stock price can fall, and you can lose money. The trading price on Base can drift from the real share price when markets are closed. There's smart contract and wallet risk, so if you lose access to your wallet, nobody can recover it for you. Some actions can be paused, and these tokens are only for eligible people outside the US. Only use money you can afford to lose.",
  },
  {
    keys: /\b(own|owns|ownership|voting|vote|rights|redeem|redemption|real shares?)\b/i,
    answer: () =>
      "Each token is backed 1:1 by real shares held in segregated, regulated custody, separate from Coinbase. Holding the token gives you a claim on that share. Turning tokens back into actual shares (redemption) is limited to approved participants who pass identity checks, so most people buy and sell the token itself on Base.",
  },
  {
    keys: /\b(no usdc|don'?t have (any )?usdc|get usdc|buy usdc|where.{0,15}usdc|fund (my )?wallet|top ?up)\b/i,
    answer: () =>
      "To buy, you need USDC (a digital dollar, 1 USDC ≈ $1) on the Base network, plus a tiny bit of ETH on Base for the network fee if your wallet asks for it. " +
      "If you have a Coinbase account, buy USDC there and send it to your wallet address, choosing the Base network. From another exchange, withdraw USDC and pick Base as the network. " +
      "Always double-check the network is Base, or the funds may not arrive.",
  },
  {
    keys: /\b(usdc|stablecoin|wallet|base account)\b/i,
    answer: () =>
      "USDC is a digital dollar (1 USDC ≈ $1) and it's what you pay with. You need a wallet on the Base network with some USDC in it. Base Account (from Coinbase) works on both phone and laptop. You can also use MetaMask or the Coinbase Wallet browser extension.",
  },
  {
    keys: /\b(why|how come)\b.{0,40}\b(higher|lower|more|less|different|gap|premium|discount)\b|\b(gap|premium|discount)\b/i,
    answer: (_s, m) =>
      "The official price comes from the real US stock market. When that market is closed, especially at weekends and on holidays, the official price stops moving, but people keep trading the token on Base. " +
      "If buyers on Base are paying more than the frozen price, you see a premium; if less, a discount. The gap often shrinks when the US market reopens, but it can close in either direction. " +
      (m && !m.isOpen ? "The US market is closed right now." : ""),
  },
  {
    keys: /\b(sell|cash out|get my money|withdraw)\b/i,
    answer: () =>
      "The tokens are yours, in your own wallet, so you can sell them any time on Base by swapping back to USDC (for example with a DEX app or your wallet's swap feature). " +
      "Stock Buddy only helps with buying today. When you sell, check the trading price against the official price first, just like when you buy.",
  },
  {
    keys: /\b(my (stocks|tokens|holdings|portfolio)|what i own|see (my|what))\b/i,
    answer: () =>
      "Your tokens sit in your own wallet, so your wallet app shows them (look for names ending in a small c, like NVDAc). " +
      "To see how many real shares that is, multiply your token amount by the multiplier shown on the stock's page in Stock Buddy.",
  },
  {
    keys: /\b(buy|purchase|how do i (get|start))\b/i,
    answer: () =>
      "To buy with Stock Buddy: connect a wallet that has some USDC on Base, pick a stock, choose an amount (from $1), and review the quote. You'll let the swap use the exact USDC amount, then confirm the purchase in your wallet. You'll see the result and a receipt link. You stay in control the whole time, and Stock Buddy never holds your money.",
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
      " You can ask me about multipliers, dividends, market hours, costs or risks.";
  }
  return "I can explain how tokenized stocks work in plain language. Try asking: \"What is a tokenized stock?\", \"Why is the price different at night?\", \"What happens with dividends?\" or \"What does it cost to buy?\"";
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
