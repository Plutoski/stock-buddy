"use client";

import { useEffect, useState } from "react";

const KEY = "stockbuddy.ack.v1";

function readAck(): boolean {
  try { return window.localStorage.getItem(KEY) === "yes"; } catch { return false; }
}
function writeAck() {
  try { window.localStorage.setItem(KEY, "yes"); } catch { /* storage unavailable: ask again next time */ }
}

export function EligibilityGate() {
  const [show, setShow] = useState(false);
  const [checks, setChecks] = useState({ age: false, us: false, advice: false });

  useEffect(() => { if (!readAck()) setShow(true); }, []);
  if (!show) return null;

  const all = checks.age && checks.us && checks.advice;
  const toggle = (k: keyof typeof checks) => setChecks((c) => ({ ...c, [k]: !c[k] }));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="modal">
        <h2 id="gate-title">Before you start</h2>
        <p className="muted">
          Stock Buddy explains Coinbase tokenized stocks on Base in plain language. It's a learning tool, not a broker or an adviser.
        </p>
        <label className="check">
          <input type="checkbox" checked={checks.age} onChange={() => toggle("age")} />
          <span>I am 18 or older.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={checks.us} onChange={() => toggle("us")} />
          <span>I'm not a US person, and tokenized stocks are allowed where I live.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={checks.advice} onChange={() => toggle("advice")} />
          <span>I understand this is not financial advice, prices can fall, and I could lose money.</span>
        </label>
        <button className="btn btn-primary btn-block" disabled={!all} onClick={() => { writeAck(); setShow(false); }}>
          Continue
        </button>
      </div>
    </div>
  );
}
