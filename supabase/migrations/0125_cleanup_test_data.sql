-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 0125 — Limpieza de datos de prueba
-- ═══════════════════════════════════════════════════════════════════════════
-- Borra TODOS los datos de dominio Kinetic sin eliminar:
--   • users (staff real preservado)
--   • intake_phase_catalog (seed del sistema — 17 fases)
--   • payroll_fiscal_config (constantes legales SV)
--   • institutional_closures (feriados / cierres institucionales)
--   • app_settings
--
-- Ejecutar en Supabase Studio ANTES de la migración de seed 0126.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Tablas de dominio sin FK hacia families ─────────────────────────────
DELETE FROM public.dashboard_alerts;
DELETE FROM public.payroll_items;
DELETE FROM public.payroll_runs;
DELETE FROM public.general_expenses;

-- ── 2. Invoices Kinetic (child_id NOT NULL) ────────────────────────────────
DELETE FROM public.invoice_items
  WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE child_id IS NOT NULL
  );
DELETE FROM public.invoices WHERE child_id IS NOT NULL;

-- ── 3. Waitlist entries (FK→children via scheduled_child_id) ──────────────
DELETE FROM public.waitlist_entries;

-- ── 4. Families — CASCADE elimina todo lo que depende de children: ─────────
--    family_users, children → treatment_plans, appointments,
--    appointment_absences, session_reports, progress_reports,
--    child_phase_history, child_discharge_records,
--    monthly_session_cycles, child_attachments
DELETE FROM public.families;

-- ── 5. Referral sources ───────────────────────────────────────────────────
DELETE FROM public.referral_sources;

-- ── 6. Fix de constraint: agregar 'cancelled' a appointments.status ────────
--    (advanceChildPhase ya usa este status — faltaba en el constraint original)
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'no_show',
    'late_cancel', 'rescheduled', 'replacement', 'cancelled'
  ));

-- ── 7. Reset campos salariales del staff (se re-sembrarán en 0126) ─────────
UPDATE public.users
SET monthly_salary_usd = NULL,
    hourly_rate_usd    = NULL,
    contract_type      = 'sin_contrato',
    dui                = NULL,
    isss_number        = NULL,
    afp_number         = NULL,
    afp_provider       = NULL,
    hire_date          = NULL
WHERE role IN (
  'admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias',
  'terapista', 'maestra', 'recepcion', 'contable', 'supervisor'
);

COMMIT;
