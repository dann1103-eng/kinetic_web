-- ═══════════════════════════════════════════════════════════════════════════
-- Destrabar / eliminar un ciclo mensual de prueba
-- ═══════════════════════════════════════════════════════════════════════════
-- Caso: se generó un ciclo (ej. agosto) solo para probar la calendarización,
-- se borró la factura por separado, pero el CICLO quedó en estado 'generated'.
-- Como el índice único es parcial (solo ciclos NO cancelados), ese ciclo
-- ocupa el mes y bloquea volver a generarlo.
--
-- A partir de ahora hay un botón "Eliminar" (admin) en el perfil del niño que
-- hace exactamente esto. Este script es para destrabar el caso ya existente.
--
-- PASO 1 — Identificar el ciclo. Ajustá el nombre del niño y el mes.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT c.id            AS cycle_id,
       ch.full_name    AS nino,
       c.period_month,
       c.status,
       c.payment_status,
       c.invoice_id,
       c.appointments_generated_count
  FROM public.monthly_session_cycles c
  JOIN public.children ch ON ch.id = c.child_id
 WHERE c.period_month = '2026-08-01'      -- ← mes a destrabar
   -- AND ch.full_name ILIKE '%apellido%'  -- ← opcional: filtrar por niño
 ORDER BY ch.full_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2 — Eliminar el ciclo. Reemplazá <CYCLE_ID> con el id del PASO 1.
-- Corré TODO el bloque (transacción): borra citas auto-generadas aún
-- programadas del mes + factura + el ciclo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_cycle_id uuid := '<CYCLE_ID>';   -- ← pegá el cycle_id del PASO 1
  v_child_id uuid;
  v_period   date;
  v_invoice  uuid;
  v_start    timestamptz;
  v_end      timestamptz;
BEGIN
  SELECT child_id, period_month, invoice_id
    INTO v_child_id, v_period, v_invoice
    FROM public.monthly_session_cycles
   WHERE id = v_cycle_id;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'No existe el ciclo %', v_cycle_id;
  END IF;

  -- Ventana del mes en zona El Salvador.
  v_start := (v_period::timestamp AT TIME ZONE 'America/El_Salvador');
  v_end   := ((v_period + interval '1 month')::timestamp AT TIME ZONE 'America/El_Salvador');

  -- 1) Citas auto-generadas del mes que siguen 'scheduled'.
  DELETE FROM public.appointments
   WHERE child_id = v_child_id
     AND status = 'scheduled'
     AND starts_at >= v_start
     AND starts_at <  v_end
     AND coalesce(notes, '') LIKE '%Auto-generado del ciclo%';

  -- 2) Factura asociada (items primero por la FK), si quedó alguna.
  IF v_invoice IS NOT NULL THEN
    DELETE FROM public.invoice_items WHERE invoice_id = v_invoice;
    DELETE FROM public.invoices      WHERE id = v_invoice;
  END IF;

  -- 3) El ciclo.
  DELETE FROM public.monthly_session_cycles WHERE id = v_cycle_id;

  RAISE NOTICE '✓ Ciclo % eliminado. El mes % quedó libre para regenerar.', v_cycle_id, v_period;
END $$;
