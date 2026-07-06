import AppShell from '@/components/shell/AppShell'

// Segment guard for /admin — strictly superadmin (AppShell redirects any
// authenticated non-superadmin to /dashboard; the edge middleware already
// bounces the unauthenticated). Same shared shell as /dashboard, so the two
// sides of the app cannot drift visually.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell requireSuperAdmin>{children}</AppShell>
}
