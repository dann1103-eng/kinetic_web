-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Crear bucket de Storage: agency-assets
-- ═══════════════════════════════════════════════════════════════════════════
-- Bucket público donde se guarda el logo de la agencia (Kinetic).
-- El logo se usa en login, favicon, sidebar del portal padres y PDFs.
--
-- En proyectos anteriores este bucket se creaba manualmente en Studio.
-- Esta migración lo crea por SQL para que sea reproducible.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Crear el bucket ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agency-assets',
  'agency-assets',
  true,                                  -- público (URLs accesibles directamente)
  5242880,                               -- 5 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Policies de storage.objects para agency-assets ───────────────────
-- SELECT: cualquiera puede ver los archivos (bucket público).
DROP POLICY IF EXISTS agency_assets_select_public ON storage.objects;
CREATE POLICY agency_assets_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'agency-assets');

-- INSERT/UPDATE/DELETE intencionalmente sin policy: el upload se hace
-- via service role desde el server action (uploadAgencyLogo), bypaseando
-- RLS. La verificación de rol="admin" se hace en el server action.

-- ── Listo ───────────────────────────────────────────────────────────────
-- Verificá en Supabase Studio → Storage que aparezca un bucket llamado
-- "agency-assets" marcado como público. Después podés subir el logo
-- desde /profile en la app sin error.
