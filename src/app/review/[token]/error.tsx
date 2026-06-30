'use client'

import SegmentError from '@/components/ui/SegmentError'

export default function ReviewError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <SegmentError
        error={error}
        reset={reset}
        title="No s'ha pogut obrir l'enllaç"
        message="Hi ha hagut un problema carregant aquesta revisió. Torna-ho a provar d'aquí un moment."
        homeHref="/"
        homeLabel="Carma"
      />
    </main>
  )
}
