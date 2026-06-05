'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, UserPlus, UserMinus, Users, Loader2, Globe, AlertTriangle, Search } from 'lucide-react'
import { updateSiteName, deleteSite, assignUserToSite, removeUserFromSite } from '@/lib/actions/sites'
import { useToast } from '@/components/ui/Toast'
import { Modal, ModalClose } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

type Client = { id: string; email: string }
type AssignedUser = { user_id: string; email: string }

function EditNameModal({
  siteId,
  currentName,
  open,
  onClose,
}: {
  siteId: string
  currentName: string
  open: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(currentName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await updateSiteName(siteId, name)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    toast('Nom del lloc actualitzat correctament')
    router.refresh()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} size="md" labelledBy="edit-site-title">
      <ModalClose onClose={onClose} />
      <div className="p-7">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-11 h-11 bg-accent-soft text-accent rounded-xl flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 id="edit-site-title" className="text-lg font-semibold text-text">Editar Lloc</h2>
            <p className="text-xs text-muted mt-0.5">Canvia el nom del lloc web</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text">Nom del Lloc</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors text-sm"
              required
            />
          </div>
          {error && (
            <div className="p-3 text-xs rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">{error}</div>
          )}
          <div className="pt-2 flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel·lar</Button>
            <Button type="submit" loading={loading}>Desar canvis</Button>
          </div>
        </form>
      </div>
    </Modal>
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

export function SiteAdminActions({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowEdit(true)}
          title="Editar nom"
          className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-muted bg-surface border border-border hover:border-border-strong hover:text-text hover:bg-surface-hover rounded-lg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />Editar
        </button>
        <button
          onClick={() => setShowDelete(true)}
          title="Eliminar lloc"
          className="cursor-pointer flex items-center justify-center w-8 h-8 text-subtle bg-surface border border-border hover:border-danger/40 hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <EditNameModal   siteId={siteId} currentName={siteName} open={showEdit}   onClose={() => setShowEdit(false)} />
      <DeleteSiteModal siteId={siteId} siteName={siteName}   open={showDelete} onClose={() => setShowDelete(false)} />
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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Afegir clients</p>

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
