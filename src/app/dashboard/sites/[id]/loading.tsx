import Skeleton from '@/components/ui/Skeleton'

// Route-level skeleton for a site detail — header → section bento → content list,
// matching the real layout so nothing shifts when the page resolves.
export default function SiteDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2.5 pt-0.5">
            <Skeleton className="h-8 w-52 rounded-xl" />
            <Skeleton className="h-3.5 w-36 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      {/* Section bento — core cards + a quiet premium row */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-2xl" />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Content — article list */}
      <div className="space-y-2.5 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" style={{ opacity: 1 - i * 0.1 }} />
        ))}
      </div>
    </div>
  )
}
