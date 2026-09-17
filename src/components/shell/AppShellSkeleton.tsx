/**
 * The app's request-time fallback — a SHAPE, not a spinner.
 *
 * Replaces `RouteLoader` (a `fixed inset-0` opaque full-viewport overlay that 14
 * separate `loading.tsx` files rendered) as the fallback for the authenticated
 * shell. The overlay was the real reason navigation felt heavy: every route change
 * blanked the entire content area behind a gold knot, whether the data behind it
 * was 40ms or 4s away.
 *
 * This paints the layout the user is about to get — sidebar rail, page header,
 * card grid — in the same radii, gaps and surfaces as the real thing, so the
 * transition is a fill rather than a flash. Card-first, like everything else.
 *
 * Shimmer is a single compositor-only transform animation (the July perf rules:
 * no idle repaints, no blur/filter animation) and it respects reduced motion via
 * the global policy in globals.css.
 */
export default function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-bg" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregant…</span>

      {/* Sidebar rail — matches DashboardSidebar's lg:w-60 */}
      <div className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 border-r border-border bg-surface p-5 lg:flex">
        <Shimmer className="h-8 w-28 rounded-lg" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map(i => (
            <Shimmer key={i} className="h-9 w-full rounded-xl" />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <Shimmer className="h-16 w-full rounded-2xl" />
        </div>
      </div>

      <main className="min-w-0 overflow-x-clip p-5 sm:p-8 lg:ml-60 lg:p-10">
        <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-8">
          {/* PageHeader */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2.5">
              <Shimmer className="h-8 w-56 rounded-lg" />
              <Shimmer className="h-4 w-72 rounded" />
            </div>
            <Shimmer className="h-10 w-36 rounded-xl" />
          </div>

          {/* Bento metric strip — same grid as the real dashboard */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Shimmer className="col-span-2 h-[168px] rounded-2xl" />
            <Shimmer className="h-[168px] rounded-2xl" />
            <Shimmer className="h-[168px] rounded-2xl" />
          </div>

          {/* Card grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(i => (
              <Shimmer key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

/** One skeleton surface. The sweep is a transform on a pseudo-element, so it
 *  never triggers layout or paint on the element itself. */
function Shimmer({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}
