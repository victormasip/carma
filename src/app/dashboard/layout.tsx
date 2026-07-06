import AppShell from '@/components/shell/AppShell'

// El shell real viu a components/shell/AppShell — compartit amb /admin perquè
// els dos costats de l'app siguin VISUALMENT idèntics per construcció.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
