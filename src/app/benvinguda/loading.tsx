import RouteLoader from '@/components/ui/RouteLoader'

// First screen after signup/unlock — the moment trust is lowest and a blank
// flash hurts most. Full-viewport (no dashboard sidebar on this route).
export default function BenvingudaLoading() {
  return <RouteLoader fullscreen />
}
