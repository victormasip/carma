import KnotLoader from '@/components/ui/KnotLoader'

// Root loading boundary — SHELL-SHAPED (founder report 2026-07-06: the old
// fullscreen-centred knot hid the sidebar and then JUMPED to the content
// centre once the layout streamed in). Now the fallback paints a sidebar
// silhouette in the exact place the real sidebar will occupy and centres the
// knot in the CONTENT area (lg:left-60) — the same spot every segment-level
// RouteLoader uses — so across all loading phases nothing moves and nothing
// disappears. On public routes the silhouette is a neutral elevated column
// for a beat; a fair trade for a stable app frame everywhere else.
export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-20 bg-bg">
      {/* Silueta del sidebar (només lg — en mòbil no hi ha columna fixa). */}
      <div className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-bg-elevated lg:block" aria-hidden />
      {/* El nus, al centre del CONTINGUT — idèntic a RouteLoader per defecte. */}
      <div className="fixed inset-0 flex items-center justify-center lg:left-60">
        <KnotLoader />
      </div>
    </div>
  )
}
