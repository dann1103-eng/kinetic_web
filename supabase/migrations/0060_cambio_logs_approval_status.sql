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
