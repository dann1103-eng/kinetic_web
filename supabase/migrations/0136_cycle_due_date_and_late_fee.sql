-- =============================================================================
-- 0136 — Ciclo con vencimiento (periodo de gracia) + recargo por mora
-- =============================================================================
-- Cambia el ciclo de "pago primero" a "factura emitida pendiente → marcar pagado":
--   • Al generar el ciclo se emite la factura como PENDIENTE (status 'issued')
--     con fecha de vencimiento = periodo de gracia (default día 5 del mes).
--   • Las citas se generan igual (operación no depende del pago).
--   • Luego se marca pagado; si se paga después de la gracia, se aplica 5%
--     simple sobre el total por cada bloque de 5 días de atraso.
--   • La gracia es prorrogable (grace_extended_to + razón).
--
-- paid_at pasa a ser NULLABLE = fecha de pago REAL (null = pendiente). Los
-- reportes financieros agrupan por paid_at, así que los pendientes quedan
-- excluidos de ingresos hasta que se paguen (correcto).
-- =============================================================================

-- ── 1. Columnas nuevas en monthly_session_cycles ──
ALTER TABLE public.monthly_session_cycles
  ALTER COLUMN paid_at DROP NOT NULL;

ALTER TABLE public.monthly_session_cycles
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('pending', 'paid')),
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS grace_extended_to date,
  ADD COLUMN IF NOT EXISTS grace_extension_reason text,
  ADD COLUMN IF NOT EXISTS surcharge_amount_usd numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.monthly_session_cycles.payment_status IS
  'pending = factura emitida sin pagar; paid = pagada. Default paid para filas históricas.';
COMMENT ON COLUMN public.monthly_session_cycles.due_date IS
  'Fecha límite de pago (periodo de gracia). Default día 5 del mes.';
COMMENT ON COLUMN public.monthly_session_cycles.grace_extended_to IS
  'Prórroga manual del vencimiento. Si está seteada, el recargo se mide contra esta fecha.';

-- ── 2. confirm_monthly_payment_and_generate → genera PENDIENTE con vencimiento
--    (reemplaza la versión de 0134; conserva la asignación de terapista por
--     servicio y agrega p_due_date).
create or replace function public.confirm_monthly_payment_and_generate(
  p_child_id        uuid,
  p_period_month    date,
  p_payment_amount  numeric,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now(),
  p_notes           text default null,
  p_appointments_override jsonb default null,
  p_due_date        date default null            -- nuevo: fecha de gracia
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
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
  ) then
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

  -- Vencimiento: param o día 5 del mes por defecto.
  v_due := coalesce(p_due_date, (v_period + 4));

  -- Map service → therapist desde therapies_json (solo activas con terapista).
  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean and coalesce(v_therapy->>'therapist_id','') <> '' then
      v_therapist_map := v_therapist_map || jsonb_build_object(
        v_therapy->>'service', v_therapy->>'therapist_id'
      );
    end if;
  end loop;

  -- Decidir qué appointments crear
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
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period);
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

  -- Factura PENDIENTE (issued) con vencimiento = gracia.
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
        v_invoice_id,
        v_therapy->>'service',
        (v_therapy->>'sessions_per_month')::numeric,
        (v_therapy->>'unit_cost_usd')::numeric,
        v_line_total,
        0
      );
    end if;
  end loop;

  update public.invoices
     set subtotal = v_subtotal,
         total = v_subtotal,
         total_a_pagar = v_subtotal
   where id = v_invoice_id;

  -- Citas con terapista por servicio.
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

  -- Ciclo PENDIENTE de pago. payment_amount_usd = total esperado.
  insert into public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, payment_status, due_date, notes
  ) values (
    p_child_id, v_period, to_jsonb(v_plan),
    null, null, null, null, v_subtotal,
    v_invoice_id, now(), v_appt_count,
    'generated', 'pending', v_due, p_notes
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- ── 3. mark_monthly_cycle_paid → marca pagado + aplica recargo por mora ──
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
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
  ) then
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

-- ── Fin de migración 0136 ───────────────────────────────────────────────────
