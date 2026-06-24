-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: ciclos "trabados" que bloquean crear un nuevo ciclo para ese mes
-- ═══════════════════════════════════════════════════════════════════════════
-- El índice único monthly_session_cycles_active_unique impide crear dos
-- ciclos no-cancelados para el mismo niño + mes. Si un ciclo quedó en
-- estado 'generated' (por ejemplo después de un intento fallido de
-- eliminar), bloquea la creación del nuevo.
--
-- PASO 1 — Ver todos los ciclos bloqueantes para julio/agosto 2026.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  c.full_name          AS nino,
  mc.period_month,
  mc.status,
  mc.payment_status,
  mc.id                AS cycle_id,
  mc.created_at::date  AS creado
FROM public.monthly_session_cycles mc
JOIN public.children c ON c.id = mc.child_id
WHERE mc.status <> 'cancelled'
  AND mc.period_month IN ('2026-07-01', '2026-08-01')
ORDER BY c.full_name, mc.period_month;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2 — Cancelar los ciclos trabados (reemplaza los IDs con los del paso 1).
--          Úsalo SOLO para ciclos de prueba/error que no tienen pagos reales.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cancelar un ciclo específico por ID:
-- UPDATE public.monthly_session_cycles
-- SET status = 'cancelled', cancel_reason = 'Ciclo de prueba — trabado'
-- WHERE id = 'PONER_CYCLE_ID_AQUI';

-- O cancelar TODOS los ciclos generated/pending de julio y agosto que no
-- tengan fecha de pago (nunca se pagaron):
-- UPDATE public.monthly_session_cycles
-- SET status = 'cancelled', cancel_reason = 'Ciclo trabado sin pago registrado'
-- WHERE status = 'generated'
--   AND payment_status = 'pending'
--   AND paid_at IS NULL
--   AND period_month IN ('2026-07-01', '2026-08-01')
--   AND id IN (
--     -- solo si hay duplicados (más de uno no-cancelado para el mismo niño+mes)
--     SELECT mc2.id
--     FROM public.monthly_session_cycles mc2
--     WHERE mc2.status <> 'cancelled'
--     GROUP BY mc2.child_id, mc2.period_month
--     HAVING count(*) > 1
--   );

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 3 — Verificar que ya no hay bloqueos (debería devolver 0 filas).
-- ═══════════════════════════════════════════════════════════════════════════

SELECT child_id, period_month, count(*) AS ciclos_activos
FROM public.monthly_session_cycles
WHERE status <> 'cancelled'
  AND period_month IN ('2026-07-01', '2026-08-01')
GROUP BY child_id, period_month
HAVING count(*) > 1;
