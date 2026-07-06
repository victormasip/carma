'use client'

import SegmentError from '@/components/ui/SegmentError'

export default function SiteDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError error={error} reset={reset} title="Aquest lloc ha tingut un error" />
}
