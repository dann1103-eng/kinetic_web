-- =============================================================================
-- 0177 — Desacople agenda/facturación — FASE 1 (spec 2026-07-12)
-- =============================================================================
-- "La agenda manda, la facturación lee." Esta fase:
--   1) Columnas de ajuste diferido en monthly_session_cycles (paid_expected_usd
--      + billing_adjustment_*) — el cómputo llega en F2, la inyección en F4.
--   2) RPC NUEVA generate_cycle_agenda: crea ciclo + citas SIN factura
--      (invoice_id NULL). Computa payment_amount_usd del snapshot para que
--      mark_monthly_cycle_paid siga funcionando en ciclos "solo agenda"
--      (su fallback sin factura usa v_cycle.payment_amount_usd).
--      confirm_monthly_payment_and_generate (0163) NO se toca: queda como
--      atajo combinado de recepción. Nombre nuevo ⇒ sin sobrecargas.
--   3) regenerate_cycle_appointments: guard relajado (ciclos PAGADOS también
--      son editables; las completadas/en curso/reposiciones se conservan
--      siempre) + arg nuevo p_only_future (limita el re-marcado Y la
--      inserción de candidatos a starts_at >= now(), para el prompt
--      "solo de ahora en adelante" de F2). Cambia la firma ⇒ DROP de la
--      firma vieja de 2 args (gotcha del repo).
-- =============================================================================

-- ── 1. Columnas de ajuste diferido ───────────────────────────────────────────
alter table public.monthly_session_cycles
  add column if not exists paid_expected_usd            numeric(12,2),
  add column if not exists billing_adjustment_usd       numeric(12,2) not null default 0,
  add column if not exists billing_adjustment_carried_at timestamptz;

comment on column public.monthly_session_cycles.paid_expected_usd is
  'Total esperado del snapshot al momento de pagar, NETO de líneas arrastradas (mora/ajustes de otros meses). Base para calcular billing_adjustment_usd si el plan cambia después del pago.';
comment on column public.monthly_session_cycles.billing_adjustment_usd is
  'Diferencia (nuevo esperado − paid_expected_usd) por ediciones posteriores al pago. Positivo=cargo, negativo=crédito. Se inyecta en la factura del mes siguiente (F4).';

-- ── 2. RPC generate_cycle_agenda (ciclo + citas, SIN factura) ────────────────
CREATE OR REPLACE FUNCTION public.generate_cycle_agenda(
  p_child_id          uuid,
  p_period_month      date,
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
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
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

  -- Total esperado del snapshot (misma matemática que las líneas de factura de
  -- confirm 0163, pero SIN insertar factura): mensualidad flat = 1×precio,
  -- resto = sesiones×precio. Va a payment_amount_usd para que mark_monthly_
  -- cycle_paid funcione sobre un ciclo sin factura.
  FOR v_therapy IN SELECT * FROM jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  LOOP
    IF (v_therapy->>'active')::boolean THEN
      IF public._kn_is_monthly_flat(v_therapy) THEN
        v_subtotal := v_subtotal + round((v_therapy->>'unit_cost_usd')::numeric, 2);
      ELSE
        v_subtotal := v_subtotal + round((v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric, 2);
      END IF;
    END IF;
  END LOOP;

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
    null, now(), v_appt_count,
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

GRANT EXECUTE ON FUNCTION public.generate_cycle_agenda(
  uuid, date, text, jsonb, date, jsonb, text, numeric, uuid, text[]
) TO anon, authenticated, service_role;

-- ── 3. regenerate_cycle_appointments: guard relajado + p_only_future ─────────
-- Cambia la firma (2 → 3 args) ⇒ DROP de la vieja para no dejar sobrecarga.
drop function if exists public.regenerate_cycle_appointments(uuid, jsonb);

create or replace function public.regenerate_cycle_appointments(
  p_cycle_id              uuid,
  p_appointments_override jsonb default null,
  p_only_future           boolean default false
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle        public.monthly_session_cycles;
  v_plan         public.treatment_plans;
  v_period       date;
  v_first_day    date;
  v_last_day     date;
  v_compute      jsonb;
  v_summary      jsonb;
  v_candidate    jsonb;
  v_appointments_to_create jsonb;
  v_therapist_map jsonb := '{}';
  v_therapy      jsonb;
  v_cand_therapist uuid;
  v_conflict_count int := 0;
  v_appt_count   int := 0;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
begin
  if not public.kn_can_manage_cycles() then
    raise exception 'not_authorized';
  end if;

  select * into v_cycle
    from public.monthly_session_cycles
   where id = p_cycle_id
   for update;

  if not found then raise exception 'cycle_not_found'; end if;
  -- [0177] Guard relajado: un ciclo PAGADO también es editable (las citas
  -- completadas/en curso/reposiciones se conservan siempre). Solo se bloquea
  -- un ciclo cancelado.
  if v_cycle.status <> 'generated' then
    raise exception 'cycle_not_editable';
  end if;

  v_period    := v_cycle.period_month;
  v_first_day := date_trunc('month', v_period)::date;
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  select * into v_plan
    from public.treatment_plans
   where child_id = v_cycle.child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean and coalesce(v_therapy->>'therapist_id','') <> '' then
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    end if;
  end loop;

  -- 1) Cancelar las citas scheduled auto-generadas del mes. Con p_only_future
  --    solo las de starts_at >= now() (las pasadas sin marcar quedan intactas).
  update public.appointments
     set status = 'rescheduled',
         notes = coalesce(notes,'') || E'\nCiclo regenerado'
   where child_id = v_cycle.child_id
     and starts_at >= v_first_day
     and starts_at <  (v_last_day + interval '1 day')
     and status = 'scheduled'
     and notes like '%Auto-generado del ciclo%'
     and (not p_only_future or starts_at >= now());

  -- 2) Determinar las citas a crear: override (validado) o compute.
  if p_appointments_override is not null and jsonb_typeof(p_appointments_override) = 'array' then
    v_appointments_to_create := p_appointments_override;

    v_period_start_iso := (v_first_day::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';
    v_period_end_iso   := ((v_first_day + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';

    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
      if (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         or (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso then
        raise exception 'override_date_out_of_period';
      end if;
      -- Con p_only_future los candidatos pasados se ignoran (no error): el
      -- caller manda el patrón del mes completo y acá se filtra.
      if p_only_future and (v_candidate->>'starts_at')::timestamptz < now() then
        continue;
      end if;

      v_cand_therapist := coalesce(
        (v_candidate->>'therapist_id')::uuid,
        (v_therapist_map->>(v_candidate->>'service'))::uuid,
        v_plan.primary_therapist_id
      );
      select count(*) into v_conflict_count
        from public.appointments a
       where a.therapist_id = v_cand_therapist
         and a.status not in ('rescheduled','no_show','late_cancel')
         and a.starts_at < (v_candidate->>'ends_at')::timestamptz
         and a.ends_at   > (v_candidate->>'starts_at')::timestamptz;
      if v_conflict_count > 0 then
        raise exception 'has_conflicts: 1';
      end if;
    end loop;
  else
    v_compute := public.compute_monthly_appointment_candidates(v_cycle.child_id, v_period, null);
    v_summary := v_compute->'summary';
    if (v_summary->>'conflict_count')::int > 0 then
      raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
    end if;
    v_appointments_to_create := v_compute->'candidates';
  end if;

  -- 3) Crear las citas nuevas (con p_only_future, solo las futuras).
  for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
  loop
    if p_only_future and (v_candidate->>'starts_at')::timestamptz < now() then
      continue;
    end if;
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      v_cycle.child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  update public.monthly_session_cycles
     set appointments_generated_count = v_appt_count,
         appointments_generated_at = now()
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;

grant execute on function public.regenerate_cycle_appointments(uuid, jsonb, boolean)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Fin de migración 0177 ────────────────────────────────────────────────────
