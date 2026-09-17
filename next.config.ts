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
  // ── Cache Components (Next 16) ──────────────────────────────────────────────
  // The keystone of the 2026-09-16 Super MVP plan. Turns rendering from
  // "static OR dynamic, per route" into a per-component spectrum with Partial
  // Prerendering as the default, and unlocks the three primitives the render
  // engine now depends on:
  //   · `use cache`  — cache the document build itself (render/theme.ts is a pure
  //                    function of (site, posts, theme, locale), so it caches
  //                    perfectly).
  //   · `cacheTag`   — tag those entries `site:<id>` / `post:<id>:<slug>`.
  //   · `updateTag`  — invalidate them the instant an article publishes. This is
  //                    what finally makes the ~8 revalidate call sites REAL; they
  //                    were no-ops against the old `force-dynamic` routes.
  // Cost of the switch: any uncached data access outside <Suspense> is now a build
  // error. The app group streams behind its shell skeleton (see (app)/layout.tsx).
  cacheComponents: true,

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
    // Barrel-file tree-shaking. lucide-react re-exports ~1000 icons from one entry;
    // without this every route that imports a single icon pulls the whole barrel
    // through the compiler. Same story for the TipTap entrypoints in the editor.
    optimizePackageImports: [
      "lucide-react",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extensions",
    ],
  },

  // Production hardening.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
