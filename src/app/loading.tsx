import RouteLoader from '@/components/ui/RouteLoader'

// Root loading boundary. Crucial for LAYOUT SWITCHES (/dashboard ⇄ /admin ⇄ /):
// a segment's own loading.tsx sits BELOW its layout, so while the destination
// LAYOUT awaits its data (session, sites, karma) no nested loader can fire and
// the app used to look frozen (founder report 2026-07-06). This boundary sits
// above every layout → the knot shows the instant any top-level navigation
// starts streaming.
export default function RootLoading() {
  return <RouteLoader fullscreen />
}
