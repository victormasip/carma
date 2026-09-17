import { Suspense } from 'react'
import AppShell from '@/components/shell/AppShell'
import AppShellSkeleton from '@/components/shell/AppShellSkeleton'

// El layout ÚNIC del route group (app): /dashboard i /admin comparteixen
// aquest layout MUNTAT — navegar entre seccions ja no desmunta mai el sidebar
// (founder 2026-07-06: el shell parpellejava i el loader saltava). El gate de
// superadmin viu al layout niat de /admin.
//
// FASE 3/4 (Cache Components): tot el que hi ha sota és per-usuari i de temps de
// petició (sessió, llocs, saldo de punts, mètriques). Amb `cacheComponents` actiu,
// qualsevol lectura no cachejada fora d'un <Suspense> és un error de build — i,
// més important, aquest límit és exactament el que converteix l'espera en un
// ESQUELET amb la forma real de la pàgina en lloc del `RouteLoader` (una capa
// opaca `fixed inset-0` que 14 fitxers `loading.tsx` pintaven a cada navegació).
//
// El shell estàtic surt immediatament; la resta hi entra en streaming.
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  )
}
