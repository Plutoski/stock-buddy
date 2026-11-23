"use client";

import { useState } from "react";
import { dailyStats } from "@/lib/daily.ts";

const label = (day: string, long = false) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", long ? { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });

/** Verified trades per day for the last 14 days (UTC). One series, so no legend; hover shows the numbers. */
export function DailyChart({ records }: { records: { wallet: string; at: string }[] }) {
  const data = dailyStats(records);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 210, padL = 40, padB = 36, padT = 10;
  const max = Math.max(4, ...data.map((d) => d.trades));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const slot = (W - padL) / data.length;
  const barW = Math.max(6, slot - 6);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const h = hover !== null ? data[hover] : null;
  if (data.every((d) => d.trades === 0)) {
    return <p className="muted">No trades in the last 14 days yet. The chart fills in from the first one.</p>;
  }

  return (
    <div className="daily">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Verified trades per day for the last 14 days">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="grid" x1={padL} x2={W} y1={y(i * step)} y2={y(i * step)} />
            <text className="axis" x={padL - 6} y={y(i * step) + 4} textAnchor="end">{i * step}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const hBar = d.trades ? Math.max(4, y(0) - y(d.trades)) : 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} role="img"
              aria-label={`${label(d.day, true)}: ${d.trades} trades, ${d.newWallets} new wallets`}>
              <rect className={d.trades ? "bar" : "bar-zero"} x={x} y={y(0) - hBar} width={barW} height={hBar} rx={Math.min(4, barW / 2)} opacity={hover === null || hover === i ? 1 : 0.55} />
              <rect className="hit" x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} />
              {(i % 2 === data.length % 2 || data.length <= 7) && (
                <text className="axis" x={x + barW / 2} y={H - 8} textAnchor="middle">{label(d.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: `${(y(h.trades) / H) * 100}%`,
          // keep the tooltip inside the card at both ends
          transform: `translate(${hover >= data.length - 3 ? "-100%" : hover <= 1 ? "0%" : "-50%"}, calc(-100% - 10px))` }}>
          <strong>{label(h.day, true)}</strong><br />{h.trades} trade{h.trades === 1 ? "" : "s"}, {h.newWallets} new wallet{h.newWallets === 1 ? "" : "s"}
        </div>
      )}
      <details>
        <summary className="small">Show as a table</summary>
        <table>
          <thead><tr><th>Day (UTC)</th><th>Trades</th><th>New wallets</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.day}><td>{label(d.day, true)}</td><td>{d.trades}</td><td>{d.newWallets}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
