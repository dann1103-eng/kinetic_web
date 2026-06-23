-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: Citas de demo en tiempo real — 30 min, 9:00 a 12:00 GMT-6
-- ═══════════════════════════════════════════════════════════════════════════
-- Crea 6 citas consecutivas de 30 minutos para HOY (CURRENT_DATE) con la
-- primera terapista del sistema y el primer niño activo.
-- Se puede correr cada día antes de una demo sin dejar duplicados.
--
-- Para especificar terapista/niño concretos: reemplaza las queries de IDs.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_therapist_id uuid;
  v_child_id     uuid;
  v_admin_id     uuid;
  v_today        date := CURRENT_DATE;  -- cambia a '2026-06-23' si necesitas fecha fija
BEGIN
  -- ── Terapista de prueba ────────────────────────────────────────────────
  -- Usa el primer terapista creado. Para usar uno específico:
  --   SELECT id INTO v_therapist_id FROM public.users WHERE email = 'terapista@ejemplo.com';
  SELECT id INTO v_therapist_id
    FROM public.users
   WHERE role = 'terapista'
   ORDER BY created_at
   LIMIT 1;

  -- ── Niño de prueba ────────────────────────────────────────────────────
  -- Usa el primer niño activo (en terapias). Para usar uno específico:
  --   SELECT id INTO v_child_id FROM public.children WHERE full_name ILIKE '%Sofía%' LIMIT 1;
  SELECT id INTO v_child_id
    FROM public.children
   WHERE current_phase_code = '3_3_activo_en_terapias'
   ORDER BY created_at
   LIMIT 1;

  -- ── Admin para auditoría ───────────────────────────────────────────────
  SELECT id INTO v_admin_id
    FROM public.users
   WHERE role = 'admin'
   ORDER BY created_at
   LIMIT 1;

  IF v_therapist_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún usuario con role=terapista';
  END IF;
  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún niño en fase 3_3_activo_en_terapias';
  END IF;

  RAISE NOTICE 'Terapista: % | Niño: % | Fecha: %', v_therapist_id, v_child_id, v_today;

  -- ── Limpiar citas scheduled existentes para esta fecha (evita duplicados) ──
  DELETE FROM public.appointments
   WHERE child_id     = v_child_id
     AND therapist_id = v_therapist_id
     AND (starts_at AT TIME ZONE 'America/El_Salvador')::date = v_today
     AND status = 'scheduled';

  -- ── Insertar 6 citas de 30 min: 9:00 → 12:00 GMT-6 ───────────────────
  --   Slot 1  9:00 – 9:30   lenguaje
  --   Slot 2  9:30 – 10:00  motricidad_fina
  --   Slot 3  10:00 – 10:30 sensorial
  --   Slot 4  10:30 – 11:00 psicologica
  --   Slot 5  11:00 – 11:30 ocupacional
  --   Slot 6  11:30 – 12:00 motricidad_gruesa
  INSERT INTO public.appointments
    (child_id, therapist_id, event_type, service_type, modality,
     starts_at, ends_at, status, created_by_user_id)
  VALUES
    -- Slot 1: 9:00 – 9:30
    (v_child_id, v_therapist_id, 'terapia', 'lenguaje', 'presencial',
      (v_today::timestamp + INTERVAL '9 hours')         AT TIME ZONE 'America/El_Salvador',
      (v_today::timestamp + INTERVAL '9 hours 30 min')  AT TIME ZONE 'America/El_Salvador',
      'scheduled', v_admin_id),

    -- Slot 2: 9:30 – 10:00
    (v_child_id, v_therapist_id, 'terapia', 'motricidad_fina', 'presencial',
      (v_today::timestamp + INTERVAL '9 hours 30 min')  AT TIME ZONE 'America/El_Salvador',
      (v_today::timestamp + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
      'scheduled', v_admin_id),

    -- Slot 3: 10:00 – 10:30
    (v_child_id, v_therapist_id, 'terapia', 'sensorial', 'presencial',
      (v_today::timestamp + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
      (v_today::timestamp + INTERVAL '10 hours 30 min') AT TIME ZONE 'America/El_Salvador',
      'scheduled', v_admin_id),

    -- Slot 4: 10:30 – 11:00
    (v_child_id, v_therapist_id, 'terapia', 'psicologica', 'presencial',
      (v_today::timestamp + INTERVAL '10 hours 30 min') AT TIME ZONE 'America/El_Salvador',
      (v_today::timestamp + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
      'scheduled', v_admin_id),

    -- Slot 5: 11:00 – 11:30
    (v_child_id, v_therapist_id, 'terapia', 'ocupacional', 'presencial',
      (v_today::timestamp + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
      (v_today::timestamp + INTERVAL '11 hours 30 min') AT TIME ZONE 'America/El_Salvador',
      'scheduled', v_admin_id),

    -- Slot 6: 11:30 – 12:00
    (v_child_id, v_therapist_id, 'terapia', 'motricidad_gruesa', 'presencial',
      (v_today::timestamp + INTERVAL '11 hours 30 min') AT TIME ZONE 'America/El_Salvador',
      (v_today::timestamp + INTERVAL '12 hours')        AT TIME ZONE 'America/El_Salvador',
      'scheduled', v_admin_id);

  RAISE NOTICE '✓ 6 citas de 30 min creadas para el % (9:00–12:00 GMT-6)', v_today;
END $$;
