-- =============================================================================
-- 0094 — session_reports (Fase 3-B)
-- Reporte por sesión con flujo de aprobación: terapista → directora → familia.
-- =============================================================================

-- ── 1. Helper: is_directora_or_admin ─────────────────────────────────────────

create or replace function public.is_directora_or_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('directora','admin')
  );
$$;

-- ── 2. session_reports table ─────────────────────────────────────────────────

create table if not exists public.session_reports (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null unique references public.therapy_sessions(id) on delete cascade,
  appointment_id           uuid not null references public.appointments(id) on delete cascade,
  child_id                 uuid not null references public.children(id) on delete cascade,
  therapist_id             uuid references public.users(id) on delete set null,
  actividades              text not null default '',
  respuesta_del_nino       text not null default '',
  tarea_para_casa          text not null default '',
  observaciones_internas   text not null default '',
  visible_to_family        boolean not null default true,
  status                   text not null default 'draft'
                             check (status in ('draft','submitted','approved','rejected','sent_to_family')),
  submitted_at             timestamptz,
  approved_by_user_id      uuid references public.users(id) on delete set null,
  approved_at              timestamptz,
  rejected_by_user_id      uuid references public.users(id) on delete set null,
  rejected_at              timestamptz,
  rejection_reason         text,
  sent_to_family_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists session_reports_status_submitted
  on public.session_reports (status, submitted_at desc)
  where status = 'submitted';
create index if not exists session_reports_child_sent
  on public.session_reports (child_id, sent_to_family_at desc)
  where status = 'sent_to_family';
create index if not exists session_reports_therapist
  on public.session_reports (therapist_id);

-- updated_at trigger (moddatetime ya está habilitada en 0093)
drop trigger if exists session_reports_updated_at on public.session_reports;
create trigger session_reports_updated_at
  before update on public.session_reports
  for each row execute function extensions.moddatetime(updated_at);

-- ── 3. RPC: submit_session_report ────────────────────────────────────────────
-- Terapista marca el borrador como listo para revisión.

create or replace function public.submit_session_report(
  p_report_id uuid
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.therapist_id is distinct from auth.uid() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  -- Validación mínima: al menos actividades llenas.
  if length(trim(v_report.actividades)) = 0 then
    raise exception 'actividades_required';
  end if;

  update public.session_reports
     set status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;

-- ── 4. RPC: approve_session_report ───────────────────────────────────────────
-- Directora/admin aprueba. Si visible_to_family, además marca sent_to_family.

create or replace function public.approve_session_report(
  p_report_id uuid
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Idempotente: si ya está aprobado, devuelve estado actual.
  if v_report.status in ('approved','sent_to_family') then
    return v_report;
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_approve';
  end if;

  if v_report.visible_to_family then
    update public.session_reports
       set status = 'sent_to_family',
           approved_by_user_id = auth.uid(),
           approved_at = now(),
           sent_to_family_at = now()
     where id = p_report_id
     returning * into v_report;
  else
    update public.session_reports
       set status = 'approved',
           approved_by_user_id = auth.uid(),
           approved_at = now()
     where id = p_report_id
     returning * into v_report;
  end if;

  return v_report;
end;
$$;

-- ── 5. RPC: reject_session_report ────────────────────────────────────────────
-- Directora/admin rechaza con motivo.

create or replace function public.reject_session_report(
  p_report_id uuid,
  p_reason    text
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'reason_too_short';
  end if;

  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_reject';
  end if;

  update public.session_reports
     set status = 'rejected',
         rejected_by_user_id = auth.uid(),
         rejected_at = now(),
         rejection_reason = trim(p_reason)
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;

-- ── 6. RLS: session_reports ──────────────────────────────────────────────────

alter table public.session_reports enable row level security;

-- SELECT: staff completo, terapista autor, o familia (solo aprobados+visibles)
drop policy if exists "sr select staff or own or family" on public.session_reports;
create policy "sr select staff or own or family"
  on public.session_reports for select
  using (
    public.is_agency_user()
    or therapist_id = auth.uid()
    or (
      status = 'sent_to_family'
      and visible_to_family = true
      and public.is_family_of_child(child_id)
    )
  );

-- INSERT: el terapista de la sesión, o admin
drop policy if exists "sr insert own or admin" on public.session_reports;
create policy "sr insert own or admin"
  on public.session_reports for insert
  with check (therapist_id = auth.uid() or public.is_admin());

-- UPDATE (terapista): solo edición de contenido en estados draft/rejected.
-- Las transiciones de aprobación/rechazo van por RPC, no por UPDATE directo.
drop policy if exists "sr update own draft" on public.session_reports;
create policy "sr update own draft"
  on public.session_reports for update
  using  (therapist_id = auth.uid() and status in ('draft','rejected'))
  with check (therapist_id = auth.uid() and status in ('draft','rejected','submitted'));
  -- with check permite la transición a submitted que hace el RPC.

-- UPDATE (admin override total)
drop policy if exists "sr update admin" on public.session_reports;
create policy "sr update admin"
  on public.session_reports for update
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE: solo admin
drop policy if exists "sr delete admin" on public.session_reports;
create policy "sr delete admin"
  on public.session_reports for delete
  using (public.is_admin());

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

grant all on public.session_reports to anon, authenticated, service_role;

-- ── 8. Realtime ───────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'session_reports'
    ) then
      execute 'alter publication supabase_realtime add table public.session_reports';
    end if;
  end if;
end $$;
