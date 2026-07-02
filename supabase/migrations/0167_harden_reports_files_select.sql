-- 0167_harden_reports_files_select.sql
-- Seguridad (H2 del audit jul 2026): endurece el SELECT del bucket `reports-files`.
--
-- NUMERACIÓN: nació como 0165, pero master ya tenía 0165/0166 (batch "Reunión
-- Admón"); este worktree estaba atrás y no los veía. Renumerada a 0167 para no
-- colisionar. El SQL es independiente de esas migraciones (solo toca la policy de
-- storage.objects para el bucket reports-files).
--
-- Antes (migración 0108): la policy `reports_files_select` daba SELECT a CUALQUIER
-- usuario autenticado sobre TODO el bucket. Como el bucket guarda informes de
-- progreso, notas de sesión y adjuntos de niños (datos clínicos de menores), una
-- cuenta family/client podía listar/leer archivos de OTROS niños consultando
-- `storage.objects` directamente con su propio JWT.
--
-- Los archivos SIEMPRE se sirven vía URL firmada generada en el servidor
-- (getReportFileSignedUrl / getChildAttachmentSignedUrl), que usa el service role
-- (ignora RLS) y desde jul 2026 AUTORIZA por RLS antes de firmar. Por eso podemos
-- restringir el SELECT directo a staff SIN cambiar el comportamiento de la app:
-- las familias siguen descargando por URL firmada, no por acceso directo al bucket.
--
-- Depende de public.current_user_role() (creada en 0117_payroll.sql), ya usada por
-- las policies de child_attachments (0119).

drop policy if exists reports_files_select on storage.objects;

create policy reports_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports-files'
    and public.current_user_role() in (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion', 'contable'
    )
  );

-- INSERT/UPDATE/DELETE siguen intencionalmente sin policy → solo el service role
-- del server action escribe (mismo patrón que 0108).

-- NOTA (pendiente, NO incluido aquí): el bucket `child-photos` (0112) es PÚBLICO
-- con key predecible `${childId}/photo.ext`. Hacerlo privado requiere migrar TODO
-- el render de fotos (hoy usa getPublicUrl) a URLs firmadas — refactor aparte para
-- no romper la visualización de fotos en toda la app.
