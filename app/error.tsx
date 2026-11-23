"use client";

// Safety net: if anything unexpected breaks while rendering, show a friendly page
// with a retry button instead of a blank white screen.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="layout">
      <section className="card" role="alert">
        <h2>Something went wrong</h2>
        <p className="muted">Stock Buddy hit an unexpected problem loading this page. Your wallet and funds are not affected.</p>
        <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
      </section>
    </main>
  );
}
