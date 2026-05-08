-- =============================================================================
-- 0097 — progress_reports (Fase 3-C1)
-- Informe de avances cuatrimestral. Uno por (niño, tipo de terapia, período).
-- Mismo flujo de aprobación que session_reports: terapista → directora → familia.
-- =============================================================================

-- ── 1. progress_reports table ────────────────────────────────────────────────

create table if not exists public.progress_reports (
  id                       uuid primary key default gen_random_uuid(),
  child_id                 uuid not null references public.children(id) on delete cascade,
  service_type             text not null,
    -- Espejado de appointments.service_type / plan_services.service_type:
    -- 'lenguaje' | 'motricidad_gruesa' | 'motricidad_fina' | 'sensorial' |
    -- 'psicologica' | 'ocupacional' | 'fisica' | 'lectoescritura' |
    -- 'funciones_ejecutivas' | 'conductual'
  period_starts            date not null,
  period_ends              date not null,
  authored_by_user_id      uuid references public.users(id) on delete set null,
  sessions_attended_count  int not null default 0,
  data_json                jsonb not null default '{}',
    -- Estructura del template hardcoded v0.7 (Fase 3-C1):
    -- {
    --   seguimiento: text,
    --   dificultades_ingreso: text,
    --   objetivos_terapeuticos: text,
    --   actividades_ejercicios: text,
    --   logros_obtenidos: text,
    --   orientaciones_casa: text,
    --   recomendaciones: text
    -- }
  status                   text not null default 'draft'
                             check (status in ('draft','submitted','approved','rejected','sent_to_family')),
  visible_to_family        boolean not null default true,
  submitted_at             timestamptz,
  approved_by_user_id      uuid references public.users(id) on delete set null,
  approved_at              timestamptz,
  rejected_by_user_id      uuid references public.users(id) on delete set null,
  rejected_at              timestamptz,
  rejection_reason         text,
  sent_to_family_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Solo un informe por niño + servicio + fecha de inicio de período.
  unique (child_id, service_type, period_starts)
);

create index if not exists progress_reports_status_submitted
  on public.progress_reports (status, submitted_at desc)
  where status = 'submitted';
create index if not exists progress_reports_child_period
  on public.progress_reports (child_id, period_ends desc);
create index if not exists progress_reports_author
  on public.progress_reports (authored_by_user_id);

-- updated_at trigger
drop trigger if exists progress_reports_updated_at on public.progress_reports;
create trigger progress_reports_updated_at
  before update on public.progress_reports
  for each row execute function extensions.moddatetime(updated_at);

-- ── 2. RPC: submit_progress_report ───────────────────────────────────────────

create or replace function public.submit_progress_report(
  p_report_id uuid
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Autoriza al autor o, durante impersonación, al admin real.
  if v_report.authored_by_user_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  -- Valida contenido mínimo: seguimiento + logros llenos.
  if length(trim(coalesce(v_report.data_json->>'seguimiento', ''))) = 0 then
    raise exception 'seguimiento_required';
  end if;
  if length(trim(coalesce(v_report.data_json->>'logros_obtenidos', ''))) = 0 then
    raise exception 'logros_required';
  end if;

  update public.progress_reports
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

-- ── 3. RPC: approve_progress_report ──────────────────────────────────────────

create or replace function public.approve_progress_report(
  p_report_id uuid
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.status in ('approved','sent_to_family') then
    return v_report;
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_approve';
  end if;

  if v_report.visible_to_family then
    update public.progress_reports
       set status = 'sent_to_family',
           approved_by_user_id = auth.uid(),
           approved_at = now(),
           sent_to_family_at = now()
     where id = p_report_id
     returning * into v_report;
  else
    update public.progress_reports
       set status = 'approved',
           approved_by_user_id = auth.uid(),
           approved_at = now()
     where id = p_report_id
     returning * into v_report;
  end if;

  return v_report;
end;
$$;

-- ── 4. RPC: reject_progress_report ───────────────────────────────────────────

create or replace function public.reject_progress_report(
  p_report_id uuid,
  p_reason    text
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'reason_too_short';
  end if;

  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_reject';
  end if;

  update public.progress_reports
     set status = 'rejected',
         rejected_by_user_id = auth.uid(),
         rejected_at = now(),
         rejection_reason = trim(p_reason)
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

alter table public.progress_reports enable row level security;

-- SELECT: staff completo, autor, o familia (solo aprobados+visibles)
drop policy if exists "pr select staff or own or family" on public.progress_reports;
create policy "pr select staff or own or family"
  on public.progress_reports for select
  using (
    public.is_agency_user()
    or authored_by_user_id = auth.uid()
    or (
      status = 'sent_to_family'
      and visible_to_family = true
      and public.is_family_of_child(child_id)
    )
  );

-- INSERT: staff agencia (la directora puede crear en nombre de otros, terapista crea las suyas)
drop policy if exists "pr insert staff" on public.progress_reports;
create policy "pr insert staff"
  on public.progress_reports for insert
  with check (
    public.is_agency_user()
    and (authored_by_user_id = auth.uid() or public.is_admin())
  );

-- UPDATE (autor): solo edita en draft/rejected.
drop policy if exists "pr update own draft" on public.progress_reports;
create policy "pr update own draft"
  on public.progress_reports for update
  using  (authored_by_user_id = auth.uid() and status in ('draft','rejected'))
  with check (authored_by_user_id = auth.uid() and status in ('draft','rejected','submitted'));

-- UPDATE (admin override)
drop policy if exists "pr update admin" on public.progress_reports;
create policy "pr update admin"
  on public.progress_reports for update
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE: solo admin
drop policy if exists "pr delete admin" on public.progress_reports;
create policy "pr delete admin"
  on public.progress_reports for delete
  using (public.is_admin());

-- ── 6. Grants ────────────────────────────────────────────────────────────────

grant all on public.progress_reports to anon, authenticated, service_role;

-- ── 7. Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'progress_reports'
    ) then
      execute 'alter publication supabase_realtime add table public.progress_reports';
    end if;
  end if;
end $$;
