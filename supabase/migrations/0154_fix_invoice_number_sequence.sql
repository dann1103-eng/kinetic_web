-- =============================================================================
-- 0154 — Fix: _kn_next_invoice_number usa MAX en lugar de COUNT
-- =============================================================================
-- BUG: la función original usaba COUNT(*) para determinar el siguiente número.
-- Si se eliminaba una factura (ej. al borrar un ciclo de prueba), el COUNT
-- quedaba por debajo del número más alto → la función generaba un número que
-- ya existía → "duplicate key value violates unique constraint invoices_invoice_number_key".
--
-- Ejemplo real: 65 facturas de julio pero MAX = KIN-202607-0066 (una fue borrada).
-- COUNT(*) = 65 → generaba KIN-202607-0066 → colisión.
--
-- FIX: usar MAX del número secuencial. Así siempre genera el siguiente al
-- más alto existente, sin importar los gaps.
--
-- Aplicado manualmente en producción el 2026-06-23 via Supabase CLI.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._kn_next_invoice_number(p_period_month date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max    int;
  v_prefix text;
  v_yyyymm text := to_char(p_period_month, 'YYYYMM');
BEGIN
  v_prefix := 'KIN-' || v_yyyymm || '-';
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(invoice_number FROM length(v_prefix) + 1) AS int)),
    0
  ) INTO v_max
  FROM public.invoices
  WHERE invoice_number LIKE v_prefix || '%';
  RETURN v_prefix || lpad((v_max + 1)::text, 4, '0');
END;
$$;

-- ── Fin de migración 0154 ────────────────────────────────────────────────────
