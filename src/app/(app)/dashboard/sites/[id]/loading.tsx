import RouteLoader from '@/components/ui/RouteLoader'

// Clean centred loader for site-detail navigation (preferred over the full-page
// skeleton — lighter and consistent with the rest of the dashboard).
export default function SiteDetailLoading() {
  return <RouteLoader />
}
