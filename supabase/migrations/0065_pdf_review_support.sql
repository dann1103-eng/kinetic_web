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
