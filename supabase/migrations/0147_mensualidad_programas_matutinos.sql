-- =============================================================================
-- 0147 — Mensualidad fija para programas matutinos (Blue Kids / Learning Kids /
--        Aula Educativa)
-- =============================================================================
-- Los programas matutinos se facturan como suscripción: monto fijo al mes por
-- asistir todos los días establecidos, venga el mes con 28 o 31 días.
--
-- Modalidad de una entrada de therapies_json (espejo de
-- src/lib/domain/billing/monthly-flat.ts):
--   • billing_mode explícito ('per_session' | 'monthly_flat') manda.
--   • Sin billing_mode: blue_kids/learning_kids/aula_educativa → monthly_flat
--     implícito (corrige planes existentes sin re-guardarlos); resto per_session.
--
-- Cambios (todas las firmas se conservan ⇒ CREATE OR REPLACE reemplaza,
-- no crea sobrecargas):
--   1) Helper _kn_is_monthly_flat(entry jsonb).
--   2) compute_monthly_appointment_candidates: los servicios monthly_flat NO
--      tienen cuota — se generan todas las fechas del patrón (feriados se
--      saltan igual); nada va a skipped_overquota y el rollover no les aplica.
--   3) confirm_monthly_payment_and_generate: línea de factura monthly_flat =
--      cantidad 1 × mensualidad (no sesiones × precio).
--   4) mark_appointment_absence: si el servicio de la cita es monthly_flat en
--      el plan activo, la inasistencia queda auto-resuelta como 'waived' (es
--      suscripción: no se repone ni entra a /aprobaciones ni al rollover). El
--      status no_show de la cita queda para métricas de asistencia.
-- =============================================================================

-- ── 1. Helper de modalidad ───────────────────────────────────────────────────
create or replace function public._kn_is_monthly_flat(p_entry jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_entry->>'billing_mode',
    case when p_entry->>'service' in ('blue_kids','learning_kids','aula_educativa')
         then 'monthly_flat' else 'per_session' end
  ) = 'monthly_flat';
$$;

-- ── 2. compute: sin cuota para monthly_flat ─────────────────────────────────
-- Reproducción verbatim de 0139; cambios marcados con [0147].
create or replace function public.compute_monthly_appointment_candidates(
  p_child_id          uuid,
  p_period_month      date,
  p_rollover_sessions jsonb default null   -- service → sesiones extra a acumular
) returns jsonb
language plpgsql security definer as $$
declare
  v_plan            public.treatment_plans;
  v_slot            jsonb;
  v_first           date := date_trunc('month', p_period_month)::date;
  v_last            date := (v_first + interval '1 month' - interval '1 day')::date;
  v_candidates      jsonb := '[]';
  v_holidays_skip   jsonb := '[]';
  v_overquota_skip  jsonb := '[]';
  v_conflicts       jsonb := '[]';
  v_per_service     jsonb := '{}';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
  v_service_key     text;
  v_service_arr     jsonb;
  v_quota_map       jsonb := '{}';
  v_therapist_map   jsonb := '{}';
  v_flat_map        jsonb := '{}';   -- [0147] service → true si es mensualidad
  v_therapy         jsonb;
  v_kept_arr        jsonb;
  v_quota           int;
  v_idx             int;
  v_cand_therapist  uuid;
begin
  if not public.is_agency_user() then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_quota_map := v_quota_map || jsonb_build_object(
        v_therapy->>'service',
        coalesce((v_therapy->>'sessions_per_month')::int, 0)
      );
      if coalesce(v_therapy->>'therapist_id','') <> '' then
        v_therapist_map := v_therapist_map || jsonb_build_object(
          v_therapy->>'service',
          v_therapy->>'therapist_id'
        );
      end if;
      -- [0147] Programas con mensualidad fija: sin cuota de citas.
      if public._kn_is_monthly_flat(v_therapy) then
        v_flat_map := v_flat_map || jsonb_build_object(v_therapy->>'service', true);
      end if;
    end if;
  end loop;

  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    v_service_key := v_slot->>'service';
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30),
          coalesce(v_slot->>'frequency', 'weekly')
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_service_key,
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30),
        'therapist_id', coalesce(
          v_therapist_map->>v_service_key,
          v_plan.primary_therapist_id::text
        )
      );

      select count(*) into v_holiday_count
        from public.institutional_calendar ic
       where ic.date = v_slot_dates.starts_at::date
         and ic.type in ('holiday','closure','gov_decree','kinetic_break');

      if v_holiday_count > 0 then
        v_holidays_skip := v_holidays_skip || jsonb_build_array(v_cand_obj);
        continue;
      end if;

      v_service_arr := coalesce(v_per_service->v_service_key, '[]'::jsonb);
      v_per_service := v_per_service || jsonb_build_object(
        v_service_key,
        v_service_arr || jsonb_build_array(v_cand_obj)
      );
    end loop;
  end loop;

  for v_service_key in select jsonb_object_keys(v_per_service)
  loop
    v_service_arr := v_per_service->v_service_key;

    select coalesce(jsonb_agg(elem order by (elem->>'starts_at')::timestamptz), '[]'::jsonb)
      into v_service_arr
      from jsonb_array_elements(v_service_arr) as elem;

    -- [0147] Mensualidad fija: todas las fechas del patrón, sin cuota.
    if coalesce((v_flat_map->>v_service_key)::boolean, false) then
      v_candidates := v_candidates || v_service_arr;
      continue;
    end if;

    -- Cuota = plan + rollover acumulado (si aplica) para este servicio.
    v_quota := coalesce((v_quota_map->>v_service_key)::int, 0)
             + coalesce((p_rollover_sessions->>v_service_key)::int, 0);

    if v_quota <= 0 then
      v_overquota_skip := v_overquota_skip || v_service_arr;
      continue;
    end if;

    if jsonb_array_length(v_service_arr) <= v_quota then
      v_candidates := v_candidates || v_service_arr;
    else
      v_kept_arr := '[]'::jsonb;
      v_idx := 0;
      for v_cand_obj in select * from jsonb_array_elements(v_service_arr)
      loop
        if v_idx < v_quota then
          v_kept_arr := v_kept_arr || jsonb_build_array(v_cand_obj);
        else
          v_overquota_skip := v_overquota_skip || jsonb_build_array(v_cand_obj);
        end if;
        v_idx := v_idx + 1;
      end loop;
      v_candidates := v_candidates || v_kept_arr;
    end if;
  end loop;

  for v_cand_obj in select * from jsonb_array_elements(v_candidates)
  loop
    v_cand_therapist := (v_cand_obj->>'therapist_id')::uuid;
    for v_conflict in
      select a.id, a.starts_at, a.child_id
        from public.appointments a
       where a.therapist_id = v_cand_therapist
         and a.status not in ('rescheduled','no_show','late_cancel')
         and a.starts_at < (v_cand_obj->>'ends_at')::timestamptz
         and a.ends_at   > (v_cand_obj->>'starts_at')::timestamptz
    loop
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'candidate', v_cand_obj,
        'conflicting_appointment_id', v_conflict.id,
        'conflict_starts_at', v_conflict.starts_at,
        'conflict_child_id', v_conflict.child_id
      ));
    end loop;
  end loop;

  return jsonb_build_object(
    'candidates', v_candidates,
    'skipped_holidays', v_holidays_skip,
    'skipped_overquota', v_overquota_skip,
    'conflicts', v_conflicts,
    'summary', jsonb_build_object(
      'candidate_count', jsonb_array_length(v_candidates),
      'conflict_count', jsonb_array_length(v_conflicts),
      'skipped_holiday_count', jsonb_array_length(v_holidays_skip),
      'skipped_overquota_count', jsonb_array_length(v_overquota_skip)
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'primary_therapist_id', v_plan.primary_therapist_id,
      'monthly_total_usd', v_plan.monthly_total_usd
    )
  );
end;
$$;

-- ── 3. confirm: línea 1 × mensualidad para monthly_flat ─────────────────────
-- Reproducción verbatim de 0145 (que ya usa kn_can_manage_cycles); cambios
-- marcados con [0147].
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
      -- [0147] Mensualidad fija: 1 × precio (sin importar nº de citas del mes).
      if public._kn_is_monthly_flat(v_therapy) then
        v_line_total := round((v_therapy->>'unit_cost_usd')::numeric, 2);
        v_subtotal := v_subtotal + v_line_total;
        insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        values (
          v_invoice_id, 'mensualidad ' || (v_therapy->>'service'),
          1, (v_therapy->>'unit_cost_usd')::numeric,
          v_line_total, 0
        );
      else
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

-- ── 4. mark_appointment_absence: auto-waive para mensualidades ───────────────
-- Reproducción verbatim de 0100; cambios marcados con [0147].
create or replace function public.mark_appointment_absence(
  p_appointment_id uuid,
  p_reason         text default null
) returns public.appointment_absences language plpgsql security definer as $$
declare
  v_appt    public.appointments;
  v_absence public.appointment_absences;
  v_is_flat boolean := false;   -- [0147]
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
   for update;

  if not found then
    raise exception 'appointment_not_found';
  end if;

  -- Autoriza al terapista del appt o admin (impersonación)
  if v_appt.therapist_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_appt.status not in ('scheduled','in_progress') then
    raise exception 'invalid_state_for_absence';
  end if;

  update public.appointments
     set status = 'no_show'
   where id = p_appointment_id;

  -- [0147] Programa matutino (mensualidad): la falta NO genera pendiente de
  -- reposición. Queda auto-resuelta como 'waived' (auditada) y la cita queda
  -- en no_show para métricas de asistencia.
  select exists (
    select 1
      from public.treatment_plans tp
      cross join lateral jsonb_array_elements(coalesce(tp.therapies_json,'[]'::jsonb)) t
     where tp.child_id = v_appt.child_id
       and tp.active
       and t->>'service' = v_appt.service_type
       and public._kn_is_monthly_flat(t)
  ) into v_is_flat;

  if v_is_flat then
    insert into public.appointment_absences (
      appointment_id, child_id, therapist_id, reported_by_user_id, reason,
      status, resolved_at, resolved_by_user_id, waive_reason
    ) values (
      p_appointment_id,
      v_appt.child_id,
      v_appt.therapist_id,
      auth.uid(),
      nullif(trim(coalesce(p_reason,'')),''),
      'waived', now(), auth.uid(),
      'Programa matutino (mensualidad) — no aplica reposición'
    )
    on conflict (appointment_id) do update set
      status = 'waived',
      reported_at = now(),
      reported_by_user_id = auth.uid(),
      reason = excluded.reason,
      resolved_at = now(),
      resolved_by_user_id = auth.uid(),
      replacement_appointment_id = null,
      waive_reason = 'Programa matutino (mensualidad) — no aplica reposición'
    returning * into v_absence;

    return v_absence;
  end if;

  insert into public.appointment_absences (
    appointment_id, child_id, therapist_id, reported_by_user_id, reason
  ) values (
    p_appointment_id,
    v_appt.child_id,
    v_appt.therapist_id,
    auth.uid(),
    nullif(trim(coalesce(p_reason,'')),'')
  )
  on conflict (appointment_id) do update set
    status = 'pending',
    reported_at = now(),
    reported_by_user_id = auth.uid(),
    reason = excluded.reason,
    resolved_at = null,
    resolved_by_user_id = null,
    replacement_appointment_id = null,
    waive_reason = null
  returning * into v_absence;

  return v_absence;
end;
$$;

-- ── Fin de migración 0147 ────────────────────────────────────────────────────
