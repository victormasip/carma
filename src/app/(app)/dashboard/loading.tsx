import RouteLoader from '@/components/ui/RouteLoader'

// A single clean centred loader for basic dashboard navigation (preferred over a
// full-page skeleton — lighter, no layout flash).
export default function DashboardLoading() {
  return <RouteLoader />
}
