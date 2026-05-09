-- =============================================================================
-- 0098 — report_templates (Fase 3-C2)
-- Plantillas DB-driven para informes de avances. Reemplaza la plantilla
-- hardcoded de C1 (src/lib/domain/progress-report-template.ts).
--
-- Decisiones (ver docs/superpowers/specs/2026-05-08-c2-plantillas-design.md):
--   - Versionado in-place: ediciones sobrescriben (la columna `version` queda
--     por si después se quiere usar, pero no se bumpea automáticamente).
--   - Block kinds soportados desde el día 1: rich_text + numbered_list.
--   - service_type opcional (NULL = aplica a cualquier terapia).
--   - CRUD restringido a admin/directora; SELECT abierto a todo el staff.
--   - Validación de submit pasa de hardcoded ('seguimiento'+'logros_obtenidos')
--     a leer `blocks_json` y exigir cada `required=true`.
-- =============================================================================


-- ── 1. report_templates table ────────────────────────────────────────────────

create table if not exists public.report_templates (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  kind                  text not null
                          check (kind in ('progress','session','evaluation','morning_program_quarterly')),
  service_type          text,                            -- NULL = aplica a cualquier terapia
  blocks_json           jsonb not null,                  -- ver schema en src/types/db.ts (ReportTemplateBlock)
  default_signers_role  text,
  active                boolean not null default true,
  version               int not null default 1,          -- placeholder; no se auto-bumpea
  created_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists report_templates_kind_service
  on public.report_templates(kind, service_type) where active;
create index if not exists report_templates_active
  on public.report_templates(active);

-- updated_at trigger (moddatetime ya está habilitada en 0093)
drop trigger if exists report_templates_updated_at on public.report_templates;
create trigger report_templates_updated_at
  before update on public.report_templates
  for each row execute function extensions.moddatetime(updated_at);


-- ── 2. progress_reports.template_id ─────────────────────────────────────────
-- FK al template usado. Nullable de entrada (reportes legacy pre-C2).
-- El UPDATE bulk del Stage 6 los apunta al seed "Genérica".

alter table public.progress_reports
  add column if not exists template_id uuid references public.report_templates(id) on delete restrict;

create index if not exists progress_reports_template_id
  on public.progress_reports(template_id);


-- ── 3. Helper: validate_progress_report_against_template ────────────────────
-- Recorre blocks_json y exige que cada bloque required=true esté lleno
-- en data_json (según el block.kind).

create or replace function public.validate_progress_report_against_template(
  p_report_id uuid
) returns void language plpgsql security definer as $$
declare
  v_report   public.progress_reports;
  v_template public.report_templates;
  v_block    jsonb;
  v_key      text;
  v_kind     text;
  v_value    jsonb;
  v_text     text;
  v_arr_len  int;
begin
  select * into v_report from public.progress_reports where id = p_report_id;
  if not found then raise exception 'report_not_found'; end if;

  -- Si el reporte no tiene template_id (legacy), validar como antes.
  if v_report.template_id is null then
    if length(trim(coalesce(v_report.data_json->>'seguimiento', ''))) = 0 then
      raise exception 'seguimiento_required';
    end if;
    if length(trim(coalesce(v_report.data_json->>'logros_obtenidos', ''))) = 0 then
      raise exception 'logros_required';
    end if;
    return;
  end if;

  select * into v_template from public.report_templates where id = v_report.template_id;
  if not found then raise exception 'template_not_found'; end if;

  for v_block in select * from jsonb_array_elements(v_template.blocks_json)
  loop
    if coalesce((v_block->>'required')::boolean, false) then
      v_key  := v_block->>'key';
      v_kind := v_block->>'kind';
      v_value := v_report.data_json->v_key;

      if v_value is null or v_value = 'null'::jsonb then
        raise exception 'required_block_empty: %', v_key;
      end if;

      if v_kind = 'rich_text' then
        v_text := v_value #>> '{}';
        if v_text is null or length(trim(v_text)) = 0 then
          raise exception 'required_block_empty: %', v_key;
        end if;
      elsif v_kind = 'numbered_list' then
        if jsonb_typeof(v_value) <> 'array' then
          raise exception 'required_block_invalid: %', v_key;
        end if;
        select count(*) into v_arr_len
          from jsonb_array_elements_text(v_value) as item
         where length(trim(item)) > 0;
        if v_arr_len = 0 then
          raise exception 'required_block_empty: %', v_key;
        end if;
      else
        -- recommendations_by_area, categorized_text → tratar como object con
        -- al menos una key con texto no vacío.
        if jsonb_typeof(v_value) <> 'object' then
          raise exception 'required_block_invalid: %', v_key;
        end if;
        select count(*) into v_arr_len
          from jsonb_each_text(v_value) as e
         where length(trim(e.value)) > 0;
        if v_arr_len = 0 then
          raise exception 'required_block_empty: %', v_key;
        end if;
      end if;
    end if;
  end loop;
end;
$$;


-- ── 4. Re-emitir submit_progress_report con validación template-aware ──────

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

  -- Validación contra template (o legacy si template_id es null).
  perform public.validate_progress_report_against_template(p_report_id);

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


-- ── 5. RLS — report_templates ──────────────────────────────────────────────

alter table public.report_templates enable row level security;

drop policy if exists "rt select all staff" on public.report_templates;
create policy "rt select all staff"
  on public.report_templates for select
  using (public.is_agency_user());

drop policy if exists "rt insert directora admin" on public.report_templates;
create policy "rt insert directora admin"
  on public.report_templates for insert
  with check (public.is_directora_or_admin());

drop policy if exists "rt update directora admin" on public.report_templates;
create policy "rt update directora admin"
  on public.report_templates for update
  using  (public.is_directora_or_admin())
  with check (public.is_directora_or_admin());

drop policy if exists "rt delete admin" on public.report_templates;
create policy "rt delete admin"
  on public.report_templates for delete
  using (public.is_admin());


-- ── 6. Grants ────────────────────────────────────────────────────────────────

grant all on public.report_templates to anon, authenticated, service_role;


-- ── 7. Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'report_templates'
    ) then
      execute 'alter publication supabase_realtime add table public.report_templates';
    end if;
  end if;
end $$;


-- ── 8. Seed inicial: plantilla "Genérica de avances" ───────────────────────
-- Idempotente vía nombre único. Refleja los 7 bloques de
-- src/lib/domain/progress-report-template.ts (Fase 3-C1).

insert into public.report_templates (name, kind, service_type, blocks_json, active, version)
select
  'Informe de avances — Genérica',
  'progress',
  null,
  jsonb_build_array(
    jsonb_build_object(
      'key', 'seguimiento',
      'label', 'Seguimiento',
      'description', 'Resumen del proceso del niño/a durante el período. Contexto familiar y escolar relevante.',
      'required', true,
      'kind', 'rich_text',
      'placeholder', 'Durante este cuatrimestre se trabajó con… El niño/a asistió a X sesiones. Contexto familiar: …'
    ),
    jsonb_build_object(
      'key', 'dificultades_ingreso',
      'label', 'Dificultades al ingreso',
      'description', 'Áreas donde se identificaron dificultades al inicio del período.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'Al ingresar al período se observó dificultad en…\n• Área motora: …\n• Área cognitiva: …'
    ),
    jsonb_build_object(
      'key', 'objetivos_terapeuticos',
      'label', 'Objetivos terapéuticos',
      'description', 'Metas planteadas para el período.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'1. Fortalecer…\n2. Mejorar la…\n3. Desarrollar…'
    ),
    jsonb_build_object(
      'key', 'actividades_ejercicios',
      'label', 'Actividades y ejercicios realizados',
      'description', 'Tipos de actividades que se trabajaron en sesión.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'Se trabajaron actividades de…\n• Coordinación: …\n• Lenguaje expresivo: …'
    ),
    jsonb_build_object(
      'key', 'logros_obtenidos',
      'label', 'Logros obtenidos',
      'description', 'Avances concretos observados durante el período.',
      'required', true,
      'kind', 'rich_text',
      'placeholder', E'El niño/a logró…\n\n• Avance #1: …\n• Avance #2: …'
    ),
    jsonb_build_object(
      'key', 'orientaciones_casa',
      'label', 'Orientaciones para casa',
      'description', 'Recomendaciones específicas para la familia, ejercicios o rutinas a reforzar fuera de sesión.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'Se sugiere a la familia:\n• Reforzar diariamente…\n• Establecer rutina de…'
    ),
    jsonb_build_object(
      'key', 'recomendaciones',
      'label', 'Recomendaciones',
      'description', 'Recomendaciones generales (académicas, conductuales, derivaciones, próximos pasos).',
      'required', true,
      'kind', 'rich_text',
      'placeholder', E'Se recomienda…\n• Continuar el proceso terapéutico\n• Coordinar con el colegio para…'
    )
  ),
  true,
  1
where not exists (
  select 1 from public.report_templates
  where name = 'Informe de avances — Genérica' and kind = 'progress' and service_type is null
);


-- ── 9. Backfill: apuntar progress_reports legacy al seed Genérica ──────────

update public.progress_reports
   set template_id = (
     select id from public.report_templates
     where kind = 'progress' and service_type is null
       and name = 'Informe de avances — Genérica'
     limit 1
   )
 where template_id is null;


-- ── Fin de migración 0098_kinetic_report_templates ────────────────────────
