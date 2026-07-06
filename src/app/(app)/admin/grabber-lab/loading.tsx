import RouteLoader from '@/components/ui/RouteLoader'

// The Lab fetches the sample history before first paint; show the knot instead
// of a blank pane. (No longer fullscreen: /admin lives inside the dashboard
// shell since 2026-07-06, so the loader centres in the content pane.)
export default function GrabberLabLoading() {
  return <RouteLoader />
}
