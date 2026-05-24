import { createClient } from '@supabase/supabase-js'

// Client amb Service Role: salta RLS. Només per a Route Handlers que validen
// per `api_key` o per a operacions de superadmin verificades al servidor.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}
