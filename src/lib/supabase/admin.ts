import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Client amb Service Role: salta RLS. Només per a Route Handlers que validen
// per `api_key` o per a operacions de superadmin verificades al servidor.
//
// Memoïtzat per instància de lambda (C2): el client de service-role no té sessió
// (és stateless), així que es pot reutilitzar entre peticions de la mateixa
// funció en calent en lloc de reconstruir-lo a cada crida.
let cached: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
  return cached
}
