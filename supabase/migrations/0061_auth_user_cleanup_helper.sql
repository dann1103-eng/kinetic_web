-- Helper: obtener el UUID de un usuario en auth.users por email.
-- Necesario porque PostgREST no expone el schema auth; solo service_role puede llamarlo.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = lower(p_email) LIMIT 1;
$$;

-- Solo service_role puede ejecutarla (los server actions usan el admin client)
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;
