-- Verificación de migraciones marcadas como pendientes en CLAUDE.md
-- Pegar TODO el script en Supabase Studio → SQL Editor → Run.
--
-- Devuelve UNA tabla con todos los checks. applied=1 → aplicada, 0 → falta.
-- Supabase Studio muestra solo la última sentencia si hay varios SELECT
-- separados por `;`, por eso usamos UNION ALL en un solo SELECT.

WITH checks AS (
  -- ── 0114 ───────────────────────────────────────────────────────────
  SELECT 1 AS ord, 'mig_0114_family_notes' AS check_name,
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='progress_reports'
            AND column_name='family_notes') AS applied
  UNION ALL
  -- ── 0115 ───────────────────────────────────────────────────────────
  SELECT 2, 'mig_0115_therapist_work_schedule',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='therapist_work_schedule')
  UNION ALL
  SELECT 3, 'mig_0115_users_max_hours_per_week',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='users'
            AND column_name='max_hours_per_week')
  UNION ALL
  -- ── 0116 ───────────────────────────────────────────────────────────
  SELECT 4, 'mig_0116_waitlist_entries',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='waitlist_entries')
  UNION ALL
  SELECT 5, 'mig_0116_waitlist_status_enum',
         (SELECT COUNT(*)::int FROM pg_type WHERE typname='waitlist_status')
  UNION ALL
  -- ── 0107 kinetic ───────────────────────────────────────────────────
  SELECT 6, 'mig_0107_submit_progress_report_file_bypass',
         (SELECT CASE
                   WHEN COUNT(*) = 0 THEN 0
                   WHEN MAX(CASE
                              WHEN pg_get_functiondef(p.oid) LIKE '%upload_kind%'
                               AND pg_get_functiondef(p.oid) LIKE '%file%'
                              THEN 1 ELSE 0
                            END) = 1 THEN 1
                   ELSE 0
                 END
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace=n.oid
          WHERE n.nspname='public' AND p.proname='submit_progress_report')
  UNION ALL
  -- ── 0117 ───────────────────────────────────────────────────────────
  SELECT 7, 'mig_0117_users_salary_cols',
         (SELECT (CASE WHEN COUNT(*)=8 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='users'
            AND column_name IN ('monthly_salary_usd','hourly_rate_usd','contract_type',
                                'dui','isss_number','afp_number','afp_provider','hire_date'))
  UNION ALL
  SELECT 8, 'mig_0117_payroll_fiscal_config',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='payroll_fiscal_config')
  UNION ALL
  SELECT 9, 'mig_0117_payroll_runs',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='payroll_runs')
  UNION ALL
  SELECT 10, 'mig_0117_payroll_items',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='payroll_items')
  UNION ALL
  SELECT 11, 'mig_0117_sign_my_payroll_item_rpc',
         (SELECT COUNT(*)::int FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace=n.oid
          WHERE n.nspname='public' AND p.proname='sign_my_payroll_item')
  UNION ALL
  -- ── 0118 ───────────────────────────────────────────────────────────
  SELECT 12, 'mig_0118_general_expenses',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='general_expenses')
  UNION ALL
  -- ── 0119 ───────────────────────────────────────────────────────────
  SELECT 13, 'mig_0119_child_attachments',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='child_attachments')
  UNION ALL
  SELECT 14, 'mig_0119_child_attachments_kind_check',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='child_attachments'
            AND column_name='kind')
  UNION ALL
  -- ── 0120 ───────────────────────────────────────────────────────────
  SELECT 15, 'mig_0120_submit_session_report_morning',
         (SELECT CASE
                   WHEN COUNT(*) = 0 THEN 0
                   WHEN MAX(CASE
                              WHEN pg_get_functiondef(p.oid) LIKE '%enrolled_program%'
                              THEN 1 ELSE 0
                            END) = 1 THEN 1
                   ELSE 0
                 END
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace=n.oid
          WHERE n.nspname='public' AND p.proname='submit_session_report')
  UNION ALL
  -- ── 0121 ───────────────────────────────────────────────────────────
  SELECT 16, 'mig_0121_intake_phase_catalog',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='intake_phase_catalog')
  UNION ALL
  SELECT 17, 'mig_0121_catalog_seed_count_17',
         (SELECT (CASE WHEN COUNT(*)=17 THEN 1 ELSE 0 END)::int
          FROM intake_phase_catalog)
  UNION ALL
  SELECT 18, 'mig_0121_waitlist_current_phase_code',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='waitlist_entries'
            AND column_name='current_phase_code')
  UNION ALL
  SELECT 19, 'mig_0121_children_current_phase_code',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='children'
            AND column_name='current_phase_code')
  UNION ALL
  SELECT 20, 'mig_0121_child_phase_history',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='child_phase_history')
  UNION ALL
  SELECT 21, 'mig_0121_child_discharge_records',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='child_discharge_records')
  UNION ALL
  SELECT 22, 'mig_0121_dashboard_alerts',
         (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='dashboard_alerts')
  UNION ALL
  SELECT 23, 'mig_0121_sync_legacy_phase_trigger',
         (SELECT COUNT(*)::int FROM pg_trigger t
          JOIN pg_class c ON c.oid=t.tgrelid
          WHERE c.relname='children' AND t.tgname='children_sync_legacy_phase')
  UNION ALL
  -- ── 0122 ───────────────────────────────────────────────────────────
  SELECT 24, 'mig_0122_waitlist_form_fields',
         (SELECT (CASE WHEN COUNT(*)=5 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='waitlist_entries'
            AND column_name IN ('child_age_text','has_previous_evaluation',
                                'referral_channel','referral_channel_other','interest_text'))
  UNION ALL
  -- ── 0123 (destructive cleanup — applied=1 cuando NO existe) ────────
  SELECT 25, 'mig_0123_dropped_waitlist_status_col',
         (SELECT (CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='waitlist_entries'
            AND column_name='status')
  UNION ALL
  SELECT 26, 'mig_0123_dropped_waitlist_status_enum',
         (SELECT (CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END)::int
          FROM pg_type WHERE typname='waitlist_status')
  UNION ALL
  -- ── 0124 (destructive — applied=1 cuando columnas NO existen) ──────
  SELECT 27, 'mig_0124_dropped_children_legacy_cols',
         (SELECT (CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='children'
            AND column_name IN ('intake_phase','intake_phase_changed_at',
                                'treatment_status','treatment_status_changed_at',
                                'treatment_status_notes'))
  UNION ALL
  SELECT 28, 'mig_0124_dropped_sync_legacy_trigger',
         (SELECT (CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END)::int
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          WHERE c.relname='children' AND t.tgname='children_sync_legacy_phase')
  UNION ALL
  SELECT 29, 'mig_0124_current_phase_audit_cols',
         (SELECT (CASE WHEN COUNT(*)=2 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='children'
            AND column_name IN ('current_phase_changed_at','current_phase_notes'))
  UNION ALL
  -- ── 0133 (contable puede crear/editar planes de tratamiento) ──────
  SELECT 30, 'mig_0133_treatment_plans_contable_insert',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_policies
          WHERE schemaname='public' AND tablename='treatment_plans'
            AND policyname='tp insert mgmt'
            AND with_check ILIKE '%contable%')
  UNION ALL
  SELECT 31, 'mig_0133_treatment_plans_contable_update',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_policies
          WHERE schemaname='public' AND tablename='treatment_plans'
            AND policyname='tp update mgmt'
            AND qual ILIKE '%contable%')
  UNION ALL
  -- ── 0119 (recepción ve toda la contabilidad — RLS) ────────────────
  SELECT 32, 'mig_0119_general_expenses_recepcion',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_policies
          WHERE schemaname='public' AND tablename='general_expenses'
            AND policyname='general_expenses_select'
            AND qual ILIKE '%recepcion%')
  UNION ALL
  SELECT 33, 'mig_0119_payroll_runs_recepcion',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_policies
          WHERE schemaname='public' AND tablename='payroll_runs'
            AND policyname='payroll_runs_select'
            AND qual ILIKE '%recepcion%')
)
SELECT
  check_name,
  applied,
  CASE WHEN applied = 1 THEN '✓' ELSE '✗ FALTA' END AS estado
FROM checks
ORDER BY ord;
