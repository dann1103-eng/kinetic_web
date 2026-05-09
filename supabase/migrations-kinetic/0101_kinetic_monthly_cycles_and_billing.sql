-- =============================================================================
-- 0101 — Monthly session cycles + billing acoplado a niños (Ronda 2)
-- =============================================================================
-- Captura el flujo mensual de Kinetic:
--   1. Recepción/admin marca "pago recibido del mes X" para un niño.
--   2. El sistema:
--      a) Toma snapshot del treatment_plan (terapias + horario + costo).
--      b) Crea invoice + invoice_items con line items por terapia.
--      c) Genera appointments del mes según el schedule_pattern_json,
--         saltando holidays/closures de institutional_calendar.
--      d) Bloquea TODA la operación si hay conflicto de horario con
--         appointments existentes del mismo terapista.
--
-- Decisiones cerradas con el usuario (ver plan):
--   - Terapista: siempre el primary_therapist_id del plan.
--   - Conflictos: bloquear y reportar (no genera nada del mes).
--   - Cuota vs patrón: validar al guardar el plan, generar por patrón.
--   - Invoice: ligada al niño (invoices.child_id), no a la familia.
-- =============================================================================


-- ── 1. Extender invoices: agregar child_id ──────────────────────────────────
-- Las invoices del mundo FM siguen usando client_id (FK a clients).
-- Las invoices Kinetic usan child_id (FK a children). Exactamente uno
-- de los dos debe estar definido.

alter table public.invoices
  add column if not exists child_id uuid references public.children(id) on delete restrict;

create index if not exists invoices_child_id_idx on public.invoices(child_id) where child_id is not null;

-- Hacer client_id nullable (las nuevas Kinetic no lo van a usar).
alter table public.invoices
  alter column client_id drop not null;

-- CHECK: exactamente uno de (client_id, child_id) — no ambos, no ninguno.
alter table public.invoices
  drop constraint if exists invoices_client_or_child_check;
alter table public.invoices
  add constraint invoices_client_or_child_check check (
    (client_id is not null and child_id is null)
    or (client_id is null and child_id is not null)
  );

-- RLS adicional para invoices Kinetic: staff agencia ve y crea invoices con
-- child_id. (Las policies FM existentes se mantienen para client_id.)
drop policy if exists "invoices_insert_kinetic_mgmt" on public.invoices;
create policy "invoices_insert_kinetic_mgmt"
  on public.invoices for insert
  with check (
    child_id is not null
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

drop policy if exists "invoices_update_kinetic_mgmt" on public.invoices;
create policy "invoices_update_kinetic_mgmt"
  on public.invoices for update
  using (
    child_id is not null
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

-- invoice_items mismo deal: si el invoice padre es Kinetic, el staff puede.
drop policy if exists "invoice_items_insert_kinetic" on public.invoice_items;
create policy "invoice_items_insert_kinetic"
  on public.invoice_items for insert
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.child_id is not null
    )
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );


-- ── 2. monthly_session_cycles ───────────────────────────────────────────────

create table if not exists public.monthly_session_cycles (
  id                          uuid primary key default gen_random_uuid(),
  child_id                    uuid not null references public.children(id) on delete cascade,
  -- Año y mes del ciclo (1ro de mes en zona SV — guardamos la fecha del 1ro).
  period_month                date not null,  -- siempre día 1: '2026-04-01'
  -- Snapshot del treatment_plan al momento de pago (congelado).
  treatment_plan_snapshot     jsonb not null,
  -- Datos del pago
  paid_at                     timestamptz not null default now(),
  paid_by_user_id             uuid references public.users(id) on delete set null,
  payment_method              text,                          -- 'cash'|'transfer'|'card'|'other'
  payment_reference           text,
  payment_amount_usd          numeric(12,2) not null,
  -- Invoice generada (FK)
  invoice_id                  uuid references public.invoices(id) on delete set null,
  -- Resultado de generación de citas
  appointments_generated_at   timestamptz,
  appointments_generated_count int not null default 0,
  -- Workflow
  status                      text not null default 'paid_pending_generation'
                                check (status in (
                                  'paid_pending_generation', -- pago registrado, falta generar
                                  'generated',               -- citas creadas
                                  'cancelled'                -- anulado (ej. error)
                                )),
  cancel_reason               text,
  cancelled_at                timestamptz,
  cancelled_by_user_id        uuid references public.users(id) on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (child_id, period_month)
);

create index if not exists monthly_session_cycles_child
  on public.monthly_session_cycles(child_id, period_month desc);
create index if not exists monthly_session_cycles_status
  on public.monthly_session_cycles(status, paid_at desc);

drop trigger if exists monthly_session_cycles_updated_at on public.monthly_session_cycles;
create trigger monthly_session_cycles_updated_at
  before update on public.monthly_session_cycles
  for each row execute function extensions.moddatetime(updated_at);

alter table public.monthly_session_cycles enable row level security;

create policy "msc select staff" on public.monthly_session_cycles for select
  using (public.is_agency_user());

create policy "msc insert mgmt" on public.monthly_session_cycles for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

create policy "msc update mgmt" on public.monthly_session_cycles for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

create policy "msc delete admin" on public.monthly_session_cycles for delete
  using (public.is_admin());

grant all on public.monthly_session_cycles to anon, authenticated, service_role;


-- ── 3. Helper: expand un slot a fechas concretas del mes ────────────────────

create or replace function public._kn_dow_to_int(p_dow text) returns int language sql immutable as $$
  select case p_dow
    when 'sun' then 0
    when 'mon' then 1
    when 'tue' then 2
    when 'wed' then 3
    when 'thu' then 4
    when 'fri' then 5
    when 'sat' then 6
  end;
$$;

create or replace function public._kn_slot_dates_in_month(
  p_period_month date,        -- 1ro del mes
  p_day_of_week  text,        -- 'mon'..'sun'
  p_time_local   text,        -- 'HH:MM'
  p_duration_min int
) returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql immutable as $$
declare
  v_dow_int int := public._kn_dow_to_int(p_day_of_week);
  v_first   date := date_trunc('month', p_period_month)::date;
  v_last    date := (v_first + interval '1 month' - interval '1 day')::date;
  v_d       date;
begin
  if v_dow_int is null then return; end if;
  for v_d in select generate_series(v_first, v_last, interval '1 day')::date loop
    if extract(dow from v_d)::int = v_dow_int then
      starts_at := (v_d::text || ' ' || p_time_local)::timestamp at time zone 'America/El_Salvador';
      ends_at   := starts_at + (p_duration_min || ' minutes')::interval;
      return next;
    end if;
  end loop;
end;
$$;


-- ── 4. RPC: compute_monthly_appointment_candidates ──────────────────────────
-- Read-only: devuelve qué citas se generarían y qué conflictos hay.
-- Estructura del JSONB:
--   {
--     "candidates": [
--       { "service": "lenguaje", "starts_at": "...", "ends_at": "...",
--         "duration_minutes": 45, "skipped_reason": null }
--     ],
--     "skipped_holidays": [ { ... slot info, "date": "..." } ],
--     "conflicts": [
--       { "candidate": {...}, "conflicting_appointment_id": "...",
--         "conflict_starts_at": "...", "conflict_child_id": "..." }
--     ],
--     "summary": {
--       "candidate_count": int,
--       "conflict_count": int,
--       "skipped_holiday_count": int
--     }
--   }

create or replace function public.compute_monthly_appointment_candidates(
  p_child_id     uuid,
  p_period_month date    -- 1ro del mes en SV
) returns jsonb
language plpgsql security definer as $$
declare
  v_plan            public.treatment_plans;
  v_slot            jsonb;
  v_first           date := date_trunc('month', p_period_month)::date;
  v_last            date := (v_first + interval '1 month' - interval '1 day')::date;
  v_candidates      jsonb := '[]';
  v_holidays_skip   jsonb := '[]';
  v_conflicts       jsonb := '[]';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
begin
  if not public.is_agency_user() then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active;

  if not found then
    raise exception 'no_active_treatment_plan';
  end if;

  if v_plan.primary_therapist_id is null then
    raise exception 'plan_has_no_primary_therapist';
  end if;

  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30)
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_slot->>'service',
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30)
      );

      -- ¿Cae en holiday/closure?
      select count(*) into v_holiday_count
        from public.institutional_calendar ic
       where ic.date = v_slot_dates.starts_at::date
         and ic.type in ('holiday','closure','gov_decree','kinetic_break');

      if v_holiday_count > 0 then
        v_holidays_skip := v_holidays_skip || jsonb_build_array(v_cand_obj);
        continue;
      end if;

      -- ¿Choca con un appointment existente del terapista (cualquier estado activo)?
      for v_conflict in
        select a.id, a.starts_at, a.child_id
          from public.appointments a
         where a.therapist_id = v_plan.primary_therapist_id
           and a.status not in ('rescheduled','no_show','late_cancel')
           and a.starts_at < v_slot_dates.ends_at
           and a.ends_at   > v_slot_dates.starts_at
      loop
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'candidate', v_cand_obj,
          'conflicting_appointment_id', v_conflict.id,
          'conflict_starts_at', v_conflict.starts_at,
          'conflict_child_id', v_conflict.child_id
        ));
      end loop;

      v_candidates := v_candidates || jsonb_build_array(v_cand_obj);
    end loop;
  end loop;

  return jsonb_build_object(
    'candidates', v_candidates,
    'skipped_holidays', v_holidays_skip,
    'conflicts', v_conflicts,
    'summary', jsonb_build_object(
      'candidate_count', jsonb_array_length(v_candidates),
      'conflict_count', jsonb_array_length(v_conflicts),
      'skipped_holiday_count', jsonb_array_length(v_holidays_skip)
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'primary_therapist_id', v_plan.primary_therapist_id,
      'monthly_total_usd', v_plan.monthly_total_usd
    )
  );
end;
$$;


-- ── 5. Helper: número correlativo de invoice ────────────────────────────────
-- Las invoices FM ya tienen su propio formato. Para Kinetic uso el prefix
-- 'KIN-YYYYMM-XXXX' contando solo invoices Kinetic del mes.

create or replace function public._kn_next_invoice_number(p_period_month date) returns text
language plpgsql security definer as $$
declare
  v_count int;
  v_yyyymm text := to_char(p_period_month, 'YYYYMM');
begin
  select count(*) into v_count
    from public.invoices
   where child_id is not null
     and to_char(issue_date, 'YYYYMM') = v_yyyymm;
  return 'KIN-' || v_yyyymm || '-' || lpad((v_count + 1)::text, 4, '0');
end;
$$;


-- ── 6. RPC: confirm_monthly_payment_and_generate ────────────────────────────
-- Atómico. Re-evalúa conflictos dentro de la transacción (anti TOCTOU).
-- Crea invoice + invoice_items + appointments + cycle. Si hay conflictos,
-- raise y nada se commitea.

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
  -- Authz
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
  ) then
    raise exception 'not_authorized';
  end if;

  -- Lock plan
  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  -- Idempotencia: si ya existe cycle para (child, period_month) en estado generated, error.
  if exists (
    select 1 from public.monthly_session_cycles
    where child_id = p_child_id
      and period_month = v_period
      and status <> 'cancelled'
  ) then
    raise exception 'cycle_already_exists_for_period';
  end if;

  -- Re-evaluar candidatos+conflictos (anti TOCTOU). Si conflictos > 0, abortar.
  v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period);
  v_summary := v_compute->'summary';

  if (v_summary->>'conflict_count')::int > 0 then
    raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
  end if;

  -- Snapshot mínimo para invoice client_snapshot_json (la tabla lo exige NOT NULL).
  -- Para Kinetic guardamos los datos del NIÑO (substituye al cliente FM).
  select jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    into v_client_snap
    from public.children c
   where c.id = p_child_id;

  -- Emitter snapshot — placeholder. Cuando company_settings tenga datos
  -- BEGINNINGS reales se reemplaza acá.
  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  -- Crear invoice
  v_invoice_no := public._kn_next_invoice_number(v_period);
  insert into public.invoices (
    invoice_number, client_id, child_id, issue_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) values (
    v_invoice_no, null, p_child_id, current_date,
    'USD', 0, 0, 0, 0, 0,
    'paid', p_paid_at::date, p_payment_method, p_payment_reference,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM')),
    v_client_snap, v_emitter, auth.uid()
  )
  returning id into v_invoice_id;

  -- Insertar items del invoice (1 por terapia activa, snapshot del plan)
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
         total = v_subtotal
   where id = v_invoice_id;

  -- Crear appointments para cada candidato
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

  -- Crear cycle row
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


-- ── 7. RPC: cancel_monthly_cycle ────────────────────────────────────────────
-- Anula el cycle: marca cancelled, void la invoice, cancela los appointments
-- 'scheduled' que se generaron (no toca los ya iniciados/completed).

create or replace function public.cancel_monthly_cycle(
  p_cycle_id uuid,
  p_reason   text
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle public.monthly_session_cycles;
  v_first_day date;
  v_last_day  date;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora')
  ) then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'reason_too_short';
  end if;

  select * into v_cycle
    from public.monthly_session_cycles
   where id = p_cycle_id
   for update;

  if not found then raise exception 'cycle_not_found'; end if;
  if v_cycle.status = 'cancelled' then return v_cycle; end if;

  v_first_day := v_cycle.period_month;
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  -- Void la invoice asociada
  if v_cycle.invoice_id is not null then
    update public.invoices
       set status = 'void',
           void_reason = trim(p_reason),
           void_by = auth.uid(),
           void_at = now()
     where id = v_cycle.invoice_id;
  end if;

  -- Cancelar appointments scheduled del periodo (los ya iniciados/completed se respetan)
  update public.appointments
     set status = 'rescheduled',
         notes = coalesce(notes,'') || E'\nCiclo cancelado: ' || trim(p_reason)
   where child_id = v_cycle.child_id
     and starts_at >= v_first_day
     and starts_at <  (v_last_day + interval '1 day')
     and status = 'scheduled'
     and (notes like '%Auto-generado del ciclo%' or notes is null);

  update public.monthly_session_cycles
     set status = 'cancelled',
         cancel_reason = trim(p_reason),
         cancelled_at = now(),
         cancelled_by_user_id = auth.uid()
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;


-- ── 8. Realtime ─────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'monthly_session_cycles'
    ) then
      execute 'alter publication supabase_realtime add table public.monthly_session_cycles';
    end if;
  end if;
end $$;


-- ── Fin de migración 0101_kinetic_monthly_cycles_and_billing ──────────────
