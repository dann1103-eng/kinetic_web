-- 0143_user_avatars_bucket.sql
-- Crea el bucket 'user-avatars' + políticas de Storage.
--
-- Histórico: desde la migración 0018 el bucket se documentaba como "crear
-- manualmente en el Dashboard", paso que se omitía y provocaba el error
-- "Bucket not found" al subir foto de perfil (uploadUserAvatar →
-- src/lib/supabase/upload-avatar.ts). Esta migración lo hace reproducible.
--
-- Ruta de subida: `${userId}/avatar.${ext}` ⇒ (storage.foldername(name))[1] = auth.uid().
-- Cliente: navegador autenticado (no service role) ⇒ requiere políticas RLS.

-- Bucket público (lectura por URL pública), 2 MB máx, solo imágenes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- SELECT: lectura pública (avatares se muestran en toda la app).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_avatars_select'
  ) THEN
    CREATE POLICY user_avatars_select
      ON storage.objects FOR SELECT
      USING (bucket_id = 'user-avatars');
  END IF;
END $$;

-- INSERT: cada usuario solo en su propia carpeta (userId = auth.uid()).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_avatars_insert'
  ) THEN
    CREATE POLICY user_avatars_insert
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'user-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- UPDATE: necesario para el upsert (reemplazar avatar existente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_avatars_update'
  ) THEN
    CREATE POLICY user_avatars_update
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'user-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'user-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- DELETE: cada usuario puede borrar su propio avatar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'user_avatars_delete'
  ) THEN
    CREATE POLICY user_avatars_delete
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'user-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
