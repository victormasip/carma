-- =============================================================================
-- MIGRACIÓ 025: Captura de leads (newsletter + desbloqueig de paywall)
-- =============================================================================
-- El mòdul "Newsletter / Lead Gen" i el mòdul "Paywall" capturen correus des del
-- blog renderitzat. Una fila per enviament. El desbloqueig del paywall estil
-- Substack funciona així: en subscriure's, l'endpoint /api/leads desa el lead i
-- retorna una cookie de desbloqueig (carma_unlock_<siteId>) → el render torna a
-- servir el contingut complet a aquell lector. Cap dada sensible: només el correu
-- i el context (mòdul d'origen, article, idioma).
--
-- Lectura: sempre des del servidor amb el service-role després de validar l'accés
-- al site (igual que page_views). RLS de sota = defensa addicional.
-- Inserció: NOMÉS via service-role (l'endpoint /api/leads), mai amb RLS.
-- Executar al Supabase SQL Editor.
--
-- El codi és 42703/relation-missing-safe: sense aquesta taula, /api/leads encara
-- retorna èxit + la cookie de desbloqueig (la captura de lead és best-effort), de
-- manera que el paywall i la newsletter segueixen funcionant.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id     UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'newsletter',  -- 'newsletter' | 'paywall'
  post_id     UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  locale      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un mateix correu només una vegada per lloc (re-subscriure's no duplica).
  UNIQUE (site_id, email)
);

CREATE INDEX IF NOT EXISTS leads_site_created_idx ON public.leads (site_id, created_at DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_superadmin" ON public.leads;
DROP POLICY IF EXISTS "leads_select_member"     ON public.leads;

CREATE POLICY "leads_select_superadmin" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "leads_select_member" ON public.leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.site_users
      WHERE site_users.site_id = leads.site_id
        AND site_users.user_id = auth.uid()
    )
  );

-- (Cap política d'INSERT per a `authenticated`: les escriptures van pel service-role.)

NOTIFY pgrst, 'reload schema';
