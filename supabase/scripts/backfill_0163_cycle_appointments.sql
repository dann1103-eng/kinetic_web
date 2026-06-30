-- =============================================================================
-- Backfill 0163 — crear las citas de los ciclos pendientes que quedaron sin agenda
-- =============================================================================
-- Para ciclos generated+pending creados ANTES de aplicar la migración 0163 (con
-- el RPC viejo que difería las citas al pago). Les crea ahora las citas que el
-- confirm canónico habría creado.
--
-- ⚠️ CORRER LA MIGRACIÓN 0163 PRIMERO (redefine las funciones).
--
-- CÓMO USARLO: pegá TODO este bloque en Supabase Studio → SQL Editor → Run, y
-- REPETÍ (botón Run otra vez) hasta que el aviso diga "0 cita(s) creada(s)".
-- Procesa hasta 25 ciclos por corrida para no exceder el timeout del editor
-- ("Failed to fetch"). Es idempotente: salta ciclos que ya tienen sus citas y
-- candidatas que choquen con una cita activa existente. No duplica.
--
-- Si una tanda reporta "0 ciclo(s), 0 cita(s)" → terminó (los que queden son
-- planes sin terapias por-niño, ej. solo programa matutino, que no llevan citas
-- individuales — su agenda son sesiones de grupo).
-- =============================================================================

DO $backfill$
DECLARE
  v_cycle          public.monthly_session_cycles;
  v_plan           public.treatment_plans;
  v_compute        jsonb;
  v_candidate      jsonb;
  v_therapist_map  jsonb;
  v_flat_map       jsonb;
  v_therapy        jsonb;
  v_cand_therapist uuid;
  v_conflict       int;
  v_appt_count     int;
  v_total_cycles   int := 0;
  v_total_appts    int := 0;
BEGIN
  FOR v_cycle IN
    SELECT c.* FROM public.monthly_session_cycles c
     WHERE c.status = 'generated' AND c.payment_status = 'pending'
       -- solo los que NO tienen ya sus citas auto del mes
       AND NOT EXISTS (
         SELECT 1 FROM public.appointments a
          WHERE a.child_id = c.child_id
            AND a.starts_at >= date_trunc('month', c.period_month)
            AND a.starts_at <  (date_trunc('month', c.period_month) + interval '1 month')
            AND a.notes LIKE '%Auto-generado del ciclo%'
            AND a.status NOT IN ('cancelled','rescheduled')
       )
     ORDER BY c.period_month
     LIMIT 25  -- tanda: subí/bajá si tu editor aguanta más/menos
  LOOP
    BEGIN
      SELECT * INTO v_plan FROM public.treatment_plans
       WHERE child_id = v_cycle.child_id AND active;
      IF NOT FOUND OR v_plan.primary_therapist_id IS NULL THEN CONTINUE; END IF;

      -- Mapas terapista por servicio + flat (regla inline, sin depender del
      -- helper _kn_is_monthly_flat por si producción no lo tiene).
      v_therapist_map := '{}';
      v_flat_map := '{}';
      FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
      LOOP
        IF (v_therapy->>'active')::boolean AND coalesce(v_therapy->>'therapist_id','') <> '' THEN
          v_therapist_map := v_therapist_map || jsonb_build_object(v_therapy->>'service', v_therapy->>'therapist_id');
        END IF;
        IF (v_therapy->>'active')::boolean AND coalesce(
             v_therapy->>'billing_mode',
             CASE WHEN v_therapy->>'service' IN ('blue_kids','learning_kids','aula_educativa')
                  THEN 'monthly_flat' ELSE 'per_session' END
           ) = 'monthly_flat' THEN
          v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
        END IF;
      END LOOP;

      v_compute := public.compute_monthly_appointment_candidates(v_cycle.child_id, v_cycle.period_month, null);
      v_appt_count := 0;

      FOR v_candidate IN SELECT * FROM jsonb_array_elements(coalesce(v_compute->'candidates','[]'::jsonb))
      LOOP
        -- Saltar servicios matutinos flat (su agenda son sesiones de grupo).
        IF coalesce((v_flat_map->>(v_candidate->>'service'))::boolean, false) THEN
          CONTINUE;
        END IF;
        v_cand_therapist := coalesce(
          (v_candidate->>'therapist_id')::uuid,
          (v_therapist_map->>(v_candidate->>'service'))::uuid,
          v_plan.primary_therapist_id
        );
        -- No chocar con una cita activa existente del terapista.
        SELECT count(*) INTO v_conflict
          FROM public.appointments a
         WHERE a.therapist_id = v_cand_therapist
           AND a.status NOT IN ('rescheduled','no_show','late_cancel','cancelled')
           AND a.starts_at < (v_candidate->>'ends_at')::timestamptz
           AND a.ends_at   > (v_candidate->>'starts_at')::timestamptz;
        IF v_conflict > 0 THEN CONTINUE; END IF;

        INSERT INTO public.appointments (
          child_id, therapist_id, event_type, service_type, modality,
          starts_at, ends_at, status, created_by_user_id, notes
        ) VALUES (
          v_cycle.child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
          (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
          'scheduled', null,
          'Auto-generado del ciclo ' || to_char(v_cycle.period_month,'YYYY-MM') || ' (backfill 0163)'
        );
        v_appt_count := v_appt_count + 1;
      END LOOP;

      IF v_appt_count > 0 THEN
        UPDATE public.monthly_session_cycles
           SET appointments_generated_count = v_appt_count,
               appointments_generated_at = now()
         WHERE id = v_cycle.id;
        v_total_cycles := v_total_cycles + 1;
        v_total_appts  := v_total_appts + v_appt_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Backfill 0163: ciclo % (niño %, mes %) saltado: %',
        v_cycle.id, v_cycle.child_id, v_cycle.period_month, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Backfill 0163: % ciclo(s), % cita(s) creada(s) en esta tanda. Re-correr hasta que diga 0.',
    v_total_cycles, v_total_appts;
END
$backfill$;
