-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Crear usuarios del equipo + 1 cuenta de portal padres
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar DESPUÉS de 02_kinetic_schema.sql.
-- Ejecutar ANTES de 03_seed_demo.sql.
--
-- Crea 12 usuarios (1 por cada rol + 4 terapistas) usando inserts directos en
-- auth.users con password bcrypt. Todos comparten password inicial. Cambia el
-- password después desde la app o desde Authentication → Users.
--
-- Usuarios staff:
--   admin:                 danielmancia1112@gmail.com    ← TU CUENTA
--   directora:             directora@kinetic.sv
--   coordinadora_familias: coord.familias@kinetic.sv
--   coordinadora_terapias: coord.terapias@kinetic.sv
--   recepcion:             recepcion@kinetic.sv
--   contable:              contable@kinetic.sv
--   maestra:               maestra.bluekids@kinetic.sv
--   terapista 1-4:         terapista1@kinetic.sv ... terapista4@kinetic.sv
--
-- Usuario portal padres:
--   family:                daanmendez100@gmail.com       ← TU CUENTA PORTAL
--     + familia ficticia "Familia Méndez" con un niño "Diego Méndez" para probar
--
-- PASSWORD INICIAL DE TODOS:  Kinetic2026!
-- Cámbialo desde Authentication → Users → ... → Send password recovery
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: función inline para crear un auth user + identity ──────────────
-- Devuelve el id del usuario creado (o existente si ya está).
CREATE OR REPLACE FUNCTION public._seed_create_auth_user(
  p_email    text,
  p_password text
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
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

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Crear los usuarios auth + actualizar roles en public.users
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_admin_id   uuid;
  v_dir_id     uuid;
  v_cof_id     uuid;
  v_cot_id     uuid;
  v_rec_id     uuid;
  v_cnt_id     uuid;
  v_mae_id     uuid;
  v_t1_id      uuid;
  v_t2_id      uuid;
  v_t3_id      uuid;
  v_t4_id      uuid;
  v_family_user_id uuid;
  v_family_id  uuid;
  v_child_id   uuid;
  v_password   text := 'Kinetic2026!';
BEGIN
  -- ── Staff ────────────────────────────────────────────────────────────────
  v_admin_id := public._seed_create_auth_user('danielmancia1112@gmail.com', v_password);
  v_dir_id   := public._seed_create_auth_user('directora@kinetic.sv',            v_password);
  v_cof_id   := public._seed_create_auth_user('coord.familias@kinetic.sv',       v_password);
  v_cot_id   := public._seed_create_auth_user('coord.terapias@kinetic.sv',       v_password);
  v_rec_id   := public._seed_create_auth_user('recepcion@kinetic.sv',            v_password);
  v_cnt_id   := public._seed_create_auth_user('contable@kinetic.sv',             v_password);
  v_mae_id   := public._seed_create_auth_user('maestra.bluekids@kinetic.sv',     v_password);
  v_t1_id    := public._seed_create_auth_user('terapista1@kinetic.sv',           v_password);
  v_t2_id    := public._seed_create_auth_user('terapista2@kinetic.sv',           v_password);
  v_t3_id    := public._seed_create_auth_user('terapista3@kinetic.sv',           v_password);
  v_t4_id    := public._seed_create_auth_user('terapista4@kinetic.sv',           v_password);

  -- ── Familia portal ───────────────────────────────────────────────────────
  v_family_user_id := public._seed_create_auth_user('daanmendez100@gmail.com',   v_password);

  -- ── Actualizar roles + full_name en public.users ─────────────────────────
  -- (el trigger on_auth_user_created ya creó la fila por cada uno)
  UPDATE public.users SET role='admin',                 full_name='Daniel Mancia'      WHERE id = v_admin_id;
  UPDATE public.users SET role='directora',             full_name='Andrea Castillo'    WHERE id = v_dir_id;
  UPDATE public.users SET role='coordinadora_familias', full_name='Carla Hernández'    WHERE id = v_cof_id;
  UPDATE public.users SET role='coordinadora_terapias', full_name='Sofía Martínez'     WHERE id = v_cot_id;
  UPDATE public.users SET role='recepcion',             full_name='Lucía Pineda'       WHERE id = v_rec_id;
  UPDATE public.users SET role='contable',              full_name='Roberto Aguilar'    WHERE id = v_cnt_id;
  UPDATE public.users SET role='maestra',               full_name='Diana Mejía'        WHERE id = v_mae_id;
  UPDATE public.users SET role='terapista',             full_name='María José Rivas'   WHERE id = v_t1_id;
  UPDATE public.users SET role='terapista',             full_name='Karla Beltrán'      WHERE id = v_t2_id;
  UPDATE public.users SET role='terapista',             full_name='Patricia Funes'     WHERE id = v_t3_id;
  UPDATE public.users SET role='terapista',             full_name='Verónica Galdámez'  WHERE id = v_t4_id;
  UPDATE public.users SET role='family',                full_name='Daniel Méndez'      WHERE id = v_family_user_id;

  -- ════════════════════════════════════════════════════════════════════════
  -- 2. Crear una familia ficticia para el usuario del portal
  -- ════════════════════════════════════════════════════════════════════════
  v_family_id := gen_random_uuid();
  INSERT INTO public.families (
    id, primary_contact_name, primary_contact_email, primary_contact_phone,
    fiscal_legal_name, status, created_by_user_id
  ) VALUES (
    v_family_id,
    'Daniel Méndez',
    'daanmendez100@gmail.com',
    '+503 7000-0000',
    'Daniel Méndez',
    'active',
    v_admin_id
  );

  -- Link family_users (portal padres)
  INSERT INTO public.family_users (family_id, user_id, role, can_billing, can_work)
  VALUES (v_family_id, v_family_user_id, 'owner', true, true);

  -- ════════════════════════════════════════════════════════════════════════
  -- 3. Crear un niño para que tengas algo que ver en el portal
  -- ════════════════════════════════════════════════════════════════════════
  v_child_id := gen_random_uuid();
  INSERT INTO public.children (
    id, family_id, full_name, preferred_name, birth_date, gender,
    school_name, school_grade,
    diagnoses_json, diagnoses_display_text,
    current_phase_code, current_phase_changed_at,
    created_by_user_id
  ) VALUES (
    v_child_id, v_family_id,
    'Diego Méndez Rivas', 'Diego', '2021-08-15', 'M',
    'Kinder Mi Mundo', 'Parvulario 5',
    '["retraso_lenguaje"]'::jsonb,
    'Retraso de lenguaje expresivo',
    '3_3_activo_en_terapias', now(),
    v_admin_id
  );

  -- Treatment plan para el niño (lenguaje 2/sem con v_t1)
  INSERT INTO public.treatment_plans (
    child_id, primary_therapist_id, diagnosis_text, starts_at,
    therapies_json, schedule_pattern_json, monthly_total_usd, active,
    created_by_user_id
  ) VALUES (
    v_child_id, v_t1_id, 'Retraso de lenguaje expresivo', '2026-01-15',
    '[{"service":"lenguaje","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
    '[{"day_of_week":"mon","time_local":"10:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"wed","time_local":"10:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
    360, true, v_cot_id
  );

  RAISE NOTICE 'Usuarios creados — todos con password: %', v_password;
  RAISE NOTICE 'Admin: % (id=%)', 'danielmancia1112@gmail.com', v_admin_id;
  RAISE NOTICE 'Portal padres: % (id=%, familia=%)', 'daanmendez100@gmail.com', v_family_user_id, v_family_id;
END $$;

-- Limpieza: borrar la función helper (ya no se necesita)
DROP FUNCTION IF EXISTS public._seed_create_auth_user(text, text);
