-- 0113_family_portal_invoice_rls.sql
-- Portal de Padres — Fase D
-- Permite que usuarios de familia con can_billing=true vean facturas
-- Kinetic (child_id) de sus niños.

-- ── 1. RLS SELECT en invoices para familia ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoices'
      AND policyname = 'invoices_select_family'
  ) THEN
    CREATE POLICY invoices_select_family
      ON public.invoices FOR SELECT
      USING (
        child_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM public.family_users fu
            JOIN public.children c ON c.family_id = fu.family_id
           WHERE fu.user_id  = auth.uid()
             AND c.id        = invoices.child_id
             AND fu.can_billing = true
        )
      );
  END IF;
END $$;

-- ── 2. RLS SELECT en invoice_items para familia ──────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoice_items'
      AND policyname = 'invoice_items_select_family'
  ) THEN
    CREATE POLICY invoice_items_select_family
      ON public.invoice_items FOR SELECT
      USING (
        EXISTS (
          SELECT 1
            FROM public.invoices i
            JOIN public.family_users fu ON true
            JOIN public.children c ON c.family_id = fu.family_id
           WHERE i.id         = invoice_items.invoice_id
             AND i.child_id   = c.id
             AND fu.user_id   = auth.uid()
             AND fu.can_billing = true
        )
      );
  END IF;
END $$;
