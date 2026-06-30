'use client'

import { Plus, Crown } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'

/**
 * "Afegir lloc" for the client (free) dashboard. The free tier is ONE blog, so
 * adding another is a Premium action — this is a locked upsell, not a working
 * create flow (superadmins get the real NewSiteModal on the admin dashboard).
 * Kept as a `secondary` Button (not the gold primary) so it never reads as a
 * live create action; the crown badge signals it's premium-locked.
 */
export default function AddSiteButton() {
  const { toast } = useToast()
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
