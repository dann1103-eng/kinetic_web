-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Datos de prueba para INDUCCIÓN de terapistas
-- ═══════════════════════════════════════════════════════════════════════════
-- Crea un entorno aislado para ensayar el flujo completo:
--   registrar terapias  →  contabilizarlas  →  verlas en planilla.
--
-- Crea:
--   • 1 terapista de prueba (planilla MIXTA: normal + servicios profesionales)
--   • 1 familia ficticia + 1 niño de prueba
--   • 1 plan de tratamiento (lenguaje, lun/mié 10:00)
--   • Citas MEZCLA: algunas ya 'completadas' este mes (una marcada extra) +
--     varias 'agendadas' para HOY (para completarlas en vivo en la inducción)
--   • Asegura el costo (cost_usd) de la terapia de lenguaje para que la planilla
--     de servicios profesionales muestre montos.
--
-- Privacidad (CLAUDE.md): apellidos ficticios + dominio @ejemplo.com.
--
-- Cómo correr: Supabase Dashboard → SQL Editor → pegar TODO → Run.
-- Es idempotente: si ya existe la familia de prueba, no duplica nada.
--
-- CREDENCIALES de la terapista de prueba:
--   email:    terapista.prueba@ejemplo.com
--   password: Kinetic2026!
--
-- Al final hay un bloque de LIMPIEZA comentado para borrar todo tras la inducción.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: crear un auth user + identity (devuelve id; idempotente por email) ──
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

-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_password    text := 'Kinetic2026!';
  v_family_email text := 'familia.prueba@ejemplo.com';
  v_therapist   uuid;
  v_creator     uuid;
  v_family_id   uuid;
  v_child_id    uuid;
  v_dur         interval := interval '45 minutes';
BEGIN
  -- ── Terapista de prueba (planilla MIXTA) ──────────────────────────────────
  v_therapist := public._seed_create_auth_user('terapista.prueba@ejemplo.com', v_password);
  UPDATE public.users SET
    role                              = 'terapista',
    full_name                         = 'Terapista Prueba',
    in_normal_payroll                 = true,   -- sueldo fijo
    in_professional_services_payroll  = true,   -- + honorarios por extras
    contract_type                     = 'mensual_fijo',
    monthly_salary_usd                = 600,
    hourly_rate_usd                   = 12.50,
    max_hours_per_week                = 30,
    hire_date                         = current_date - interval '1 year'
  WHERE id = v_therapist;

  -- Creador para los campos created_by (un admin existente, o la terapista).
  SELECT id INTO v_creator FROM public.users WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF v_creator IS NULL THEN
    v_creator := v_therapist;
  END IF;

  -- ── Asegurar el costo de la terapia de lenguaje (pago a la terapista) ──────
  UPDATE public.service_catalog
     SET cost_usd = 12.50
   WHERE category = 'terapia_individual'
     AND service_type = 'lenguaje'
     AND (cost_usd IS NULL OR cost_usd = 0);

  -- ── Si la familia de prueba ya existe, no duplicar ────────────────────────
  SELECT id INTO v_family_id FROM public.families
   WHERE primary_contact_email = v_family_email LIMIT 1;

  IF v_family_id IS NOT NULL THEN
    RAISE NOTICE 'La familia de prueba ya existe (id=%). No se duplican datos.', v_family_id;
    RAISE NOTICE 'Terapista de prueba lista: terapista.prueba@ejemplo.com / %', v_password;
    RETURN;
  END IF;

  -- ── Familia ficticia ──────────────────────────────────────────────────────
  v_family_id := gen_random_uuid();
  INSERT INTO public.families (
    id, primary_contact_name, primary_contact_email, primary_contact_phone,
    status, created_by_user_id
  ) VALUES (
    v_family_id, 'Familia Zelaya (Prueba)', v_family_email, '+503 7000-1111',
    'active', v_creator
  );

  -- ── Niño de prueba (activo en terapias) ───────────────────────────────────
  v_child_id := gen_random_uuid();
  INSERT INTO public.children (
    id, family_id, full_name, preferred_name, birth_date, gender,
    diagnoses_json, diagnoses_display_text,
    current_phase_code, current_phase_changed_at, created_by_user_id
  ) VALUES (
    v_child_id, v_family_id,
    'Niño Prueba Zelaya', 'Prueba', '2021-05-10', 'M',
    '["retraso_lenguaje"]'::jsonb, 'Retraso de lenguaje (caso de prueba)',
    '3_3_activo_en_terapias', now(), v_creator
  );

  -- ── Plan de tratamiento (lenguaje, lun/mié 10:00, terapista de prueba) ────
  INSERT INTO public.treatment_plans (
    child_id, primary_therapist_id, diagnosis_text, starts_at,
    therapies_json, schedule_pattern_json, monthly_total_usd, active,
    created_by_user_id
  ) VALUES (
    v_child_id, v_therapist, 'Retraso de lenguaje (caso de prueba)', current_date - interval '1 month',
    jsonb_build_array(
      jsonb_build_object(
        'service','lenguaje','active',true,'sessions_per_month',8,
        'unit_cost_usd',25,'therapist_id', v_therapist::text
      )
    ),
    '[{"day_of_week":"mon","time_local":"10:00","duration_minutes":45,"service":"lenguaje"},
      {"day_of_week":"wed","time_local":"10:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
    200, true, v_creator
  );

  -- ── Citas COMPLETADAS (este mes) ──────────────────────────────────────────
  -- 2 completadas hoy (entran a día/semana/mes y a "Mi semana" de la terapista).
  INSERT INTO public.appointments (
    child_id, therapist_id, event_type, service_type, modality,
    starts_at, ends_at, status, completed_at, is_extra, extra_reason,
    created_by_user_id, notes
  ) VALUES
  ( v_child_id, v_therapist, 'terapia', 'lenguaje', 'presencial',
    now() - interval '3 hours', now() - interval '3 hours' + v_dur,
    'completed', now() - interval '3 hours' + v_dur, false, NULL,
    v_creator, 'Cita de prueba (completada)'),
  -- Una marcada EXTRAORDINARIA (cobertura) → entra a servicios profesionales.
  ( v_child_id, v_therapist, 'terapia', 'lenguaje', 'presencial',
    now() - interval '2 hours', now() - interval '2 hours' + v_dur,
    'completed', now() - interval '2 hours' + v_dur, true, 'cobertura',
    v_creator, 'Cita de prueba (completada, EXTRA)'),
  -- 1 completada antes en el mes (solo aparece en granularidad mensual).
  ( v_child_id, v_therapist, 'terapia', 'lenguaje', 'presencial',
    now() - interval '12 days', now() - interval '12 days' + v_dur,
    'completed', now() - interval '12 days' + v_dur, false, NULL,
    v_creator, 'Cita de prueba (completada, mes)');

  -- ── Citas AGENDADAS para HOY (completarlas en vivo en la inducción) ───────
  INSERT INTO public.appointments (
    child_id, therapist_id, event_type, service_type, modality,
    starts_at, ends_at, status, created_by_user_id, notes
  ) VALUES
  ( v_child_id, v_therapist, 'terapia', 'lenguaje', 'presencial',
    now() + interval '2 hours', now() + interval '2 hours' + v_dur,
    'scheduled', v_creator, 'Cita de prueba (agendada hoy)'),
  ( v_child_id, v_therapist, 'terapia', 'lenguaje', 'presencial',
    now() + interval '4 hours', now() + interval '4 hours' + v_dur,
    'scheduled', v_creator, 'Cita de prueba (agendada hoy)');

  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE 'Datos de prueba creados.';
  RAISE NOTICE 'Terapista: terapista.prueba@ejemplo.com  /  %', v_password;
  RAISE NOTICE 'Familia:   % (id=%)', 'Familia Zelaya (Prueba)', v_family_id;
  RAISE NOTICE 'Niño:      % (id=%)', 'Niño Prueba Zelaya', v_child_id;
  RAISE NOTICE '────────────────────────────────────────────────────────';
END $$;

-- Limpieza del helper (ya no se necesita).
DROP FUNCTION IF EXISTS public._seed_create_auth_user(text, text);


-- ═══════════════════════════════════════════════════════════════════════════
-- LIMPIEZA — descomentar y correr DESPUÉS de la inducción para borrar todo
-- ═══════════════════════════════════════════════════════════════════════════
-- DO $$
-- DECLARE
--   v_family_id uuid;
--   v_therapist uuid;
-- BEGIN
--   SELECT id INTO v_family_id FROM public.families
--    WHERE primary_contact_email = 'familia.prueba@ejemplo.com' LIMIT 1;
--   IF v_family_id IS NOT NULL THEN
--     -- appointments / treatment_plans / children caen en cascada al borrar el niño/familia
--     DELETE FROM public.appointments a USING public.children c
--       WHERE a.child_id = c.id AND c.family_id = v_family_id;
--     DELETE FROM public.treatment_plans tp USING public.children c
--       WHERE tp.child_id = c.id AND c.family_id = v_family_id;
--     DELETE FROM public.children WHERE family_id = v_family_id;
--     DELETE FROM public.families WHERE id = v_family_id;
--   END IF;
--
--   -- Borrar la terapista de prueba (auth + public.users en cascada)
--   SELECT id INTO v_therapist FROM auth.users WHERE email = 'terapista.prueba@ejemplo.com' LIMIT 1;
--   IF v_therapist IS NOT NULL THEN
--     DELETE FROM auth.users WHERE id = v_therapist;
--   END IF;
-- END $$;
