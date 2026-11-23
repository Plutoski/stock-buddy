/** Stock Buddy mark: two price bars, the official one and the live one, slightly apart. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="logo-mark">
      <rect width="64" height="64" rx="14" fill="#0052FF" />
      <rect x="14" y="22" width="36" height="7" rx="3.5" fill="#fff" />
      <rect x="14" y="35" width="26" height="7" rx="3.5" fill="#fff" opacity=".62" />
    </svg>
  );
}
