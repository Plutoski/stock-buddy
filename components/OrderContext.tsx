"use client";

import { createContext, useContext } from "react";
import type { Stock } from "@/lib/types.ts";
import type { MarketStatus } from "@/lib/market.ts";

/** An order the chat agent prepared. The user still reviews the quote and signs in their wallet. */
export type PreparedOrder =
  | { side: "buy"; stock: Stock; usdc: number }
  | { side: "sell"; stock: Stock; fraction?: number; tokens?: number };

export interface OrderCtx {
  stocks: Stock[];
  market?: MarketStatus;
  live: boolean;
  prepare: (order: PreparedOrder) => void;
  /** Open a stock's page (used by the chat's price answers). */
  open?: (stock: Stock) => void;
}

export const OrderContext = createContext<OrderCtx>({ stocks: [], live: false, prepare: () => {} });
export const useOrders = () => useContext(OrderContext);
