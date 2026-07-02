'use client'

import SegmentError from '@/components/ui/SegmentError'

export default function AgentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError error={error} reset={reset} />
}
