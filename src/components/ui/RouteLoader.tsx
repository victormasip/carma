import KnotLoader from './KnotLoader'

/**
 * The single, premium navigation loader: the Endless Knot drawing itself in gold,
 * perfectly centred in the content area. Rendered as every route-level
 * `loading.tsx` fallback so basic dashboard navigation feels light, consistent and
 * on-brand (preferred over full-page skeletons).
 *
 * It's a fixed overlay offset by the sidebar (`lg:left-60`) so the knot sits in the
 * TRUE centre of the viewport, not the top of the padded content column.
 */
export default function RouteLoader({ label }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-bg lg:left-60">
      <KnotLoader label={label} />
    </div>
  )
}
