'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, UserPlus, UserMinus, Users, X, Loader2, Globe, AlertTriangle, Search } from 'lucide-react'
import { updateSiteName, deleteSite, assignUserToSite, removeUserFromSite } from '@/lib/actions/sites'
import { useToast } from '@/components/ui/Toast'

type Client = { id: string; email: string }
type AssignedUser = { user_id: string; email: string }

function EditNameModal({
  siteId,
  currentName,
  onClose,
}: {
  siteId: string
  currentName: string
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm" style={{ animation: 'modal-fade 0.18s ease' }}>
      <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-premium p-10" style={{ animation: 'modal-in 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
        <button onClick={onClose} className="cursor-pointer absolute top-6 right-6 p-2 text-neutral-400 hover:text-neutral-900 bg-neutral-50 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-carma-50 text-carma-500 rounded-2xl flex items-center justify-center">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-neutral-900">Editar Lloc</h2>
            <p className="text-xs font-medium text-neutral-500 mt-1">Canvia el nom del lloc web</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest pl-1">Nom del Lloc</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3.5 bg-neutral-50/50 border border-neutral-200/80 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-sm font-medium transition-all"
              required
            />
          </div>
          {error && <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-100 text-red-600 font-medium">{error}</div>}
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="cursor-pointer flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-100 rounded-xl transition-colors">
              Cancel·lar
            </button>
            <button type="submit" disabled={loading} className="cursor-pointer flex-[2] bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 text-white py-4 rounded-xl font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Desar canvis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteSiteModal({
  siteId,
  siteName,
  onClose,
}: {
  siteId: string
  siteName: string
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm" style={{ animation: 'modal-fade 0.18s ease' }}>
      <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-premium p-10" style={{ animation: 'modal-in 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
        <button onClick={onClose} className="cursor-pointer absolute top-6 right-6 p-2 text-neutral-400 hover:text-neutral-900 bg-neutral-50 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-neutral-900">Eliminar Lloc</h2>
            <p className="text-xs font-medium text-neutral-500 mt-1">Aquesta acció no es pot desfer</p>
          </div>
        </div>
        <p className="text-sm text-neutral-600 mb-6 leading-relaxed">
          Estàs a punt d&apos;eliminar <strong>{siteName}</strong> i tots els seus articles. La clau API deixarà de funcionar.
        </p>
        {error && <div className="mb-4 p-3 text-xs rounded-xl bg-red-50 border border-red-100 text-red-600 font-medium">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="cursor-pointer flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-100 rounded-xl transition-colors">
            Cancel·lar
          </button>
          <button onClick={handleDelete} disabled={loading} className="cursor-pointer flex-[2] bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function SiteAdminActions({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button onClick={() => setShowEdit(true)} title="Editar nom" className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-neutral-600 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-lg shadow-sm transition-all">
          <Pencil className="w-3.5 h-3.5" />Editar
        </button>
        <button onClick={() => setShowDelete(true)} title="Eliminar lloc" className="cursor-pointer flex items-center justify-center w-8 h-8 text-neutral-400 bg-white border border-neutral-200 hover:border-red-200 hover:text-red-600 hover:bg-red-50 rounded-lg shadow-sm transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {showEdit   && <EditNameModal   siteId={siteId} currentName={siteName} onClose={() => setShowEdit(false)} />}
      {showDelete && <DeleteSiteModal siteId={siteId} siteName={siteName}   onClose={() => setShowDelete(false)} />}
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
    <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 bg-carma-50 rounded-lg flex items-center justify-center text-carma-500">
          <Users className="w-4 h-4" />
        </div>
        <h3 className="text-base font-bold text-neutral-900">Usuaris Assignats</h3>
        <span className="ml-1 text-sm font-semibold text-neutral-400">({assignedUsers.length})</span>
      </div>

      {assignedUsers.length === 0 ? (
        <p className="text-sm text-neutral-400 mb-5 px-1">Cap usuari assignat a aquest site.</p>
      ) : (
        <ul className="space-y-1.5 mb-5">
          {assignedUsers.map(u => (
            <li key={u.user_id} className="flex items-center justify-between py-2.5 px-4 bg-neutral-50 rounded-xl group">
              <span className="text-sm font-medium text-neutral-700">{u.email}</span>
              <button
                onClick={() => handleRemove(u.user_id, u.email)}
                disabled={isPending}
                title="Revocar accés"
                className="cursor-pointer p-1.5 text-neutral-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {unassigned.length > 0 && (
        <div className="border-t border-neutral-100 pt-4 space-y-3">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Afegir clients</p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per email..."
              className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:border-carma-400 focus:bg-white transition-all"
            />
          </div>

          {filteredUnassigned.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-2">
              {search ? 'Cap resultat' : 'Tots els clients ja estan assignats'}
            </p>
          ) : (
            <ul className="max-h-52 overflow-y-auto space-y-1">
              {filteredUnassigned.map(c => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-neutral-50 rounded-xl transition-colors"
                >
                  <span className="text-sm font-medium text-neutral-700">{c.email}</span>
                  <button
                    onClick={() => handleAssign(c.id, c.email)}
                    disabled={isPending}
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 bg-carma-500 hover:bg-carma-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                    Afegir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 text-xs rounded-xl bg-red-50 border border-red-100 text-red-600 font-medium">
          {error}
        </div>
      )}
    </div>
  )
}
