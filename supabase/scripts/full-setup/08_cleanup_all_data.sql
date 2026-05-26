-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Limpieza total de datos
-- ═══════════════════════════════════════════════════════════════════════════
-- Borra TODOS los datos operacionales y deja la base lista para arrancar
-- en producción "limpia". Conserva:
--
--   ✓ users (staff interno — admin, directora, coordinadoras, terapistas,
--     maestras, recepción, contable). Resetea sus campos salariales para
--     que la directora pueda configurarlos manualmente.
--   ✓ intake_phase_catalog (17 fases del pipeline, seed sistema)
--   ✓ payroll_fiscal_config (constantes legales SV — ISSS/AFP/ISR)
--   ✓ institutional_closures (feriados / cierres)
--   ✓ app_settings (logo de la agencia, etc.)
--   ✓ storage buckets (agency-assets, reports-files, etc.) — solo borra los
--     objetos asociados a niños/reportes; no toca el logo de la agencia.
--
-- Borra:
--   ✗ familias, niños, citas, planes de tratamiento, sesiones, reportes,
--     informes cuatrimestrales, adjuntos, historial de fases, altas/retiros
--   ✗ planillas mensuales y sus items
--   ✗ ciclos de pago + invoices Kinetic
--   ✗ gastos generales
--   ✗ lista de espera
--   ✗ alertas de dashboard
--   ✗ referral sources
--   ✗ usuarios `family` (portal padres) en auth + public
--
-- EJECUTAR UNA VEZ en Supabase SQL Editor cuando quieras arrancar con la
-- base limpia (datos reales eliminados, staff y configuración conservados).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Tablas sin FK hacia families (borrar primero) ─────────────────────
DELETE FROM public.dashboard_alerts;
DELETE FROM public.payroll_items;
DELETE FROM public.payroll_runs;
DELETE FROM public.general_expenses;

-- ── 2. Invoices Kinetic + items ──────────────────────────────────────────
DELETE FROM public.invoice_items
  WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE child_id IS NOT NULL
  );
DELETE FROM public.invoices WHERE child_id IS NOT NULL;

-- ── 3. Lista de espera ────────────────────────────────────────────────────
DELETE FROM public.waitlist_entries;

-- ── 4. Historial y registros de cierre — borrar antes que children/families
--    Algunas tablas tienen ON DELETE CASCADE desde children pero las borramos
--    explícitamente para no depender del orden de cascada y para mostrar el
--    conteo en el output.
DELETE FROM public.child_discharge_records;
DELETE FROM public.child_phase_history;

-- ── 5. Adjuntos de niños (bucket cleanup viene aparte) ───────────────────
DELETE FROM public.child_attachments;

-- ── 6. Reportes (los borraría el CASCADE, pero explícito para limpieza) ──
DELETE FROM public.session_reports;
DELETE FROM public.progress_reports;

-- ── 7. Treatment plans + appointments + cycles ───────────────────────────
DELETE FROM public.appointment_absences;
DELETE FROM public.therapy_sessions;
DELETE FROM public.monthly_session_cycles;
DELETE FROM public.appointments;
DELETE FROM public.treatment_plan_changes;
DELETE FROM public.treatment_plans;

-- ── 8. Familias — CASCADE elimina children (que aún no se hayan borrado),
--     family_users (link portal padres) y todo lo que dependa
DELETE FROM public.children;       -- explicit por si quedaron huérfanos
DELETE FROM public.family_users;   -- link portal padres
DELETE FROM public.families;

-- ── 9. Referral sources ──────────────────────────────────────────────────
DELETE FROM public.referral_sources;

-- ── 10. Reset campos salariales del staff (vuelven a NULL / sin_contrato)
UPDATE public.users
SET monthly_salary_usd = NULL,
    hourly_rate_usd    = NULL,
    contract_type      = 'sin_contrato',
    dui                = NULL,
    isss_number        = NULL,
    afp_number         = NULL,
    afp_provider       = NULL,
    hire_date          = NULL,
    max_hours_per_week = NULL
WHERE role IN (
  'admin', 'directora', 'coordinadora_familias', 'coordinadora_terapias',
  'terapista', 'maestra', 'recepcion', 'contable', 'supervisor'
);

-- ── 11. Therapist work schedule (horarios laborales — se reconfiguran) ──
DELETE FROM public.therapist_work_schedule;

-- ── 12. Eliminar usuarios family (portal padres) ─────────────────────────
-- Los user_id de role='family' que existan en public.users se borran junto
-- con su fila en auth.users (CASCADE configurado en mig 0001).
DELETE FROM auth.users
WHERE id IN (
  SELECT id FROM public.users WHERE role IN ('family', 'client')
);
-- Limpieza de cualquier orphan en public.users
DELETE FROM public.users WHERE role IN ('family', 'client');

-- ── 13. Storage cleanup ──────────────────────────────────────────────────
-- IMPORTANTE: Supabase bloquea el DELETE directo en storage.objects con un
-- trigger de protección (storage.protect_delete()). Para borrar los archivos
-- físicos del bucket reports-files hay 2 opciones:
--
-- A) Desde Supabase Dashboard → Storage → reports-files:
--    Click en cada carpeta (progress/ y session/) → seleccionar todo →
--    Delete. Esto borra los archivos sin tocar la base.
--
-- B) Desde un Node script con service role (más rápido si hay muchos):
--    const { data } = await admin.storage.from('reports-files').list('', { limit: 1000 })
--    const paths = data.map(f => f.name)
--    await admin.storage.from('reports-files').remove(paths)
--
-- (Conserva el bucket agency-assets — ahí vive el logo de Kinetic.)

COMMIT;

-- ── Verificación rápida ─────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.users)              AS staff_users,
  (SELECT COUNT(*) FROM public.families)           AS families,
  (SELECT COUNT(*) FROM public.children)           AS children,
  (SELECT COUNT(*) FROM public.appointments)       AS appointments,
  (SELECT COUNT(*) FROM public.treatment_plans)    AS treatment_plans,
  (SELECT COUNT(*) FROM public.invoices WHERE child_id IS NOT NULL) AS kinetic_invoices,
  (SELECT COUNT(*) FROM public.waitlist_entries)   AS waitlist,
  (SELECT COUNT(*) FROM public.payroll_runs)       AS payroll_runs,
  (SELECT COUNT(*) FROM public.general_expenses)   AS expenses,
  (SELECT COUNT(*) FROM public.referral_sources)   AS referral_sources,
  (SELECT COUNT(*) FROM public.intake_phase_catalog) AS phase_catalog_kept,
  (SELECT COUNT(*) FROM public.payroll_fiscal_config) AS fiscal_config_kept,
  (SELECT COUNT(*) FROM public.app_settings)       AS app_settings_kept;
