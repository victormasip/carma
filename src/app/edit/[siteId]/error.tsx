'use client'

import SegmentError from '@/components/ui/SegmentError'

// The fullscreen Studio lives outside the dashboard shell, so without its own
// boundary a crash here would fall through to the bare root error page.
export default function EditSiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError error={error} reset={reset} />
}
