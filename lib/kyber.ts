export function kyberHeaders(): Record<string, string> {
  return { accept: "application/json", "x-client-id": process.env.KYBER_CLIENT_ID || "stock-buddy" };
}
