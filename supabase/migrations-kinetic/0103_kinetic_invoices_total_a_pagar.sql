-- =============================================================================
-- 0103 — Hotfix: invoices.total_a_pagar NOT NULL en confirm_monthly_payment_and_generate
-- =============================================================================
-- Bug: el RPC de Ronda 2 (mig 0101) insertaba en invoices sin setear
-- `total_a_pagar`, que es NOT NULL desde la migración FM 0062 (renta retenida).
-- Postgres rechazaba la transacción al confirmar pago.
--
-- Fix: re-emitir la RPC seteando `total_a_pagar = 0` en el INSERT inicial y
-- `total_a_pagar = v_subtotal` en el UPDATE final junto con `subtotal`/`total`.
--
-- Para invoices Kinetic NO aplica retención (MVP); cuando exista soporte de
-- agente de retención por niño/familia se calculará v_subtotal - retencion.
-- =============================================================================

create or replace function public.confirm_monthly_payment_and_generate(
  p_child_id        uuid,
  p_period_month    date,
  p_payment_amount  numeric,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now(),
  p_notes           text default null
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_invoice_id  uuid;
  v_invoice_no  text;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_line_total  numeric(12,2);
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_emitter     jsonb;
  v_client_snap jsonb;
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

  v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period);
  v_summary := v_compute->'summary';

  if (v_summary->>'conflict_count')::int > 0 then
    raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
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
    invoice_number, client_id, child_id, issue_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) values (
    v_invoice_no, null, p_child_id, current_date,
    'USD', 0, 0, 0, 0, 0, 0,
    'paid', p_paid_at::date, p_payment_method, p_payment_reference,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM')),
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

  -- MVP Kinetic: sin renta retenida → total_a_pagar = total = subtotal.
  update public.invoices
     set subtotal = v_subtotal,
         total = v_subtotal,
         total_a_pagar = v_subtotal
   where id = v_invoice_id;

  for v_candidate in select * from jsonb_array_elements(v_compute->'candidates')
  loop
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      p_child_id,
      v_plan.primary_therapist_id,
      'terapia',
      v_candidate->>'service',
      'presencial',
      (v_candidate->>'starts_at')::timestamptz,
      (v_candidate->>'ends_at')::timestamptz,
      'scheduled',
      auth.uid(),
      'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  insert into public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, notes
  ) values (
    p_child_id, v_period, to_jsonb(v_plan),
    p_paid_at, auth.uid(), p_payment_method, p_payment_reference, p_payment_amount,
    v_invoice_id, now(), v_appt_count,
    'generated', p_notes
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- ── Fin de migración 0103_kinetic_invoices_total_a_pagar ───────────────────
