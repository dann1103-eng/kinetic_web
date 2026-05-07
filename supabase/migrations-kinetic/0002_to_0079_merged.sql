-- ============================================================================
-- Kinetic — Merged migrations 0002 → 0079 (FM CRM base schema)
-- ============================================================================
-- Este archivo combina las 78 migraciones 0002-0079 del schema base de FM CRM
-- en un solo SQL para pegar/ejecutar de una vez en Supabase SQL Editor.
--
-- Orden de ejecución en proyecto Supabase Kinetic:
--   1. supabase/migrations/0001_init.sql                          (ya corrida)
--   2. ESTE archivo (0002_to_0079_merged.sql)
--   3. supabase/migrations-kinetic/0001_kinetic_init.sql
--
-- Orden interno: numérico ascendente. Para los dos archivos numerados 0060,
-- se respeta el orden cronológico de commit:
--   1) 0060_n1co_integration            (commit 2026-04-27)
--   2) 0060_cambio_logs_approval_status (commit 2026-04-28)
-- ============================================================================


-- ============================================================================
-- ╔══ 0002_pipeline.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0002: Pipeline de producción
-- ============================================================

-- ── Columna phase en consumptions ────────────────────────────
ALTER TABLE public.consumptions
  ADD COLUMN phase text NOT NULL DEFAULT 'pendiente'
    CHECK (phase IN (
      'pendiente',
      'en_produccion',
      'revision_interna',
      'revision_cliente',
      'aprobado',
      'publicado'
    ));

-- ── consumption_phase_logs ───────────────────────────────────
CREATE TABLE public.consumption_phase_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumption_id  uuid NOT NULL REFERENCES public.consumptions(id) ON DELETE CASCADE,
  from_phase      text,
  to_phase        text NOT NULL,
  moved_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX phase_logs_consumption_id_idx
  ON public.consumption_phase_logs(consumption_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.consumption_phase_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can view phase logs"
  ON public.consumption_phase_logs FOR SELECT
  USING (public.is_agency_user());

CREATE POLICY "Agency users can insert phase logs"
  ON public.consumption_phase_logs FOR INSERT
  WITH CHECK (public.is_agency_user());

-- No UPDATE / DELETE: logs son inmutables


-- ============================================================================
-- ╔══ 0003_pipeline_rollover.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0003: Pipeline rollover (carried_over)
-- ============================================================

ALTER TABLE public.consumptions
  ADD COLUMN carried_over boolean NOT NULL DEFAULT false;


-- ============================================================================
-- ╔══ 0004_reuniones.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0004: Tipo de consumo "reunion"
-- ============================================================

-- 1. Actualizar CHECK constraint en consumptions
ALTER TABLE public.consumptions
  DROP CONSTRAINT consumptions_content_type_check;

ALTER TABLE public.consumptions
  ADD CONSTRAINT consumptions_content_type_check
  CHECK (content_type IN (
    'historia', 'estatico', 'video_corto', 'reel',
    'short', 'produccion', 'reunion'
  ));

-- 2. Agregar reuniones a los tres planes existentes
UPDATE public.plans
  SET limits_json = limits_json || '{"reuniones": 1, "reunion_duracion_horas": 1}'::jsonb
  WHERE name = 'Básico';

UPDATE public.plans
  SET limits_json = limits_json || '{"reuniones": 2, "reunion_duracion_horas": 1}'::jsonb
  WHERE name = 'Profesional';

UPDATE public.plans
  SET limits_json = limits_json || '{"reuniones": 2, "reunion_duracion_horas": 2}'::jsonb
  WHERE name = 'Premium';


-- ============================================================================
-- ╔══ 0005_client_social_fields.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0005: Additional client social / contact fields
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS yt_handle       text,
  ADD COLUMN IF NOT EXISTS linkedin_handle  text,
  ADD COLUMN IF NOT EXISTS website_url      text,
  ADD COLUMN IF NOT EXISTS other_contact    text;


-- ============================================================================
-- ╔══ 0006_client_weekly_targets.sql
-- ============================================================================
-- supabase/migrations/0006_client_weekly_targets.sql
-- ============================================================
-- FM CRM — Migration 0006: Weekly targets per client
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS weekly_targets_json jsonb;


-- ============================================================================
-- ╔══ 0007_client_logos_bucket.sql
-- ============================================================================
-- Storage bucket: client-logos (público)
--
-- El bucket debe crearse manualmente en el Supabase Dashboard:
--   Storage → New bucket → Name: "client-logos" → Public: ON
--
-- Una vez creado, ejecutar las siguientes policies desde el SQL Editor:

-- Admins pueden subir logos
create policy "admins_insert_client_logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-logos'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins pueden actualizar logos existentes
create policy "admins_update_client_logos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'client-logos'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- Admins pueden eliminar logos
create policy "admins_delete_client_logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'client-logos'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

-- SELECT es público por configuración del bucket (no requiere policy adicional).


-- ============================================================================
-- ╔══ 0008_consumption_title_cambios.sql
-- ============================================================================
-- supabase/migrations/0008_consumption_title_cambios.sql

-- Título de consumo (registros existentes quedan con '' — UI requiere uno no vacío)
ALTER TABLE public.consumptions
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

-- Contador de cambios solicitados por el cliente
ALTER TABLE public.consumptions
  ADD COLUMN IF NOT EXISTS cambios_count INTEGER NOT NULL DEFAULT 0;

-- Límite de cambios por defecto por cliente
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS max_cambios INTEGER NOT NULL DEFAULT 2;


-- ============================================================================
-- ╔══ 0009_rename_consumptions_to_requirements.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0009: Renombrar consumptions → requirements
-- ============================================================

-- 1. Renombrar tablas
ALTER TABLE public.consumptions RENAME TO requirements;
ALTER TABLE public.consumption_phase_logs RENAME TO requirement_phase_logs;

-- 2. Renombrar columna consumption_id → requirement_id en requirement_phase_logs
ALTER TABLE public.requirement_phase_logs RENAME COLUMN consumption_id TO requirement_id;

-- 3. Renombrar índices
ALTER INDEX consumptions_cycle_id_idx RENAME TO requirements_cycle_id_idx;
ALTER INDEX consumptions_type_idx RENAME TO requirements_type_idx;
ALTER INDEX phase_logs_consumption_id_idx RENAME TO phase_logs_requirement_id_idx;

-- 4. Renombrar CHECK constraint (tabla ahora es requirements)
ALTER TABLE public.requirements
  RENAME CONSTRAINT consumptions_content_type_check TO requirements_content_type_check;

-- 5. Renombrar FK constraints
ALTER TABLE public.requirements
  RENAME CONSTRAINT consumptions_billing_cycle_id_fkey TO requirements_billing_cycle_id_fkey;

ALTER TABLE public.requirement_phase_logs
  RENAME CONSTRAINT consumption_phase_logs_consumption_id_fkey TO requirement_phase_logs_requirement_id_fkey;

-- 6. Actualizar políticas RLS en requirements
DROP POLICY "Agency users can view consumptions" ON public.requirements;
DROP POLICY "Agency users can register consumptions" ON public.requirements;
DROP POLICY "Agency users can void consumptions" ON public.requirements;

CREATE POLICY "Agency users can view requirements"
  ON public.requirements FOR SELECT
  USING (public.is_agency_user());

CREATE POLICY "Agency users can register requirements"
  ON public.requirements FOR INSERT
  WITH CHECK (public.is_agency_user());

CREATE POLICY "Agency users can void requirements"
  ON public.requirements FOR UPDATE
  USING (public.is_agency_user());

-- 7. Actualizar políticas RLS en requirement_phase_logs
DROP POLICY "Agency users can view phase logs" ON public.requirement_phase_logs;
DROP POLICY "Agency users can insert phase logs" ON public.requirement_phase_logs;

CREATE POLICY "Agency users can view requirement phase logs"
  ON public.requirement_phase_logs FOR SELECT
  USING (public.is_agency_user());

CREATE POLICY "Agency users can insert requirement phase logs"
  ON public.requirement_phase_logs FOR INSERT
  WITH CHECK (public.is_agency_user());


-- ============================================================================
-- ╔══ 0010_chat_timesheet.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0010: Chat interno + Hojas de tiempo
-- ============================================================

-- 1. Columna review_started_at en requirements
--    Se setea automáticamente cuando el requerimiento entra a revision_cliente
ALTER TABLE public.requirements
  ADD COLUMN IF NOT EXISTS review_started_at timestamptz;

-- 2. Tabla requirement_messages (chat interno por requerimiento)
CREATE TABLE IF NOT EXISTS public.requirement_messages (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  requirement_id  uuid        NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body            text        NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.requirement_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can view requirement messages"
  ON public.requirement_messages FOR SELECT
  USING (public.is_agency_user());

CREATE POLICY "Agency users can send requirement messages"
  ON public.requirement_messages FOR INSERT
  WITH CHECK (public.is_agency_user());

CREATE INDEX IF NOT EXISTS req_messages_requirement_id_idx
  ON public.requirement_messages(requirement_id);

-- 3. Tabla time_entries (hojas de tiempo por requerimiento)
CREATE TABLE IF NOT EXISTS public.time_entries (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  requirement_id      uuid        NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phase               text        NOT NULL,
  title               text        NOT NULL DEFAULT '',
  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,               -- null = timer activo
  duration_seconds    integer,                   -- null mientras corre el timer
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can view time entries"
  ON public.time_entries FOR SELECT
  USING (public.is_agency_user());

CREATE POLICY "Agency users can insert time entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (public.is_agency_user());

CREATE POLICY "Users can update their own time entries"
  ON public.time_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time entries"
  ON public.time_entries FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS time_entries_requirement_id_idx
  ON public.time_entries(requirement_id);

CREATE INDEX IF NOT EXISTS time_entries_user_id_idx
  ON public.time_entries(user_id);


-- ============================================================================
-- ╔══ 0011_phase2_cambios.sql
-- ============================================================================
-- Phase 2: sistema de cambios global, contenido extra, overrides de ciclo

-- 1. Agregar cambios_included a plans
ALTER TABLE plans ADD COLUMN IF NOT EXISTS cambios_included integer NOT NULL DEFAULT 0;

-- Valores iniciales según precios estándar de FM
UPDATE plans SET cambios_included = 8  WHERE price_usd = 200;
UPDATE plans SET cambios_included = 20 WHERE price_usd = 300;
UPDATE plans SET cambios_included = 26 WHERE price_usd = 400;

-- 2. Nuevas columnas en billing_cycles
ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS cambios_budget integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cambios_packages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_content_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS content_limits_override_json jsonb;

-- 3. Eliminar max_cambios de clients (cambios ahora son globales por ciclo)
ALTER TABLE clients DROP COLUMN IF EXISTS max_cambios;

-- 4. cambios_count se mantiene en requirements como contador por pieza (sin límite)
--    La validación del presupuesto se hace a nivel de ciclo (suma vs cambios_budget)


-- ============================================================================
-- ╔══ 0012_phase3_billing.sql
-- ============================================================================
-- Phase 3: periodo de facturación (mensual/quincenal) por cliente

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly'
  CHECK (billing_period IN ('monthly', 'biweekly'));


-- ============================================================================
-- ╔══ 0013_billing_day_2.sql
-- ============================================================================
-- Phase 3: segundo día de facturación para clientes quincenales

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_day_2 int
  CHECK (billing_day_2 BETWEEN 1 AND 31);


-- ============================================================================
-- ╔══ 0014_time_entries_admin.sql
-- ============================================================================
-- Phase 5: extender time_entries para soportar entradas administrativas

ALTER TABLE time_entries
  ALTER COLUMN requirement_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'requirement'
    CHECK (entry_type IN ('requirement', 'administrative')),
  ADD COLUMN IF NOT EXISTS category text
    CHECK (category IN (
      'administrativa',
      'coordinacion_cuentas',
      'reunion_interna',
      'direccion_creativa',
      'direccion_comunicacion',
      'standby'
    ));

-- Un usuario solo puede tener una entrada activa a la vez (ended_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_active_per_user
  ON time_entries (user_id)
  WHERE ended_at IS NULL;

-- Constraint: requirement entries necesitan requirement_id; admin entries necesitan category
ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_type_check CHECK (
    (entry_type = 'requirement' AND requirement_id IS NOT NULL AND category IS NULL)
    OR
    (entry_type = 'administrative' AND category IS NOT NULL AND requirement_id IS NULL)
  );


-- ============================================================================
-- ╔══ 0015_supervisor_role.sql
-- ============================================================================
-- Phase 6A: Agregar rol 'supervisor' al sistema de permisos

-- Relajar el CHECK constraint de users.role para aceptar 'supervisor'
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'supervisor', 'operator'));


-- ============================================================================
-- ╔══ 0016_requirement_properties.sql
-- ============================================================================
-- Fase B: Propiedades de requerimiento (prioridad, tiempo estimado, asignado)
ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baja','media','alta')),
  ADD COLUMN IF NOT EXISTS estimated_time_minutes integer,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requirements_assigned_to ON requirements(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requirements_priority ON requirements(priority);


-- ============================================================================
-- ╔══ 0017_weekly_distribution.sql
-- ============================================================================
-- Fase D: distribución semanal por tipo S1–S4

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS default_weekly_distribution_json jsonb;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS weekly_distribution_json jsonb;

-- Básico (price_usd = 200): 1 corto + 1 estático S1/S3, 1 reel + 1 estático S2/S4
UPDATE plans
SET default_weekly_distribution_json = '{
  "S1": {"video_corto": 1, "estatico": 1},
  "S2": {"reel": 1, "estatico": 1},
  "S3": {"video_corto": 1, "estatico": 1},
  "S4": {"reel": 1, "estatico": 1}
}'::jsonb
WHERE price_usd = 200;


-- ============================================================================
-- ╔══ 0018_user_profile.sql
-- ============================================================================
-- Fase F: avatar de usuario
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Crear el bucket 'user-avatars' manualmente en Supabase Dashboard (Storage > New bucket, public = true)
-- Policies necesarias:
--   INSERT: bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text
--   UPDATE: bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text
--   DELETE: bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = auth.uid()::text
--   SELECT: bucket_id = 'user-avatars' (public read)


-- ============================================================================
-- ╔══ 0019_pipeline_phases_v2.sql
-- ============================================================================
-- Fase G: Reestructura de fases del pipeline (6 → 12)

-- Eliminar constraints existentes (el nombre original viene de la tabla 'consumptions')
ALTER TABLE requirements DROP CONSTRAINT IF EXISTS consumptions_phase_check;
ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_phase_check;
ALTER TABLE requirement_phase_logs DROP CONSTRAINT IF EXISTS requirement_phase_logs_to_phase_check;
ALTER TABLE requirement_phase_logs DROP CONSTRAINT IF EXISTS requirement_phase_logs_from_phase_check;

-- Mapear fases antiguas a las nuevas equivalentes
UPDATE requirements SET phase = 'proceso_edicion'   WHERE phase = 'en_produccion';
UPDATE requirements SET phase = 'publicado_entregado' WHERE phase = 'publicado';

UPDATE requirement_phase_logs SET to_phase = 'proceso_edicion'   WHERE to_phase = 'en_produccion';
UPDATE requirement_phase_logs SET to_phase = 'publicado_entregado' WHERE to_phase = 'publicado';
UPDATE requirement_phase_logs SET from_phase = 'proceso_edicion'   WHERE from_phase = 'en_produccion';
UPDATE requirement_phase_logs SET from_phase = 'publicado_entregado' WHERE from_phase = 'publicado';

-- Actualizar CHECK constraints (requirements.phase)
ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_phase_check;
ALTER TABLE requirements ADD CONSTRAINT requirements_phase_check CHECK (
  phase IN (
    'pendiente','proceso_edicion','proceso_diseno','proceso_animacion','cambios',
    'pausa','revision_interna','revision_diseno','revision_cliente',
    'aprobado','pendiente_publicar','publicado_entregado'
  )
);

-- Actualizar CHECK constraints (requirement_phase_logs.to_phase)
ALTER TABLE requirement_phase_logs DROP CONSTRAINT IF EXISTS requirement_phase_logs_to_phase_check;
ALTER TABLE requirement_phase_logs ADD CONSTRAINT requirement_phase_logs_to_phase_check CHECK (
  to_phase IN (
    'pendiente','proceso_edicion','proceso_diseno','proceso_animacion','cambios',
    'pausa','revision_interna','revision_diseno','revision_cliente',
    'aprobado','pendiente_publicar','publicado_entregado'
  )
);

-- Actualizar CHECK constraints (requirement_phase_logs.from_phase) si existe
ALTER TABLE requirement_phase_logs DROP CONSTRAINT IF EXISTS requirement_phase_logs_from_phase_check;
ALTER TABLE requirement_phase_logs ADD CONSTRAINT requirement_phase_logs_from_phase_check CHECK (
  from_phase IS NULL OR from_phase IN (
    'pendiente','proceso_edicion','proceso_diseno','proceso_animacion','cambios',
    'pausa','revision_interna','revision_diseno','revision_cliente',
    'aprobado','pendiente_publicar','publicado_entregado'
  )
);


-- ============================================================================
-- ╔══ 0020_multi_assignee.sql
-- ============================================================================
-- Convert requirements.assigned_to from uuid to uuid[] for multi-assignee support

-- Drop FK constraint (uuid[] cannot have FK constraints in PostgreSQL)
ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_assigned_to_fkey;

-- Drop existing btree index
DROP INDEX IF EXISTS idx_requirements_assigned_to;

-- Convert column to uuid[] preserving existing single assignments
ALTER TABLE requirements
  ALTER COLUMN assigned_to TYPE uuid[]
  USING CASE WHEN assigned_to IS NULL THEN NULL ELSE ARRAY[assigned_to] END;

-- GIN index for @> containment queries (used by operator scoping filter)
CREATE INDEX idx_requirements_assigned_to ON requirements USING GIN (assigned_to)
  WHERE assigned_to IS NOT NULL;


-- ============================================================================
-- ╔══ 0021_cambio_logs.sql
-- ============================================================================
-- Log individual de cada cambio con descripción opcional

CREATE TABLE requirement_cambio_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  notes       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cambio_logs_requirement_id ON requirement_cambio_logs(requirement_id);

ALTER TABLE requirement_cambio_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read cambio logs"
  ON requirement_cambio_logs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users insert cambio logs"
  ON requirement_cambio_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');


-- ============================================================================
-- ╔══ 0022_matriz_contenido.sql
-- ============================================================================
-- Add matrices_contenido = 1 to all existing plans
UPDATE plans
SET limits_json = limits_json || '{"matrices_contenido": 1}'::jsonb;

-- Also patch any existing billing_cycle snapshots so they inherit the field
-- (prevents old cycles from showing limit=0 on the new type)
UPDATE billing_cycles
SET limits_snapshot_json = limits_snapshot_json || '{"matrices_contenido": 1}'::jsonb
WHERE limits_snapshot_json IS NOT NULL;


-- ============================================================================
-- ╔══ 0023_basic_plan_historias.sql
-- ============================================================================
-- Plan Básico: incluir 3 historias/semana explícitamente en la distribución default.
-- Los ceros explícitos en reel/video_corto impiden que augmentDistribution añada
-- fallbacks automáticos (ceil(limit/4)) para esos tipos en las semanas donde no aplican.
UPDATE plans
SET default_weekly_distribution_json = '{
  "S1": {"historia": 3, "video_corto": 1, "estatico": 1, "reel": 0},
  "S2": {"historia": 3, "reel": 1, "estatico": 1, "video_corto": 0},
  "S3": {"historia": 3, "video_corto": 1, "estatico": 1, "reel": 0},
  "S4": {"historia": 3, "reel": 1, "estatico": 1, "video_corto": 0}
}'::jsonb
WHERE price_usd = 200;


-- ============================================================================
-- ╔══ 0024_default_assignee_flag.sql
-- ============================================================================
-- Flag para marcar usuarios que deben ser preseleccionados al crear un requerimiento.
-- El admin marcará manualmente (ej. Alejandra y Fabiola) desde /users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_assignee boolean NOT NULL DEFAULT false;

-- Índice parcial opcional — la consulta siempre filtra por true y la cardinalidad es baja.
CREATE INDEX IF NOT EXISTS idx_users_default_assignee
  ON users(default_assignee)
  WHERE default_assignee = true;


-- ============================================================================
-- ╔══ 0025_phase_log_timer_split.sql
-- ============================================================================
-- Desglose stand-by vs trabajado por fase.
-- Al salir de una fase, se calcula:
--   worked_seconds  = SUM(duration_seconds) de time_entries en esa fase durante la ventana del log
--   standby_seconds = total_seconds - worked_seconds
-- Los logs históricos (sin ended_at) quedan como "fase actual" o "fase no cerrada".
ALTER TABLE requirement_phase_logs
  ADD COLUMN IF NOT EXISTS ended_at        timestamptz,
  ADD COLUMN IF NOT EXISTS standby_seconds integer,
  ADD COLUMN IF NOT EXISTS worked_seconds  integer;

-- Índice para localizar rápido el log abierto de un requerimiento al mover fase
CREATE INDEX IF NOT EXISTS idx_phase_logs_req_created
  ON requirement_phase_logs(requirement_id, created_at);


-- ============================================================================
-- ╔══ 0026_requirement_message_attachments.sql
-- ============================================================================
-- Attachments (imágenes) en el chat de requerimientos.
-- 1 imagen por mensaje; múltiples imágenes → múltiples messages.
-- Las imágenes se comprimen client-side a ≤800KB (presupuesto Supabase: 50MB TOTAL
-- entre todos los buckets). Se limpian al archivar ciclo, anular req o eliminar cliente.
ALTER TABLE requirement_messages
  ADD COLUMN IF NOT EXISTS attachment_path text,  -- path dentro del bucket "requirement-attachments"
  ADD COLUMN IF NOT EXISTS attachment_type text,  -- "image/jpeg", "image/png", "image/webp"
  ADD COLUMN IF NOT EXISTS attachment_name text;  -- nombre original (para descarga)

CREATE INDEX IF NOT EXISTS idx_req_messages_req
  ON requirement_messages(requirement_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- BUCKET MANUAL en Supabase Dashboard:
--
--   Nombre:   requirement-attachments
--   Público:  sí (paths contienen UUIDs, son opacos)
--   Policies:
--     - INSERT: authenticated (admin/supervisor/operator de la agencia)
--     - SELECT: public
--     - DELETE: authenticated con role='admin' en tabla users
--
-- ─────────────────────────────────────────────────────────────────────────────


-- ============================================================================
-- ╔══ 0027_biweekly_payment_tracking.sql
-- ============================================================================
-- Facturación quincenal con 2 pagos por ciclo.
-- Hasta ahora el ciclo tenía un solo `payment_status`/`payment_date`. Para biweekly
-- necesitamos separar 1er pago (cubre S1-S2) y 2do pago (cubre S3-S4).
-- Los ciclos monthly usan solo `payment_status`/`payment_date` como antes.
ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS payment_status_2 text
    DEFAULT 'unpaid'
    CHECK (payment_status_2 IN ('unpaid', 'paid', 'pending', 'overdue')),
  ADD COLUMN IF NOT EXISTS payment_date_2 timestamptz;

COMMENT ON COLUMN billing_cycles.payment_status IS
  'Estado del 1er pago (monthly) o 1ra quincena (biweekly).';
COMMENT ON COLUMN billing_cycles.payment_status_2 IS
  'Estado del 2do pago biweekly. NULL/unpaid si monthly o no aplicable.';


-- ============================================================================
-- ╔══ 0028_content_plan.sql
-- ============================================================================
-- Plan "Contenido": pool único de N contenidos tipables al registrar.
-- Se agrega columna top-level en plans para query/filtrado fácil; el mismo valor
-- se copia también dentro de limits_snapshot_json al crear el billing_cycle,
-- para que el snapshot sea autosuficiente aun si el plan cambia después.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS unified_content_limit integer;

COMMENT ON COLUMN plans.unified_content_limit IS
  'NULL = plan normal (limits per-type). N = todos los tipos tippables comparten un pool único de N.';

-- Insertar el plan "Contenido" (idempotente por nombre).
INSERT INTO plans (name, price_usd, cambios_included, active, unified_content_limit, limits_json)
SELECT
  'Contenido',
  120,
  1,
  true,
  10,
  '{
    "historias": 0,
    "estaticos": 0,
    "videos_cortos": 0,
    "reels": 0,
    "shorts": 0,
    "producciones": 0,
    "reuniones": 0,
    "reunion_duracion_horas": 0,
    "matrices_contenido": 0,
    "unified_content_limit": 10
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Contenido');


-- ============================================================================
-- ╔══ 0029_update_plan_historias.sql
-- ============================================================================
-- Actualización de límite de historias por plan.
-- Básico: 8 · Profesional: 20 · Premium: 24
UPDATE plans SET limits_json = limits_json || '{"historias": 8}'::jsonb  WHERE name = 'Básico';
UPDATE plans SET limits_json = limits_json || '{"historias": 20}'::jsonb WHERE name = 'Profesional';
UPDATE plans SET limits_json = limits_json || '{"historias": 24}'::jsonb WHERE name = 'Premium';


-- ============================================================================
-- ╔══ 0030_app_settings.sql
-- ============================================================================
-- Tabla de configuración global de la aplicación (key-value).
-- Usada para almacenar la URL del logo de la agencia y otros ajustes futuros.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- Fila inicial para el logo de la agencia (null = sin logo cargado aún)
INSERT INTO app_settings (key, value)
VALUES ('agency_logo_url', null)
ON CONFLICT (key) DO NOTHING;

-- Solo admins pueden modificar los ajustes; cualquier autenticado puede leer.
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" ON app_settings
  FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Authenticated can read settings" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────────────
-- BUCKET MANUAL en Supabase Dashboard:
--
--   Nombre:   agency-assets
--   Público:  sí
--   Policies:
--     - INSERT: authenticated
--     - SELECT: public  (bucket_id = 'agency-assets')
--     - UPDATE: authenticated con role='admin'
--     - DELETE: authenticated con role='admin'
-- ─────────────────────────────────────────────────────────────────────────────


-- ============================================================================
-- ╔══ 0031_time_entries_admin_policies.sql
-- ============================================================================
-- Allow admins and supervisors to update/delete time entries that belong to any user.
-- The existing policies only allow users to manage their OWN entries, so admin edits
-- and deletes on other users' entries were being silently blocked by RLS.

CREATE POLICY "Admins can update any time entry"
  ON public.time_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Admins can delete any time entry"
  ON public.time_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );


-- ============================================================================
-- ╔══ 0032_operator_timer_restrictions.sql
-- ============================================================================
-- Operators should only be able to open (INSERT) and close (stop timer) their own
-- time entries. They must not be able to edit completed entries or delete anything.
--
-- Currently the generic "Users can update/delete their own time entries" policies
-- grant full UPDATE and DELETE to every authenticated user, including operators.
--
-- Fix:
--   1. Drop the generic update/delete policies.
--   2. Re-create update as admin+supervisor only (full edit of own entries).
--   3. Add a narrow "Operators can close their own active timer" policy that only
--      allows UPDATE on rows where ended_at IS NULL (the running timer row).
--   4. Re-create delete as admin+supervisor only.

-- ── Update ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update their own time entries" ON public.time_entries;

-- Admins and supervisors: full update on their own entries
CREATE POLICY "Users can update their own time entries"
  ON public.time_entries FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- Operators: can ONLY stop an active timer (ended_at IS NULL → sets ended_at)
CREATE POLICY "Operators can close their own active timer"
  ON public.time_entries FOR UPDATE
  USING (
    auth.uid() = user_id
    AND ended_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'operator'
    )
  );

-- ── Delete ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can delete their own time entries" ON public.time_entries;

-- Only admins and supervisors can delete their own entries
-- (the "Admins can delete any time entry" policy from 0031 already covers deleting others')
CREATE POLICY "Users can delete their own time entries"
  ON public.time_entries FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );


-- ============================================================================
-- ╔══ 0033_fix_operator_timer_policy.sql
-- ============================================================================
-- Fix: "Operators can close their own active timer" fails with RLS error because
-- without an explicit WITH CHECK, Postgres reuses the USING clause to validate
-- the row AFTER the update — but ended_at is no longer NULL after closing,
-- so the post-update check fails and the operation is rejected.
--
-- Solution: add an explicit WITH CHECK that only verifies ownership + role,
-- without the ended_at IS NULL restriction (which only needs to apply before).

DROP POLICY IF EXISTS "Operators can close their own active timer" ON public.time_entries;

CREATE POLICY "Operators can close their own active timer"
  ON public.time_entries FOR UPDATE
  USING (
    -- Only allow updating rows that are still open (active timer)
    auth.uid() = user_id
    AND ended_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'operator'
    )
  )
  WITH CHECK (
    -- After the update, only verify ownership + role (ended_at will now be set)
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'operator'
    )
  );


-- ============================================================================
-- ╔══ 0034_story_flag_and_deadline.sql
-- ============================================================================
-- Adds two new fields to requirements:
--   includes_story: boolean flag — when true, this requirement counts as +1
--                   towards the historia totals (derived story). Default false
--                   to avoid retroactively counting legacy rows.
--   deadline:       optional delivery date. Drives the Kanban card calendar
--                   icon color semaphore (green/yellow/amber/red) and the
--                   "Vencido" bubble for overdue items in non-terminal phases.

ALTER TABLE public.requirements
  ADD COLUMN includes_story boolean NOT NULL DEFAULT false;

ALTER TABLE public.requirements
  ADD COLUMN deadline date NULL;

CREATE INDEX IF NOT EXISTS idx_requirements_deadline
  ON public.requirements(deadline)
  WHERE deadline IS NOT NULL;


-- ============================================================================
-- ╔══ 0035_app_settings_anon_logo.sql
-- ============================================================================
-- Permitir a usuarios no autenticados (anon) leer únicamente la fila
-- `agency_logo_url` de app_settings. Necesario para que la página /login
-- (que se renderiza sin sesión) pueda mostrar el logo de la agencia.

CREATE POLICY "Anon can read agency logo setting" ON app_settings
  FOR SELECT
  TO anon
  USING (key = 'agency_logo_url');


-- ============================================================================
-- ╔══ 0036_fix_historia_limits_and_cycle_snapshots.sql
-- ============================================================================
-- Corrige los límites de historias en los planes y sincroniza los snapshots
-- de los ciclos activos para que reflejen los valores correctos.
--
-- Básico: 8 · Profesional: 20 · Premium: 24
--
-- Usa ILIKE para tolerar diferencias de mayúsculas y acento ('básico' / 'Basico').
-- Los ciclos cerrados NO se modifican — solo los ciclos en status = 'current'.

-- ── 1. Planes ──────────────────────────────────────────────────────────────

UPDATE plans
SET limits_json = limits_json || '{"historias": 8}'::jsonb
WHERE name ILIKE '%sico%'           -- básico, Basico, Básico …
  AND name NOT ILIKE '%cl%sico%';   -- excluye "clásico" si existiera

UPDATE plans
SET limits_json = limits_json || '{"historias": 20}'::jsonb
WHERE name ILIKE '%profesional%';

UPDATE plans
SET limits_json = limits_json || '{"historias": 24}'::jsonb
WHERE name ILIKE '%premium%';

-- ── 2. Ciclos activos ──────────────────────────────────────────────────────
-- Sobreescribe limits_snapshot_json.historias con el valor del plan actual del cliente.
-- El rollover (rollover_from_previous_json.historias) sigue sumándose en la app.

UPDATE billing_cycles bc
SET limits_snapshot_json = bc.limits_snapshot_json ||
  jsonb_build_object(
    'historias',
    (
      SELECT (p.limits_json ->> 'historias')::int
      FROM clients c
      JOIN plans p ON c.current_plan_id = p.id
      WHERE c.id = bc.client_id
        AND p.limits_json ? 'historias'
    )
  )
WHERE bc.status = 'current'
  AND EXISTS (
    SELECT 1
    FROM clients c
    JOIN plans p ON c.current_plan_id = p.id
    WHERE c.id = bc.client_id
      AND p.limits_json ? 'historias'
  );


-- ============================================================================
-- ╔══ 0037_fix_matrices_constraint.sql
-- ============================================================================
-- Incluye 'matriz_contenido' en el CHECK constraint de requirements.content_type.
-- La migración 0022 añadió el tipo en plans y cycles, pero nunca actualizó el
-- CHECK de la tabla requirements (originalmente definido en 0004), lo que hacía
-- fallar la inserción de cualquier requerimiento con content_type = 'matriz_contenido'.

ALTER TABLE public.requirements DROP CONSTRAINT IF EXISTS requirements_content_type_check;

ALTER TABLE public.requirements ADD CONSTRAINT requirements_content_type_check
  CHECK (content_type IN (
    'historia',
    'estatico',
    'video_corto',
    'reel',
    'short',
    'produccion',
    'reunion',
    'matriz_contenido'
  ));


-- ============================================================================
-- ╔══ 0038_weekly_distribution_reset.sql
-- ============================================================================
-- Re-siembra el desglose semanal por defecto para los 3 planes desde cero.
-- Versiones previas sólo incluían el plan Básico y no contemplaban 'historia'.
--
-- Totales mensuales (consistentes con 0036):
--   Básico:       8 historias · 4 estáticos · 2 videos cortos · 2 reels
--   Profesional: 20 historias · 8 estáticos · 4 videos cortos · 4 reels
--   Premium:     24 historias · 8 estáticos · 8 videos cortos · 4 reels
--
-- Distribución semanal:
--   Básico       : 2/1/1/0 (S1), 2/1/0/1 (S2), 2/1/1/0 (S3), 2/1/0/1 (S4)
--   Profesional  : 5/2/1/1 igual en las 4 semanas
--   Premium      : 6/2/2/1 igual en las 4 semanas

-- Wipe
UPDATE plans SET default_weekly_distribution_json = NULL;

-- Básico
UPDATE plans
SET default_weekly_distribution_json = '{
  "S1": {"historia": 2, "estatico": 1, "video_corto": 1, "reel": 0},
  "S2": {"historia": 2, "estatico": 1, "video_corto": 0, "reel": 1},
  "S3": {"historia": 2, "estatico": 1, "video_corto": 1, "reel": 0},
  "S4": {"historia": 2, "estatico": 1, "video_corto": 0, "reel": 1}
}'::jsonb
WHERE name ILIKE '%sico%'
  AND name NOT ILIKE '%cl%sico%';

-- Profesional
UPDATE plans
SET default_weekly_distribution_json = '{
  "S1": {"historia": 5, "estatico": 2, "video_corto": 1, "reel": 1},
  "S2": {"historia": 5, "estatico": 2, "video_corto": 1, "reel": 1},
  "S3": {"historia": 5, "estatico": 2, "video_corto": 1, "reel": 1},
  "S4": {"historia": 5, "estatico": 2, "video_corto": 1, "reel": 1}
}'::jsonb
WHERE name ILIKE '%profesional%';

-- Premium
UPDATE plans
SET default_weekly_distribution_json = '{
  "S1": {"historia": 6, "estatico": 2, "video_corto": 2, "reel": 1},
  "S2": {"historia": 6, "estatico": 2, "video_corto": 2, "reel": 1},
  "S3": {"historia": 6, "estatico": 2, "video_corto": 2, "reel": 1},
  "S4": {"historia": 6, "estatico": 2, "video_corto": 2, "reel": 1}
}'::jsonb
WHERE name ILIKE '%premium%';


-- ============================================================================
-- ╔══ 0039_weekly_distribution_override.sql
-- ============================================================================
-- Override semanal por ciclo. Guarda cómo el admin quiere redistribuir el contenido
-- dentro del ciclo cuando se sube o baja un límite. Formato idéntico al
-- default_weekly_distribution_json de plans: { S1: {...}, S2: {...}, ... }.

ALTER TABLE billing_cycles
  ADD COLUMN IF NOT EXISTS weekly_distribution_override_json jsonb;


-- ============================================================================
-- ╔══ 0040_inbox_chat.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0040: Inbox de chat interno entre miembros del equipo
-- ============================================================
-- Soporta DMs 1-a-1 entre cualquier par de usuarios y canales por tema
-- creados únicamente por admin. Polling-based (no Realtime).
-- Incluye adjuntos de archivos/imágenes en bucket privado.
-- ============================================================

-- ── conversations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type              text        NOT NULL CHECK (type IN ('dm','channel')),
  name              text,
  description       text,
  topic             text,
  created_by        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_channel_requires_name
    CHECK (type <> 'channel' OR (name IS NOT NULL AND char_length(trim(name)) > 0))
);

-- Nombre de canal único (case-insensitive) cuando aplica
CREATE UNIQUE INDEX IF NOT EXISTS conversations_channel_name_unique
  ON public.conversations (LOWER(name))
  WHERE type = 'channel';

CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx
  ON public.conversations (last_message_at DESC);

-- ── conversation_members ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id   uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at         timestamptz NOT NULL DEFAULT now(),
  last_read_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conversation_members_user_id_idx
  ON public.conversation_members (user_id);

-- ── messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id           uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  body              text        NOT NULL DEFAULT '',
  edited_at         timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at DESC);

-- ── message_attachments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    uuid        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path  text        NOT NULL,
  file_name     text        NOT NULL,
  file_size     bigint,
  mime_type     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_attachments_message_id_idx
  ON public.message_attachments (message_id);

-- ── Trigger: mantener last_message_at actualizado ────────────
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_conversation_last_message_on_insert ON public.messages;
CREATE TRIGGER bump_conversation_last_message_on_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE PROCEDURE public.bump_conversation_last_message();

-- ── Helper: membership check (SECURITY DEFINER para evitar recursión RLS) ─
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
     WHERE conversation_id = conv_id
       AND user_id = auth.uid()
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments   ENABLE ROW LEVEL SECURITY;

-- conversations
CREATE POLICY "Members can view their conversations"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_member(id));

CREATE POLICY "Any agency user can create DMs; only admins create channels"
  ON public.conversations FOR INSERT
  WITH CHECK (
    public.is_agency_user() AND (
      type = 'dm' OR public.is_admin()
    )
  );

CREATE POLICY "Admins can update channel metadata"
  ON public.conversations FOR UPDATE
  USING (type = 'channel' AND public.is_admin());

CREATE POLICY "Admins can delete channels"
  ON public.conversations FOR DELETE
  USING (type = 'channel' AND public.is_admin());

-- conversation_members
CREATE POLICY "Users see their own membership rows"
  ON public.conversation_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_conversation_member(conversation_id));

CREATE POLICY "Users can update their own membership (last_read_at)"
  ON public.conversation_members FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can leave a conversation or admins can expel from channels"
  ON public.conversation_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.conversations c
         WHERE c.id = conversation_id AND c.type = 'channel'
      )
    )
  );

-- Nota: INSERT en conversation_members se realiza desde server actions con
-- admin client (service role) para bootstrapear DMs idempotentes y agregar
-- miembros a canales. No se expone política de INSERT a clientes.

-- messages
CREATE POLICY "Members can view non-deleted messages"
  ON public.messages FOR SELECT
  USING (public.is_conversation_member(conversation_id) AND deleted_at IS NULL);

CREATE POLICY "Members can send messages as themselves"
  ON public.messages FOR INSERT
  WITH CHECK (
    public.is_conversation_member(conversation_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "Authors can edit their messages"
  ON public.messages FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Authors can delete their messages"
  ON public.messages FOR DELETE
  USING (user_id = auth.uid());

-- message_attachments
CREATE POLICY "Members can view attachments of visible messages"
  ON public.message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.id = message_attachments.message_id
         AND public.is_conversation_member(m.conversation_id)
         AND m.deleted_at IS NULL
    )
  );

CREATE POLICY "Members can insert attachments to their messages"
  ON public.message_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.id = message_attachments.message_id
         AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Author or admin can delete attachments"
  ON public.message_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.id = message_attachments.message_id
         AND (m.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- BUCKET MANUAL en Supabase Dashboard:
--
--   Nombre:   chat-attachments
--   Público:  no (privado; se sirven con signed URLs desde el server)
--   Convención de path: {conversation_id}/{message_id}/{filename}
--
--   Policies sugeridas (crear en Dashboard → Storage → Policies):
--
--   a) INSERT (subir adjunto):
--        authenticated, WITH CHECK:
--          public.is_conversation_member( (storage.foldername(name))[1]::uuid )
--
--   b) SELECT (descargar con signed URL o directo si se hiciera público):
--        authenticated, USING:
--          public.is_conversation_member( (storage.foldername(name))[1]::uuid )
--
--   c) DELETE:
--        authenticated, USING:
--          public.is_conversation_member( (storage.foldername(name))[1]::uuid )
--          AND public.is_admin()  -- opcional: restringir borrado a admin
--
--   Límite recomendado por archivo: 10 MB (configurar en Dashboard).
--
-- ─────────────────────────────────────────────────────────────────────────────


-- ============================================================================
-- ╔══ 0041_mentions_and_supervisor_channels.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0041: Menciones en requerimientos + permisos supervisor
-- ============================================================
-- Agrega:
--   1. Helper is_admin_or_supervisor() (equivalente a is_admin pero incluye supervisor)
--   2. Tabla requirement_mentions (satélite de requirement_messages)
--   3. Actualiza policies de 0040 para permitir crear/gestionar canales a supervisores
--
-- IMPORTANTE: reescribe policies de conversations y conversation_members
-- creadas en 0040. Usa DROP POLICY IF EXISTS antes de CREATE.
-- ============================================================

-- ── Helper: role in (admin, supervisor) ──────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT (SELECT role FROM public.users WHERE id = auth.uid())
         IN ('admin','supervisor');
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor() TO authenticated;

-- ── requirement_mentions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requirement_mentions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id            uuid        NOT NULL REFERENCES public.requirement_messages(id) ON DELETE CASCADE,
  requirement_id        uuid        NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  mentioned_user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mentioned_by_user_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  read_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requirement_mentions_unique UNIQUE (message_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS requirement_mentions_user_inbox_idx
  ON public.requirement_mentions (mentioned_user_id, read_at, created_at DESC);

ALTER TABLE public.requirement_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own mentions"
  ON public.requirement_mentions FOR SELECT
  USING (mentioned_user_id = auth.uid());

-- INSERT se hace desde server action con admin client; no hay política de INSERT pública.

CREATE POLICY "Users mark their mentions as read"
  ON public.requirement_mentions FOR UPDATE
  USING (mentioned_user_id = auth.uid());

-- ── Reescribir policies de 0040 (conversations) ──────────────
DROP POLICY IF EXISTS "Any agency user can create DMs; only admins create channels"
  ON public.conversations;

CREATE POLICY "Any agency user can create DMs; admin/supervisor create channels"
  ON public.conversations FOR INSERT
  WITH CHECK (
    public.is_agency_user() AND (
      type = 'dm' OR public.is_admin_or_supervisor()
    )
  );

DROP POLICY IF EXISTS "Admins can update channel metadata"
  ON public.conversations;

CREATE POLICY "Admin or supervisor can update channel metadata"
  ON public.conversations FOR UPDATE
  USING (type = 'channel' AND public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "Admins can delete channels"
  ON public.conversations;

CREATE POLICY "Admin or supervisor can delete channels"
  ON public.conversations FOR DELETE
  USING (type = 'channel' AND public.is_admin_or_supervisor());

-- ── Reescribir policies de 0040 (conversation_members) ───────
DROP POLICY IF EXISTS "Users can leave a conversation or admins can expel from channels"
  ON public.conversation_members;

CREATE POLICY "Users leave or admin/supervisor expel from channels"
  ON public.conversation_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin_or_supervisor()
      AND EXISTS (
        SELECT 1 FROM public.conversations c
         WHERE c.id = conversation_id AND c.type = 'channel'
      )
    )
  );


-- ============================================================================
-- ╔══ 0042_agency_assets_bucket_policies.sql
-- ============================================================================
-- Policies faltantes para el bucket `agency-assets`.
-- La migración 0030_app_settings.sql documentó estas policies como comentarios
-- pero nunca se registraron como SQL ejecutable — causa del error
-- "new row violates row-level security policy" al subir el logo de agencia.
--
-- Requisito previo: el bucket `agency-assets` debe existir (Storage → New bucket
-- → Name: "agency-assets" → Public: ON). SELECT es público por configuración del
-- bucket, por eso no se crea policy de SELECT aquí.

create policy "admins_insert_agency_assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'agency-assets'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admins_update_agency_assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'agency-assets'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admins_delete_agency_assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'agency-assets'
    and exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );


-- ============================================================================
-- ╔══ 0043_admin_delete_messages.sql
-- ============================================================================
-- Admins pueden borrar mensajes en cualquier chat.
-- Para `messages` (DMs y canales) la app hace soft-delete con UPDATE deleted_at.
-- Para `requirement_messages` no hay columna deleted_at -> delete real.

-- messages: consolidamos Authors + admins en UNA sola policy de UPDATE
-- (elimina cualquier edge-case con OR entre múltiples permissive policies).
drop policy if exists "Authors can edit their messages" on public.messages;
drop policy if exists "admins_update_messages"          on public.messages;
drop policy if exists "authors_or_admins_update_messages" on public.messages;

create policy "authors_or_admins_update_messages"
  on public.messages for update to authenticated
  using     ( user_id = auth.uid() or public.is_admin() )
  with check( user_id = auth.uid() or public.is_admin() );

-- Lo mismo para DELETE (hard-delete) por si en el futuro se usa.
drop policy if exists "Authors can delete their messages" on public.messages;
drop policy if exists "authors_or_admins_delete_messages" on public.messages;

create policy "authors_or_admins_delete_messages"
  on public.messages for delete to authenticated
  using ( user_id = auth.uid() or public.is_admin() );

-- requirement_messages: antes no tenía DELETE policy. Autor o admin.
drop policy if exists "authors_or_admins_delete_requirement_messages" on public.requirement_messages;
create policy "authors_or_admins_delete_requirement_messages"
  on public.requirement_messages for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

-- Pedir a PostgREST que recargue su cache de schema.
notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0044_content_review.sql
-- ============================================================================
-- Feature: Revisión de contenido (estilo Frame.io / Skool) dentro de RequirementModal.
-- 4 tablas: review_assets (archivo lógico), review_versions (cada versión subida),
-- review_pins (punto de revisión posicional — y temporal en videos) y review_comments
-- (thread anclado al pin, con respuestas anidadas un nivel).
--
-- Decisiones del diseño:
--   * Cada VERSIÓN es independiente: sus pines no "viajan" a la siguiente versión.
--   * Pin numbering secuencial por versión (review_pins.pin_number, UNIQUE por version_id).
--   * Threads: review_comments.parent_id NULL = comentario raíz; no-NULL = respuesta.
--   * Permisos: todos los agency users pueden crear/resolver/reabrir/eliminar.
--   * Realtime habilitado en las 4 tablas para colaboración live.
--
-- Requisitos: bucket `review-files` debe existir en Storage (ver 0045).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. review_assets
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.review_assets (
  id              uuid primary key default gen_random_uuid(),
  requirement_id  uuid not null references public.requirements(id) on delete cascade,
  name            text not null,
  kind            text not null check (kind in ('image','video')),
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create index if not exists review_assets_requirement_idx on public.review_assets(requirement_id);
create index if not exists review_assets_archived_idx    on public.review_assets(archived_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. review_versions
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.review_versions (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid not null references public.review_assets(id) on delete cascade,
  version_number  int  not null,
  storage_path    text not null,
  mime_type       text not null,
  byte_size       bigint not null,
  thumbnail_path  text,
  duration_ms     int,
  uploaded_by     uuid references public.users(id),
  uploaded_at     timestamptz not null default now(),
  unique (asset_id, version_number)
);

create index if not exists review_versions_asset_idx on public.review_versions(asset_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. review_pins
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.review_pins (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references public.review_versions(id) on delete cascade,
  pin_number    int  not null,
  pos_x_pct     numeric(6,3) not null check (pos_x_pct between 0 and 100),
  pos_y_pct     numeric(6,3) not null check (pos_y_pct between 0 and 100),
  timestamp_ms  int check (timestamp_ms is null or timestamp_ms >= 0),
  status        text not null default 'active' check (status in ('active','resolved')),
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  resolved_by   uuid references public.users(id),
  resolved_at   timestamptz,
  unique (version_id, pin_number)
);

create index if not exists review_pins_version_idx on public.review_pins(version_id);
create index if not exists review_pins_status_idx  on public.review_pins(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. review_comments
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.review_comments (
  id          uuid primary key default gen_random_uuid(),
  pin_id      uuid not null references public.review_pins(id) on delete cascade,
  parent_id   uuid references public.review_comments(id) on delete cascade,
  user_id     uuid references public.users(id),
  body        text not null check (length(body) > 0),
  edited_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists review_comments_pin_idx    on public.review_comments(pin_id);
create index if not exists review_comments_parent_idx on public.review_comments(parent_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — patrón is_agency_user() (mismo que el resto del CRM)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.review_assets   enable row level security;
alter table public.review_versions enable row level security;
alter table public.review_pins     enable row level security;
alter table public.review_comments enable row level security;

-- review_assets
create policy "Agency users view review_assets"
  on public.review_assets for select
  using (public.is_agency_user());

create policy "Agency users insert review_assets"
  on public.review_assets for insert
  with check (public.is_agency_user());

create policy "Agency users update review_assets"
  on public.review_assets for update
  using (public.is_agency_user());

create policy "Agency users delete review_assets"
  on public.review_assets for delete
  using (public.is_agency_user());

-- review_versions
create policy "Agency users view review_versions"
  on public.review_versions for select
  using (public.is_agency_user());

create policy "Agency users insert review_versions"
  on public.review_versions for insert
  with check (public.is_agency_user());

create policy "Agency users update review_versions"
  on public.review_versions for update
  using (public.is_agency_user());

create policy "Agency users delete review_versions"
  on public.review_versions for delete
  using (public.is_agency_user());

-- review_pins
create policy "Agency users view review_pins"
  on public.review_pins for select
  using (public.is_agency_user());

create policy "Agency users insert review_pins"
  on public.review_pins for insert
  with check (public.is_agency_user());

create policy "Agency users update review_pins"
  on public.review_pins for update
  using (public.is_agency_user());

create policy "Agency users delete review_pins"
  on public.review_pins for delete
  using (public.is_agency_user());

-- review_comments
create policy "Agency users view review_comments"
  on public.review_comments for select
  using (public.is_agency_user());

create policy "Agency users insert review_comments"
  on public.review_comments for insert
  with check (public.is_agency_user());

create policy "Agency users update review_comments"
  on public.review_comments for update
  using (public.is_agency_user() and (user_id = auth.uid() or public.is_admin()));

create policy "Agency users delete review_comments"
  on public.review_comments for delete
  using (public.is_agency_user() and (user_id = auth.uid() or public.is_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime: habilitar en la publicación supabase_realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.review_assets';
    execute 'alter publication supabase_realtime add table public.review_versions';
    execute 'alter publication supabase_realtime add table public.review_pins';
    execute 'alter publication supabase_realtime add table public.review_comments';
  end if;
exception when duplicate_object then
  -- tablas ya incluidas en la publicación — ignorar
  null;
end$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTs explícitos — requerido por Supabase para que PostgREST exponga las
-- tablas vía API. Sin esto, la API responde "Could not find the table in the
-- schema cache" aunque la tabla exista y las policies estén bien.
-- La seguridad real la provee RLS; estos GRANT solo permiten a PostgREST
-- consultar metadata y ejecutar los queries sujetos a las policies.
-- ─────────────────────────────────────────────────────────────────────────────
grant all on public.review_assets   to anon, authenticated, service_role;
grant all on public.review_versions to anon, authenticated, service_role;
grant all on public.review_pins     to anon, authenticated, service_role;
grant all on public.review_comments to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0045_review_files_bucket.sql
-- ============================================================================
-- Bucket de archivos para la feature de Revisión de contenido (0044).
-- Privado: accesos por signed URL. Los paths contienen requirement_id + asset_id + versión.
-- Estructura: review-files/{requirement_id}/{asset_id}/v{version_number}.{ext}
--   Thumbnails: review-files/{requirement_id}/{asset_id}/v{version_number}.thumb.jpg
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CREAR BUCKET MANUAL en Supabase Dashboard (Storage → New bucket):
--
--   Nombre:               review-files
--   Público:              NO (privado)
--   File size limit:      200 MB (209715200 bytes)
--   Allowed MIME types:   image/jpeg, image/png, image/webp, image/gif,
--                         video/mp4, video/webm, video/quicktime
--
-- Las políticas RLS se crean con este SQL.
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT: cualquier agency user puede listar/leer objetos del bucket.
create policy "agency_select_review_files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'review-files'
    and public.is_agency_user()
  );

-- INSERT: cualquier agency user puede subir archivos.
create policy "agency_insert_review_files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'review-files'
    and public.is_agency_user()
  );

-- UPDATE: cualquier agency user puede reemplazar archivos (upsert).
create policy "agency_update_review_files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'review-files'
    and public.is_agency_user()
  );

-- DELETE: cualquier agency user puede borrar (por ejemplo al eliminar una versión).
create policy "agency_delete_review_files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'review-files'
    and public.is_agency_user()
  );


-- ============================================================================
-- ╔══ 0046_relax_message_body_check.sql
-- ============================================================================
-- Permitir body vacío en requirement_messages cuando el mensaje trae un adjunto.
-- El constraint original (0010_chat_timesheet) exigía body no vacío; 0026 agregó
-- los campos de attachment pero no relajó el check. El proyecto viejo tenía el
-- cambio aplicado manualmente, así que al migrar al proyecto Pro se perdió.

alter table public.requirement_messages
  drop constraint if exists requirement_messages_body_check;

alter table public.requirement_messages
  add constraint requirement_messages_body_check
  check (char_length(trim(body)) > 0 or attachment_path is not null);


-- ============================================================================
-- ╔══ 0047_review_comment_mentions.sql
-- ============================================================================
-- Menciones en comentarios de la feature de Revisión (0044).
-- Paralela a `requirement_mentions` (0041): cada fila es una mención específica
-- de un usuario dentro de un comentario de pin. El notif feed la expone como
-- `kind: 'mention'` con campos extra que identifican el pin y el asset.

create table if not exists public.review_comment_mentions (
  id                    uuid primary key default gen_random_uuid(),
  comment_id            uuid not null references public.review_comments(id) on delete cascade,
  requirement_id        uuid not null references public.requirements(id) on delete cascade,
  mentioned_user_id     uuid not null references public.users(id) on delete cascade,
  mentioned_by_user_id  uuid references public.users(id) on delete set null,
  read_at               timestamptz,
  created_at            timestamptz not null default now(),
  unique (comment_id, mentioned_user_id)
);

create index if not exists review_comment_mentions_user_unread_idx
  on public.review_comment_mentions (mentioned_user_id, created_at desc)
  where read_at is null;

create index if not exists review_comment_mentions_comment_idx
  on public.review_comment_mentions (comment_id);

alter table public.review_comment_mentions enable row level security;

-- SELECT: usuario mencionado, quien menciona, o admin
create policy "review_mentions_select"
  on public.review_comment_mentions for select
  using (
    mentioned_user_id = auth.uid()
    or mentioned_by_user_id = auth.uid()
    or public.is_admin()
  );

-- INSERT: cualquier agency user (lo inserta el server action con admin client,
-- pero dejamos la policy por consistencia con el patrón del resto del CRM)
create policy "review_mentions_insert"
  on public.review_comment_mentions for insert
  with check (public.is_agency_user());

-- UPDATE: el propio usuario mencionado (para marcar como leída)
create policy "review_mentions_update_own"
  on public.review_comment_mentions for update
  using (mentioned_user_id = auth.uid());

-- GRANTs requeridos para PostgREST
grant all on public.review_comment_mentions to anon, authenticated, service_role;

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.review_comment_mentions';
  end if;
exception when duplicate_object then
  null;
end$$;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0048_billing_module.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0048: Módulo de Facturación y Cotización
-- ============================================================
-- Añade:
--   1. Campos fiscales en `clients` (razón social, NIT, NRC, DUI, dirección, giro, IVA default).
--   2. Tabla `company_settings` (singleton con datos fiscales de FM como emisor).
--   3. Tablas `invoices` / `invoice_items`, `quotes` / `quote_items`.
--   4. Secuencias de correlativos anuales para INV-YYYYnnnnnnn y QUO-YYYYnnnnnnn.
--   5. Trigger que restringe edición de campos fiscales de `clients` a admins.
--   6. RLS (admin UPDATE; agency users SELECT) sobre todas las tablas nuevas.
-- ============================================================

-- ── 1. Campos fiscales en clients ────────────────────────────
alter table public.clients
  add column if not exists legal_name       text,
  add column if not exists person_type      text check (person_type in ('natural','juridical')),
  add column if not exists nit              text,
  add column if not exists nrc              text,
  add column if not exists dui              text,
  add column if not exists fiscal_address   text,
  add column if not exists giro             text,
  add column if not exists country_code     text default 'SV',
  add column if not exists default_tax_rate numeric(5,4) default 0.13;

-- Trigger: solo admins pueden modificar campos fiscales.
create or replace function public.clients_fiscal_admin_only()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' and not public.is_admin() then
    if new.legal_name       is distinct from old.legal_name
    or new.person_type      is distinct from old.person_type
    or new.nit              is distinct from old.nit
    or new.nrc              is distinct from old.nrc
    or new.dui              is distinct from old.dui
    or new.fiscal_address   is distinct from old.fiscal_address
    or new.giro             is distinct from old.giro
    or new.country_code     is distinct from old.country_code
    or new.default_tax_rate is distinct from old.default_tax_rate then
      raise exception 'Solo los administradores pueden modificar los datos fiscales del cliente.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_fiscal_admin_only on public.clients;
create trigger clients_fiscal_admin_only
  before update on public.clients
  for each row execute procedure public.clients_fiscal_admin_only();


-- ── 2. company_settings (emisor) ─────────────────────────────
create table if not exists public.company_settings (
  id                         uuid primary key default gen_random_uuid(),
  legal_name                 text not null,
  trade_name                 text,
  nit                        text,
  nrc                        text,
  fiscal_address             text,
  giro                       text,
  phone                      text,
  email                      text,
  logo_url                   text,
  invoice_footer_note        text,
  payment_methods_json       jsonb not null default '[]'::jsonb,
  terms_and_conditions_json  jsonb not null default '[]'::jsonb,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references public.users(id)
);

alter table public.company_settings enable row level security;

create policy "company_settings_select_agency"
  on public.company_settings for select
  using (public.is_agency_user());

create policy "company_settings_insert_admin"
  on public.company_settings for insert
  with check (public.is_admin());

create policy "company_settings_update_admin"
  on public.company_settings for update
  using (public.is_admin());

create policy "company_settings_delete_admin"
  on public.company_settings for delete
  using (public.is_admin());

grant all on public.company_settings to anon, authenticated, service_role;

-- Seed inicial con datos oficiales de FM (tarjeta IVA).
insert into public.company_settings (
  legal_name, trade_name, nit, nrc,
  fiscal_address, giro,
  payment_methods_json, terms_and_conditions_json
)
select
  'MORATAYA DE FLOTRES, LAURA MARIA',
  'FM COMMUNICATION SOLUTIONS',
  '0467-1632-2',
  '371163-1',
  'Calle Belice, Psj. 4, Col. Centroamérica, #7, Distrito de San Salvador, Municipio de San Salvador Centro, Departamento de San Salvador',
  'Publicidad',
  '[
    {"id":"pm_bac","type":"bank","label":"Banco BAC","account_holder":"Laura María Morataya de Flores","account_number":"116244039","account_type":"Cuenta corriente"},
    {"id":"pm_card","type":"card","label":"Tarjeta de crédito/débito","note":"Solicitar enlace de pago al ejecutivo"}
  ]'::jsonb,
  '[
    {"id":"tc_01","order":1,"text":"Esta cotización tiene una validez de 15 días calendario a partir de la fecha de emisión."},
    {"id":"tc_02","order":2,"text":"Los precios están expresados en dólares de los Estados Unidos de América (USD)."},
    {"id":"tc_03","order":3,"text":"Para clientes locales (El Salvador) el IVA del 13% está incluido según indique la factura."},
    {"id":"tc_04","order":4,"text":"Para clientes del exterior los servicios se emiten exentos de IVA."},
    {"id":"tc_05","order":5,"text":"La aceptación de esta cotización implica el pago del 50% como anticipo para iniciar el servicio."},
    {"id":"tc_06","order":6,"text":"El saldo restante se cancela contra entrega del servicio/producto contratado."},
    {"id":"tc_07","order":7,"text":"Los tiempos de entrega se contabilizan a partir de la recepción del anticipo y del material requerido por el cliente."},
    {"id":"tc_08","order":8,"text":"Cualquier modificación fuera del alcance cotizado será cotizada por separado."},
    {"id":"tc_09","order":9,"text":"FM Communication Solutions se reserva los derechos de autor de todo material creativo hasta el pago total."},
    {"id":"tc_10","order":10,"text":"Los métodos de pago aceptados son transferencia bancaria y tarjeta de crédito/débito (ver datos de pago)."},
    {"id":"tc_11","order":11,"text":"Cualquier consulta sobre esta cotización puede dirigirse al ejecutivo asignado."}
  ]'::jsonb
where not exists (select 1 from public.company_settings);


-- ── 3. Secuencias de correlativos (por año) ───────────────────
-- Una secuencia global por tipo de documento; el año va prepended en el número formateado.
create sequence if not exists public.invoice_number_seq;
create sequence if not exists public.quote_number_seq;

-- RPCs para consumir correlativos (seguras para ser llamadas desde server actions).
create or replace function public.next_invoice_number()
returns text language plpgsql security definer as $$
declare
  n bigint;
  y int;
begin
  n := nextval('public.invoice_number_seq');
  y := extract(year from now())::int;
  return format('INV-%s%s', y, lpad(n::text, 7, '0'));
end;
$$;

create or replace function public.next_quote_number()
returns text language plpgsql security definer as $$
declare
  n bigint;
  y int;
begin
  n := nextval('public.quote_number_seq');
  y := extract(year from now())::int;
  return format('QUO-%s%s', y, lpad(n::text, 7, '0'));
end;
$$;

grant execute on function public.next_invoice_number() to authenticated;
grant execute on function public.next_quote_number() to authenticated;


-- ── 4. invoices + invoice_items ──────────────────────────────
create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  invoice_number        text unique not null,
  client_id             uuid not null references public.clients(id) on delete restrict,
  billing_cycle_id      uuid references public.billing_cycles(id) on delete set null,
  quote_id              uuid,  -- FK se añade después de crear quotes
  issue_date            date not null default current_date,
  due_date              date,
  currency              text not null default 'USD',
  subtotal              numeric(12,2) not null default 0,
  discount_amount       numeric(12,2) not null default 0,
  tax_rate              numeric(5,4)  not null default 0.13,
  tax_amount            numeric(12,2) not null default 0,
  total                 numeric(12,2) not null default 0,
  status                text not null default 'draft'
                          check (status in ('draft','issued','paid','void')),
  payment_date          date,
  payment_method        text,
  payment_reference     text,
  notes                 text,
  client_snapshot_json  jsonb not null,
  emitter_snapshot_json jsonb not null,
  void_reason           text,
  void_by               uuid references public.users(id),
  void_at               timestamptz,
  created_by            uuid references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists invoices_client_id_idx      on public.invoices (client_id);
create index if not exists invoices_billing_cycle_idx  on public.invoices (billing_cycle_id);
create index if not exists invoices_status_idx         on public.invoices (status);
create index if not exists invoices_issue_date_idx     on public.invoices (issue_date desc);

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute procedure public.update_updated_at();

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(12,2) not null,
  line_total  numeric(12,2) not null,
  sort_order  int not null default 0
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

-- SELECT: cualquier agency user (para que supervisores/admins vean el módulo).
create policy "invoices_select_agency"      on public.invoices      for select using (public.is_agency_user());
create policy "invoice_items_select_agency" on public.invoice_items for select using (public.is_agency_user());

-- INSERT/UPDATE/DELETE: solo admin (emisión controlada).
create policy "invoices_insert_admin" on public.invoices for insert with check (public.is_admin());
create policy "invoices_update_admin" on public.invoices for update using (public.is_admin());
create policy "invoices_delete_admin" on public.invoices for delete using (public.is_admin());

create policy "invoice_items_insert_admin" on public.invoice_items for insert with check (public.is_admin());
create policy "invoice_items_update_admin" on public.invoice_items for update using (public.is_admin());
create policy "invoice_items_delete_admin" on public.invoice_items for delete using (public.is_admin());

grant all on public.invoices      to anon, authenticated, service_role;
grant all on public.invoice_items to anon, authenticated, service_role;


-- ── 5. quotes + quote_items ──────────────────────────────────
create table if not exists public.quotes (
  id                     uuid primary key default gen_random_uuid(),
  quote_number           text unique not null,
  client_id              uuid not null references public.clients(id) on delete restrict,
  issue_date             date not null default current_date,
  valid_until            date,
  currency               text not null default 'USD',
  subtotal               numeric(12,2) not null default 0,
  discount_amount        numeric(12,2) not null default 0,
  tax_rate               numeric(5,4)  not null default 0.13,
  tax_amount             numeric(12,2) not null default 0,
  total                  numeric(12,2) not null default 0,
  status                 text not null default 'draft'
                           check (status in ('draft','sent','accepted','rejected','expired')),
  notes                  text,
  client_snapshot_json   jsonb not null,
  emitter_snapshot_json  jsonb not null,
  terms_snapshot_json    jsonb not null default '[]'::jsonb,
  converted_invoice_id   uuid references public.invoices(id) on delete set null,
  created_by             uuid references public.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists quotes_client_id_idx  on public.quotes (client_id);
create index if not exists quotes_status_idx     on public.quotes (status);
create index if not exists quotes_issue_date_idx on public.quotes (issue_date desc);

create trigger quotes_updated_at
  before update on public.quotes
  for each row execute procedure public.update_updated_at();

create table if not exists public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(12,2) not null,
  line_total  numeric(12,2) not null,
  sort_order  int not null default 0
);

create index if not exists quote_items_quote_id_idx on public.quote_items (quote_id);

-- FK bidireccional invoices.quote_id → quotes.id (ahora que quotes existe).
alter table public.invoices
  add constraint invoices_quote_id_fkey
  foreign key (quote_id) references public.quotes(id) on delete set null;

alter table public.quotes      enable row level security;
alter table public.quote_items enable row level security;

create policy "quotes_select_agency"      on public.quotes      for select using (public.is_agency_user());
create policy "quote_items_select_agency" on public.quote_items for select using (public.is_agency_user());

create policy "quotes_insert_admin" on public.quotes for insert with check (public.is_admin());
create policy "quotes_update_admin" on public.quotes for update using (public.is_admin());
create policy "quotes_delete_admin" on public.quotes for delete using (public.is_admin());

create policy "quote_items_insert_admin" on public.quote_items for insert with check (public.is_admin());
create policy "quote_items_update_admin" on public.quote_items for update using (public.is_admin());
create policy "quote_items_delete_admin" on public.quote_items for delete using (public.is_admin());

grant all on public.quotes      to anon, authenticated, service_role;
grant all on public.quote_items to anon, authenticated, service_role;


-- ── 6. Reload PostgREST schema ───────────────────────────────
notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0049_review_version_files.sql
-- ============================================================================
-- Feature: versiones multi-archivo en el sistema de revisión.
-- Hoy cada review_version tiene UN archivo (storage_path). Ahora una versión
-- puede componerse de N archivos (ej. carrusel de 5 imágenes). Los pines pasan
-- a referenciar un archivo específico dentro de la versión.
--
-- Compatibilidad:
--   * review_versions.storage_path / thumbnail_path / mime_type se conservan
--     por compat (backfill copia a review_version_files el primer archivo).
--     El frontend deja de usarlos.
--   * review_pins.file_id es NULLABLE; pines legacy quedan ligados al único
--     file_order=0 de su versión (vía backfill).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. review_version_files
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.review_version_files (
  id             uuid primary key default gen_random_uuid(),
  version_id     uuid not null references public.review_versions(id) on delete cascade,
  file_order     int  not null,
  storage_path   text not null,
  thumbnail_path text,
  mime_type      text not null,
  byte_size      bigint not null,
  duration_ms    int,
  created_at     timestamptz not null default now(),
  unique (version_id, file_order)
);

create index if not exists review_version_files_version_idx
  on public.review_version_files(version_id, file_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. review_pins.file_id
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.review_pins
  add column if not exists file_id uuid references public.review_version_files(id) on delete cascade;

create index if not exists review_pins_file_idx on public.review_pins(file_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.review_version_files
  (version_id, file_order, storage_path, thumbnail_path, mime_type, byte_size, duration_ms)
select v.id, 0, v.storage_path, v.thumbnail_path, v.mime_type, coalesce(v.byte_size, 0), v.duration_ms
  from public.review_versions v
  left join public.review_version_files f
    on f.version_id = v.id and f.file_order = 0
 where v.storage_path is not null
   and f.id is null;

update public.review_pins p
   set file_id = f.id
  from public.review_version_files f
 where f.version_id = p.version_id
   and f.file_order = 0
   and p.file_id is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — mismo patrón is_agency_user() que el resto de tablas de review
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.review_version_files enable row level security;

create policy "Agency users view review_version_files"
  on public.review_version_files for select
  using (public.is_agency_user());

create policy "Agency users insert review_version_files"
  on public.review_version_files for insert
  with check (public.is_agency_user());

create policy "Agency users update review_version_files"
  on public.review_version_files for update
  using (public.is_agency_user());

create policy "Agency users delete review_version_files"
  on public.review_version_files for delete
  using (public.is_agency_user());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.review_version_files';
  end if;
exception when duplicate_object then
  null;
end$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. GRANTs
-- ─────────────────────────────────────────────────────────────────────────────
grant all on public.review_version_files to anon, authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0050_inbox_realtime.sql
-- ============================================================================
-- Habilita Supabase Realtime para el chat interno.
-- Antes: useInboxPolling.ts se suscribía a postgres_changes, pero las tablas no
-- estaban en la publicación supabase_realtime, por lo que los eventos nunca
-- llegaban y la UI dependía de un poll de seguridad de 60s.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.messages';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.conversations';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.conversation_members';
    exception when duplicate_object then null;
    end;
  end if;
end$$;

-- REPLICA IDENTITY FULL para que el payload de UPDATE/DELETE incluya todas las
-- columnas (el cliente filtra por conversation_id en payload.old de DELETE).
alter table public.messages replica identity full;
alter table public.conversation_members replica identity full;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0051_calendar_events.sql
-- ============================================================================
-- Calendar feature: adds scheduling fields to requirements and time_entries.
--
-- requirements.starts_at  — exact start timestamp for reunion/produccion types.
--                           Arts-type requirements continue using deadline (date, all-day).
--                           Legacy reunion/produccion rows keep starts_at NULL and will be
--                           shown as all-day events on their deadline until manually edited.
--
-- time_entries.scheduled_* — planned calendar events for internal meetings (no client).
--                            These are inserted by admins/supervisors from the calendar UI.
--                            The timer is NOT started automatically; users mark real time
--                            as always. To avoid conflicting with the one-active-timer
--                            constraint (ended_at IS NULL), server actions must set
--                            ended_at = scheduled_at (i.e. immediately "closed") when
--                            inserting scheduled events.

-- ── requirements ────────────────────────────────────────────────────────────

ALTER TABLE public.requirements
  ADD COLUMN starts_at timestamptz;

CREATE INDEX idx_requirements_starts_at
  ON public.requirements (starts_at)
  WHERE starts_at IS NOT NULL;

-- ── time_entries ─────────────────────────────────────────────────────────────

ALTER TABLE public.time_entries
  ADD COLUMN scheduled_at               timestamptz,
  ADD COLUMN scheduled_duration_minutes integer,
  ADD COLUMN scheduled_attendees        uuid[] DEFAULT '{}';

CREATE INDEX idx_time_entries_scheduled_at
  ON public.time_entries (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- GIN index for attendee lookups: auth.uid() = any(scheduled_attendees)
CREATE INDEX idx_time_entries_scheduled_attendees
  ON public.time_entries USING GIN (scheduled_attendees)
  WHERE array_length(scheduled_attendees, 1) > 0;


-- ============================================================================
-- ╔══ 0052_client_portal_foundations.sql
-- ============================================================================
-- 0052_client_portal_foundations.sql
-- Fundamentos del Portal del Cliente:
-- 1) rol 'client' + refactor is_agency_user
-- 2) tabla client_users (user ↔ cliente N:N)
-- 3) helper is_client_of
-- 4) flag visible_to_client en requirement_messages
-- 5) tabla renewal_requests
-- 6) policies complementarias (staff OR client_of) en tablas expuestas al portal
--
-- Nota de schema: public.requirements NO tiene columna client_id. El vínculo al
-- cliente pasa por billing_cycle_id → billing_cycles.client_id. Las policies del
-- cliente sobre requirements y requirement_messages hacen join a billing_cycles.

begin;

-- 1) Ampliar CHECK de users.role
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('admin','supervisor','operator','client'));

-- 1b) Refactor is_agency_user: excluir role='client'
create or replace function public.is_agency_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','supervisor','operator')
  );
$$;

-- 2) client_users
create table public.client_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index client_users_user_idx on public.client_users(user_id);
create index client_users_client_idx on public.client_users(client_id);
alter table public.client_users enable row level security;

-- RLS client_users: staff lee todo; cliente solo sus propias filas
create policy "Agency users can view client_users"
  on public.client_users for select
  using (public.is_agency_user());
create policy "Clients can view their own client_users"
  on public.client_users for select
  using (user_id = auth.uid());
create policy "Admins manage client_users"
  on public.client_users for all
  using (public.is_admin())
  with check (public.is_admin());

-- 3) Helper is_client_of(client_id)
create or replace function public.is_client_of(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.client_users
    where user_id = auth.uid()
      and client_id = target_client_id
  );
$$;

-- 4) visible_to_client en requirement_messages
alter table public.requirement_messages
  add column if not exists visible_to_client boolean not null default false;
create index if not exists requirement_messages_visible_client_idx
  on public.requirement_messages(requirement_id)
  where visible_to_client = true;

-- 5) renewal_requests
create table public.renewal_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  requested_by uuid not null references public.users(id),
  from_cycle_id uuid references public.billing_cycles(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','completed')),
  rollover_items_json jsonb not null default '[]'::jsonb,
  addons_json jsonb not null default '{}'::jsonb,
  admin_notes text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.users(id)
);
create index renewal_requests_client_idx on public.renewal_requests(client_id);
create index renewal_requests_status_idx on public.renewal_requests(status);
alter table public.renewal_requests enable row level security;

create policy "Staff or owner-client can view renewal_requests"
  on public.renewal_requests for select
  using (public.is_agency_user() or public.is_client_of(client_id));
create policy "Owner-client can create renewal_requests"
  on public.renewal_requests for insert
  with check (public.is_client_of(client_id) and requested_by = auth.uid());
create policy "Admin can decide renewal_requests"
  on public.renewal_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- 6) Extender policies existentes para que clients vean lo suyo.
--    Patrón: añadir policies PERMISSIVE adicionales (no alterar las de staff).

-- clients
create policy "Client can view own client row"
  on public.clients for select
  using (public.is_client_of(id));

-- billing_cycles
create policy "Client can view own cycles"
  on public.billing_cycles for select
  using (public.is_client_of(client_id));

-- requirements (no tiene client_id directo; join via billing_cycles)
create policy "Client can view own requirements"
  on public.requirements for select
  using (
    exists (
      select 1 from public.billing_cycles bc
      where bc.id = requirements.billing_cycle_id
        and public.is_client_of(bc.client_id)
    )
  );

-- requirement_messages: cliente solo ve visible_to_client=true
-- (el join pasa por requirements → billing_cycles para llegar al client_id)
create policy "Client can view visible messages"
  on public.requirement_messages for select
  using (
    visible_to_client = true
    and exists (
      select 1
      from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = requirement_messages.requirement_id
        and public.is_client_of(bc.client_id)
    )
  );
create policy "Client can insert visible messages"
  on public.requirement_messages for insert
  with check (
    visible_to_client = true
    and user_id = auth.uid()
    and exists (
      select 1
      from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = requirement_id
        and public.is_client_of(bc.client_id)
    )
  );

-- invoices / quotes (schema de 0048)
create policy "Client can view own invoices"
  on public.invoices for select
  using (public.is_client_of(client_id));
create policy "Client can view own quotes"
  on public.quotes for select
  using (public.is_client_of(client_id));

-- Nota: calendar-related (time_entries) se cubrirá en Fase 3 cuando
-- se defina exactamente qué debe ver el cliente. Por ahora sus policies
-- siguen siendo solo is_agency_user().

commit;


-- ============================================================================
-- ╔══ 0053_client_self_read_policies.sql
-- ============================================================================
-- 0053_client_self_read_policies.sql
-- La migración 0052 refactorizó is_agency_user() para excluir 'client',
-- pero no añadió políticas de auto-lectura para clientes en las tablas
-- que solo tenían políticas basadas en is_agency_user().
-- Sin esto, los clientes no pueden leer su propio perfil en public.users
-- y cualquier layout que haga from('users').select().eq('id', uid) devuelve null,
-- causando loops de redirect.

begin;

-- Permitir que cada usuario lea su propia fila en public.users
create policy "Users can read own profile"
  on public.users for select
  using (auth.uid() = id);

commit;


-- ============================================================================
-- ╔══ 0054_portal_client_rls_items_and_plans.sql
-- ============================================================================
-- 0054_portal_client_rls_items_and_plans.sql
-- Políticas SELECT faltantes para que los clientes del portal puedan leer:
-- 1) invoice_items  — la factura del cliente sin líneas de detalle se ve vacía
-- 2) quote_items    — mismo caso para cotizaciones
-- 3) plans          — Mi Empresa muestra el plan contratado (read-only)
--
-- La migración 0052 agregó policies para invoices/quotes via is_client_of(client_id),
-- pero no para las tablas de items ni para plans.

begin;

-- 1) invoice_items: cliente puede ver las líneas de sus propias facturas
create policy "invoice_items_select_client" on public.invoice_items
  for select
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.is_client_of(i.client_id)
    )
  );

-- 2) quote_items: cliente puede ver las líneas de sus propias cotizaciones
create policy "quote_items_select_client" on public.quote_items
  for select
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and public.is_client_of(q.client_id)
    )
  );

-- 3) plans: cliente puede ver el plan asignado a sus clients vinculados.
--    Nota: la policy "Agency users can view plans" de 0001 sigue activa para staff.
create policy "plans_select_own_via_clients" on public.plans
  for select
  using (
    exists (
      select 1 from public.clients c
      where c.current_plan_id = plans.id
        and public.is_client_of(c.id)
    )
  );

commit;


-- ============================================================================
-- ╔══ 0055_portal_client_review_access.sql
-- ============================================================================
-- 0055_portal_client_review_access.sql
-- Acceso del cliente al sistema de revisión (pines + comentarios) cuando
-- el requerimiento está en fase 'revision_cliente'. Aditivo a los policies
-- agency-only de 0044/0049. Al mover el requerimiento fuera de revision_cliente,
-- el cliente pierde acceso automáticamente (pero el data persiste).
--
-- Requisitos previos:
--   * public.is_client_of(uuid) — definida en migración 0052
--   * tablas review_assets / review_versions / review_version_files / review_pins / review_comments

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- review_assets — SELECT
-- ─────────────────────────────────────────────────────────────────────────────
create policy "review_assets_select_client" on public.review_assets
  for select
  using (
    exists (
      select 1 from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = review_assets.requirement_id
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- review_versions — SELECT
-- ─────────────────────────────────────────────────────────────────────────────
create policy "review_versions_select_client" on public.review_versions
  for select
  using (
    exists (
      select 1 from public.review_assets a
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where a.id = review_versions.asset_id
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- review_version_files — SELECT
-- ─────────────────────────────────────────────────────────────────────────────
create policy "review_version_files_select_client" on public.review_version_files
  for select
  using (
    exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_version_files.version_id
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- review_pins — SELECT + INSERT + UPDATE (comentario raíz del pin propio)
-- ─────────────────────────────────────────────────────────────────────────────
create policy "review_pins_select_client" on public.review_pins
  for select
  using (
    exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_pins.version_id
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

create policy "review_pins_insert_client" on public.review_pins
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_pins.version_id
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- review_comments — SELECT + INSERT
-- ─────────────────────────────────────────────────────────────────────────────
create policy "review_comments_select_client" on public.review_comments
  for select
  using (
    exists (
      select 1 from public.review_pins p
      join public.review_versions v on v.id = p.version_id
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where p.id = review_comments.pin_id
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

create policy "review_comments_insert_client" on public.review_comments
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.review_pins p
      join public.review_versions v on v.id = p.version_id
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where p.id = review_comments.pin_id
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: bucket `review-files` (privado). El cliente necesita leer archivos
-- y thumbnails para ver la última versión mientras deja pines.
-- Path layout: review-files/{requirement_id}/{asset_id}/v{n}.{ext}
--              review-files/{requirement_id}/{asset_id}/v{n}.thumb.jpg
-- Validamos que el primer segmento del path coincida con un requirement en
-- fase revision_cliente cuyo cliente esté vinculado al usuario del portal.
-- ─────────────────────────────────────────────────────────────────────────────
create policy "client_select_review_files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'review-files'
    and exists (
      select 1 from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id::text = split_part(name, '/', 1)
        and r.phase = 'revision_cliente'
        and public.is_client_of(bc.client_id)
    )
  );

commit;


-- ============================================================================
-- ╔══ 0056_requirement_messages_realtime.sql
-- ============================================================================
-- 0056_requirement_messages_realtime.sql
-- Habilita realtime para requirement_messages.
-- Sin esto, los postgres_changes del chat de requerimiento no disparan
-- en el cliente Supabase y el chat no actualiza en tiempo real.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'requirement_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.requirement_messages';
    end if;
  end if;
end $$;


-- ============================================================================
-- ╔══ 0057_billing_automation.sql
-- ============================================================================
-- 0057_billing_automation.sql
-- Auto-billing + biweekly invoice support.

alter table clients
  add column if not exists auto_billing boolean not null default false,
  add column if not exists is_foreign   boolean not null default false;

alter table invoices
  add column if not exists biweekly_half text
    check (biweekly_half in ('first','second'))
    default null;

-- 'first'  covers S1-S2; its payment updates billing_cycles.payment_status.
-- 'second' covers S3-S4; its payment updates billing_cycles.payment_status_2.
-- null     = monthly invoice or extra (no biweekly semantics).

create index if not exists idx_invoices_cycle_half
  on invoices (billing_cycle_id, biweekly_half)
  where billing_cycle_id is not null;

-- Nuevo estado 'scheduled' para ciclos pre-creados por el auto-billing.
-- Un ciclo 'scheduled' aún no ha iniciado; al expirar el ciclo 'current' anterior,
-- el cron lo promueve a 'current'.
alter table billing_cycles
  drop constraint if exists billing_cycles_status_check;

alter table billing_cycles
  add constraint billing_cycles_status_check
  check (status in ('current', 'archived', 'pending_renewal', 'scheduled'));

create index if not exists idx_billing_cycles_client_scheduled
  on billing_cycles (client_id)
  where status = 'scheduled';


-- ============================================================================
-- ╔══ 0058_notifications_realtime.sql
-- ============================================================================
-- Habilita realtime para las tablas fuente del feed de notificaciones.
-- Antes sólo estaban publicadas messages/conversations/conversation_members (0050)
-- y requirement_messages (0056), por eso el hook useNotifications dependía
-- del safety poll de 60s.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.requirement_mentions';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.review_comment_mentions';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.time_entries';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.invoices';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.requirements';
    exception when duplicate_object then null;
    end;
  end if;
end$$;

-- REPLICA IDENTITY FULL para que los payloads de UPDATE traigan todas las columnas
-- (necesario para filtrar por mentioned_user_id / assignees en el cliente).
alter table public.requirement_mentions replica identity full;
alter table public.review_comment_mentions replica identity full;
alter table public.time_entries replica identity full;
alter table public.requirements replica identity full;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0059_requirements_multi_consumption_and_cambio_void.sql
-- ============================================================================
-- 0059 — Multi-consumo de requerimientos + anulación de cambios registrados
-- ----------------------------------------------------------------------------
-- 1. Multi-consumo: el admin puede definir que un requerimiento descuente
--    cantidades específicas de uno o varios tipos de contenido del plan.
--    Map ContentType→cantidad guardado como JSONB. NULL/vacío = legacy
--    (1 del content_type + 1 historia si includes_story).
ALTER TABLE public.requirements
  ADD COLUMN IF NOT EXISTS consumption_overrides_json JSONB;

COMMENT ON COLUMN public.requirements.consumption_overrides_json IS
  'Solo admin. Map ContentType->cantidad. NULL = consumo legacy (1 del content_type + 1 historia si includes_story). Si tiene valores, reemplaza la lógica legacy.';

-- 2. Anulación de cambios registrados: el admin puede deshacer un cambio
--    capturado por error. El log queda en BD con auditoría completa, y
--    requirements.cambios_count se decrementa en la server action.
ALTER TABLE public.requirement_cambio_logs
  ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cambio_logs_active
  ON public.requirement_cambio_logs(requirement_id) WHERE voided = false;


-- ============================================================================
-- ╔══ 0060_n1co_integration.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0060: Integración con n1co business
-- ============================================================
-- Añade:
--   1. Campos n1co en `plans` (id de plan en n1co + links estáticos por plan).
--   2. Campos n1co en `clients` (suscripción + customer + payment method).
--   3. Campos n1co + DTE en `invoices` (link de pago + datos del DTE emitido).
--   4. Campos de configuración en `company_settings` (ambiente, location).
--   5. Tabla `n1co_payment_events` (auditoría completa de webhooks).
-- ============================================================

-- ── 1. plans: links estáticos + sync con n1co ───────────────
alter table public.plans
  add column if not exists n1co_plan_id                     text,
  add column if not exists n1co_payment_link_static_sandbox text,
  add column if not exists n1co_payment_link_static_prod    text,
  add column if not exists n1co_synced_at                   timestamptz;

-- Seed de los 3 links sandbox que el usuario ya creó manualmente.
update public.plans set n1co_payment_link_static_sandbox = 'https://pay-sandbox.n1co.shop/pl/2PGRcv1q'
  where lower(name) similar to '%(b[áa]sico)%' and n1co_payment_link_static_sandbox is null;
update public.plans set n1co_payment_link_static_sandbox = 'https://pay-sandbox.n1co.shop/pl/KEj9c0YV'
  where lower(name) like '%pro%' and lower(name) not like '%premium%' and n1co_payment_link_static_sandbox is null;
update public.plans set n1co_payment_link_static_sandbox = 'https://pay-sandbox.n1co.shop/pl/Q2O5Fdkw'
  where lower(name) like '%premium%' and n1co_payment_link_static_sandbox is null;


-- ── 2. clients: datos de suscripción n1co ───────────────────
alter table public.clients
  add column if not exists n1co_customer_id              text,
  add column if not exists n1co_subscription_id          text,
  add column if not exists n1co_payment_method_id        text,
  add column if not exists n1co_subscription_status      text,
  add column if not exists n1co_subscription_started_at  timestamptz,
  add column if not exists n1co_subscription_cancelled_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_n1co_subscription_status_check'
  ) then
    alter table public.clients
      add constraint clients_n1co_subscription_status_check
      check (n1co_subscription_status is null or n1co_subscription_status in ('Pending','Active','Inactive','Blocked','Error','Cancelled'));
  end if;
end $$;

create unique index if not exists clients_n1co_subscription_id_uq
  on public.clients(n1co_subscription_id)
  where n1co_subscription_id is not null;


-- ── 3. invoices: payment provider + datos n1co + datos DTE ──
alter table public.invoices
  add column if not exists payment_provider        text not null default 'manual',
  add column if not exists n1co_payment_link_id    text,
  add column if not exists n1co_payment_link_url   text,
  add column if not exists n1co_order_reference    text,
  add column if not exists n1co_order_id           text,
  add column if not exists n1co_buyer_email        text,
  add column if not exists n1co_buyer_name         text,
  add column if not exists n1co_paid_at            timestamptz,
  -- Datos del DTE generado (input manual del admin post-emisión, o auto-poblado si n1co lo expone)
  add column if not exists dte_codigo_generacion   uuid,
  add column if not exists dte_numero_control      text,
  add column if not exists dte_sello_recepcion     text,
  add column if not exists dte_tipo                text,
  add column if not exists dte_pdf_url             text,
  add column if not exists dte_received_at         timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_payment_provider_check'
  ) then
    alter table public.invoices
      add constraint invoices_payment_provider_check
      check (payment_provider in ('manual','n1co_subscription','n1co_link','n1co_link_oneoff','n1co_static'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_dte_tipo_check'
  ) then
    alter table public.invoices
      add constraint invoices_dte_tipo_check
      check (dte_tipo is null or dte_tipo in ('01','03','05','06','14'));
  end if;
end $$;

create unique index if not exists invoices_n1co_order_id_uq
  on public.invoices(n1co_order_id) where n1co_order_id is not null;

create unique index if not exists invoices_n1co_order_reference_uq
  on public.invoices(n1co_order_reference) where n1co_order_reference is not null;

create index if not exists invoices_payment_provider_status_idx
  on public.invoices(payment_provider, status);


-- ── 4. company_settings: configuración n1co ─────────────────
alter table public.company_settings
  add column if not exists n1co_environment        text not null default 'sandbox',
  add column if not exists n1co_location_code      text,
  add column if not exists n1co_location_id        integer,
  add column if not exists n1co_webhook_secret_hint text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_n1co_environment_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_n1co_environment_check
      check (n1co_environment in ('sandbox','production'));
  end if;
end $$;


-- ── 5. n1co_payment_events: auditoría completa de webhooks ──
create table if not exists public.n1co_payment_events (
  id                   uuid primary key default gen_random_uuid(),
  event_type           text not null,
  order_id             text,
  order_reference      text,
  payment_link_id      text,
  subscription_id      text,
  buyer_email          text,
  buyer_name           text,
  buyer_phone          text,
  buyer_external_id    text,
  metadata_json        jsonb,
  raw_payload_json     jsonb not null,
  hmac_signature       text,
  signature_valid      boolean,
  matched_invoice_id   uuid references public.invoices(id) on delete set null,
  matched_client_id    uuid references public.clients(id)  on delete set null,
  matching_strategy    text,
  processed            boolean not null default false,
  process_error        text,
  received_at          timestamptz not null default now()
);

create index if not exists n1co_payment_events_order_id_idx        on public.n1co_payment_events(order_id);
create index if not exists n1co_payment_events_subscription_id_idx on public.n1co_payment_events(subscription_id);
create index if not exists n1co_payment_events_buyer_email_idx     on public.n1co_payment_events(buyer_email);
create index if not exists n1co_payment_events_received_at_idx     on public.n1co_payment_events(received_at desc);

-- Idempotencia: un mismo (order_id, event_type) procesado no se aplica dos veces.
-- No es UNIQUE porque queremos guardar reintentos como auditoría — el handler
-- chequea si ya hay un row con processed=true antes de re-procesar.
create index if not exists n1co_payment_events_dedup_idx
  on public.n1co_payment_events(order_id, event_type, processed)
  where order_id is not null;

alter table public.n1co_payment_events enable row level security;

-- Solo admins pueden leer eventos (datos sensibles del comprador).
create policy "n1co_payment_events_select_admin"
  on public.n1co_payment_events for select
  using (public.is_admin());

-- INSERT/UPDATE: el webhook handler usa Service Role (bypassa RLS).
-- Los usuarios regulares no pueden insertar ni modificar eventos.


-- ── 6. Comentarios documentando el schema ───────────────────
comment on column public.invoices.payment_provider is
  'Origen del cobro: manual (efectivo/transferencia) | n1co_subscription | n1co_link (link dinámico por factura) | n1co_link_oneoff (paquete extra) | n1co_static (link estático fallback)';
comment on column public.invoices.n1co_order_reference is
  'Referencia externa que se mandó a n1co al crear el payment link (típicamente invoice.id). Permite matchear el webhook directamente.';
comment on column public.invoices.dte_codigo_generacion is
  'UUID v4 del DTE asignado por el Ministerio de Hacienda. Llenado manualmente por admin post-emisión, o auto-poblado si n1co lo expone vía webhook/API.';
comment on column public.invoices.dte_numero_control is
  'Número de control del DTE en formato DTE-XX-CCCCCCCC-NNNNNNNNNNNNNNN.';
comment on column public.invoices.dte_tipo is
  '01=Factura Consumidor Final, 03=Comprobante Crédito Fiscal, 05=Nota Crédito, 06=Nota Débito, 14=Sujeto Excluido';
comment on table public.n1co_payment_events is
  'Auditoría de todos los webhooks recibidos de n1co. Persistido siempre (firma válida o no) para debugging y conciliación.';


-- ============================================================================
-- ╔══ 0060_cambio_logs_approval_status.sql
-- ============================================================================
-- Aprobación de cambios registrados en requerimientos.
-- Los cambios creados por operadores quedan en 'pending' hasta que
-- un admin o supervisor los apruebe. Los existentes se marcan 'approved'.

ALTER TABLE public.requirement_cambio_logs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));

-- Índice para filtrar rápido por estado (aprobados activos)
CREATE INDEX IF NOT EXISTS idx_cambio_logs_status
  ON public.requirement_cambio_logs(requirement_id, status)
  WHERE voided = false;

COMMENT ON COLUMN public.requirement_cambio_logs.status IS
  'pending = esperando aprobación de admin/supervisor;
   approved = aprobado, ya contabilizado en cambios_count;
   rejected = rechazado, no contabilizado.
   Los registros pre-migración tienen DEFAULT ''approved''.';


-- ============================================================================
-- ╔══ 0061_auth_user_cleanup_helper.sql
-- ============================================================================
-- Helper: obtener el UUID de un usuario en auth.users por email.
-- Necesario porque PostgREST no expone el schema auth; solo service_role puede llamarlo.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = lower(p_email) LIMIT 1;
$$;

-- Solo service_role puede ejecutarla (los server actions usan el admin client)
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;


-- ============================================================================
-- ╔══ 0062_billing_retention.sql
-- ============================================================================
-- Migración 0062: Renta retenida (10%) y Total a Pagar
-- Toggle por cliente para aplicar renta retenida + nuevos campos en invoices/quotes
-- para distinguir entre Total en DTE y TOTAL A PAGAR (monto real al cobrar).

-- 1. Toggle por cliente: ¿es agente de retención?
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS aplica_renta_retenida BOOLEAN NOT NULL DEFAULT false;

-- 2. Snapshot fiscal en facturas
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS retention_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_renta_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_a_pagar NUMERIC(12,2);

-- 3. Snapshot fiscal en cotizaciones
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS retention_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_renta_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_a_pagar NUMERIC(12,2);

-- 4. Backfill: total_a_pagar = total para registros existentes (sin retención)
UPDATE public.invoices SET total_a_pagar = total WHERE total_a_pagar IS NULL;
UPDATE public.quotes   SET total_a_pagar = total WHERE total_a_pagar IS NULL;

-- 5. Hacer el campo NOT NULL después del backfill
ALTER TABLE public.invoices ALTER COLUMN total_a_pagar SET NOT NULL;
ALTER TABLE public.quotes   ALTER COLUMN total_a_pagar SET NOT NULL;


-- ============================================================================
-- ╔══ 0063_client_credits.sql
-- ============================================================================
-- Migración 0063: Créditos del cliente sin caducidad
-- Reemplaza el modelo de "paquetes atados al ciclo" por un saldo persistente.
-- Los créditos se generan al pagar facturas con `extras_metadata` poblado y se consumen
-- al aprobar cambios extras o al crear requerimientos por encima del límite del ciclo.
--
-- Reusa la función public.update_updated_at() (creada en 0001_init.sql) para
-- mantener `updated_at` sincronizado automáticamente.

-- 1. Tipos de crédito disponibles
create type credit_kind as enum (
  'cambios',
  'content_estatico',
  'content_video_corto',
  'content_reel',
  'content_short'
);

-- 2. Tabla principal
create table public.client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind credit_kind not null,
  qty_initial integer not null check (qty_initial > 0),
  qty_remaining integer not null check (qty_remaining >= 0),
  unit_price_usd numeric(12,2) not null default 0,
  source_invoice_id uuid references public.invoices(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una factura solo puede generar créditos una vez (idempotencia para webhooks).
create unique index idx_client_credits_unique_source
  on public.client_credits(source_invoice_id, kind)
  where source_invoice_id is not null;

-- Búsquedas rápidas de saldo disponible.
create index idx_client_credits_available
  on public.client_credits(client_id, kind)
  where qty_remaining > 0;

-- updated_at trigger usando la función existente public.update_updated_at()
create trigger trg_client_credits_updated_at
  before update on public.client_credits
  for each row execute function public.update_updated_at();

-- 3. Metadata de paquete extra en facturas
alter table public.invoices
  add column if not exists extras_metadata jsonb;

comment on column public.invoices.extras_metadata is
  'Si la factura corresponde a un paquete extra: { kind: "cambios"|"content", content_type?: ContentType, qty: number }. Al pagar, se materializa como crédito en client_credits.';

-- 4. Tracking de qué crédito pagó qué consumo (para reverso al anular)
alter table public.requirements
  add column if not exists paid_from_credit_id uuid references public.client_credits(id);

alter table public.requirement_cambio_logs
  add column if not exists paid_from_credit_id uuid references public.client_credits(id);

-- 5. RLS
alter table public.client_credits enable row level security;

-- Personal interno (admin, supervisor, operator) puede leer todos los créditos.
create policy "credits_select_internal" on public.client_credits
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role <> 'client'
    )
  );

-- Cliente solo lee los créditos de sus marcas.
create policy "credits_select_client" on public.client_credits
  for select using (public.is_client_of(client_id));

-- Sin policies INSERT/UPDATE/DELETE — solo desde server actions con admin client (service_role).


-- ============================================================================
-- ╔══ 0064_work_sessions.sql
-- ============================================================================
-- Migración 0064: Sesiones de jornada (clock in/out)
-- Independiente del sistema time_entries: mide "tiempo online" desde clock-in hasta clock-out,
-- con pausas (almuerzo / away) que se suman pero no cuentan como tiempo activo.
-- Sirve para comparar tiempo online vs tiempo productivo (suma de time_entries durante la jornada).

begin;

create type work_session_status as enum ('active', 'on_lunch', 'on_away', 'ended');

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status work_session_status not null default 'active',
  notes text,
  -- Pausas: array de { type: 'lunch'|'away', started_at, ended_at? }
  breaks_json jsonb not null default '[]'::jsonb,
  -- Calculados al cerrar la sesión
  total_seconds integer,           -- tiempo online sin pausas (started_at..ended_at − Σ pausas cerradas)
  productive_seconds integer,      -- suma de duration_seconds de time_entries del usuario en la ventana
  created_at timestamptz not null default now()
);

-- Solo una sesión activa por usuario (sin ended_at)
create unique index idx_work_sessions_one_active
  on public.work_sessions(user_id)
  where ended_at is null;

create index idx_work_sessions_user_started
  on public.work_sessions(user_id, started_at desc);

alter table public.work_sessions enable row level security;

-- Cada usuario gestiona sus propias sesiones
create policy "shifts_self" on public.work_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admins y supervisores pueden leer las sesiones de todos (para reportes)
create policy "shifts_admin_supervisor_select" on public.work_sessions
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'supervisor')
    )
  );

commit;


-- ============================================================================
-- ╔══ 0065_pdf_review_support.sql
-- ============================================================================
-- 0065_pdf_review_support.sql
-- Amplía el tipo de asset para soportar PDFs y agrega la columna de página en pines.

-- 1. Ampliar CHECK constraint en review_assets.kind
--    El constraint se auto-nombró review_assets_kind_check al crearse en 0044.
alter table public.review_assets
  drop constraint review_assets_kind_check,
  add constraint review_assets_kind_check
    check (kind in ('image', 'video', 'pdf'));

-- 2. Agregar page_number a review_pins (nullable — pines de imagen/video quedan NULL)
alter table public.review_pins
  add column if not exists page_number integer null;

comment on column public.review_pins.page_number is
  'Página del PDF (0-based). NULL para pines en imágenes o video.';


-- ============================================================================
-- ╔══ 0066_user_current_session.sql
-- ============================================================================
-- 0066_user_current_session.sql
-- Single-session-per-user enforcement.
-- Adds users.current_session_id (uuid). When a device logs in, it claims a new
-- UUID and writes it here. Other devices subscribe via realtime and notice the
-- mismatch with their locally-stored session id → they get force-logged-out.

alter table public.users
  add column if not exists current_session_id uuid;

-- Permitir al propio usuario actualizar su current_session_id (para llamar
-- claimSession() sin admin client). Solo se permite UPDATE de su propia fila.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_self_update_session'
  ) then
    create policy users_self_update_session on public.users
      for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

-- Asegurar que la tabla users esté en la publicación supabase_realtime para
-- que SessionSentinel pueda detectar el kick vía postgres_changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'users'
    ) then
      execute 'alter publication supabase_realtime add table public.users';
    end if;
  end if;
end $$;


-- ============================================================================
-- ╔══ 0067_impersonation_audit.sql
-- ============================================================================
-- 0067_impersonation_audit.sql
-- Tabla de auditoría para el modo espectador del admin.
-- Cada start/stop de impersonación registra una fila aquí. La cookie
-- httpOnly fm_impersonate_user_id es la fuente de verdad — esta tabla
-- solo provee trazabilidad para forensics.

create table if not exists public.impersonation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists impersonation_logs_admin_idx
  on public.impersonation_logs(admin_user_id, started_at desc);
create index if not exists impersonation_logs_target_idx
  on public.impersonation_logs(target_user_id, started_at desc);

alter table public.impersonation_logs enable row level security;

-- Lectura: solo admins pueden ver el log completo.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'impersonation_logs'
      and policyname = 'impersonation_logs_admin_read'
  ) then
    create policy impersonation_logs_admin_read on public.impersonation_logs
      for select using (
        exists (
          select 1 from public.users u
          where u.id = auth.uid() and u.role = 'admin'
        )
      );
  end if;
end $$;

-- INSERT/UPDATE solo via service role (admin client en server actions).
-- No se exponen políticas para esas operaciones.


-- ============================================================================
-- ╔══ 0068_fix_inbox_realtime.sql
-- ============================================================================
-- 0068_fix_inbox_realtime.sql
-- Re-asegura que las tablas del inbox estén en supabase_realtime.
-- La migración 0050 original no tenía guard "if not exists", por lo que
-- si alguna tabla ya estaba en la publicación, la ejecución fallaba
-- silenciosamente y las demás tablas no se añadían.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'conversations'
    ) then
      execute 'alter publication supabase_realtime add table public.conversations';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'conversation_members'
    ) then
      execute 'alter publication supabase_realtime add table public.conversation_members';
    end if;
  end if;
end $$;


-- ============================================================================
-- ╔══ 0069_voice_calls.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0069: Llamadas de voz/video estilo Discord
-- ============================================================
-- Agrega:
--   1) Tipo 'voice_channel' a conversations.type (canales de voz persistentes).
--   2) Tabla call_sessions: una fila por llamada (DM o canal).
--   3) Tabla call_participants: histórico de quién entró/salió de cada sesión.
--   4) RLS: solo miembros de la conversación ven/insertan/actualizan.
--   5) Realtime: call_sessions en publicación supabase_realtime.
--
-- El media de WebRTC NO pasa por Supabase — solo metadata. La señalización
-- "incoming call" viaja por Supabase Realtime broadcast, no por estas tablas.
-- ============================================================

-- ── 1) Extender conversations.type para canales de voz ──────────
do $$
declare
  cname text;
begin
  -- Drop el check constraint actual (nombre auto-generado por Postgres).
  -- Buscamos el check sobre la columna type específicamente.
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'conversations'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%dm%channel%'
  limit 1;

  if cname is not null then
    execute format('alter table public.conversations drop constraint %I', cname);
  end if;
end$$;

alter table public.conversations
  add constraint conversations_type_check
  check (type in ('dm','channel','voice_channel'));

-- Los voice_channel también requieren name (igual que channel)
alter table public.conversations
  drop constraint if exists conversations_channel_requires_name;

alter table public.conversations
  add constraint conversations_channel_requires_name
  check (
    type = 'dm'
    or (name is not null and char_length(trim(name)) > 0)
  );

-- ── 2) call_sessions ────────────────────────────────────────────
create table if not exists public.call_sessions (
  id                  uuid        primary key default gen_random_uuid(),
  conversation_id     uuid        not null references public.conversations(id) on delete cascade,
  started_by          uuid        not null references public.users(id) on delete cascade,
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  livekit_room_name   text        not null unique,
  modality            text        not null default 'voice'
                                  check (modality in ('voice','video','screen'))
);

create index if not exists call_sessions_conversation_active_idx
  on public.call_sessions (conversation_id)
  where ended_at is null;

create index if not exists call_sessions_started_at_idx
  on public.call_sessions (started_at desc);

-- ── 3) call_participants ────────────────────────────────────────
create table if not exists public.call_participants (
  session_id    uuid        not null references public.call_sessions(id) on delete cascade,
  user_id       uuid        not null references public.users(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  primary key (session_id, user_id, joined_at)
);

create index if not exists call_participants_user_idx
  on public.call_participants (user_id);

-- ── 4) RLS ──────────────────────────────────────────────────────
alter table public.call_sessions enable row level security;
alter table public.call_participants enable row level security;

drop policy if exists call_sessions_select on public.call_sessions;
create policy call_sessions_select on public.call_sessions
  for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = call_sessions.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_sessions_insert on public.call_sessions;
create policy call_sessions_insert on public.call_sessions
  for insert with check (
    started_by = auth.uid()
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = call_sessions.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_sessions_update on public.call_sessions;
create policy call_sessions_update on public.call_sessions
  for update using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = call_sessions.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_participants_select on public.call_participants;
create policy call_participants_select on public.call_participants
  for select using (
    exists (
      select 1 from public.call_sessions cs
      join public.conversation_members cm on cm.conversation_id = cs.conversation_id
      where cs.id = call_participants.session_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_participants_insert on public.call_participants;
create policy call_participants_insert on public.call_participants
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.call_sessions cs
      join public.conversation_members cm on cm.conversation_id = cs.conversation_id
      where cs.id = call_participants.session_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists call_participants_update on public.call_participants;
create policy call_participants_update on public.call_participants
  for update using (
    user_id = auth.uid()
    or exists (
      select 1 from public.call_sessions cs
      join public.conversation_members cm on cm.conversation_id = cs.conversation_id
      where cs.id = call_participants.session_id
        and cm.user_id = auth.uid()
    )
  );

-- ── 5) Realtime ─────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'call_sessions'
    ) then
      execute 'alter publication supabase_realtime add table public.call_sessions';
    end if;
  end if;
end$$;

alter table public.call_sessions replica identity full;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0070_call_sessions_room_name_partial_unique.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0070: arreglar unicidad de livekit_room_name
-- ============================================================
-- En 0069 se declaró `livekit_room_name UNIQUE` globalmente, pero la
-- convención `conv-{conversationId}` reusa siempre el mismo nombre de room
-- por conversación. Cuando termina una llamada y se inicia otra, el insert
-- falla con:
--   ERROR: duplicate key value violates unique constraint
--          "call_sessions_livekit_room_name_key"
--
-- Solución: la unicidad debe ser parcial — solo entre sesiones activas.
-- Una conversación puede tener N llamadas históricas con el mismo room name,
-- pero solo UNA activa a la vez.
-- ============================================================

-- 1) Drop la constraint UNIQUE global creada por la columna en 0069.
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'call_sessions'
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) ilike '%livekit_room_name%';

  if cname is not null then
    execute format('alter table public.call_sessions drop constraint %I', cname);
  end if;
end$$;

-- 2) Indice parcial que garantiza unicidad solo cuando la sesión sigue activa.
create unique index if not exists call_sessions_active_room_name_unique
  on public.call_sessions (livekit_room_name)
  where ended_at is null;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0071_force_team_members_in_channels.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0071: backfill de Laura y Samuel en canales existentes
-- ============================================================
-- Política: Laura Morataya (1c786d40-...) y P.A. Samuel Flores (32e9b7d5-...)
-- deben estar en TODOS los canales internos (type='channel' o 'voice_channel'),
-- nunca en DMs. El código de createChannel ya los agrega para canales nuevos
-- (src/lib/domain/team.ts → FORCE_CHANNEL_MEMBER_IDS); esta migración rellena
-- los canales que se crearon antes de la política.
--
-- Idempotente: ON CONFLICT DO NOTHING — si ya están agregados, no pasa nada.
-- ============================================================

insert into public.conversation_members (conversation_id, user_id)
select c.id, u.id
from public.conversations c
cross join (
  values
    ('1c786d40-7954-423b-8d8f-a6405a2f6053'::uuid),  -- Laura Morataya
    ('32e9b7d5-40eb-491b-a799-3b1597e4ebba'::uuid)   -- P.A. Samuel Flores
) as forced(id)
join public.users u on u.id = forced.id
where c.type in ('channel', 'voice_channel')
on conflict (conversation_id, user_id) do nothing;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0072_user_presence.sql
-- ============================================================================
-- ============================================================
-- FM CRM — Migration 0072: presence manual de usuarios
-- ============================================================
-- Tabla separada de `users` (no metemos toda la tabla de users en realtime)
-- con el estado manual del usuario. El estado "en videollamada" NO se guarda
-- aquí — se deriva en el cliente cruzando call_participants y call_sessions
-- activas, y override visualmente al estado manual.
--
-- Estados:
--   online    — usuario disponible (default)
--   away      — usuario ausente / no perturbar
--   almuerzo  — usuario en almuerzo
--
-- Quién puede ver: cualquier usuario autenticado (es información pública
-- entre el equipo, no sensible).
-- Quién puede actualizar: solo el dueño (user_id = auth.uid()).
-- ============================================================

create table if not exists public.user_presence (
  user_id     uuid primary key references public.users(id) on delete cascade,
  status      text not null default 'online'
              check (status in ('online','away','almuerzo')),
  updated_at  timestamptz not null default now()
);

create index if not exists user_presence_status_idx
  on public.user_presence (status);

-- Trigger para mantener updated_at fresco automáticamente
create or replace function public.touch_user_presence_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_presence_touch_updated_at on public.user_presence;
create trigger user_presence_touch_updated_at
  before update on public.user_presence
  for each row execute function public.touch_user_presence_updated_at();

-- RLS
alter table public.user_presence enable row level security;

drop policy if exists user_presence_select on public.user_presence;
create policy user_presence_select on public.user_presence
  for select using (auth.uid() is not null);

drop policy if exists user_presence_insert on public.user_presence;
create policy user_presence_insert on public.user_presence
  for insert with check (user_id = auth.uid());

drop policy if exists user_presence_update on public.user_presence;
create policy user_presence_update on public.user_presence
  for update using (user_id = auth.uid());

-- Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'user_presence'
    ) then
      execute 'alter publication supabase_realtime add table public.user_presence';
    end if;
  end if;
end$$;

alter table public.user_presence replica identity full;

-- También agregamos call_participants a realtime — necesario para detectar
-- "en videollamada" en vivo en el cliente (cuando alguien entra/sale de un
-- room, los demás ven actualizar el indicador).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'call_participants'
    ) then
      execute 'alter publication supabase_realtime add table public.call_participants';
    end if;
  end if;
end$$;

alter table public.call_participants replica identity full;

notify pgrst, 'reload schema';


-- ============================================================================
-- ╔══ 0073_client_user_permissions.sql
-- ============================================================================
-- 0073_client_user_permissions.sql
-- Permisos granulares dentro del portal del cliente:
--   * can_billing → ve facturación (invoices, quotes, invoice_items, quote_items)
--   * can_work    → gestiona trabajo (requirements, requirement_messages, review_*)
--
-- is_client_of() sigue existiendo y se mantiene para data compartida
-- (clients, client_users, plans, billing_cycles).
-- Las policies específicas de cada sección se actualizan para usar
-- is_billing_user_of() o is_work_user_of() según corresponda.

begin;

-- 1) Flags granulares en client_users
alter table public.client_users
  add column if not exists can_billing boolean not null default false,
  add column if not exists can_work boolean not null default false;

-- 2) Backfill: usuarios existentes mantienen acceso (compatibilidad).
--    'owner' → ambos permisos (era admin de la cuenta del cliente)
--    'viewer' → solo can_work (era observador del trabajo)
update public.client_users set can_billing = true, can_work = true
  where role = 'owner' and can_billing = false and can_work = false;
update public.client_users set can_work = true
  where role = 'viewer' and can_work = false;

-- 3) Helpers RLS por capacidad
create or replace function public.is_billing_user_of(target_client_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.client_users
    where user_id = auth.uid()
      and client_id = target_client_id
      and can_billing = true
  );
$$;

create or replace function public.is_work_user_of(target_client_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.client_users
    where user_id = auth.uid()
      and client_id = target_client_id
      and can_work = true
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Reemplazar policies de FACTURACIÓN (is_client_of → is_billing_user_of)
-- ─────────────────────────────────────────────────────────────────────

-- invoices
drop policy if exists "Client can view own invoices" on public.invoices;
create policy "Billing users can view own invoices" on public.invoices
  for select using (public.is_billing_user_of(client_id));

-- quotes (la policy aplica solo cuando client_id no es null; quotes con
-- client_id null son cotizaciones a prospectos y solo las ve el staff)
drop policy if exists "Client can view own quotes" on public.quotes;
create policy "Billing users can view own quotes" on public.quotes
  for select using (
    client_id is not null and public.is_billing_user_of(client_id)
  );

-- invoice_items (vía invoice)
drop policy if exists "invoice_items_select_client" on public.invoice_items;
create policy "invoice_items_select_billing" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.is_billing_user_of(i.client_id)
    )
  );

-- quote_items (vía quote)
drop policy if exists "quote_items_select_client" on public.quote_items;
create policy "quote_items_select_billing" on public.quote_items
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and q.client_id is not null
        and public.is_billing_user_of(q.client_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Reemplazar policies de TRABAJO (is_client_of → is_work_user_of)
-- ─────────────────────────────────────────────────────────────────────

-- requirements (read)
drop policy if exists "Client can view own requirements" on public.requirements;
create policy "Work users can view own requirements" on public.requirements
  for select using (
    exists (
      select 1 from public.billing_cycles bc
      where bc.id = requirements.billing_cycle_id
        and public.is_work_user_of(bc.client_id)
    )
  );

-- requirement_messages (read + insert)
drop policy if exists "Client can view visible messages" on public.requirement_messages;
create policy "Work users can view visible messages" on public.requirement_messages
  for select using (
    visible_to_client = true
    and exists (
      select 1
      from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = requirement_messages.requirement_id
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "Client can insert visible messages" on public.requirement_messages;
create policy "Work users can insert visible messages" on public.requirement_messages
  for insert with check (
    visible_to_client = true
    and user_id = auth.uid()
    and exists (
      select 1
      from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = requirement_id
        and public.is_work_user_of(bc.client_id)
    )
  );

-- review_assets / versions / version_files / pins / comments
-- (todos por work_user_of, en fase revision_cliente)
drop policy if exists "review_assets_select_client" on public.review_assets;
create policy "review_assets_select_work" on public.review_assets
  for select using (
    exists (
      select 1 from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id = review_assets.requirement_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_versions_select_client" on public.review_versions;
create policy "review_versions_select_work" on public.review_versions
  for select using (
    exists (
      select 1 from public.review_assets a
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where a.id = review_versions.asset_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_version_files_select_client" on public.review_version_files;
create policy "review_version_files_select_work" on public.review_version_files
  for select using (
    exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_version_files.version_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_pins_select_client" on public.review_pins;
create policy "review_pins_select_work" on public.review_pins
  for select using (
    exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_pins.version_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_pins_insert_client" on public.review_pins;
create policy "review_pins_insert_work" on public.review_pins
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.review_versions v
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where v.id = review_pins.version_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_comments_select_client" on public.review_comments;
create policy "review_comments_select_work" on public.review_comments
  for select using (
    exists (
      select 1 from public.review_pins p
      join public.review_versions v on v.id = p.version_id
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where p.id = review_comments.pin_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

drop policy if exists "review_comments_insert_client" on public.review_comments;
create policy "review_comments_insert_work" on public.review_comments
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.review_pins p
      join public.review_versions v on v.id = p.version_id
      join public.review_assets a on a.id = v.asset_id
      join public.requirements r on r.id = a.requirement_id
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where p.id = review_comments.pin_id
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

-- Storage bucket review-files: limitar a work_user
drop policy if exists "client_select_review_files" on storage.objects;
create policy "work_select_review_files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'review-files'
    and exists (
      select 1 from public.requirements r
      join public.billing_cycles bc on bc.id = r.billing_cycle_id
      where r.id::text = split_part(name, '/', 1)
        and r.phase = 'revision_cliente'
        and public.is_work_user_of(bc.client_id)
    )
  );

commit;


-- ============================================================================
-- ╔══ 0074_requirement_approval_flow.sql
-- ============================================================================
-- 0074_requirement_approval_flow.sql
-- Solicitudes de requerimiento desde el portal del cliente:
--   * Cliente con can_work crea un requirement con approval_status='pending'
--     llenando solo título, descripción, fecha deseada y tipo (reunion|produccion).
--   * Staff (admin/supervisor) lo aprueba completando los campos faltantes
--     (estimated_time_minutes, priority, assigned_to, deadline final, consumo).
--   * Mientras está pending o rejected, NO aparece en pipeline ni en consumo.

begin;

alter table public.requirements
  add column if not exists approval_status text
    not null default 'approved'
    check (approval_status in ('approved','pending','rejected')),
  add column if not exists requested_by_user_id uuid references public.users(id),
  add column if not exists client_requested_deadline timestamptz,
  add column if not exists client_requested_notes text,
  add column if not exists approved_by_user_id uuid references public.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by_user_id uuid references public.users(id);

create index if not exists requirements_pending_approval_idx
  on public.requirements(approval_status)
  where approval_status = 'pending';

-- Backfill explícito (default ya cubre filas nuevas; aseguramos las viejas)
update public.requirements set approval_status = 'approved' where approval_status is null;

-- Policy: work user puede insertar solicitudes (pending) para reunion/produccion
-- en sus propias billing_cycles. Los campos de staff se llenan luego al aprobar.
drop policy if exists "Work users can request requirements" on public.requirements;
create policy "Work users can request requirements" on public.requirements
  for insert
  with check (
    approval_status = 'pending'
    and content_type in ('reunion','produccion')
    and requested_by_user_id = auth.uid()
    and exists (
      select 1 from public.billing_cycles bc
      where bc.id = requirements.billing_cycle_id
        and public.is_work_user_of(bc.client_id)
    )
  );

commit;


-- ============================================================================
-- ╔══ 0075_quotes_optional_client.sql
-- ============================================================================
-- 0075_quotes_optional_client.sql
-- Permite generar cotizaciones a prospectos (sin cliente creado en BD).
-- client_id pasa a ser nullable; los datos del prospecto se guardan en
-- client_snapshot_json (campo ya existente desde 0048_billing_module).

begin;

alter table public.quotes
  alter column client_id drop not null;

-- La FK 'on delete restrict' tolera null sin cambios. La policy del cliente
-- (Billing users can view own quotes en 0073) ya ignora filas con client_id null.

commit;


-- ============================================================================
-- ╔══ 0076_relax_request_content_types.sql
-- ============================================================================
-- 0076_relax_request_content_types.sql
-- Permite que los clientes soliciten cualquier tipo de contenido (artes, reuniones,
-- producciones) EXCEPTO matriz_contenido (que es prerrogativa de la agencia).

begin;

drop policy if exists "Work users can request requirements" on public.requirements;
create policy "Work users can request requirements" on public.requirements
  for insert
  with check (
    approval_status = 'pending'
    and content_type <> 'matriz_contenido'
    and requested_by_user_id = auth.uid()
    and exists (
      select 1 from public.billing_cycles bc
      where bc.id = requirements.billing_cycle_id
        and public.is_work_user_of(bc.client_id)
    )
  );

commit;


-- ============================================================================
-- ╔══ 0077_missed_call_messages.sql
-- ============================================================================
-- 0077_missed_call_messages.sql
-- Soporte para mensajes de sistema en conversaciones (inicio: llamada perdida).

begin;

alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text', 'system_missed_call'));

create index if not exists messages_kind_idx
  on public.messages(conversation_id, kind)
  where kind <> 'text';

-- Realtime ya cubre messages (migración 0050). Sin cambios.

commit;


-- ============================================================================
-- ╔══ 0078_billing_cycle_auto_billed_marker.sql
-- ============================================================================
-- 0078_billing_cycle_auto_billed_marker.sql
-- Evita que el cron auto-facture si ya hay factura (manual o automática) cubriendo
-- el período del scheduled cycle.

begin;

alter table public.billing_cycles
  add column if not exists auto_billed_at timestamptz;

create index if not exists billing_cycles_auto_billed_at_idx
  on public.billing_cycles(auto_billed_at)
  where auto_billed_at is not null;

commit;


-- ============================================================================
-- ╔══ 0079_can_quote_permission.sql
-- ============================================================================
-- Permiso especial para cotizar sin acceso completo a facturación.
-- Se asigna manualmente a usuarios específicos; no hay UI de gestión.
alter table public.users
  add column if not exists can_quote boolean not null default false;

