-- 0112_children_photo.sql
-- Agrega foto del niño + bucket de almacenamiento

-- Columna photo_url en children (URL pública del bucket child-photos)
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Bucket child-photos (público, 5 MB máx, solo imágenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'child-photos',
  'child-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy SELECT para usuarios autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'child_photos_select'
  ) THEN
    CREATE POLICY child_photos_select
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'child-photos');
  END IF;
END $$;
