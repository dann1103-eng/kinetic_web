-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Actualizar bucket reports-files para aceptar HEIC/HEIF y subir
-- el límite por archivo a 15 MB.
-- ═══════════════════════════════════════════════════════════════════════════
-- Razón: cuando una terapista toma una foto desde iPhone al adjuntar evidencia
-- en un reporte, el archivo viene en formato HEIC (default de iOS desde 2017).
-- Sin este UPDATE el upload falla con "mime_type not allowed".
--
-- Ejecutar UNA vez en Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET
  file_size_limit = 15728640,  -- 15 MB
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
WHERE id = 'reports-files';

-- Verificación
SELECT id, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'reports-files';
