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
