import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, FlaskConical } from 'lucide-react'
import { getSession } from '@/lib/auth/session'

// Segment guard for /admin — strictly superadmin. Unauthenticated users are
// already bounced to "/" by the edge middleware; here we additionally redirect
// any authenticated NON-superadmin to their dashboard, so these internal tools
// are never reachable by clients even if they discover the URL.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = await getSession()
  if (!user) redirect('/')
  if (!isSuperAdmin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-bg-elevated/95 backdrop-blur flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Tauler</span>
          </Link>
          <span className="text-border">/</span>
          <span className="inline-flex items-center gap-2 font-semibold tracking-tight truncate">
            <FlaskConical className="w-4 h-4 text-accent" />
            Admin
          </span>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-subtle">Superadmin</span>
      </header>
      {children}
    </div>
  )
}
