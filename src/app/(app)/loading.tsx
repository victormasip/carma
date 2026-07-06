import RouteLoader from '@/components/ui/RouteLoader'

// Fallback de grup: es renderitza DINS del shell (sidebar ja muntat), amb el
// nus al centre del contingut — cap pàgina del tauler es queda mai sense loader.
export default function AppGroupLoading() {
  return <RouteLoader />
}
