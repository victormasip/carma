'use client'

import { Plus, Crown } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

/**
 * "Afegir lloc" for the client (free) dashboard. The free tier is ONE blog, so
 * adding another is a Premium action — this is a locked upsell, not a working
 * create flow (superadmins get the real NewSiteModal on the admin dashboard).
 */
export default function AddSiteButton() {
  const { toast } = useToast()
  return (
    <button
      type="button"
      onClick={() =>
        toast(
          'Tenir més d’un blog és una funció Premium. Contacta amb el teu administrador per ampliar el pla.',
          'info',
        )
      }
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-bold text-text shadow-sm transition-all hover:border-accent/40 hover:bg-accent-soft"
      title="Afegir un altre blog (Premium)"
    >
      <Plus className="h-4 w-4" />
      Afegir lloc
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent"
        aria-label="Funció Premium"
      >
        <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
    </button>
  )
}
