import RouteLoader from '@/components/ui/RouteLoader'

// Editor routes (new + edit) do several sequential Supabase reads server-side.
// Without this, navigation showed nothing until they all resolved ("no carrega
// res / tarda molt"). A light centred loader gives instant feedback instead.
export default function PostEditorLoading() {
  return <RouteLoader label="Carregant l'editor…" />
}
