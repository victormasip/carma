'use client'

import { useState, useTransition, useMemo, useRef, useEffect, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, UserPlus, UserMinus, Users, Loader2, AlertTriangle, Search } from 'lucide-react'
import { updateSiteName, deleteSite, assignUserToSite, removeUserFromSite } from '@/lib/actions/sites'
import { useToast } from '@/components/ui/Toast'
import { Modal, ModalClose } from '@/components/ui/Modal'
import SaveStatus, { type SaveState } from '@/components/ui/SaveStatus'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { cn } from '@/lib/cn'

type Client = { id: string; email: string }
type AssignedUser = { user_id: string; email: string }

// Click-to-edit site title (replaces the old "Editar" modal — basic metadata is
// edited in place now). The H1 turns into an input on click; commit on Enter/blur
// saves optimistically in the background with a subtle SaveStatus indicator.
export function InlineSiteName({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [name, setName] = useState(siteName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(siteName)
  const [save, setSave] = useState<SaveState>('idle')
  const inRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => { if (editing) { inRef.current?.focus(); inRef.current?.select() } }, [editing])

  const open = () => { setDraft(name); setEditing(true) }
  const cancel = () => { setDraft(name); setEditing(false) }
  const commit = () => {
    setEditing(false)
    const next = draft.replace(/\s+/g, ' ').trim()
    if (!next || next === name) { setDraft(name); return }
    const prev = name
    setName(next)            // optimistic
    setSave('saving')
    void (async () => {
      const r = await updateSiteName(siteId, next)
      if (r.error) { setName(prev); setSave('error'); toast(r.error, 'error'); return }
      setSave('saved')
      setTimeout(() => setSave(s => (s === 'saved' ? 'idle' : s)), 1600)
    })()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  const typeClass = 'text-2xl sm:text-[28px] font-bold text-text tracking-tight'

  if (editing) {
    return (
      <input
        ref={inRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        aria-label="Nom del lloc"
        className={cn(typeClass, 'min-w-0 w-full max-w-md bg-surface-subtle border border-accent rounded-lg px-2 -mx-2 outline-none ring-2 ring-accent/20')}
      />
    )
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        type="button"
        onClick={open}
        title="Clica per canviar el nom"
        aria-label="Nom del lloc — clica per editar"
        className="group/name inline-flex items-center gap-2 min-w-0 text-left rounded-lg -mx-1 px-1 hover:bg-surface-hover transition-colors cursor-text"
      >
        <span className={cn(typeClass, 'truncate')}>{name}</span>
        <Pencil className="w-4 h-4 text-subtle opacity-0 group-hover/name:opacity-60 transition-opacity shrink-0" />
      </button>
      <SaveStatus state={save} className="shrink-0" />
    </div>
  )
}

function DeleteSiteModal({
  siteId,
  siteName,
  open,
  onClose,
}: {
  siteId: string
  siteName: string
  open: boolean
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    const result = await deleteSite(siteId)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    router.replace('/dashboard')
  }

  return (
    <Modal open={open} onClose={onClose} size="md" labelledBy="delete-site-title">
      <ModalClose onClose={onClose} />
      <div className="p-7">
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 bg-danger-soft text-danger rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 id="delete-site-title" className="text-lg font-semibold text-text">Eliminar Lloc</h2>
            <p className="text-xs text-muted mt-0.5">Aquesta acció no es pot desfer</p>
          </div>
        </div>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          Estàs a punt d&apos;eliminar <span className="font-semibold text-text">{siteName}</span> i tots els seus articles. La clau API deixarà de funcionar.
        </p>
        {error && (
          <div className="mb-4 p-3 text-xs rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">{error}</div>
        )}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel·lar</Button>
          <Button variant="danger" onClick={handleDelete} loading={loading}>Sí, eliminar</Button>
        </div>
      </div>
    </Modal>
  )
}

// Site-level admin actions. Renaming is now INLINE on the title (see
// InlineSiteName), so this is just the destructive Delete (kept behind a modal).
export function SiteAdminActions({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [showDelete, setShowDelete] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowDelete(true)}
        title="Eliminar lloc"
        aria-label="Eliminar lloc"
        className="cursor-pointer flex items-center justify-center w-8 h-8 text-subtle bg-surface border border-border hover:border-danger/40 hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <DeleteSiteModal siteId={siteId} siteName={siteName} open={showDelete} onClose={() => setShowDelete(false)} />
    </>
  )
}

export function SiteUsersManager({
  siteId,
  assignedUsers,
  availableClients,
}: {
  siteId: string
  assignedUsers: AssignedUser[]
  availableClients: Client[]
}) {
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  const assignedIds = new Set(assignedUsers.map(u => u.user_id))
  const unassigned = availableClients.filter(c => !assignedIds.has(c.id))

  const filteredUnassigned = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return unassigned
    return unassigned.filter(c => c.email.toLowerCase().includes(q))
  }, [unassigned, search])

  const handleAssign = (userId: string, email: string) => {
    setError(null)
    startTransition(async () => {
      const result = await assignUserToSite(siteId, userId)
      if (result.error) setError(result.error)
      else {
        toast(`${email} afegit correctament`)
        setSearch('')
        router.refresh()
      }
    })
  }

  const handleRemove = (userId: string, email: string) => {
    setError(null)
    startTransition(async () => {
      const result = await removeUserFromSite(siteId, userId)
      if (result.error) setError(result.error)
      else {
        toast(`Accés de ${email} revocat`)
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-accent-soft rounded-lg flex items-center justify-center text-accent shrink-0">
          <Users className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-semibold text-text">Usuaris Assignats</h3>
        <span className="text-xs font-semibold text-subtle">({assignedUsers.length})</span>
      </div>

      {assignedUsers.length === 0 ? (
        <p className="text-sm text-subtle mb-5">Cap usuari assignat a aquest site.</p>
      ) : (
        <ul className="space-y-1.5 mb-5">
          {assignedUsers.map(u => (
            <li key={u.user_id} className="flex items-center justify-between py-2 px-3 bg-surface-subtle rounded-lg group">
              <span className="text-sm font-medium text-text">{u.email}</span>
              <button
                onClick={() => handleRemove(u.user_id, u.email)}
                disabled={isPending}
                title="Revocar accés"
                className="cursor-pointer p-1.5 text-subtle hover:text-danger hover:bg-danger-soft rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {unassigned.length > 0 && (
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Afegir clients</p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per email…"
              className="w-full h-10 pl-9 pr-3 bg-surface-subtle border border-border rounded-lg text-sm focus:outline-none focus:border-accent focus:bg-surface transition-colors text-text placeholder:text-subtle"
            />
          </div>

          {filteredUnassigned.length === 0 ? (
            <p className="text-xs text-subtle text-center py-2">
              {search ? 'Cap resultat' : 'Tots els clients ja estan assignats'}
            </p>
          ) : (
            <ul className="max-h-52 overflow-y-auto space-y-1">
              {filteredUnassigned.map(c => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-surface-hover rounded-lg transition-colors"
                >
                  <span className="text-sm font-medium text-text">{c.email}</span>
                  <Button
                    size="sm"
                    onClick={() => handleAssign(c.id, c.email)}
                    disabled={isPending}
                    iconLeft={isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                  >
                    Afegir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 text-xs rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">
          {error}
        </div>
      )}
    </Card>
  )
}
