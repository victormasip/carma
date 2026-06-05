---
name: nextjs16-conventions
description: Installed Next.js 16.2.6 specifics that differ from training-data defaults (verified against node_modules/next/dist/docs)
metadata:
  type: reference
---

Next.js 16.2.6 in this repo. AGENTS.md mandates reading `node_modules/next/dist/docs/` before writing Next code. Verified facts:

- **Middleware is `src/proxy.ts`** (NOT middleware.ts). Build output labels it "Proxy (Middleware)". Auth lives there.
- **Server Actions**: doc at `01-app/03-api-reference/01-directives/use-server.md`. Pattern: `'use server'` at file top, every export must be an async function, auth-check inside, return only serializable data. Carma's `src/lib/actions/*.ts` follow this. Constraint (entry 16): non-async consts CANNOT be exported from a 'use server' file — keep page-size/config consts un-exported.
- **Route handlers**: doc at `01-app/01-getting-started/15-route-handlers.md` and `03-api-reference/03-file-conventions/route.md`. `export async function GET/POST(request: NextRequest)`; `export const runtime='nodejs'`, `export const dynamic='force-dynamic'` as needed. `params` is a Promise (await it). `request.nextUrl.searchParams` for query.
- **Route segment config** doc: `03-api-reference/03-file-conventions/02-route-segment-config`. (Cache-Control set via response headers in the handlers.)
- Mutations are done via Server Actions, not client SDK. Image transform + upload + import are route handlers (`/api/img`, `/api/upload`, `/api/import/*`).

Doc path to consult per topic, so future sessions don't re-discover:
- `01-app/01-getting-started/15-route-handlers.md` — route handlers
- `01-app/03-api-reference/01-directives/use-server.md` — server actions
- `01-app/03-api-reference/04-functions/use-router.md` — useRouter (client nav)
