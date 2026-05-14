-- 0111_cycles_partial_unique.sql
-- El constraint UNIQUE en (child_id, period_month) impedía crear un nuevo ciclo
-- para un mes en el que ya había existido un ciclo cancelado.
-- Se reemplaza por un índice parcial que solo aplica a ciclos NO cancelados.

-- 1. Eliminar el constraint de unicidad global
ALTER TABLE public.monthly_session_cycles
  DROP CONSTRAINT IF EXISTS monthly_session_cycles_child_id_period_month_key;

-- 2. Crear índice único parcial: solo aplica a ciclos que NO están cancelados
CREATE UNIQUE INDEX IF NOT EXISTS monthly_session_cycles_active_unique
  ON public.monthly_session_cycles (child_id, period_month)
  WHERE status != 'cancelled';
