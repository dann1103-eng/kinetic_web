-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Crear los 18 miembros reales del personal
-- ═══════════════════════════════════════════════════════════════════════════
-- Lista del Excel de personal Kinetic 2026.
-- Todos comparten password inicial: usuario123
-- Emails son dummy (formato {nombre}@kinetic.sv) — el equipo los cambia
-- después desde Authentication → Users en Supabase.
--
-- Asignación de roles según la sección del Excel:
--   • ADMINISTRACIÓN  → directora / coord_familias / coord_terapias / recepcion / contable
--   • BLUE KIDS I-IV  → maestra (todos, los grupos son irrelevantes en el sistema)
--   • LEARNING KIDS   → maestra
--   • AULA EDUCATIVA  → maestra
--   • TERAPIAS TARDE  → terapista
--   • HORNATO/LIMPIEZA → recepcion (sin rol clínico — acceso mínimo)
--
-- Idempotente: si el email ya existe, devuelve el id existente sin recrear.
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper para crear auth user + identity (mismo patrón que 04_create_users.sql)
CREATE OR REPLACE FUNCTION public._seed_create_auth_user(
  p_email    text,
  p_password text
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id  uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email',
    now(), now(), now()
  );

  RETURN v_user_id;
END;
$$;

DO $$
DECLARE
  v_password text := 'usuario123';
  v_id uuid;
BEGIN
  -- ── ADMINISTRACIÓN (5) ────────────────────────────────────────────────
  v_id := public._seed_create_auth_user('josselin@kinetic.sv', v_password);
  UPDATE public.users SET role='directora',             full_name='Josselin Lisseth Castro Alvarado' WHERE id = v_id;

  v_id := public._seed_create_auth_user('laura@kinetic.sv', v_password);
  UPDATE public.users SET role='coordinadora_familias', full_name='Laura María Morataya de Flores'    WHERE id = v_id;

  v_id := public._seed_create_auth_user('diana@kinetic.sv', v_password);
  UPDATE public.users SET role='coordinadora_terapias', full_name='Diana Patricia Mancía Ayala'       WHERE id = v_id;

  v_id := public._seed_create_auth_user('ana.ruth@kinetic.sv', v_password);
  UPDATE public.users SET role='recepcion',             full_name='Ana Ruth Hernández López'          WHERE id = v_id;

  v_id := public._seed_create_auth_user('daniela.romero@kinetic.sv', v_password);
  UPDATE public.users SET role='contable',              full_name='Daniela Alejandra Romero Palacios' WHERE id = v_id;

  -- ── BLUE KIDS I-IV (7) — todas como maestra ──────────────────────────
  v_id := public._seed_create_auth_user('jenny@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Jenny Elizabeth Palacios Portillo' WHERE id = v_id;

  v_id := public._seed_create_auth_user('estefany@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Estefany Judith Cruz Vásquez' WHERE id = v_id;

  v_id := public._seed_create_auth_user('betsaida@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Betsaida Jocabed Mena Mejía' WHERE id = v_id;

  v_id := public._seed_create_auth_user('julia@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Julia Cristina Alvarado Hernández' WHERE id = v_id;

  v_id := public._seed_create_auth_user('jennifer@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Jennifer Paola Chavarría Palacios' WHERE id = v_id;

  v_id := public._seed_create_auth_user('hazel@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Hazel Daniela Mejía Carbajal' WHERE id = v_id;

  v_id := public._seed_create_auth_user('michelle@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Michelle Carolina Rodríguez Hernández' WHERE id = v_id;

  -- ── LEARNING KIDS (1) ────────────────────────────────────────────────
  v_id := public._seed_create_auth_user('tania@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Tania Abigail Meléndez Mejía' WHERE id = v_id;

  -- ── AULA EDUCATIVA (2) ───────────────────────────────────────────────
  v_id := public._seed_create_auth_user('karla.osorio@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Karla Rocío Osorio Esperanza' WHERE id = v_id;

  v_id := public._seed_create_auth_user('vanesa@kinetic.sv', v_password);
  UPDATE public.users SET role='maestra', full_name='Vanesa Yamileth Rodríguez Hernández' WHERE id = v_id;

  -- ── TERAPIAS DE LA TARDE (2) ─────────────────────────────────────────
  v_id := public._seed_create_auth_user('kattya@kinetic.sv', v_password);
  UPDATE public.users SET role='terapista', full_name='Kattya Stefanie García Olmedo' WHERE id = v_id;

  v_id := public._seed_create_auth_user('paola@kinetic.sv', v_password);
  UPDATE public.users SET role='terapista', full_name='Paola Alexandra Vidal Zepeda' WHERE id = v_id;

  -- ── HORNATO Y LIMPIEZA (1) ───────────────────────────────────────────
  -- Sin rol clínico — usamos 'recepcion' como rol mínimo con acceso al sistema.
  -- Si no necesita acceso, puede dejarse así o cambiarse a 'sin_contrato' en el
  -- campo contract_type (los roles del sistema están separados del contrato).
  v_id := public._seed_create_auth_user('darlin@kinetic.sv', v_password);
  UPDATE public.users SET role='recepcion', full_name='Darlin Yamilet Portillo Pérez' WHERE id = v_id;

  RAISE NOTICE '✓ 18 miembros del personal creados con password: %', v_password;
END $$;

-- Limpieza: borrar el helper (ya no se necesita)
DROP FUNCTION IF EXISTS public._seed_create_auth_user(text, text);

-- ── Verificación ────────────────────────────────────────────────────────
SELECT role, COUNT(*) AS cantidad
FROM public.users
WHERE email LIKE '%@kinetic.sv'
GROUP BY role
ORDER BY role;
