import AppShell from '@/components/shell/AppShell'

// El layout ÚNIC del route group (app): /dashboard i /admin comparteixen
// aquest layout MUNTAT — navegar entre seccions ja no desmunta mai el sidebar
// (founder 2026-07-06: el shell parpellejava i el loader saltava). El gate de
// superadmin viu al layout niat de /admin.
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
