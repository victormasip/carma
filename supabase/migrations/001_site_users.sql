-- =============================================================================
-- MIGRACIÓ 001: Taula site_users (multi-tenant) + actualització RLS
-- Executar al Supabase SQL Editor
-- =============================================================================

-- 1. Afegir email a profiles per evitar joins constants amb auth.users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Trigger per mantenir email sincronitzat
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- Trigger per insertar email en crear usuari (si ja existia el perfil)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'client')
  ON CONFLICT (id) DO UPDATE SET email = NEW.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 2. Crear la taula de junction site_users
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.site_users (
  site_id     UUID NOT NULL REFERENCES public.sites(id)    ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, user_id)
);

-- =============================================================================
-- 3. Migrar dades existents (owner_id -> site_users)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sites' AND column_name = 'owner_id'
  ) THEN
    INSERT INTO public.site_users (site_id, user_id)
    SELECT id, owner_id FROM public.sites WHERE owner_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE public.sites DROP COLUMN IF EXISTS owner_id;
  END IF;
END;
$$;

-- =============================================================================
-- 4. Trigger per actualitzar updated_at als posts
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_set_updated_at ON public.posts;
CREATE TRIGGER posts_set_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 5. Funció helper per evitar recursivitat en RLS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- =============================================================================
-- 6. RLS: profiles
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_superadmin" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_superadmin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

-- =============================================================================
-- 7. RLS: sites
-- =============================================================================
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sites_select_superadmin" ON public.sites;
DROP POLICY IF EXISTS "sites_all_superadmin"    ON public.sites;
DROP POLICY IF EXISTS "sites_select_client"     ON public.sites;
DROP POLICY IF EXISTS "sites_select_assigned"   ON public.sites;
-- Eliminar qualsevol política heretada basada en owner_id
DROP POLICY IF EXISTS "Enable read access for users based on owner_id" ON public.sites;
DROP POLICY IF EXISTS "Users can view own sites"                        ON public.sites;

CREATE POLICY "sites_all_superadmin" ON public.sites
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "sites_select_assigned" ON public.sites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.site_users
      WHERE site_users.site_id = sites.id
        AND site_users.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 8. RLS: site_users
-- =============================================================================
ALTER TABLE public.site_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_users_all_superadmin" ON public.site_users;
DROP POLICY IF EXISTS "site_users_select_own"     ON public.site_users;

CREATE POLICY "site_users_all_superadmin" ON public.site_users
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "site_users_select_own" ON public.site_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 9. RLS: posts
-- =============================================================================
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_all_superadmin"    ON public.posts;
DROP POLICY IF EXISTS "posts_all_client_member" ON public.posts;

CREATE POLICY "posts_all_superadmin" ON public.posts
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "posts_all_client_member" ON public.posts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.site_users
      WHERE site_users.site_id = posts.site_id
        AND site_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.site_users
      WHERE site_users.site_id = posts.site_id
        AND site_users.user_id = auth.uid()
    )
  );
