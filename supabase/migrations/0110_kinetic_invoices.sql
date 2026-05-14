-- 0110_kinetic_invoices.sql
-- Extiende la tabla invoices para soportar facturas ligadas a niños (Kinetic)
-- en lugar de solo clientes (FM CRM).
--
-- El constraint vigente en 0048 hace client_id NOT NULL.
-- Aquí lo relajamos y añadimos child_id para poder emitir facturas por ciclo mensual.

-- 1. Quitar NOT NULL de client_id
ALTER TABLE public.invoices
  ALTER COLUMN client_id DROP NOT NULL;

-- 2. Agregar child_id FK
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS child_id uuid
    REFERENCES public.children(id) ON DELETE SET NULL;

-- 3. Constraint: al menos uno de los dos debe estar presente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoices'
      AND constraint_name = 'invoices_requires_owner'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_requires_owner
        CHECK (client_id IS NOT NULL OR child_id IS NOT NULL);
  END IF;
END $$;

-- 4. Índice para consultas por child_id (historial de facturas de un niño/familia)
CREATE INDEX IF NOT EXISTS idx_invoices_child_id
  ON public.invoices (child_id)
  WHERE child_id IS NOT NULL;
