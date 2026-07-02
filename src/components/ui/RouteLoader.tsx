import KnotLoader from './KnotLoader'

/**
 * The single, premium navigation loader: the Endless Knot drawing itself in gold,
 * perfectly centred in the content area. Rendered as every route-level
 * `loading.tsx` fallback so basic dashboard navigation feels light, consistent and
 * on-brand (preferred over full-page skeletons).
 *
 * By default it's a fixed overlay offset by the dashboard sidebar (`lg:left-60`)
 * so the knot sits in the TRUE centre of the viewport, not the top of the padded
 * content column. Routes without the sidebar (fullscreen Studio, onboarding,
 * admin tools) pass `fullscreen` to centre on the whole viewport instead.
 */
export default function RouteLoader({ label, fullscreen = false }: { label?: string; fullscreen?: boolean }) {
  return (
    <div className={`fixed inset-0 z-20 flex items-center justify-center bg-bg ${fullscreen ? '' : 'lg:left-60'}`}>
      <KnotLoader label={label} />
    </div>
  )
}
