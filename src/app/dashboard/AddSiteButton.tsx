'use client'

import { Plus, Crown } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'

/**
 * "Afegir lloc" for the client dashboard. Plan-aware (2026-07-06): when the
 * user's plan still has room (SITE_LIMITS — premium 3 / gold 10 / agency 100),
 * this is a REAL create action into the clone funnel. At the limit (free = 1
 * blog) it stays the locked upsell with the crown badge.
 */
export default function AddSiteButton({ canCreate = false }: { canCreate?: boolean }) {
  const { toast } = useToast()
  if (canCreate) {
    return (
      <Button href="/benvinguda" glow iconLeft={<Plus className="h-4 w-4" />}>
        Afegir lloc
      </Button>
    )
  }
  return (
    <Button
      variant="secondary"
      title="Afegir un altre blog (Premium)"
      onClick={() =>
        toast(
          'Tenir més d’un blog és una funció Premium. Contacta amb el teu administrador per ampliar el pla.',
          'info',
        )
      }
      iconLeft={<Plus className="h-4 w-4" />}
      iconRight={
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent"
          aria-label="Funció Premium"
        >
          <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
        </span>
      }
    >
      Afegir lloc
    </Button>
  )
}
