'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Globe, Search, Check } from 'lucide-react'
import { createSite } from '@/lib/actions/sites'

type Client = { id: string; email: string }

export default function NewSiteModal({ clients }: { clients: Client[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => c.email.toLowerCase().includes(q))
  }, [clients, clientSearch])

  const toggleClient = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleClose = () => {
    setIsOpen(false)
    setSiteName('')
    setSelectedIds([])
    setClientSearch('')
    setError(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = await createSite(siteName, selectedIds)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
    handleClose()
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400 text-white px-6 py-3 rounded-xl text-sm font-bold tracking-wide shadow-[0_10px_30px_-6px_rgba(212,175,55,0.3)] transition-all duration-300 flex items-center gap-2 cursor-pointer"
      >
        <Plus className="w-5 h-5" />
        Nou Lloc
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-premium p-10">
            <button
              onClick={handleClose}
              className="cursor-pointer absolute top-6 right-6 p-2 text-neutral-400 hover:text-neutral-900 bg-neutral-50 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-carma-50 text-carma-500 rounded-2xl flex items-center justify-center">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-neutral-900">Crear un nou Lloc</h2>
                <p className="text-xs font-medium text-neutral-500 mt-1">
                  Vincula un espai a un o més clients
                </p>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest pl-1">
                  Nom del Lloc
                </label>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="w-full px-4 py-3.5 bg-neutral-50/50 border border-neutral-200/80 rounded-xl focus:outline-none focus:border-carma-500 focus:bg-white text-sm font-medium transition-all"
                  placeholder="Ex: Blog de Viatges Acme"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between pl-1">
                  <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                    Assignar Clients
                  </label>
                  {selectedIds.length > 0 && (
                    <span className="text-[11px] font-bold text-carma-600 bg-carma-50 px-2 py-0.5 rounded-full">
                      {selectedIds.length} seleccionat{selectedIds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {clients.length === 0 ? (
                  <p className="text-xs text-neutral-400 px-1">
                    No hi ha clients disponibles. Crea usuaris amb rol &quot;client&quot; des de Supabase.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        placeholder="Cerca per email..."
                        className="w-full pl-8 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-carma-400 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto space-y-1 p-0.5">
                      {filteredClients.length === 0 ? (
                        <p className="text-xs text-neutral-400 text-center py-4">Cap resultat per &quot;{clientSearch}&quot;</p>
                      ) : filteredClients.map(client => {
                        const isSelected = selectedIds.includes(client.id)
                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => toggleClient(client.id)}
                            className={`cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                              isSelected
                                ? 'bg-carma-50 border border-carma-200'
                                : 'bg-neutral-50 border border-transparent hover:bg-neutral-100'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? 'bg-carma-500 border-carma-500' : 'border-neutral-300'
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <span className={`text-sm font-medium truncate ${isSelected ? 'text-carma-800' : 'text-neutral-700'}`}>
                              {client.email}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-100 text-red-600 font-medium">
                  {error}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="cursor-pointer flex-1 py-4 text-sm font-bold text-neutral-500 hover:bg-neutral-100 rounded-xl transition-colors"
                >
                  Cancel·lar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer flex-[2] bg-gradient-to-r from-carma-600 via-carma-500 to-carma-600 hover:from-carma-500 hover:to-carma-400 text-white py-4 rounded-xl font-bold text-sm tracking-wide flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Crear Lloc'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
