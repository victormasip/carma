import RouteLoader from '@/components/ui/RouteLoader'

// The Lab fetches the sample history before first paint; show the knot instead
// of a blank pane. Full-viewport (the /admin shell has no left sidebar).
export default function GrabberLabLoading() {
  return <RouteLoader fullscreen />
}
