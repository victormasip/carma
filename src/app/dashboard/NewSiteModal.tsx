'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Globe, Search, Check } from 'lucide-react'
import { createSite } from '@/lib/actions/sites'
import { Modal, ModalClose } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'

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

    if (result.error || !result.id) {
      setError(result.error ?? 'No s’ha pogut crear el lloc')
      setLoading(false)
      return
    }

    // Keep the button in its loading state through the navigation so the modal
    // never looks "done but nothing happened" while the new site page loads.
    router.push(`/dashboard/sites/${result.id}`)
  }

  return (
    <>
      <Button glow onClick={() => setIsOpen(true)} iconLeft={<Plus className="w-4 h-4" />}>
        Nou Lloc
      </Button>

      <Modal open={isOpen} onClose={handleClose} size="md" labelledBy="new-site-title">
        <ModalClose onClose={handleClose} />
        <div className="p-7">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-11 h-11 bg-accent-soft text-accent rounded-xl flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 id="new-site-title" className="text-lg font-semibold text-text">Crear un nou Lloc</h2>
              <p className="text-xs text-muted mt-0.5">
                Vincula un espai a un o més clients
              </p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text">
                Nom del Lloc
              </label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full h-11 px-3.5 bg-surface-subtle border border-border rounded-xl focus:outline-none focus:border-accent focus:bg-surface text-text placeholder:text-subtle transition-colors text-sm"
                placeholder="Ex: Blog de Viatges Acme"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-text">
                  Assignar Clients
                </label>
                {selectedIds.length > 0 && (
                  <span className="text-xs font-semibold text-accent bg-accent-soft px-2 py-0.5 rounded-md">
                    {selectedIds.length} seleccionat{selectedIds.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {clients.length === 0 ? (
                <p className="text-xs text-subtle">
                  No hi ha clients disponibles. Crea usuaris amb rol &quot;client&quot; des de Supabase.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle pointer-events-none z-10" />
                    <Input
                      type="text"
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      placeholder="Cerca per email…"
                      className="h-9 pl-8 pr-3 rounded-lg bg-surface-subtle text-xs"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-1 p-0.5">
                    {filteredClients.length === 0 ? (
                      <p className="text-xs text-subtle text-center py-4">Cap resultat per &quot;{clientSearch}&quot;</p>
                    ) : filteredClients.map(client => {
                      const isSelected = selectedIds.includes(client.id)
                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => toggleClient(client.id)}
                          className={`cursor-pointer w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                            isSelected
                              ? 'bg-accent-soft border border-accent/30'
                              : 'bg-surface-subtle border border-transparent hover:bg-surface-hover'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-accent border-accent' : 'border-border-strong'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-on-accent" strokeWidth={3} />}
                          </span>
                          <span className={`text-sm font-medium truncate ${isSelected ? 'text-text' : 'text-muted'}`}>
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
              <div className="p-3 text-xs rounded-lg bg-danger-soft border border-danger/20 text-danger font-medium">
                {error}
              </div>
            )}

            <div className="pt-2 flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel·lar
              </Button>
              <Button type="submit" glow loading={loading}>
                {loading ? 'Creant el lloc…' : 'Crear Lloc'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  )
}
