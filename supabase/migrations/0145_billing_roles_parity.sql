-- Migración 0145 — Paridad de roles para planes y ciclos de facturación
-- =============================================================================
-- Objetivo: que el mismo set de roles pueda crear PLANES de tratamiento y
-- generar/cobrar CICLOS de facturación:
--   admin, directora, coordinadora_terapias, coordinadora_familias,
--   recepcion, contable
--
-- Estado previo:
--   • Planes (RLS 0100/0133/0144): faltaba 'recepcion'.
--   • Ciclos (RPCs 0136/0139 + RLS de tabla 0101): faltaba 'coordinadora_familias'.
--
-- Para los ciclos, la autorización vivía hardcodeada dentro de RPCs grandes
-- (SECURITY DEFINER) y en las policies de la tabla. Centralizamos esa lista en
-- un helper `kn_can_manage_cycles()` para que cambios futuros toquen un solo
-- lugar y no haya que reescribir las funciones de facturación.
-- =============================================================================

-- ── Helper de autorización de ciclos ────────────────────────────────────────
create or replace function public.kn_can_manage_cycles()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in (
        'admin','directora','coordinadora_terapias',
        'coordinadora_familias','recepcion','contable'
      )
  );
$$;

-- ── treatment_plans / treatment_plan_changes: agregar 'recepcion' ────────────
-- (supersede a 0133 y 0144; set final de 6 roles)
DROP POLICY IF EXISTS "tp insert mgmt" ON public.treatment_plans;
CREATE POLICY "tp insert mgmt"
  ON public.treatment_plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin','directora','coordinadora_terapias','coordinadora_familias','recepcion','contable')
    )
  );

DROP POLICY IF EXISTS "tp update mgmt" ON public.treatment_plans;
CREATE POLICY "tp update mgmt"
  ON public.treatment_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin','directora','coordinadora_terapias','coordinadora_familias','recepcion','contable')
    )
  );

DROP POLICY IF EXISTS "tpc insert mgmt" ON public.treatment_plan_changes;
CREATE POLICY "tpc insert mgmt"
  ON public.treatment_plan_changes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin','directora','coordinadora_terapias','coordinadora_familias','recepcion','contable')
    )
  );

-- ── monthly_session_cycles: policies de tabla usan el helper ─────────────────
DROP POLICY IF EXISTS "msc insert mgmt" ON public.monthly_session_cycles;
CREATE POLICY "msc insert mgmt"
  ON public.monthly_session_cycles FOR INSERT
  WITH CHECK (public.kn_can_manage_cycles());

DROP POLICY IF EXISTS "msc update mgmt" ON public.monthly_session_cycles;
CREATE POLICY "msc update mgmt"
  ON public.monthly_session_cycles FOR UPDATE
  USING (public.kn_can_manage_cycles());

-- ── RPC: confirm_monthly_payment_and_generate (misma firma 12-args de 0139) ──
-- Reproducción verbatim de 0139; ÚNICO cambio: el bloque de autorización ahora
-- llama a kn_can_manage_cycles(). Misma firma ⇒ CREATE OR REPLACE reemplaza
-- (no crea sobrecarga).
create or replace function public.confirm_monthly_payment_and_generate(
  p_child_id        uuid,
  p_period_month    date,
  p_payment_amount  numeric,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now(),
  p_notes           text default null,
  p_appointments_override jsonb default null,
  p_due_date        date default null,
  p_rollover_sessions jsonb default null,        -- service → extra (modo accumulate)
  p_rollover_mode   text default 'none',          -- none | accumulate | discount
  p_rollover_discount numeric default 0           -- monto de descuento (modo discount)
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
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
  v_cand_therapist uuid;
  v_due         date;
  v_rollover_for_compute jsonb := null;
begin
  if not public.kn_can_manage_cycles() then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  if exists (
    select 1 from public.monthly_session_cycles
    where child_id = p_child_id
      and period_month = v_period
      and status <> 'cancelled'
  ) then
    raise exception 'cycle_already_exists_for_period';
  end if;

  v_due := coalesce(p_due_date, (v_period + 4));

  -- Solo el modo accumulate sube la cuota en compute.
  if p_rollover_mode = 'accumulate' then
    v_rollover_for_compute := p_rollover_sessions;
  end if;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean and coalesce(v_therapy->>'therapist_id','') <> '' then
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    end if;
  end loop;

  if p_appointments_override is not null and jsonb_typeof(p_appointments_override) = 'array' then
    v_appointments_to_create := p_appointments_override;

    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
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

    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';

    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
      if (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         or (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso then
        raise exception 'override_date_out_of_period';
      end if;
    end loop;
  else
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period, v_rollover_for_compute);
    v_summary := v_compute->'summary';
    if (v_summary->>'conflict_count')::int > 0 then
      raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
    end if;
    v_appointments_to_create := v_compute->'candidates';
  end if;

  select jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    into v_client_snap
    from public.children c
   where c.id = p_child_id;

  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  v_invoice_no := public._kn_next_invoice_number(v_period);
  insert into public.invoices (
    invoice_number, client_id, child_id, issue_date, due_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) values (
    v_invoice_no, null, p_child_id, current_date, v_due,
    'USD', 0, 0, 0, 0, 0, 0,
    'issued', null, null, null,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM'))
      || '. Fecha límite de pago: ' || to_char(v_due,'DD/MM/YYYY')
      || ' (pasada esa fecha se cobra 5% de recargo por cada 5 días de atraso).',
    v_client_snap, v_emitter, auth.uid()
  )
  returning id into v_invoice_id;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_line_total := round(
        (v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric,
        2
      );
      v_subtotal := v_subtotal + v_line_total;
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
      values (
        v_invoice_id, v_therapy->>'service',
        (v_therapy->>'sessions_per_month')::numeric, (v_therapy->>'unit_cost_usd')::numeric,
        v_line_total, 0
      );
    end if;
  end loop;

  update public.invoices
     set subtotal = v_subtotal, total = v_subtotal, total_a_pagar = v_subtotal
   where id = v_invoice_id;

  for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
  loop
    v_cand_therapist := coalesce(
      (v_candidate->>'therapist_id')::uuid,
      (v_therapist_map->>(v_candidate->>'service'))::uuid,
      v_plan.primary_therapist_id
    );
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      p_child_id, v_cand_therapist, 'terapia', v_candidate->>'service', 'presencial',
      (v_candidate->>'starts_at')::timestamptz, (v_candidate->>'ends_at')::timestamptz,
      'scheduled', auth.uid(), 'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  insert into public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, payment_status, due_date, notes,
    rollover_mode, rollover_sessions_json, rollover_discount_usd
  ) values (
    p_child_id, v_period, to_jsonb(v_plan),
    null, null, null, null, v_subtotal,
    v_invoice_id, now(), v_appt_count,
    'generated', 'pending', v_due, p_notes,
    coalesce(p_rollover_mode, 'none'),
    p_rollover_sessions,
    coalesce(p_rollover_discount, 0)
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- ── RPC: mark_monthly_cycle_paid (misma firma 4-args de 0136) ────────────────
-- Reproducción verbatim de 0136; ÚNICO cambio: autorización vía helper.
create or replace function public.mark_monthly_cycle_paid(
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

-- ── Fin de migración 0145 ────────────────────────────────────────────────────
