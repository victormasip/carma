'use client'

import { useEffect } from 'react'

// Last-resort boundary: catches errors thrown in the root layout itself.
// Must render its own <html>/<body> because it replaces the root layout.
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
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', background: '#F9F8F6' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', border: '1px solid #f5f5f4', borderRadius: 32, boxShadow: '0 30px 70px -10px rgba(0,0,0,0.08)', padding: 40, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, margin: '0 auto 24px', background: '#fef2f2', color: '#ef4444', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>!</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1c1917', margin: 0 }}>Error crític</h1>
            <p style={{ fontSize: 14, color: '#78716c', marginTop: 8, lineHeight: 1.6 }}>
              L&apos;aplicació ha trobat un error inesperat. Torna a carregar la pàgina.
            </p>
            <button
              onClick={reset}
              style={{ marginTop: 28, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#d4af37', color: '#fff', fontWeight: 700, fontSize: 14 }}
            >
              Tornar a carregar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
