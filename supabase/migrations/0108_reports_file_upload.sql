-- 0108_reports_file_upload.sql
-- Soporte para upload de archivos (PDF/Word/Excel/imagen) en informes
-- cuatrimestrales (progress_reports) y reportes de sesion (session_reports).
-- Bucket privado reports-files; las write policies bypasean via service role
-- desde server actions (mismo patron que agency-assets).

-- =============================================================================
-- 1. Columnas en progress_reports
-- =============================================================================
alter table public.progress_reports
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes integer,
  add column if not exists file_mime_type text,
  add column if not exists upload_kind text default 'editor';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'progress_reports_upload_kind_check'
  ) then
    alter table public.progress_reports
      add constraint progress_reports_upload_kind_check
      check (upload_kind in ('editor', 'file'));
  end if;
end $$;

-- =============================================================================
-- 2. Columnas en session_reports
-- =============================================================================
alter table public.session_reports
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes integer,
  add column if not exists file_mime_type text,
  add column if not exists upload_kind text default 'editor';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'session_reports_upload_kind_check'
  ) then
    alter table public.session_reports
      add constraint session_reports_upload_kind_check
      check (upload_kind in ('editor', 'file'));
  end if;
end $$;

-- =============================================================================
-- 3. Bucket reports-files (privado)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports-files',
  'reports-files',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- =============================================================================
-- 4. Policies storage: SELECT para autenticados; write via service role
-- =============================================================================
drop policy if exists reports_files_select on storage.objects;
create policy reports_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reports-files');

-- INSERT/UPDATE/DELETE intencionalmente sin policy: solo el service role del
-- server action puede escribir. Mismo patron de agency-assets para evitar el
-- problema de JWT-no-propagado de Supabase Storage.

-- =============================================================================
-- 5. Comentarios
-- =============================================================================
comment on column public.progress_reports.upload_kind is
  'Origen del informe: editor (formato estructurado en data_json) o file (archivo subido al bucket reports-files).';
comment on column public.session_reports.upload_kind is
  'Origen del reporte: editor (campos de texto actividades/respuesta/tarea/observaciones) o file (archivo subido).';
comment on column public.progress_reports.file_url is
  'Path en el bucket reports-files. La URL firmada se genera on-demand al servir el archivo.';
comment on column public.session_reports.file_url is
  'Path en el bucket reports-files. La URL firmada se genera on-demand al servir el archivo.';
