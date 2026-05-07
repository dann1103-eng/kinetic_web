-- =============================================================================
-- Kinetic — Fase 1: Núcleo familiar/clínico
-- =============================================================================
-- Crea las tablas core del dominio Kinetic:
--   1. families              — cuenta familiar (1 por familia, no por niño)
--   2. family_users          — bridge auth user ↔ family (acceso al portal de padres)
--   3. referral_sources      — colegios y médicos externos referentes
--   4. children              — niños/pacientes, FK a families
--
-- Plus:
--   - Helper RLS `is_family_member(family_id)` análogo a `is_client_of`
--   - Función generadora de código del niño (iniciales + sufijo si colisión)
--   - Ampliación del check constraint de `users.role` para roles Kinetic
--
-- COEXISTENCIA: estas tablas conviven con `clients`, `client_users`, etc. del
-- schema FM. La migración a Kinetic-only se hace gradualmente en fases siguientes.
-- =============================================================================


-- ── 0. Ampliar roles de users ────────────────────────────────────────────────
-- El schema base FM tenía: 'admin' | 'operator' (0001), luego se agregó 'supervisor'
-- (0015) y 'client' (0052). Kinetic agrega los roles del dominio clínico.

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in (
  'admin',
  'supervisor',
  'operator',
  'client',                  -- portal padres (legacy nombre, mantenido)
  -- Roles Kinetic:
  'directora',               -- Directora General — aprueba reportes
  'coordinadora_familias',   -- captación + intake (fases 1-3 del pipeline)
  'coordinadora_terapias',   -- gestión de horarios y reposiciones
  'terapista',               -- terapista individual
  'maestra',                 -- programas matutinos (BlueKids/Learning/Aula)
  'recepcion',               -- agenda, cobros pendientes
  'contable',                -- facturación + contabilidad sin acceso clínico
  'family'                   -- portal padres (alias semántico de 'client')
));


-- ── 1. families ──────────────────────────────────────────────────────────────
create table if not exists public.families (
  id                       uuid primary key default gen_random_uuid(),
  code                     text unique,                            -- ej. "MOR" (apellido), libre opcional
  primary_contact_name     text not null,                          -- ej. "Daniel Mancia / Laura Morataya"
  primary_contact_email    text,
  primary_contact_phone    text,
  secondary_contact_name   text,
  secondary_contact_phone  text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  emergency_contact_relation text,
  fiscal_legal_name        text,                                   -- snapshot para facturas
  fiscal_nit               text,
  fiscal_dui               text,
  fiscal_address           text,
  status                   text not null default 'active'
                             check (status in ('active','paused','overdue','dropped')),
  notes                    text,
  created_at               timestamptz not null default now(),
  created_by_user_id       uuid references public.users(id) on delete set null,
  updated_at               timestamptz not null default now()
);

create index if not exists families_status_idx on public.families(status);
create index if not exists families_primary_email_idx on public.families(primary_contact_email);


-- ── 2. family_users (bridge auth user ↔ family) ──────────────────────────────
-- Equivale a `client_users` para Kinetic.

create table if not exists public.family_users (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','viewer')),
  -- Capabilities granulares del portal:
  can_billing  boolean not null default true,    -- ver/pagar facturas
  can_work     boolean not null default true,    -- ver agenda + reportes + cuadernillo
  created_at   timestamptz not null default now(),
  unique (family_id, user_id)
);

create index if not exists family_users_user_id_idx on public.family_users(user_id);
create index if not exists family_users_family_id_idx on public.family_users(family_id);


-- ── 3. referral_sources (colegios + médicos externos) ───────────────────────
create table if not exists public.referral_sources (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('school','doctor','direct','social_media','walk_in','referral_other')),
  name            text not null,                                   -- ej. "Colegio Salesiano San José", "Dr. Juan Pérez"
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  specialty       text,                                            -- si type='doctor': "Neurología pediátrica", etc.
  address         text,
  notes           text,
  can_receive_reports     boolean not null default false,          -- si reciben copia de informes
  partnership_active      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (type, name)
);

create index if not exists referral_sources_type_idx on public.referral_sources(type);
create index if not exists referral_sources_active_idx on public.referral_sources(partnership_active);


-- ── 4. children (niños / pacientes) ─────────────────────────────────────────
create table if not exists public.children (
  id                       uuid primary key default gen_random_uuid(),
  family_id                uuid not null references public.families(id) on delete cascade,
  code                     text unique,                            -- iniciales de apellidos + sufijo (ej. "MR", "MR2")
  full_name                text not null,
  preferred_name           text,                                   -- nombre como le dicen
  birth_date               date,
  gender                   text check (gender in ('M','F','other')),
  -- Datos clínicos (críticos para emergencias)
  blood_type               text,                                   -- ej. "O+"
  allergies_text           text,
  medications_text         text,
  preferred_hospital       text,
  -- Escolaridad
  school_name              text,                                   -- ej. "Liceo San Luis, Santa Ana"
  school_grade             text,                                   -- ej. "Preparatoria", "Segundo grado"
  -- Diagnósticos (visibles en header de informes)
  diagnoses_json           jsonb not null default '[]'::jsonb,     -- ej. ["tdah","altas_capacidades"]
  diagnoses_display_text   text,                                   -- override editorial: "Doble excepcionalidad: TDAH y Altas Capacidades"
  -- Origen del paciente
  referral_source_type     text check (referral_source_type in ('school','doctor','direct','social_media','walk_in','referral_other')),
  referral_source_id       uuid references public.referral_sources(id) on delete set null,
  referral_notes           text,
  -- Pipeline de atención (12 fases, ver plan v0.7)
  intake_phase             text not null default 'solicitud_informacion'
                             check (intake_phase in (
                               'solicitud_informacion',
                               'bateria_preguntas',
                               'entrevista_directora',
                               'propuesta_observacion_evaluacion',
                               'propuesta_economica_evaluacion',
                               'agenda_observacion',
                               'en_observacion_evaluacion',
                               'informe_resultados',
                               'propuesta_plan_terapias',
                               'propuesta_economica_terapias',
                               'en_terapias',
                               'alta'
                             )),
  intake_phase_changed_at  timestamptz not null default now(),
  -- Estado del tratamiento
  treatment_status         text not null default 'active'
                             check (treatment_status in (
                               'active',
                               'considering_discharge',
                               'discharged_conditional',
                               'discharged_final',
                               'paused',
                               'dropped'
                             )),
  treatment_status_changed_at  timestamptz not null default now(),
  treatment_status_notes   text,
  -- Inscripción en programa matutino (si aplica)
  enrolled_program         text check (enrolled_program in ('blue_kids','learning_kids','aula_educativa')),
  enrollment_started_at    date,
  enrollment_ended_at      date,
  -- Notas libres
  notes                    text,
  -- Auditoría
  created_at               timestamptz not null default now(),
  created_by_user_id       uuid references public.users(id) on delete set null,
  updated_at               timestamptz not null default now()
);

create index if not exists children_family_idx on public.children(family_id);
create index if not exists children_intake_phase_idx on public.children(intake_phase);
create index if not exists children_treatment_status_idx on public.children(treatment_status);
create index if not exists children_enrolled_program_idx on public.children(enrolled_program) where enrolled_program is not null;
create index if not exists children_referral_source_idx on public.children(referral_source_id) where referral_source_id is not null;


-- ── 5. Helper RLS: is_family_member ─────────────────────────────────────────
-- Análogo a is_client_of, para el portal de padres.

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.family_users
    where user_id = auth.uid()
      and family_id = target_family_id
  );
$$;


-- ── 6. Función para generar código del niño ──────────────────────────────────
-- Genera código basado en iniciales de apellidos del full_name, con sufijo si colisiona.
-- Lógica: tomar las 2 últimas palabras del nombre (apellidos), inicial de cada una.
--   Ej: "Roberto Andrés Flores Morataya" → "FM"
--   Si "FM" ya existe → "FM2", "FM3", etc.

create or replace function public.generate_child_code(p_full_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_words text[];
  v_n int;
  v_base text;
  v_candidate text;
  v_suffix int := 0;
begin
  v_words := regexp_split_to_array(trim(p_full_name), '\s+');
  v_n := array_length(v_words, 1);

  if v_n is null or v_n < 1 then
    return 'XX';
  end if;

  -- Si solo 1 palabra: primera letra duplicada
  if v_n = 1 then
    v_base := upper(left(v_words[1], 1)) || upper(left(v_words[1], 1));
  -- Si 2 palabras: inicial de cada una
  elsif v_n = 2 then
    v_base := upper(left(v_words[1], 1)) || upper(left(v_words[2], 1));
  -- Si 3+ palabras: tomar las 2 ÚLTIMAS (apellidos)
  else
    v_base := upper(left(v_words[v_n - 1], 1)) || upper(left(v_words[v_n], 1));
  end if;

  -- Buscar primer sufijo libre
  loop
    v_candidate := case when v_suffix = 0 then v_base else v_base || v_suffix::text end;
    if not exists (select 1 from public.children where code = v_candidate) then
      return v_candidate;
    end if;
    v_suffix := v_suffix + 1;
    -- Safety: evitar loop infinito
    if v_suffix > 9999 then
      return v_base || extract(epoch from now())::text;
    end if;
  end loop;
end;
$$;


-- ── 7. Trigger: auto-asignar code al insertar children sin code ─────────────
create or replace function public.children_auto_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.generate_child_code(new.full_name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_children_auto_code on public.children;
create trigger trg_children_auto_code
  before insert on public.children
  for each row execute function public.children_auto_code();


-- ── 8. Trigger: actualizar timestamps ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_families_touch on public.families;
create trigger trg_families_touch before update on public.families
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_children_touch on public.children;
create trigger trg_children_touch before update on public.children
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_referral_sources_touch on public.referral_sources;
create trigger trg_referral_sources_touch before update on public.referral_sources
  for each row execute function public.touch_updated_at();


-- ── 9. RLS — families ──────────────────────────────────────────────────────
alter table public.families enable row level security;

create policy "families_select_agency"
  on public.families for select
  using (public.is_agency_user());

create policy "families_select_member"
  on public.families for select
  using (public.is_family_member(id));

create policy "families_insert_agency"
  on public.families for insert
  with check (public.is_agency_user());

create policy "families_update_agency"
  on public.families for update
  using (public.is_agency_user());

create policy "families_delete_admin"
  on public.families for delete
  using (public.is_admin());


-- ── 10. RLS — family_users ──────────────────────────────────────────────────
alter table public.family_users enable row level security;

create policy "family_users_select_agency"
  on public.family_users for select
  using (public.is_agency_user());

create policy "family_users_select_self"
  on public.family_users for select
  using (user_id = auth.uid());

create policy "family_users_insert_admin"
  on public.family_users for insert
  with check (public.is_admin());

create policy "family_users_update_admin"
  on public.family_users for update
  using (public.is_admin());

create policy "family_users_delete_admin"
  on public.family_users for delete
  using (public.is_admin());


-- ── 11. RLS — children ──────────────────────────────────────────────────────
alter table public.children enable row level security;

create policy "children_select_agency"
  on public.children for select
  using (public.is_agency_user());

create policy "children_select_family_member"
  on public.children for select
  using (public.is_family_member(family_id));

create policy "children_insert_agency"
  on public.children for insert
  with check (public.is_agency_user());

create policy "children_update_agency"
  on public.children for update
  using (public.is_agency_user());

create policy "children_delete_admin"
  on public.children for delete
  using (public.is_admin());


-- ── 12. RLS — referral_sources ──────────────────────────────────────────────
alter table public.referral_sources enable row level security;

create policy "referral_sources_select_agency"
  on public.referral_sources for select
  using (public.is_agency_user());

create policy "referral_sources_insert_agency"
  on public.referral_sources for insert
  with check (public.is_agency_user());

create policy "referral_sources_update_agency"
  on public.referral_sources for update
  using (public.is_agency_user());

create policy "referral_sources_delete_admin"
  on public.referral_sources for delete
  using (public.is_admin());


-- ── 13. Grants ──────────────────────────────────────────────────────────────
grant all on public.families         to anon, authenticated, service_role;
grant all on public.family_users     to anon, authenticated, service_role;
grant all on public.children         to anon, authenticated, service_role;
grant all on public.referral_sources to anon, authenticated, service_role;


-- ── 14. Realtime (familias y niños — para que padres vean cambios live) ────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'families') then
      execute 'alter publication supabase_realtime add table public.families';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'children') then
      execute 'alter publication supabase_realtime add table public.children';
    end if;
  end if;
end $$;


-- ── Fin de migración 0091_kinetic_families_and_children ───────────────────
