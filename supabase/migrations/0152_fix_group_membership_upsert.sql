-- =============================================================================
-- 0152 — Fix: upsert de membresía de grupo matutino en ciclo
-- =============================================================================
-- BUG: al crear un ciclo con programa matutino, el RPC hacía:
--   1) UPDATE: desactivar grupos DISTINTOS al destino
--   2) INSERT: si no existe el registro del grupo destino
--
-- Si el niño ya tenía un registro activo para ese mismo grupo destino
-- (de un ciclo anterior), el UPDATE del paso 1 lo saltaba (WHERE group_id <>
-- p_program_group_id) y el EXISTS del paso 2 lo encontraba → UPDATE, ok.
--
-- PERO si el niño tenía un registro activo para OTRO grupo Y también uno
-- INACTIVO para el grupo destino... el UPDATE desactivaba el otro, luego el
-- INSERT fallaba porque el registro inactivo del grupo destino fue pasado por
-- alto en el EXISTS (o hubo un estado corrupto previo).
--
-- FIX: desactivar TODOS los registros activos del niño primero, luego hacer
-- INSERT … ON CONFLICT para el grupo destino. Esto es idempotente y nunca
-- viola el índice único (child_id) WHERE active.
--
-- Añade también un índice único en (child_id, group_id) para soportar
-- ON CONFLICT en el INSERT, y reproduce verbatim el confirm con el cambio.
-- =============================================================================

-- ── 1. Índice único (child_id, group_id) para el ON CONFLICT ─────────────────
CREATE UNIQUE INDEX IF NOT EXISTS program_group_members_child_group_idx
  ON public.program_group_members (child_id, group_id);

-- ── 2. confirm_monthly_payment_and_generate: membresía con ON CONFLICT ────────
-- Solo cambia el bloque de membresía (marcado [0152]). Todo lo demás es
-- idéntico a 0149.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_monthly_payment_and_generate(
  p_child_id          uuid,
  p_period_month      date,
  p_payment_amount    numeric,
  p_payment_method    text DEFAULT 'cash',
  p_payment_reference text DEFAULT null,
  p_paid_at           timestamptz DEFAULT now(),
  p_notes             text DEFAULT null,
  p_appointments_override jsonb DEFAULT null,
  p_due_date          date DEFAULT null,
  p_rollover_sessions jsonb DEFAULT null,
  p_rollover_mode     text DEFAULT 'none',
  p_rollover_discount numeric DEFAULT 0,
  p_program_group_id  uuid DEFAULT null,
  p_attendance_days   text[] DEFAULT null
) RETURNS public.monthly_session_cycles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_appointments_to_create jsonb;
  v_invoice_id  uuid;
  v_invoice_no  text;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_line_total  numeric(12,2);
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_emitter     jsonb;
  v_client_snap jsonb;
  v_conflict_count int := 0;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
  v_therapist_map jsonb := '{}';
  v_flat_map      jsonb := '{}';
  v_cand_therapist uuid;
  v_due         date;
  v_rollover_for_compute jsonb := null;
BEGIN
  IF NOT public.kn_can_manage_cycles() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_plan
    FROM public.treatment_plans
   WHERE child_id = p_child_id AND active
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_treatment_plan'; END IF;
  IF v_plan.primary_therapist_id IS NULL THEN RAISE EXCEPTION 'plan_has_no_primary_therapist'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.monthly_session_cycles
    WHERE child_id = p_child_id
      AND period_month = v_period
      AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'cycle_already_exists_for_period';
  END IF;

  v_due := coalesce(p_due_date, (v_period + 4));

  IF p_rollover_mode = 'accumulate' THEN
    v_rollover_for_compute := p_rollover_sessions;
  END IF;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean AND coalesce(v_therapy->>'therapist_id','') <> '' THEN
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    END IF;
    IF (v_therapy->>'active')::boolean AND public._kn_is_monthly_flat(v_therapy) THEN
      v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
    END IF;
  END LOOP;

  IF p_appointments_override IS NOT NULL AND jsonb_typeof(p_appointments_override) = 'array' THEN
    v_appointments_to_create := p_appointments_override;

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      v_cand_therapist := coalesce(
        (v_candidate->>'therapist_id')::uuid,
        (v_therapist_map->>(v_candidate->>'service'))::uuid,
        v_plan.primary_therapist_id
      );
      SELECT count(*) INTO v_conflict_count
        FROM public.appointments a
       WHERE a.therapist_id = v_cand_therapist
         AND a.status NOT IN ('rescheduled','no_show','late_cancel')
         AND a.starts_at < (v_candidate->>'ends_at')::timestamptz
         AND a.ends_at   > (v_candidate->>'starts_at')::timestamptz;
      IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'has_conflicts: 1';
      END IF;
    END LOOP;

    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/El_Salvador';

    FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
    LOOP
      IF (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         OR (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso THEN
        RAISE EXCEPTION 'override_date_out_of_period';
      END IF;
    END LOOP;
  ELSE
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period, v_rollover_for_compute);
    v_summary := v_compute->'summary';
    IF (v_summary->>'conflict_count')::int > 0 THEN
      RAISE EXCEPTION 'has_conflicts: %', (v_summary->>'conflict_count');
    END IF;
    v_appointments_to_create := v_compute->'candidates';
  END IF;

  SELECT jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    INTO v_client_snap
    FROM public.children c
   WHERE c.id = p_child_id;

  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  v_invoice_no := public._kn_next_invoice_number(v_period);
  INSERT INTO public.invoices (
    invoice_number, client_id, child_id, issue_date, due_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) VALUES (
    v_invoice_no, null, p_child_id, current_date, v_due,
    'USD', 0, 0, 0, 0, 0, 0,
    'issued', null, null, null,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM'))
      || '. Fecha límite de pago: ' || to_char(v_due,'DD/MM/YYYY')
      || ' (pasada esa fecha se cobra 5% de recargo por cada 5 días de atraso).',
    v_client_snap, v_emitter, auth.uid()
  )
  RETURNING id INTO v_invoice_id;

  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean THEN
      IF public._kn_is_monthly_flat(v_therapy) THEN
        v_line_total := round((v_therapy->>'unit_cost_usd')::numeric, 2);
        v_subtotal := v_subtotal + v_line_total;
        INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (v_invoice_id, 'mensualidad ' || (v_therapy->>'service'), 1, (v_therapy->>'unit_cost_usd')::numeric, v_line_total, 0);
      ELSE
        v_line_total := round((v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric, 2);
        v_subtotal := v_subtotal + v_line_total;
        INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (v_invoice_id, v_therapy->>'service', (v_therapy->>'sessions_per_month')::numeric, (v_therapy->>'unit_cost_usd')::numeric, v_line_total, 0);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.invoices
     SET subtotal = v_subtotal, total = v_subtotal, total_a_pagar = v_subtotal
   WHERE id = v_invoice_id;

  FOR v_candidate IN SELECT * FROM jsonb_array_elements(v_appointments_to_create)
  LOOP
    IF coalesce((v_flat_map->>(v_candidate->>'service'))::boolean, false) THEN
      CONTINUE;
    END IF;
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    INSERT INTO public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) VALUES (
      p_child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  END LOOP;

  -- [0152] Membresía del grupo matutino: fix idempotente.
  -- Desactiva TODOS los registros activos del niño primero (no solo los de
  -- otros grupos), luego inserta/actualiza el grupo destino. Esto elimina la
  -- violación del índice único (child_id) WHERE active que ocurría cuando
  -- el niño ya tenía una membresía activa previa para cualquier grupo.
  IF p_program_group_id IS NOT NULL THEN
    UPDATE public.program_group_members
       SET active = false, updated_at = now()
     WHERE child_id = p_child_id AND active;

    INSERT INTO public.program_group_members (group_id, child_id, attendance_days, active)
    VALUES (p_program_group_id, p_child_id, coalesce(p_attendance_days, '{}'), true)
    ON CONFLICT (child_id, group_id)
    DO UPDATE SET
      active          = true,
      attendance_days = coalesce(p_attendance_days, program_group_members.attendance_days),
      updated_at      = now();
  END IF;

  INSERT INTO public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, payment_status, due_date, notes,
    rollover_mode, rollover_sessions_json, rollover_discount_usd,
    program_group_id, attendance_days
  ) VALUES (
    p_child_id, v_period, to_jsonb(v_plan),
    null, null, null, null, v_subtotal,
    v_invoice_id, now(), v_appt_count,
    'generated', 'pending', v_due, p_notes,
    coalesce(p_rollover_mode, 'none'),
    p_rollover_sessions,
    coalesce(p_rollover_discount, 0),
    p_program_group_id, p_attendance_days
  )
  RETURNING * INTO v_cycle;

  RETURN v_cycle;
END;
$$;

-- ── Fin de migración 0152 ────────────────────────────────────────────────────
