-- Migración 0062: Renta retenida (10%) y Total a Pagar
-- Toggle por cliente para aplicar renta retenida + nuevos campos en invoices/quotes
-- para distinguir entre Total en DTE y TOTAL A PAGAR (monto real al cobrar).

-- 1. Toggle por cliente: ¿es agente de retención?
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS aplica_renta_retenida BOOLEAN NOT NULL DEFAULT false;

-- 2. Snapshot fiscal en facturas
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS retention_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_renta_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_a_pagar NUMERIC(12,2);

-- 3. Snapshot fiscal en cotizaciones
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS retention_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencion_renta_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_a_pagar NUMERIC(12,2);

-- 4. Backfill: total_a_pagar = total para registros existentes (sin retención)
UPDATE public.invoices SET total_a_pagar = total WHERE total_a_pagar IS NULL;
UPDATE public.quotes   SET total_a_pagar = total WHERE total_a_pagar IS NULL;

-- 5. Hacer el campo NOT NULL después del backfill
ALTER TABLE public.invoices ALTER COLUMN total_a_pagar SET NOT NULL;
ALTER TABLE public.quotes   ALTER COLUMN total_a_pagar SET NOT NULL;
