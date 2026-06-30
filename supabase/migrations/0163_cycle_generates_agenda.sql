-- =============================================================================
-- 0163 — El ciclo genera la AGENDA al GENERAR (independiente del pago)
-- =============================================================================
-- PROBLEMA (producción): al generar el ciclo se creaba la factura PENDIENTE y la
-- previsualización, pero las citas NO se insertaban hasta "Marcar pagado". Esto
-- forzaba a recepción a marcar pagado para poder planificar la agenda — lo que
-- descuadra la contabilidad (el ingreso debe registrarse solo cuando se cobra de
-- verdad). El repo ya hace lo correcto desde 0136 (las citas se crean al GENERAR,
-- la factura queda pendiente), pero esa versión del RPC nunca llegó a producción:
-- el RPC desplegado quedó desfasado (el #1 gotcha del proyecto — migraciones
-- aplicadas a mano) y/o coexistían sobrecargas (ver 0153) que ejecutaban una
-- versión vieja.
--
-- FIX (idempotente, determinista):
--   1) Dropea TODAS las sobrecargas viejas de confirm_monthly_payment_and_generate
--      y deja SOLO la firma canónica de 14 args.
--   2) Re-asegura confirm_monthly_payment_and_generate VERBATIM de 0152
--      → generar el ciclo crea las citas (factura 'pending', paid_at NULL).
--   3) Re-asegura mark_monthly_cycle_paid VERBATIM de 0145
--      → marcar pagado SOLO toca pago/factura, NO crea citas.
--      (Crítico: si el mark_paid desplegado creaba citas, dejarlo así + arreglar
--       confirm produciría citas DUPLICADAS al cobrar. Por eso se tocan los dos.)
--   4) Backfill: para TODOS los ciclos generated+pending que hoy quedaron sin
--      citas, las crea ahora (espejo de confirm; salta programas matutinos flat
--      que tienen su propia generación de grupo). No duplica: salta ciclos que ya
--      tienen citas auto y candidatas que choquen con una cita activa existente.
--
-- Después de aplicar: generar un ciclo refleja la agenda al instante en
-- /agenda, /mi-dia, dashboard del niño y portal — sin marcar pagado.
-- =============================================================================

-- ── 1. Limpiar sobrecargas viejas de confirm (deja solo la de 14 args) ───────
DROP FUNCTION IF EXISTS public.confirm_monthly_payment_and_generate(
  uuid, date, numeric, text, text, timestamptz, text
);
DROP FUNCTION IF EXISTS public.confirm_monthly_payment_and_generate(
  uuid, date, numeric, text, text, timestamptz, text, jsonb
);
DROP FUNCTION IF EXISTS public.confirm_monthly_payment_and_generate(
  uuid, date, numeric, text, text, timestamptz, text, jsonb, date
);

-- ── 2. confirm_monthly_payment_and_generate — VERBATIM de 0152 ───────────────
-- Crea factura pendiente + citas al generar. Estado del ciclo: 'generated' /
-- 'pending' / paid_at NULL. NO registra pago.
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

GRANT EXECUTE ON FUNCTION public.confirm_monthly_payment_and_generate(
  uuid, date, numeric, text, text, timestamptz, text, jsonb, date, jsonb, text, numeric, uuid, text[]
) TO anon, authenticated, service_role;

-- ── 3. mark_monthly_cycle_paid — VERBATIM de 0145 ────────────────────────────
-- SOLO marca pagado + recargo por mora. NO crea, modifica ni borra citas.
CREATE OR REPLACE FUNCTION public.mark_monthly_cycle_paid(
  p_cycle_id        uuid,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now()
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle       public.monthly_session_cycles;
  v_invoice     public.invoices;
  v_grace       date;
  v_days_late   int;
  v_blocks      int;
  v_pct         numeric;
  v_base        numeric(12,2);
  v_surcharge   numeric(12,2) := 0;
begin
  if not public.kn_can_manage_cycles() then
    raise exception 'not_authorized';
  end if;

  select * into v_cycle from public.monthly_session_cycles where id = p_cycle_id for update;
  if not found then raise exception 'cycle_not_found'; end if;
  if v_cycle.status = 'cancelled' then raise exception 'cycle_cancelled'; end if;
  if v_cycle.payment_status = 'paid' then raise exception 'cycle_already_paid'; end if;

  -- Recargo por mora: 5% por cada 5 días de atraso vs gracia efectiva.
  v_grace := coalesce(v_cycle.grace_extended_to, v_cycle.due_date);
  v_base  := v_cycle.payment_amount_usd;  -- total esperado (sin recargo)

  if v_cycle.invoice_id is not null then
    select * into v_invoice from public.invoices where id = v_cycle.invoice_id;
    if found then v_base := v_invoice.total; end if;
  end if;

  if v_grace is not null then
    v_days_late := (p_paid_at::date - v_grace);
    if v_days_late > 0 then
      v_blocks := ceil(v_days_late::numeric / 5);
      v_pct := v_blocks * 5;
      v_surcharge := round(v_base * v_pct / 100, 2);
    end if;
  end if;

  -- Actualizar factura: recargo como línea + total + marcar pagada.
  if v_cycle.invoice_id is not null and found then
    if v_surcharge > 0 then
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
      values (
        v_cycle.invoice_id,
        'Recargo por mora (' || v_pct::text || '% — ' || v_days_late::text || ' días de atraso)',
        1, v_surcharge, v_surcharge, 99
      );
    end if;
    update public.invoices
       set total = v_base + v_surcharge,
           total_a_pagar = v_base + v_surcharge,
           status = 'paid',
           payment_date = p_paid_at::date,
           payment_method = p_payment_method,
           payment_reference = p_payment_reference
     where id = v_cycle.invoice_id;
  end if;

  update public.monthly_session_cycles
     set payment_status = 'paid',
         paid_at = p_paid_at,
         paid_by_user_id = auth.uid(),
         payment_method = p_payment_method,
         payment_reference = p_payment_reference,
         surcharge_amount_usd = v_surcharge,
         payment_amount_usd = v_base + v_surcharge
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;

GRANT EXECUTE ON FUNCTION public.mark_monthly_cycle_paid(
  uuid, text, text, timestamptz
) TO anon, authenticated, service_role;

-- ── 4. Backfill: citas de los ciclos pendientes que quedaron sin agenda ──────
-- Para TODOS los ciclos generated+pending (cualquier mes), crea las citas que
-- el confirm canónico habría creado. Best-effort por ciclo (un error no aborta
-- el resto). Espejo de confirm: salta servicios matutinos flat y no duplica.
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
  v_existing       int;
  v_conflict       int;
  v_appt_count     int;
  v_total_cycles   int := 0;
  v_total_appts    int := 0;
BEGIN
  FOR v_cycle IN
    SELECT * FROM public.monthly_session_cycles
     WHERE status = 'generated' AND payment_status = 'pending'
     ORDER BY period_month
  LOOP
    BEGIN
      -- ¿el ciclo ya tiene citas auto del mes? → no re-crear.
      SELECT count(*) INTO v_existing
        FROM public.appointments a
       WHERE a.child_id = v_cycle.child_id
         AND a.starts_at >= date_trunc('month', v_cycle.period_month)
         AND a.starts_at <  (date_trunc('month', v_cycle.period_month) + interval '1 month')
         AND a.notes LIKE '%Auto-generado del ciclo%'
         AND a.status NOT IN ('cancelled','rescheduled');
      IF v_existing > 0 THEN CONTINUE; END IF;

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

  RAISE NOTICE 'Backfill 0163 completo: % ciclo(s) rellenado(s), % cita(s) creada(s).',
    v_total_cycles, v_total_appts;
END
$backfill$;

-- ── Fin de migración 0163 ────────────────────────────────────────────────────
