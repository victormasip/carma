'use client'

// /admin/users — la taula de gestió d'usuaris del superadmin (client half).
//
// Tot el filtratge/ordenació és INSTANTANI al client (el servidor envia fins a
// 500 perfils d'una tacada — de sobres per ara, i zero latència per tecla).
// Les mutacions són server actions que re-verifiquen superadmin a la BD:
//   · Ajustar punts  → modal ràpid; queda al llibre major (admin_grant /
//     admin_adjustment) amb el ref de QUI ho ha fet.
//   · Canviar pla    → select inline; una millora re-avalua i puja el saldo a
//     la nova assignació a l'instant.
//   · Superadmin     → interruptor (∞ punts); mai sobre tu mateix.
//   · Eliminar       → només comptes no-superadmin, amb confirmació; els llocs
//     es conserven (esborrar contingut és una decisió separada).
// Cada fila s'EXPANDEIX per veure els llocs de l'usuari (amb enllaç directe),
// l'estat de WhatsApp i les accions perilloses. Cada resposta del servidor
// re-patcha la fila localment → la taula sempre diu la veritat sense esperar
// un refresh sencer.

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, Users, Sparkles, ShieldCheck, X, ArrowUpDown, ArrowDown01, ArrowDown10,
  Infinity as InfinityIcon, Globe, Copy as CopyIcon, ChevronDown, MessageCircle,
  FileText, Trash2, ExternalLink,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { adminAdjustKarma, adminSetPlan, adminSetSuperadmin, adminDeleteUser } from '@/lib/actions/admin-users'
import type { KarmaPlan } from '@/lib/karma/config'

export type AdminUserSite = { id: string; name: string; subdomain: string | null }

export type AdminUserRow = {
  id: string
  email: string
  plan: KarmaPlan
  superadmin: boolean
  /** null = cartera encara no estrenada (saldo efectiu = assignació). */
  balance: number | null
  allocation: number
  sites: AdminUserSite[]
  postsTotal: number
  waActive: boolean
  createdAt: string
}

const PLAN_LABELS: Record<KarmaPlan, string> = {
  free: 'Gratuït', premium: 'Premium', gold: 'Gold', agency: 'Agència',
}
const PLAN_BADGE: Record<KarmaPlan, string> = {
  free: 'bg-surface-subtle text-muted',
  premium: 'bg-accent-soft text-accent',
  gold: 'bg-accent-soft text-accent',
  agency: 'bg-success-soft text-success',
}

type PlanFilter = 'all' | KarmaPlan | 'superadmin' | 'whatsapp'
type SortMode = 'recent' | 'balance-desc' | 'balance-asc'

/** Cerca sense accents ni majúscules — mateixa filosofia que el cercador del Studio. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function UsersClient({ rows: initialRows, selfId, capped }: {
  rows: AdminUserRow[]
  selfId: string
  capped: boolean
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [query, setQuery] = useState('')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [sort, setSort] = useState<SortMode>('recent')
  const [adjusting, setAdjusting] = useState<AdminUserRow | null>(null)
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const patchRow = (id: string, patch: Partial<AdminUserRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const dropRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id))

  const effective = (r: AdminUserRow) =>
    r.superadmin ? Number.POSITIVE_INFINITY : (r.balance ?? r.allocation)

  const visible = useMemo(() => {
    const q = fold(query.trim())
    let out = rows.filter((r) => {
      if (planFilter === 'superadmin' && !r.superadmin) return false
      if (planFilter === 'whatsapp' && !r.waActive) return false
      if (planFilter !== 'all' && planFilter !== 'superadmin' && planFilter !== 'whatsapp' && r.plan !== planFilter) return false
      if (!q) return true
      if (fold(r.email).includes(q)) return true
      if (r.id.toLowerCase().startsWith(q)) return true
      return r.sites.some((s) => fold(s.name).includes(q) || s.id.toLowerCase().startsWith(q) || fold(s.subdomain ?? '').includes(q))
    })
    if (sort !== 'recent') {
      out = [...out].sort((a, b) =>
        sort === 'balance-desc' ? effective(b) - effective(a) : effective(a) - effective(b))
    }
    return out
  }, [rows, query, planFilter, sort])

  const counts = useMemo(() => ({
    all: rows.length,
    superadmin: rows.filter((r) => r.superadmin).length,
    whatsapp: rows.filter((r) => r.waActive).length,
  }), [rows])

  return (
    <div>
      {/* ── Capçalera ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-text">
            <Users className="h-6 w-6 text-accent" /> Usuaris
          </h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} comptes{capped ? ' (mostrant els 500 més recents)' : ''} · cerca per email, id o nom de lloc · clica una fila per al detall
          </p>
        </div>
        <SortPicker sort={sort} onChange={setSort} />
      </div>

      {/* ── Cerca + filtres ── */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per email, id o nom de lloc…"
            className="w-full rounded-xl border border-border-strong bg-surface py-2.5 pl-9 pr-3 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'free', 'premium', 'gold', 'agency', 'superadmin', 'whatsapp'] as PlanFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPlanFilter(f)}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                planFilter === f
                  ? 'border-accent/50 bg-accent-soft text-accent'
                  : 'border-border bg-surface text-muted hover:text-text',
              )}
            >
              {f === 'all' ? `Tots (${counts.all})`
                : f === 'superadmin' ? `Superadmins (${counts.superadmin})`
                : f === 'whatsapp' ? `WhatsApp (${counts.whatsapp})`
                : PLAN_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Taula ── */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle text-left text-xs font-extrabold uppercase tracking-wider text-subtle">
              <th className="px-4 py-3">Usuari</th>
              <th className="px-4 py-3">Pla</th>
              <th className="px-4 py-3 text-right">Punts</th>
              <th className="px-3 py-3 text-center">Llocs</th>
              <th className="px-3 py-3 text-center">Articles</th>
              <th className="px-3 py-3 text-center">WA</th>
              <th className="px-4 py-3">Alta</th>
              <th className="px-4 py-3 text-center">Superadmin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => (
              <UserRow
                key={r.id}
                row={r}
                isSelf={r.id === selfId}
                expanded={expandedId === r.id}
                onToggleExpand={() => setExpandedId((e) => (e === r.id ? null : r.id))}
                onPatch={patchRow}
                onAdjust={() => setAdjusting(r)}
                onDelete={() => setDeleting(r)}
                toast={toast}
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted">
                  Cap usuari no coincideix amb la cerca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal d'ajust de punts ── */}
      {adjusting && (
        <AdjustModal
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={(balance, applied) => {
            patchRow(adjusting.id, { balance })
            setAdjusting(null)
            toast(
              applied === 0
                ? 'Cap canvi (saldo ja a zero o usuari amb punts infinits)'
                : applied > 0 ? `+${applied} punts per a ${adjusting.email} ✨` : `${applied} punts per a ${adjusting.email}`,
              'success',
            )
            router.refresh()
          }}
        />
      )}

      {/* ── Modal d'eliminació ── */}
      {deleting && (
        <DeleteModal
          row={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            dropRow(deleting.id)
            setDeleting(null)
            toast(`Compte de ${deleting.email} eliminat`, 'success')
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/* ───────────────────────── Fila (+ detall expandible) ───────────────────────── */
function UserRow({ row, isSelf, expanded, onToggleExpand, onPatch, onAdjust, onDelete, toast }: {
  row: AdminUserRow
  isSelf: boolean
  expanded: boolean
  onToggleExpand: () => void
  onPatch: (id: string, patch: Partial<AdminUserRow>) => void
  onAdjust: () => void
  onDelete: () => void
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [pending, startTransition] = useTransition()

  const changePlan = (plan: KarmaPlan) => {
    startTransition(async () => {
      const res = await adminSetPlan(row.id, plan)
      if (!res.ok) { toast(res.error, 'error'); return }
      onPatch(row.id, { plan: res.plan, allocation: res.allocation, ...(res.balance !== null ? { balance: res.balance } : {}) })
      toast(`${row.email} ara és ${PLAN_LABELS[res.plan]} (${res.allocation} punts/mes)`, 'success')
    })
  }

  const toggleSuper = () => {
    const next = !row.superadmin
    startTransition(async () => {
      const res = await adminSetSuperadmin(row.id, next)
      if (!res.ok) { toast(res.error, 'error'); return }
      onPatch(row.id, { superadmin: res.superadmin })
      toast(res.superadmin ? `${row.email} ara és superadmin (∞ punts)` : `${row.email} ja no és superadmin`, 'success')
    })
  }

  const lowBalance = !row.superadmin && row.balance !== null && row.balance <= row.allocation * 0.15

  return (
    <>
      <tr
        className={cn('cursor-pointer transition-colors hover:bg-surface-hover', pending && 'opacity-60', expanded && 'bg-surface-hover/60')}
        onClick={onToggleExpand}
      >
        {/* Usuari */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-subtle transition-transform', expanded && 'rotate-180')} />
            <div className="min-w-0">
              <p className="max-w-[20rem] truncate font-semibold text-text" title={row.email}>{row.email}</p>
              <button
                type="button"
                title="Copia l'id d'usuari"
                onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(row.id); toast('Id copiat', 'info') }}
                className="mt-0.5 inline-flex cursor-pointer items-center gap-1 font-mono text-xs text-subtle transition-colors hover:text-text"
              >
                {row.id.slice(0, 8)}… <CopyIcon className="h-3 w-3" />
              </button>
            </div>
          </div>
        </td>

        {/* Pla — select disfressat de badge */}
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={row.plan}
            disabled={pending}
            onChange={(e) => changePlan(e.target.value as KarmaPlan)}
            className={cn(
              'cursor-pointer appearance-none rounded-full border-0 px-3 py-1 text-xs font-extrabold outline-none transition-shadow focus:ring-2 focus:ring-accent/40',
              PLAN_BADGE[row.plan],
            )}
            title="Canvia el pla (re-avalua l'assignació a l'instant)"
          >
            {(Object.keys(PLAN_LABELS) as KarmaPlan[]).map((p) => (
              <option key={p} value={p}>{PLAN_LABELS[p]}</option>
            ))}
          </select>
        </td>

        {/* Punts */}
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center justify-end gap-2">
            {row.superadmin ? (
              <span className="inline-flex items-center gap-1 font-extrabold text-accent"><InfinityIcon className="h-4 w-4" /></span>
            ) : row.balance === null ? (
              <span className="font-semibold text-subtle" title="Cartera per estrenar — es crearà amb l'assignació sencera al primer moviment">
                {row.allocation}
              </span>
            ) : (
              <span className={cn('font-extrabold tabular-nums', lowBalance ? 'text-danger' : 'text-text')}>{row.balance}</span>
            )}
            <button
              type="button"
              onClick={onAdjust}
              disabled={pending}
              title="Ajusta els Punts de Carma"
              className="cursor-pointer rounded-lg border border-border bg-bg-elevated px-2 py-1 text-xs font-bold text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>

        {/* Llocs */}
        <td className="px-3 py-3 text-center">
          <span className="inline-flex items-center gap-1 text-muted"><Globe className="h-3.5 w-3.5" /> {row.sites.length}</span>
        </td>

        {/* Articles */}
        <td className="px-3 py-3 text-center">
          <span className="inline-flex items-center gap-1 tabular-nums text-muted"><FileText className="h-3.5 w-3.5" /> {row.postsTotal}</span>
        </td>

        {/* WhatsApp */}
        <td className="px-3 py-3 text-center">
          {row.waActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-success" title="Agent de WhatsApp connectat">
              <MessageCircle className="h-3 w-3" /> Sí
            </span>
          ) : (
            <span className="text-xs text-subtle">—</span>
          )}
        </td>

        {/* Alta */}
        <td className="px-4 py-3 whitespace-nowrap text-muted">
          {new Date(row.createdAt).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
        </td>

        {/* Superadmin */}
        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            role="switch"
            aria-checked={row.superadmin}
            disabled={pending || (isSelf && row.superadmin)}
            title={isSelf && row.superadmin ? 'No et pots revocar a tu mateix' : row.superadmin ? 'Revoca superadmin' : 'Concedeix superadmin (∞ punts)'}
            onClick={toggleSuper}
            className={cn(
              'relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              row.superadmin ? 'bg-accent' : 'bg-surface-subtle border border-border-strong',
            )}
          >
            <span className={cn(
              'inline-flex h-4.5 w-4.5 transform items-center justify-center rounded-full bg-white shadow transition-transform',
              row.superadmin ? 'translate-x-[1.45rem]' : 'translate-x-0.5',
            )}>
              {row.superadmin && <ShieldCheck className="h-3 w-3 text-accent" />}
            </span>
          </button>
        </td>
      </tr>

      {/* ── Detall expandible: llocs + accions perilloses ── */}
      {expanded && (
        <tr className="bg-surface-subtle/50">
          <td colSpan={8} className="px-5 pb-4 pt-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-subtle">Llocs de l&apos;usuari</p>
                {row.sites.length === 0 ? (
                  <p className="mt-1.5 text-sm text-muted">Cap lloc encara.</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {row.sites.map((s) => (
                      <Link
                        key={s.id}
                        href={`/dashboard/sites/${s.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs font-semibold text-muted no-underline transition-colors hover:border-accent/40 hover:text-text"
                      >
                        <Globe className="h-3 w-3 text-subtle" />
                        <span className="max-w-[14rem] truncate">{s.name}</span>
                        {s.subdomain && <span className="text-subtle">· {s.subdomain}</span>}
                        <ExternalLink className="h-3 w-3 text-subtle" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={row.superadmin || isSelf}
                  title={row.superadmin ? 'Revoca-li superadmin abans' : isSelf ? 'No et pots eliminar' : 'Elimina el compte'}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Elimina el compte
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/* ───────────────────────── Modal d'ajust de punts ───────────────────────── */
const QUICK_AMOUNTS = [25, 50, 100, 400, -50, -100]

function AdjustModal({ row, onClose, onDone }: {
  row: AdminUserRow
  onClose: () => void
  onDone: (balance: number | null, applied: number) => void
}) {
  const { toast } = useToast()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()

  const parsed = Math.trunc(Number(amount))
  const valid = Number.isFinite(parsed) && parsed !== 0

  const submit = () => {
    if (!valid || pending) return
    startTransition(async () => {
      const res = await adminAdjustKarma(row.id, parsed, note.trim() || undefined)
      if (!res.ok) { toast(res.error, 'error'); return }
      if (res.infinite) { toast('Aquest usuari és superadmin: punts infinits, res a ajustar.', 'info'); onClose(); return }
      onDone(res.balance, res.applied)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Tancar" onClick={onClose} className="absolute inset-0 cursor-default bg-black/35 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-bg-elevated p-5 shadow-premium" role="dialog" aria-label="Ajustar Punts de Carma">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-text">Ajustar Punts de Carma</p>
            <p className="mt-0.5 truncate text-xs text-muted" title={row.email}>{row.email}</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg p-1 text-subtle transition-colors hover:bg-surface-hover hover:text-text" aria-label="Tancar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(String(q))}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-1 text-xs font-bold transition-colors',
                String(q) === amount ? 'border-accent/50 bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:text-text',
              )}
            >
              {q > 0 ? `+${q}` : q}
            </button>
          ))}
        </div>

        <input
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          inputMode="numeric"
          placeholder="Quantitat (p. ex. 100 o -50)"
          className="mt-3 w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Nota (opcional — queda al llibre major)"
          className="mt-2 w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-accent"
        />
        <p className="mt-2 text-xs text-subtle">
          Positiu = regal (<code>admin_grant</code>) · negatiu = ajust (<code>admin_adjustment</code>, retallat al saldo). Tot queda al llibre major amb el teu id.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" size="sm">Cancel·la</Button>
          <Button onClick={submit} loading={pending} disabled={!valid} size="sm" glow iconLeft={<Sparkles className="h-3.5 w-3.5" />}>
            Aplica
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Modal d'eliminació ───────────────────────── */
function DeleteModal({ row, onClose, onDone }: {
  row: AdminUserRow
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [confirmText, setConfirmText] = useState('')
  const [pending, startTransition] = useTransition()
  const canDelete = confirmText.trim().toLowerCase() === row.email.trim().toLowerCase()

  const submit = () => {
    if (!canDelete || pending) return
    startTransition(async () => {
      const res = await adminDeleteUser(row.id)
      if (!res.ok) { toast(res.error, 'error'); return }
      onDone()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Tancar" onClick={onClose} className="absolute inset-0 cursor-default bg-black/35 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-sm rounded-2xl border border-danger/30 bg-bg-elevated p-5 shadow-premium" role="dialog" aria-label="Eliminar usuari">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-text">Eliminar aquest compte?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              S&apos;eliminarà el compte i l&apos;accés de <span className="font-bold text-text">{row.email}</span>.
              Els seus {row.sites.length} lloc{row.sites.length === 1 ? '' : 's'} i articles <span className="font-semibold">es conserven</span> (sense usuari assignat).
              Aquesta acció no es pot desfer.
            </p>
          </div>
        </div>

        <input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={`Escriu ${row.email} per confirmar`}
          className="mt-4 w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-subtle focus:border-danger"
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" size="sm">Cancel·la</Button>
          <button
            type="button"
            onClick={submit}
            disabled={!canDelete || pending}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> {pending ? 'Eliminant…' : 'Elimina definitivament'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Ordenació ───────────────────────── */
function SortPicker({ sort, onChange }: { sort: SortMode; onChange: (s: SortMode) => void }) {
  const next: Record<SortMode, SortMode> = { recent: 'balance-desc', 'balance-desc': 'balance-asc', 'balance-asc': 'recent' }
  const label = sort === 'recent' ? 'Més recents' : sort === 'balance-desc' ? 'Més punts' : 'Menys punts'
  const icon = sort === 'recent' ? <ArrowUpDown className="h-3.5 w-3.5" />
    : sort === 'balance-desc' ? <ArrowDown10 className="h-3.5 w-3.5" /> : <ArrowDown01 className="h-3.5 w-3.5" />
  return (
    <button
      type="button"
      onClick={() => onChange(next[sort])}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-muted transition-colors hover:text-text"
      title="Canvia l'ordenació"
    >
      {icon} {label}
    </button>
  )
}
