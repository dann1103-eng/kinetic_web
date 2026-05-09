-- =============================================================================
-- 0105 — Hotfix: contador de invoice_number Kinetic (counting por prefix)
-- =============================================================================
-- Bug: `_kn_next_invoice_number(p_period_month)` contaba invoices con
-- `issue_date YYYYMM = period_month YYYYMM`. Pero `issue_date` se setea
-- a `current_date` al crear la invoice, NO al period_month del ciclo.
-- Resultado:
--   - Crear ciclo de junio 2026 hoy (mayo 2026): issue_date=2026-05-XX,
--     prefix='KIN-202606-', counter contaba YYYYMM='202606' → 0 →
--     número 'KIN-202606-0001'.
--   - Re-intentar (ej. después de anular el primero): same counter → 0
--     → 'KIN-202606-0001' otra vez → DUPLICATE KEY.
--
-- Fix: contar por el prefix del invoice_number en lugar de por
-- issue_date. Garantiza unicidad dentro del prefix sin importar qué
-- día se haya emitido.
-- =============================================================================

create or replace function public._kn_next_invoice_number(p_period_month date) returns text
language plpgsql security definer as $$
declare
  v_count int;
  v_prefix text;
  v_yyyymm text := to_char(p_period_month, 'YYYYMM');
begin
  v_prefix := 'KIN-' || v_yyyymm || '-';
  select count(*) into v_count
    from public.invoices
   where invoice_number like v_prefix || '%';
  return v_prefix || lpad((v_count + 1)::text, 4, '0');
end;
$$;

-- ── Fin de migración 0105_kinetic_invoice_number_fix ──────────────────────
