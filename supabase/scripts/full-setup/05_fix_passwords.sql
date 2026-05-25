-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Fix de passwords para los 2 usuarios principales
-- ═══════════════════════════════════════════════════════════════════════════
-- Pone password = 'usuario123' en:
--   • danielmancia1112@gmail.com (admin)
--   • daanmendez100@gmail.com    (portal padres)
--
-- También:
--   • Confirma el email (email_confirmed_at = now())
--   • Verifica que la fila en auth.identities exista (sin ella el login falla
--     en versiones recientes de Supabase)
--   • Si el usuario no existe lo crea desde cero
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_id  uuid;
  v_family_id uuid;
  v_password  text := 'usuario123';
BEGIN
  -- ── ADMIN: danielmancia1112@gmail.com ──────────────────────────────────
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'danielmancia1112@gmail.com';

  IF v_admin_id IS NULL THEN
    -- No existe → crear
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id, 'authenticated', 'authenticated',
      'danielmancia1112@gmail.com',
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
    RAISE NOTICE 'Admin creado nuevo: %', v_admin_id;
  ELSE
    -- Existe → actualizar password y confirmar email
    UPDATE auth.users
    SET encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        updated_at = now()
    WHERE id = v_admin_id;
    RAISE NOTICE 'Admin actualizado: %', v_admin_id;
  END IF;

  -- Asegurar identity row
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_admin_id AND provider = 'email') THEN
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_admin_id::text,
      v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', 'danielmancia1112@gmail.com', 'email_verified', true),
      'email',
      now(), now(), now()
    );
  END IF;

  -- Asegurar fila en public.users con rol admin
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (v_admin_id, 'danielmancia1112@gmail.com', 'Daniel Mancia', 'admin')
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin', full_name = 'Daniel Mancia';

  -- ── PORTAL PADRES: daanmendez100@gmail.com ────────────────────────────
  SELECT id INTO v_family_id FROM auth.users WHERE email = 'daanmendez100@gmail.com';

  IF v_family_id IS NULL THEN
    v_family_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_family_id, 'authenticated', 'authenticated',
      'daanmendez100@gmail.com',
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
    RAISE NOTICE 'Family creado nuevo: %', v_family_id;
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        updated_at = now()
    WHERE id = v_family_id;
    RAISE NOTICE 'Family actualizado: %', v_family_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_family_id AND provider = 'email') THEN
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_family_id::text,
      v_family_id,
      jsonb_build_object('sub', v_family_id::text, 'email', 'daanmendez100@gmail.com', 'email_verified', true),
      'email',
      now(), now(), now()
    );
  END IF;

  INSERT INTO public.users (id, email, full_name, role)
  VALUES (v_family_id, 'daanmendez100@gmail.com', 'Daniel Méndez', 'family')
  ON CONFLICT (id) DO UPDATE
    SET role = 'family', full_name = 'Daniel Méndez';

  RAISE NOTICE '─────────────────────────────────────────────────────────';
  RAISE NOTICE 'Password de ambas cuentas:  usuario123';
  RAISE NOTICE 'Admin:        danielmancia1112@gmail.com  (id=%)', v_admin_id;
  RAISE NOTICE 'Portal:       daanmendez100@gmail.com     (id=%)', v_family_id;
  RAISE NOTICE '─────────────────────────────────────────────────────────';
END $$;
