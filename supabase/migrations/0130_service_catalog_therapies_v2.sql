-- Migración 0130 — Catálogo de servicios v2 — PARTE 1/2
--
-- PostgreSQL no permite usar un nuevo valor de enum en la misma transacción
-- que lo agrega. Por eso esta migración solo agrega el enum + las columnas
-- nuevas. El seed va en una migración aparte (0131).
--
-- Cambios:
--   1) Agrega 'terapia_individual' al enum service_category
--   2) Nueva columna service_catalog.unit_price_bk_usd
--   3) Nueva columna service_catalog.service_type (link al enum ServiceType)
--   4) Amplía appointments.service_type CHECK con 5 nuevos valores

-- ── 1. Enum: agregar terapia_individual ───────────────────────────────────
ALTER TYPE public.service_category ADD VALUE IF NOT EXISTS 'terapia_individual';

-- ── 2. Columnas nuevas en service_catalog ─────────────────────────────────
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS unit_price_bk_usd numeric(10, 2),
  ADD COLUMN IF NOT EXISTS service_type text;

COMMENT ON COLUMN public.service_catalog.unit_price_bk_usd IS
  'Precio descontado para niños inscritos en programa matutino (Blue Kids / Learning Kids / Aula). NULL = no aplica descuento.';
COMMENT ON COLUMN public.service_catalog.service_type IS
  'Enlace con el enum ServiceType del CRM (ej. lenguaje, sensorial). Permite que el TreatmentPlanEditor jale el precio del catálogo automáticamente.';

CREATE INDEX IF NOT EXISTS service_catalog_service_type_idx
  ON public.service_catalog (service_type) WHERE service_type IS NOT NULL;

-- ── 3. appointments.service_type: agregar 5 nuevos ────────────────────────
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_service_type_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_service_type_check CHECK (service_type IN (
    'lenguaje',
    'motricidad_gruesa',
    'motricidad_fina',
    'sensorial',
    'psicologica',
    'ocupacional',
    'fisica',
    'lectoescritura',
    'funciones_ejecutivas',
    'conductual',
    'blue_kids',
    'alim_deglu',
    'destreza_manual_pre_escritura',
    -- ─── Nuevos service_types (Excel 2026) ───
    'ils_escucha',
    'refuerzo_academico',
    'concentracion_atencion',
    'comunicacion_regulacion',
    'estimulacion_juego',
    'otra'
  ));

-- ⚠️  IMPORTANTE: después de ejecutar esta migración, ejecutar también
-- 0131_service_catalog_seed_v2.sql para sembrar los precios del Excel 2026.
