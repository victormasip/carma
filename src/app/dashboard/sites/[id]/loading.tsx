export default function SiteDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-surface-hover rounded-full shrink-0" />
          <div className="space-y-2.5">
            <div className="h-8 w-52 bg-surface-hover rounded-xl" />
            <div className="h-3 w-40 bg-surface-hover rounded-lg" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-surface-hover rounded-lg" />
          <div className="h-9 w-20 bg-surface-hover rounded-lg" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-hover p-1 rounded-2xl w-fit">
        {[108, 60, 96].map((w, i) => (
          <div key={i} className="h-10 bg-surface-hover rounded-xl" style={{ width: w }} />
        ))}
      </div>

      {/* Content area — article list skeleton */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-surface-hover rounded-lg" />
            <div className="h-6 w-24 bg-surface-hover rounded-lg" />
            <div className="h-5 w-8 bg-surface-hover rounded-lg" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 bg-surface-hover rounded-xl" />
            <div className="h-10 w-36 bg-surface-hover rounded-xl" />
          </div>
        </div>

        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-2xl overflow-hidden flex items-stretch"
              style={{ opacity: 1 - i * 0.12 }}
            >
              <div className="w-1 shrink-0 bg-surface-hover" />
              <div className="flex-1 flex items-center gap-4 px-5 py-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-hover rounded-lg" style={{ width: `${55 + (i % 3) * 15}%` }} />
                  <div className="h-3 bg-surface-hover rounded-md" style={{ width: `${30 + (i % 2) * 12}%` }} />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="h-3 w-20 bg-surface-hover rounded" />
                  <div className="h-6 w-20 bg-surface-hover rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
