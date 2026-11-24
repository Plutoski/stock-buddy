/** @type {import('next').NextConfig} */
// Browser security headers for every page and API response.
// - frame-ancestors / X-Frame-Options: no other site can show Stock Buddy inside a frame, so nobody can
//   overlay a fake page on top of the real buttons (clickjacking).
// - No Cross-Origin-Opener-Policy on purpose: Base Account signs in a popup that talks back to this page.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack: (config) => {
    // The Base Account SDK optionally references payment (x402) and logging packages
    // that Stock Buddy never uses. Tell the bundler to treat them as empty.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@coinbase/cdp-sdk": false,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
