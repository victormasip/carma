import KnotLoader from '@/components/ui/KnotLoader'

export default function ReviewLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <KnotLoader label="Carregant la revisió…" />
    </main>
  )
}
