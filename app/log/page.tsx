import type { Metadata } from "next";
import { Logo } from "@/components/Logo.tsx";

// Public build log: every change pushed to the public repository, grouped by day.
// Read from GitHub's API and refreshed every 10 minutes.
export const dynamic = "force-dynamic"; // the GitHub request itself is cached for 10 minutes
export const metadata: Metadata = {
  title: "Build log: Stock Buddy",
  description: "Every change to Stock Buddy, by day, from the public GitHub repository.",
};

const REPO = "Plutoski/stock-buddy";

interface Commit { sha: string; html_url: string; commit: { message: string; author: { date: string } } }

async function getCommits(): Promise<Commit[] | null> {
  try {
    const all: Commit[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=100&page=${page}`, {
        headers: { accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return all.length ? all : null;
      const batch = (await res.json()) as Commit[];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  } catch { return null; }
}

const dayKey = (iso: string) => iso.slice(0, 10);
const dayLabel = (key: string) =>
  new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function LogPage() {
  const commits = await getCommits();
  const days = new Map<string, Commit[]>();
  for (const c of commits ?? []) {
    const k = dayKey(c.commit.author.date);
    days.set(k, [...(days.get(k) ?? []), c]);
  }
  const keys = [...days.keys()].sort().reverse();

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/"><Logo size={30} /> <span>Stock Buddy</span></a>
        <a className="btn btn-ghost" href="/">Back to stocks</a>
      </header>
      <main className="layout proof">
        <section>
          <h1>Build log</h1>
          <p className="muted">
            Every change to Stock Buddy, newest first, taken from the public code on{" "}
            <a href={`https://github.com/${REPO}`} target="_blank" rel="noreferrer">GitHub</a>. Dates are in UTC.
            Real trades are listed on the <a href="/proof">verified trades</a> page.
          </p>
          {commits === null && <p className="card">GitHub didn&apos;t answer just now. The full history is on <a href={`https://github.com/${REPO}/commits`}>GitHub</a>.</p>}
          {commits && keys.length === 0 && <p className="card">No changes yet.</p>}
          <ol className="log">
            {keys.map((k) => (
              <li key={k}>
                <h2>{dayLabel(k)}</h2>
                <p className="muted small">{days.get(k)!.length} change{days.get(k)!.length === 1 ? "" : "s"}</p>
                <ul>
                  {days.get(k)!.map((c) => (
                    <li key={c.sha}>
                      <a href={c.html_url} target="_blank" rel="noreferrer">{c.commit.message.split("\n")[0]}</a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
