'use client'

import { useEffect } from 'react'

// Last-resort boundary: catches errors thrown in the root layout itself.
// Must render its own <html>/<body> because it replaces the root layout.
// Tokens aren't available here (the design system lives in globals.css which
// is mounted by the root layout we just bypassed), so colors are inline and
// follow the light theme.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Carma] Fatal error:', error)
  }, [error])

  return (
    <html lang="ca">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', background: '#F9F8F6', color: '#1c1917' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', border: '1px solid rgba(28,25,23,0.07)', borderRadius: 16, boxShadow: '0 1px 2px rgba(28,25,23,0.04)', padding: 32, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 20px', background: 'rgba(239,68,68,0.10)', color: '#ef4444', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>!</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1c1917', margin: 0 }}>Error crític</h1>
            <p style={{ fontSize: 14, color: '#57534e', marginTop: 8, lineHeight: 1.6 }}>
              L&apos;aplicació ha trobat un error inesperat. Torna a carregar la pàgina.
            </p>
            <button
              onClick={reset}
              style={{ marginTop: 24, padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#f5bc00', color: '#1a1400', fontWeight: 600, fontSize: 14 }}
            >
              Tornar a carregar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
