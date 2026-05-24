export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-end justify-between">
        <div className="space-y-2.5">
          <div className="h-8 w-72 bg-neutral-200 rounded-xl" />
          <div className="h-4 w-96 bg-neutral-100 rounded-lg" />
        </div>
      </div>

      <div className="flex gap-1 bg-neutral-100 p-1 rounded-2xl w-fit">
        {[96, 80, 88].map((w, i) => (
          <div key={i} className="h-10 bg-neutral-200 rounded-xl" style={{ width: w }} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-3xl border border-neutral-100 p-7 space-y-4">
            <div className="flex items-start justify-between">
              <div className="h-6 w-3/4 bg-neutral-200 rounded-lg" />
              <div className="w-8 h-8 bg-neutral-100 rounded-full shrink-0" />
            </div>
            <div className="flex gap-3">
              <div className="h-4 w-24 bg-neutral-100 rounded-lg" />
              <div className="h-4 w-20 bg-neutral-100 rounded-lg" />
            </div>
            <div className="h-px bg-neutral-100" />
            <div className="h-3 w-1/3 bg-neutral-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
