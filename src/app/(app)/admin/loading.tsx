import SectionSkeleton from '@/components/shell/SectionSkeleton'

// Fase 3: un esquelet amb la FORMA de la pàgina, dins la columna de contingut —
// ja no el `RouteLoader` (una capa opaca `fixed inset-0` que tapava tot el
// viewport, sidebar inclòs, a cada navegació). El shell no parpelleja mai.
export default function AdminLoading() {
  return <SectionSkeleton variant="bento" />
}
