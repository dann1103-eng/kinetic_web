-- =============================================================================
-- 0140 — Despacho del niño + cargo por recogida tardía
-- =============================================================================
-- La terapista marca "terapia finalizada" (completed_at) y luego "despachado"
-- (dispatched_at) cuando los padres recogen al niño. Si pasan >15 min, se
-- sugiere un cargo por recogida tardía (5% no — $5 + $5 cada 30 min), que
-- recepción confirma o perdona. El cargo se acumula a la factura del ciclo.
-- =============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by_user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS late_fee_minutes int,
  ADD COLUMN IF NOT EXISTS late_fee_usd numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fee_status text NOT NULL DEFAULT 'none'
    CHECK (late_fee_status IN ('none', 'suggested', 'charged', 'waived')),
  ADD COLUMN IF NOT EXISTS late_fee_waive_reason text,
  ADD COLUMN IF NOT EXISTS dispatch_snoozed_until timestamptz;

COMMENT ON COLUMN public.appointments.dispatch_snoozed_until IS
  'Cuando alguien marca "el niño no lo han traído aún", se pospone el pop-up de despacho hasta esta hora (sincronizado entre recepción y terapista).';

COMMENT ON COLUMN public.appointments.completed_at IS
  'Momento en que la terapista marcó la terapia como finalizada (arranca el timer de despacho).';
COMMENT ON COLUMN public.appointments.dispatched_at IS
  'Momento en que el niño fue despachado (recogido por los padres).';
COMMENT ON COLUMN public.appointments.late_fee_status IS
  'none | suggested (calculado, pendiente de revisión) | charged | waived.';

-- Índice para el watcher de despachos pendientes (completadas sin despachar).
CREATE INDEX IF NOT EXISTS appointments_pending_dispatch_idx
  ON public.appointments (completed_at)
  WHERE dispatched_at IS NULL AND completed_at IS NOT NULL;

-- Realtime: que el pop-up sincronizado reciba cambios de appointments.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;
