-- Verificación de migraciones marcadas como pendientes en CLAUDE.md
-- Pegar en Supabase Studio → SQL Editor → Run.
-- Cada bloque devuelve una fila con `applied`: 1 = migración aplicada, 0 = falta aplicar.
--
-- Si una migración falta, abrir el archivo correspondiente en
-- supabase/migrations/ o supabase/migrations-kinetic/ y pegarlo en el editor.

-- ── 0114: progress_reports.family_notes ────────────────────────────
SELECT 'mig_0114_family_notes' AS check_name, COUNT(*)::int AS applied
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'progress_reports'
  AND column_name = 'family_notes';

-- ── 0115: therapist_work_schedule + users.max_hours_per_week ──────
SELECT 'mig_0115_therapist_work_schedule' AS check_name, COUNT(*)::int AS applied
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'therapist_work_schedule';

SELECT 'mig_0115_users_max_hours_per_week' AS check_name, COUNT(*)::int AS applied
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'max_hours_per_week';

-- ── 0116: waitlist_entries + enum waitlist_status ──────────────────
SELECT 'mig_0116_waitlist_entries' AS check_name, COUNT(*)::int AS applied
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'waitlist_entries';

SELECT 'mig_0116_waitlist_status_enum' AS check_name, COUNT(*)::int AS applied
FROM pg_type WHERE typname = 'waitlist_status';

-- ── 0107 kinetic: submit_progress_report con bypass para upload_kind='file' ──
-- Verifica que el cuerpo del RPC referencia upload_kind y 'file'.
SELECT 'mig_0107_submit_progress_report_file_bypass' AS check_name,
       CASE
         WHEN COUNT(*) = 0 THEN 0
         WHEN MAX(CASE
                    WHEN pg_get_functiondef(p.oid) LIKE '%upload_kind%'
                     AND pg_get_functiondef(p.oid) LIKE '%file%'
                    THEN 1 ELSE 0
                  END) = 1 THEN 1
         ELSE 0
       END AS applied
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'submit_progress_report';

-- ── 0117: módulo de planillas (Fase 8) ─────────────────────────────
-- Crea: columnas salariales en users, payroll_fiscal_config (con seed),
-- payroll_runs, payroll_items, RLS, y RPC sign_my_payroll_item.

SELECT 'mig_0117_users_salary_cols' AS check_name,
       (CASE WHEN COUNT(*) = 8 THEN 1 ELSE 0 END)::int AS applied
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'monthly_salary_usd', 'hourly_rate_usd', 'contract_type',
    'dui', 'isss_number', 'afp_number', 'afp_provider', 'hire_date'
  );

SELECT 'mig_0117_payroll_fiscal_config' AS check_name, COUNT(*)::int AS applied
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'payroll_fiscal_config';

SELECT 'mig_0117_payroll_runs' AS check_name, COUNT(*)::int AS applied
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'payroll_runs';

SELECT 'mig_0117_payroll_items' AS check_name, COUNT(*)::int AS applied
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'payroll_items';

SELECT 'mig_0117_sign_my_payroll_item_rpc' AS check_name, COUNT(*)::int AS applied
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'sign_my_payroll_item';

-- ── 0118: gastos generales (egresos no-planilla) ────────────────────
SELECT 'mig_0118_general_expenses' AS check_name, COUNT(*)::int AS applied
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'general_expenses';

-- ── 0119: child_attachments (adjuntos unificados) ───────────────────
SELECT 'mig_0119_child_attachments' AS check_name, COUNT(*)::int AS applied
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'child_attachments';

SELECT 'mig_0119_child_attachments_kind_check' AS check_name,
       (CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END)::int AS applied
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'child_attachments'
  AND column_name = 'kind';

-- ── 0120: submit_session_report con bypass para morning_program ─────
SELECT 'mig_0120_submit_session_report_morning' AS check_name,
       CASE
         WHEN COUNT(*) = 0 THEN 0
         WHEN MAX(CASE
                    WHEN pg_get_functiondef(p.oid) LIKE '%enrolled_program%'
                    THEN 1 ELSE 0
                  END) = 1 THEN 1
         ELSE 0
       END AS applied
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'submit_session_report';
