import Skeleton from '@/components/ui/Skeleton'

// Route-level skeleton for the dashboard home — mirrors the bento (header →
// metric strip → site grid) so the real content streams in with no layout jump.
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-56 rounded-xl" />
          <Skeleton className="h-4 w-72 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* Bento metric strip — wide hero + two tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton className="col-span-2 h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>

      {/* Site grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
