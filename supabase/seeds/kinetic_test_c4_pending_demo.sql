-- =============================================================================
-- DEMO C4 — Banner de informes de avances pendientes
-- =============================================================================
-- Crea 2 familias ficticias con 3 niños y citas de terapia en los últimos 4
-- meses con un terapista de prueba. Algunos pares (child × service) ya tienen
-- informe → NO deben aparecer en el banner. Otros NO → SÍ deben aparecer.
--
-- Cómo correrlo:
--   1. Editá `v_therapist_email` abajo con el email del terapista que vas a usar
--      para iniciar sesión (debe existir en public.users con role='terapista').
--   2. Pegá todo el archivo en Supabase Dashboard → SQL Editor → Run.
--   3. Loguéate como ese terapista, andá a /mi-dia → debe aparecer el banner.
--   4. Loguéate como directora/admin, andá a /aprobaciones → vista resumen
--      debe mostrar al terapista con sus pendientes.
--
-- Para borrar todo: descomentar el bloque CLEANUP al final y correr de nuevo.
--
-- IMPORTANTE: nombres ficticios, no usar datos reales.
-- =============================================================================

DO $$
DECLARE
  -- ⬇️ EDITAR ESTE EMAIL ⬇️
  v_therapist_email text := 'CAMBIAR_AQUI@ejemplo.com';

  v_therapist_id    uuid;
  v_template_id     uuid;
  v_family1_id      uuid;
  v_family2_id      uuid;
  v_sofia_id        uuid;
  v_mateo_id        uuid;
  v_luca_id         uuid;
  v_appt_id         uuid;
  v_period_start    date := (now() - interval '3 months')::date;
  v_period_end      date := (now() - interval '7 days')::date;
  i int;
BEGIN
  -- 0. Resolver terapista: primero por email, fallback al primer terapista/maestra disponible.
  SELECT id INTO v_therapist_id
    FROM public.users
   WHERE email = v_therapist_email
   LIMIT 1;

  IF v_therapist_id IS NULL THEN
    SELECT id INTO v_therapist_id
      FROM public.users
     WHERE role IN ('terapista','maestra')
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_therapist_id IS NULL THEN
      RAISE EXCEPTION 'No hay ningún usuario con role terapista/maestra en public.users. Creá uno primero (Auth → Add user → setear role en public.users).';
    END IF;

    RAISE NOTICE 'Email % no encontrado. Usando primer terapista/maestra disponible: id=%', v_therapist_email, v_therapist_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_therapist_id AND role IN ('terapista','maestra','admin','directora')
  ) THEN
    RAISE WARNING 'El usuario % no tiene role compatible con /mi-dia (terapista/maestra). El banner no se verá ahí, pero sí en /aprobaciones para la directora.', v_therapist_email;
  END IF;

  -- 1. Plantilla genérica (debe existir tras mig 0098)
  SELECT id INTO v_template_id
    FROM public.report_templates
   WHERE kind = 'progress' AND service_type IS NULL AND active = true
   LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'No hay plantilla "Genérica" activa. Aplicá la migración 0098 antes.';
  END IF;

  -- 2. Familias ficticias (idempotente por nombre)
  SELECT id INTO v_family1_id FROM public.families
    WHERE primary_contact_name = 'DEMO C4 — Familia García';

  IF v_family1_id IS NULL THEN
    INSERT INTO public.families (primary_contact_name, primary_contact_email, status, notes)
    VALUES (
      'DEMO C4 — Familia García',
      'demo.garcia@example.com',
      'active',
      'Datos de prueba para banner C4. Borrar con bloque CLEANUP del seed.'
    )
    RETURNING id INTO v_family1_id;
  END IF;

  SELECT id INTO v_family2_id FROM public.families
    WHERE primary_contact_name = 'DEMO C4 — Familia Martínez';

  IF v_family2_id IS NULL THEN
    INSERT INTO public.families (primary_contact_name, primary_contact_email, status, notes)
    VALUES (
      'DEMO C4 — Familia Martínez',
      'demo.martinez@example.com',
      'active',
      'Datos de prueba para banner C4.'
    )
    RETURNING id INTO v_family2_id;
  END IF;

  -- 3. Niños ficticios (3 niños, todos active)
  SELECT id INTO v_sofia_id FROM public.children
    WHERE family_id = v_family1_id AND full_name = 'Sofía Demo García';
  IF v_sofia_id IS NULL THEN
    INSERT INTO public.children (family_id, full_name, preferred_name, birth_date, gender, treatment_status)
    VALUES (v_family1_id, 'Sofía Demo García', 'Sofi', '2018-03-15', 'F', 'active')
    RETURNING id INTO v_sofia_id;
  END IF;

  SELECT id INTO v_mateo_id FROM public.children
    WHERE family_id = v_family1_id AND full_name = 'Mateo Demo García';
  IF v_mateo_id IS NULL THEN
    INSERT INTO public.children (family_id, full_name, preferred_name, birth_date, gender, treatment_status)
    VALUES (v_family1_id, 'Mateo Demo García', 'Mati', '2020-07-22', 'M', 'active')
    RETURNING id INTO v_mateo_id;
  END IF;

  SELECT id INTO v_luca_id FROM public.children
    WHERE family_id = v_family2_id AND full_name = 'Luca Demo Martínez';
  IF v_luca_id IS NULL THEN
    INSERT INTO public.children (family_id, full_name, preferred_name, birth_date, gender, treatment_status)
    VALUES (v_family2_id, 'Luca Demo Martínez', NULL, '2019-11-08', 'M', 'active')
    RETURNING id INTO v_luca_id;
  END IF;

  -- 4. Limpiar citas/informes previos del seed (para que sea re-ejecutable)
  DELETE FROM public.progress_reports
    WHERE child_id IN (v_sofia_id, v_mateo_id, v_luca_id);
  DELETE FROM public.appointments
    WHERE child_id IN (v_sofia_id, v_mateo_id, v_luca_id)
      AND therapist_id = v_therapist_id;

  -- 5. Citas de terapia con el terapista de prueba.
  --
  --   Pares activos en la ventana de 4 meses (lo que detecta el helper):
  --     Sofía  × lenguaje      ← 6 citas semanales recientes
  --     Sofía  × sensorial     ← 2 citas hace 3 meses
  --     Mateo  × motricidad_gruesa ← 4 citas
  --     Mateo  × lenguaje      ← 3 citas
  --     Luca   × ocupacional   ← 5 citas
  --     Luca   × lenguaje      ← 2 citas
  --   Total: 6 pares activos.

  -- Sofía × lenguaje (6 citas, semanales)
  FOR i IN 0..5 LOOP
    INSERT INTO public.appointments
      (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status)
    VALUES
      (v_sofia_id, v_therapist_id, 'terapia', 'lenguaje', 'presencial',
       (now() - (i * interval '7 days') - interval '2 days')::timestamptz,
       (now() - (i * interval '7 days') - interval '2 days' + interval '45 minutes')::timestamptz,
       'completed');
  END LOOP;

  -- Sofía × sensorial (2 citas hace ~3 meses)
  FOR i IN 0..1 LOOP
    INSERT INTO public.appointments
      (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status)
    VALUES
      (v_sofia_id, v_therapist_id, 'terapia', 'sensorial', 'presencial',
       (now() - interval '90 days' - (i * interval '7 days'))::timestamptz,
       (now() - interval '90 days' - (i * interval '7 days') + interval '45 minutes')::timestamptz,
       'completed');
  END LOOP;

  -- Mateo × motricidad_gruesa (4 citas)
  FOR i IN 0..3 LOOP
    INSERT INTO public.appointments
      (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status)
    VALUES
      (v_mateo_id, v_therapist_id, 'terapia', 'motricidad_gruesa', 'presencial',
       (now() - (i * interval '14 days') - interval '5 days')::timestamptz,
       (now() - (i * interval '14 days') - interval '5 days' + interval '45 minutes')::timestamptz,
       'completed');
  END LOOP;

  -- Mateo × lenguaje (3 citas)
  FOR i IN 0..2 LOOP
    INSERT INTO public.appointments
      (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status)
    VALUES
      (v_mateo_id, v_therapist_id, 'terapia', 'lenguaje', 'presencial',
       (now() - (i * interval '14 days') - interval '10 days')::timestamptz,
       (now() - (i * interval '14 days') - interval '10 days' + interval '45 minutes')::timestamptz,
       'completed');
  END LOOP;

  -- Luca × ocupacional (5 citas)
  FOR i IN 0..4 LOOP
    INSERT INTO public.appointments
      (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status)
    VALUES
      (v_luca_id, v_therapist_id, 'terapia', 'ocupacional', 'presencial',
       (now() - (i * interval '7 days') - interval '3 days')::timestamptz,
       (now() - (i * interval '7 days') - interval '3 days' + interval '45 minutes')::timestamptz,
       'completed');
  END LOOP;

  -- Luca × lenguaje (2 citas)
  FOR i IN 0..1 LOOP
    INSERT INTO public.appointments
      (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status)
    VALUES
      (v_luca_id, v_therapist_id, 'terapia', 'lenguaje', 'presencial',
       (now() - interval '60 days' - (i * interval '14 days'))::timestamptz,
       (now() - interval '60 days' - (i * interval '14 days') + interval '45 minutes')::timestamptz,
       'completed');
  END LOOP;

  -- 6. Informes ya hechos para 2 de los 6 pares.
  --    Mateo × motricidad_gruesa → APPROVED (no debe aparecer pendiente)
  --    Luca  × lenguaje          → SENT_TO_FAMILY (no debe aparecer pendiente)
  --
  --    Resultado esperado del banner: 4 pendientes
  --      • Sofía × Lenguaje
  --      • Sofía × Sensorial
  --      • Mateo × Lenguaje
  --      • Luca  × Ocupacional

  INSERT INTO public.progress_reports
    (child_id, service_type, period_starts, period_ends, authored_by_user_id,
     sessions_attended_count, data_json, status, visible_to_family,
     submitted_at, approved_by_user_id, approved_at, template_id)
  VALUES
    (v_mateo_id, 'motricidad_gruesa', v_period_start, v_period_end, v_therapist_id,
     4,
     jsonb_build_object(
       'seguimiento', 'Mateo asistió a 4 sesiones de motricidad gruesa.',
       'logros_obtenidos', 'Mejoró equilibrio en una pierna y coordinación bilateral.',
       'recomendaciones', 'Continuar con ejercicios de salto en casa 2 veces por semana.'
     ),
     'approved', false,
     now() - interval '5 days',
     v_therapist_id, now() - interval '4 days',
     v_template_id),
    (v_luca_id, 'lenguaje', v_period_start, v_period_end, v_therapist_id,
     2,
     jsonb_build_object(
       'seguimiento', 'Luca trabajó en articulación de fonemas /r/ y /s/.',
       'logros_obtenidos', 'Logró pronunciar /r/ en posición inicial.',
       'recomendaciones', 'Reforzar con lectura diaria de cuentos en voz alta.'
     ),
     'sent_to_family', true,
     now() - interval '8 days',
     v_therapist_id, now() - interval '7 days',
     v_template_id);

  RAISE NOTICE 'Seed C4 completo. Terapista: %. Pares activos: 6. Informes ya hechos: 2. Esperás ver 4 pendientes en el banner.', v_therapist_email;
END $$;


-- =============================================================================
-- CLEANUP — descomentar y correr para borrar todo lo del seed
-- =============================================================================
--
-- DO $$
-- DECLARE
--   v_family1_id uuid;
--   v_family2_id uuid;
-- BEGIN
--   SELECT id INTO v_family1_id FROM public.families WHERE primary_contact_name = 'DEMO C4 — Familia García';
--   SELECT id INTO v_family2_id FROM public.families WHERE primary_contact_name = 'DEMO C4 — Familia Martínez';
--
--   -- Cascade desde families → children → appointments / progress_reports
--   IF v_family1_id IS NOT NULL THEN
--     DELETE FROM public.families WHERE id = v_family1_id;
--   END IF;
--   IF v_family2_id IS NOT NULL THEN
--     DELETE FROM public.families WHERE id = v_family2_id;
--   END IF;
--   RAISE NOTICE 'Cleanup C4 completo.';
-- END $$;
