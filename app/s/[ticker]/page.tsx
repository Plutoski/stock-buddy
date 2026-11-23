import type { Metadata } from "next";
import { Go } from "./go.tsx";

// A shareable link for one stock: /s/NVDA?r=a11ce0
// Link previews (WhatsApp, X, Telegram) read the image below; people are sent on to the stock in the app.
type Props = { params: Promise<{ ticker: string }>; searchParams: Promise<{ r?: string }> };

const clean = (t: string) => decodeURIComponent(t).toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 12);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = clean((await params).ticker);
  const title = `${t} on Base · Stock Buddy`;
  const description = `See ${t}'s trading price next to its official price before you buy. Start with $1, in your own wallet.`;
  const image = { url: `/api/og?t=${encodeURIComponent(t)}`, width: 1200, height: 630, alt: `${t} price on Stock Buddy` };
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://stock-buddy-gnt7.vercel.app"),
    title, description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const t = clean((await params).ticker);
  const r = (await searchParams).r;
  const ref = typeof r === "string" && /^[0-9a-f]{6}$/.test(r) ? r : "";
  const to = `/?s=${encodeURIComponent(t)}${ref ? `&r=${ref}` : ""}`;
  return (
    <main className="layout" style={{ padding: 32 }}>
      <Go to={to} />
      <p>Opening {t} in Stock Buddy… <a href={to}>Tap here if nothing happens</a>.</p>
    </main>
  );
}
