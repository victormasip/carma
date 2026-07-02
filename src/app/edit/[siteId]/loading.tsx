import RouteLoader from '@/components/ui/RouteLoader'

// The fullscreen Studio loads a heavy client bundle + the site theme; without a
// fallback the "Edita aquest lloc" click on the live render lands on a blank
// screen. Full-viewport (this route lives outside the dashboard shell).
export default function EditSiteLoading() {
  return <RouteLoader fullscreen label="Obrint l’estudi…" />
}
