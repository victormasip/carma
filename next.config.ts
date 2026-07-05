import type { NextConfig } from "next";

// Tunnel/proxy hosts allowed to reach this app. Ngrok's free tier hands out a NEW
// random subdomain on every restart (e.g. d4cf-… → ee68-…), so we MUST use a
// wildcard — pinning one subdomain silently breaks Server Actions (the /review
// "Aprovar i Publicar" POST) and dev assets the moment ngrok restarts.
const TUNNEL_ORIGINS = [
  "*.ngrok-free.app",
  "*.ngrok.app",
  "*.ngrok.io",
  "*.ngrok-free.dev",
  "*.trycloudflare.com",
  "carma.cat",
  "localhost",
];

const nextConfig: NextConfig = {
  // `next dev` blocks cross-origin requests to dev endpoints (incl. Server Actions)
  // unless the origin is allow-listed here.
  allowedDevOrigins: TUNNEL_ORIGINS,
  experimental: {
    // Production/proxy: Server Actions compare the request Origin against the host
    // and reject a mismatch (CSRF guard). Behind a tunnel the Origin is the tunnel
    // host, so it must be an allowed origin or every Approve/Edit POST 403s.
    serverActions: {
      allowedOrigins: TUNNEL_ORIGINS,
    },
  },
  // Production hardening.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
