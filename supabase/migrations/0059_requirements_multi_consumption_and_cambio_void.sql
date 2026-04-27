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
