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
  UNION ALL
  -- ── 0134 (terapista por tipo de terapia en generación del ciclo) ──
  SELECT 34, 'mig_0134_compute_therapist_per_service',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc
          WHERE proname='compute_monthly_appointment_candidates'
            AND prosrc ILIKE '%v_therapist_map%')
  UNION ALL
  SELECT 35, 'mig_0134_confirm_therapist_per_service',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc
          WHERE proname='confirm_monthly_payment_and_generate'
            AND prosrc ILIKE '%v_therapist_map%')
  UNION ALL
  -- ── 0135 (catálogo de costos + escritura admin/contable/recepción) ─
  SELECT 36, 'mig_0135_service_catalog_cost_usd',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='service_catalog'
            AND column_name='cost_usd')
  UNION ALL
  SELECT 37, 'mig_0135_service_catalog_mgmt_write',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_policies
          WHERE schemaname='public' AND tablename='service_catalog'
            AND policyname='service_catalog_mgmt_write')
  UNION ALL
  -- ── 0136 (ciclo con vencimiento + recargo por mora) ───────────────
  SELECT 38, 'mig_0136_cycle_payment_status',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='monthly_session_cycles'
            AND column_name='payment_status')
  UNION ALL
  SELECT 39, 'mig_0136_cycle_due_date',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='monthly_session_cycles'
            AND column_name IN ('due_date','grace_extended_to','surcharge_amount_usd'))
  UNION ALL
  SELECT 40, 'mig_0136_mark_cycle_paid_rpc',
         (SELECT COUNT(*)::int FROM pg_proc WHERE proname='mark_monthly_cycle_paid')
  UNION ALL
  -- ── 0137 (fix sobrecarga ambigua _kn_slot_dates_in_month) ─────────
  SELECT 41, 'mig_0137_slot_dates_single_overload',
         (SELECT (CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END)::int
          FROM pg_proc WHERE proname='_kn_slot_dates_in_month')
  UNION ALL
  -- ── 0138 (planilla por terapia: contract_type + is_extra) ─────────
  SELECT 42, 'mig_0138_contract_type_por_terapias',
         (SELECT (CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END)::int
          FROM public.users WHERE contract_type = 'por_hora')
  UNION ALL
  SELECT 43, 'mig_0138_appointments_is_extra',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='appointments'
            AND column_name='is_extra')
  UNION ALL
  -- ── 0139 (rollover de terapias no dadas) ──────────────────────────
  SELECT 44, 'mig_0139_cycle_rollover_cols',
         (SELECT (CASE WHEN COUNT(*)=3 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='monthly_session_cycles'
            AND column_name IN ('rollover_mode','rollover_sessions_json','rollover_discount_usd'))
  UNION ALL
  SELECT 45, 'mig_0139_compute_rollover_param',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc
          WHERE proname='compute_monthly_appointment_candidates'
            AND prosrc ILIKE '%p_rollover_sessions%')
  UNION ALL
  -- ── 0140 (despacho + cargo por recogida tardía) ───────────────────
  SELECT 46, 'mig_0140_appointment_dispatch_cols',
         (SELECT (CASE WHEN COUNT(*)=4 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='appointments'
            AND column_name IN ('completed_at','dispatched_at','late_fee_status','dispatch_snoozed_until'))
  UNION ALL
  SELECT 47, 'mig_0140_appointments_realtime',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_publication_tables
          WHERE pubname='supabase_realtime' AND tablename='appointments')
  UNION ALL
  -- ── 0141 (una sola sobrecarga de cada RPC del ciclo) ──────────────
  SELECT 48, 'mig_0141_compute_single_overload',
         (SELECT (CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END)::int
          FROM pg_proc WHERE proname='compute_monthly_appointment_candidates')
  UNION ALL
  SELECT 49, 'mig_0141_confirm_single_overload',
         (SELECT (CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END)::int
          FROM pg_proc WHERE proname='confirm_monthly_payment_and_generate')
  UNION ALL
  -- ── 0142 (dos tipos de planilla: normal + servicios profesionales) ─
  SELECT 50, 'mig_0142_users_payroll_flags',
         (SELECT (CASE WHEN COUNT(*)=2 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='users'
            AND column_name IN ('in_normal_payroll','in_professional_services_payroll'))
  UNION ALL
  SELECT 51, 'mig_0142_fiscal_sp_isr_rate',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='payroll_fiscal_config'
            AND column_name='professional_services_isr_rate')
  UNION ALL
  SELECT 52, 'mig_0142_payroll_runs_type',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='payroll_runs'
            AND column_name='payroll_type')
  UNION ALL
  SELECT 53, 'mig_0142_appointments_extra_reason',
         (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_schema='public' AND table_name='appointments'
            AND column_name='extra_reason')
  UNION ALL
  -- ── 0147 (mensualidad fija programas matutinos) ───────────────────
  SELECT 54, 'mig_0147_is_monthly_flat_helper',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc WHERE proname='_kn_is_monthly_flat')
  UNION ALL
  SELECT 55, 'mig_0147_compute_flat_sin_cuota',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc
          WHERE proname='compute_monthly_appointment_candidates'
            AND prosrc ILIKE '%_kn_is_monthly_flat%')
  UNION ALL
  SELECT 56, 'mig_0147_confirm_linea_mensualidad',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc
          WHERE proname='confirm_monthly_payment_and_generate'
            AND prosrc ILIKE '%_kn_is_monthly_flat%')
  UNION ALL
  SELECT 57, 'mig_0147_absence_autowaive_matutinos',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc
          WHERE proname='mark_appointment_absence'
            AND prosrc ILIKE '%_kn_is_monthly_flat%')
  UNION ALL
  -- ── 0148 (regenerar citas de un ciclo al editarlo) ────────────────
  SELECT 58, 'mig_0148_regenerate_cycle_appointments',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc WHERE proname='regenerate_cycle_appointments')
  UNION ALL
  -- ── 0155 (reposiciones aprobables por ambas coordinadoras) ────────
  SELECT 59, 'mig_0155_resolve_absence_coord_familias',
         (SELECT (CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END)::int
          FROM pg_proc
          WHERE proname='resolve_absence_with_replacement'
            AND prosrc ILIKE '%coordinadora_familias%')
  UNION ALL
  -- ── 0156 (evaluaciones agendables con nombre libre + tipo) ────────
  SELECT 60, 'mig_0156_appointments_child_id_nullable',
         (SELECT (CASE WHEN is_nullable='YES' THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='appointments'
            AND column_name='child_id')
  UNION ALL
  SELECT 61, 'mig_0156_appointments_eval_cols',
         (SELECT (CASE WHEN COUNT(*)=2 THEN 1 ELSE 0 END)::int
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='appointments'
            AND column_name IN ('external_child_name','service_code'))
  UNION ALL
  -- ── 0157 (sin terapista principal: backfill therapist_id por terapia) ─────
  -- applied=1 cuando NO quedan terapias activas NO matutinas sin terapista en
  -- planes activos que sí tienen primary (es decir, el backfill ya corrió).
  SELECT 62, 'mig_0157_backfill_therapist_per_service',
         (SELECT (CASE WHEN COUNT(*)=0 THEN 1 ELSE 0 END)::int
          FROM public.treatment_plans tp
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tp.therapies_json,'[]'::jsonb)) AS e(elem)
          WHERE tp.active = true
            AND tp.primary_therapist_id IS NOT NULL
            AND COALESCE(elem->>'active','true') <> 'false'
            AND ((elem->>'therapist_id') IS NULL OR (elem->>'therapist_id') = '')
            AND COALESCE(elem->>'service','') NOT IN ('blue_kids','learning_kids','aula_educativa'))
)
SELECT
  check_name,
  applied,
  CASE WHEN applied = 1 THEN '✓' ELSE '✗ FALTA' END AS estado
FROM checks
ORDER BY ord;
