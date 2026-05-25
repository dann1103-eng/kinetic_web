-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Parte 3: Seed de datos demo (migraciones 0125 → 0127)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar DESPUÉS de Parte 2.
-- IMPORTANTE: Antes de ejecutar este archivo, crea manualmente los usuarios
-- internos del staff via Authentication → Users → Add user.
--
-- Después de crearlos, actualízalos con su rol y nombre con SQL como:
--   UPDATE public.users SET role = 'admin',     full_name = 'Daniel Mancia' WHERE email = 'tu-email@dominio.com';
--   UPDATE public.users SET role = 'directora', full_name = 'Directora' WHERE email = '...';
--   UPDATE public.users SET role = 'terapista', full_name = 'Terapista 1' WHERE email = '...';
--   -- Crea al menos: 1 admin, 1 directora, 1 coordinadora_familias,
--   --                1 coordinadora_terapias, 1 recepcion, 1 contable,
--   --                1 maestra, 4 terapistas
--
-- 0125 limpia datos previos (en proyecto nuevo no borra nada).
-- 0126 inserta 22 familias + niños + citas + ciclos + invoices + waitlist.
-- 0127 crea 3 planillas mensuales con cálculo ISSS/AFP/ISR.
-- ═══════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0125_cleanup_test_data.sql
-- ────────────────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0126_seed_demo_data.sql
-- ────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 0126 — Seed de datos de demostración
-- ═══════════════════════════════════════════════════════════════════════════
-- Inserta datos ficticios representativos para demostrar y probar el CRM
-- Kinetic en todos sus módulos:
--   • Salarios variados por rol (planilla)
--   • 22 familias / 22 niños con plan de tratamiento activo
--   • Niños en distintas terapias + 2 inscritos en programa matutino BlueKids
--   • 1 niño en pausa temporal (4_1) + 1 con alta terapéutica firmada (5_1)
--   • Citas generadas para marzo–mayo 2026 (semana SV, lun–vie)
--   • Ciclos mensuales + invoices pagadas (mar/abr/may)
--   • Inasistencias con reposición programada
--   • Informes cuatrimestrales en distintos estados (draft → sent_to_family)
--   • 16 entradas en lista de espera distribuidas en las sub-fases 1.x–3.1
--   • Historial de fases + carta de alta firmada
--   • Gastos generales (renta, servicios públicos, etc.) por 3 meses
--
-- EJECUTAR DESPUÉS DE 0125_cleanup_test_data.sql.
-- Apellidos y nombres son ficticios (privacidad de pacientes Kinetic).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ── Familias (22) ──────────────────────────────────────────────────────
  v_f01 uuid; v_f02 uuid; v_f03 uuid; v_f04 uuid; v_f05 uuid; v_f06 uuid;
  v_f07 uuid; v_f08 uuid; v_f09 uuid; v_f10 uuid; v_f11 uuid; v_f12 uuid;
  v_f13 uuid; v_f14 uuid; v_f15 uuid; v_f16 uuid; v_f17 uuid; v_f18 uuid;
  v_f19 uuid; v_f20 uuid; v_f21 uuid; v_f22 uuid;
  -- ── Niños (22) ─────────────────────────────────────────────────────────
  v_c01 uuid; v_c02 uuid; v_c03 uuid; v_c04 uuid; v_c05 uuid; v_c06 uuid;
  v_c07 uuid; v_c08 uuid; v_c09 uuid; v_c10 uuid; v_c11 uuid; v_c12 uuid;
  v_c13 uuid; v_c14 uuid; v_c15 uuid; v_c16 uuid; v_c17 uuid; v_c18 uuid;
  v_c19 uuid; v_c20 uuid; v_c21 uuid; v_c22 uuid;
  -- ── Fuentes de referido ────────────────────────────────────────────────
  v_rs1 uuid; v_rs2 uuid; v_rs3 uuid; v_rs4 uuid;
  -- ── Staff ──────────────────────────────────────────────────────────────
  v_admin_id uuid; v_dir_id uuid; v_cof_id uuid; v_cot_id uuid;
  v_rec_id   uuid; v_cnt_id uuid; v_mae_id uuid;
  v_tids uuid[];   v_tcnt int;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid;
  -- ── Helpers ────────────────────────────────────────────────────────────
  v_invn   int := 0;
  v_inv_id uuid;
  v_appt_id uuid;
  v_months date[];
  v_m date;
BEGIN
  -- ════════════════════════════════════════════════════════════════════════
  -- 0. Asignar UUIDs para familias y niños
  -- ════════════════════════════════════════════════════════════════════════
  v_f01:=gen_random_uuid(); v_f02:=gen_random_uuid(); v_f03:=gen_random_uuid();
  v_f04:=gen_random_uuid(); v_f05:=gen_random_uuid(); v_f06:=gen_random_uuid();
  v_f07:=gen_random_uuid(); v_f08:=gen_random_uuid(); v_f09:=gen_random_uuid();
  v_f10:=gen_random_uuid(); v_f11:=gen_random_uuid(); v_f12:=gen_random_uuid();
  v_f13:=gen_random_uuid(); v_f14:=gen_random_uuid(); v_f15:=gen_random_uuid();
  v_f16:=gen_random_uuid(); v_f17:=gen_random_uuid(); v_f18:=gen_random_uuid();
  v_f19:=gen_random_uuid(); v_f20:=gen_random_uuid(); v_f21:=gen_random_uuid();
  v_f22:=gen_random_uuid();
  v_c01:=gen_random_uuid(); v_c02:=gen_random_uuid(); v_c03:=gen_random_uuid();
  v_c04:=gen_random_uuid(); v_c05:=gen_random_uuid(); v_c06:=gen_random_uuid();
  v_c07:=gen_random_uuid(); v_c08:=gen_random_uuid(); v_c09:=gen_random_uuid();
  v_c10:=gen_random_uuid(); v_c11:=gen_random_uuid(); v_c12:=gen_random_uuid();
  v_c13:=gen_random_uuid(); v_c14:=gen_random_uuid(); v_c15:=gen_random_uuid();
  v_c16:=gen_random_uuid(); v_c17:=gen_random_uuid(); v_c18:=gen_random_uuid();
  v_c19:=gen_random_uuid(); v_c20:=gen_random_uuid(); v_c21:=gen_random_uuid();
  v_c22:=gen_random_uuid();

  -- ════════════════════════════════════════════════════════════════════════
  -- 1. IDs del equipo (con fallback a admin si rol no existe)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_admin_id FROM public.users WHERE role='admin' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_dir_id   FROM public.users WHERE role='directora' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cof_id   FROM public.users WHERE role='coordinadora_familias' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cot_id   FROM public.users WHERE role='coordinadora_terapias' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_rec_id   FROM public.users WHERE role='recepcion' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cnt_id   FROM public.users WHERE role='contable' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_mae_id   FROM public.users WHERE role='maestra' ORDER BY created_at LIMIT 1;

  v_dir_id := COALESCE(v_dir_id, v_admin_id);
  v_cof_id := COALESCE(v_cof_id, v_admin_id);
  v_cot_id := COALESCE(v_cot_id, v_admin_id);
  v_rec_id := COALESCE(v_rec_id, v_admin_id);
  v_cnt_id := COALESCE(v_cnt_id, v_admin_id);
  v_mae_id := COALESCE(v_mae_id, v_admin_id);

  SELECT ARRAY_AGG(id ORDER BY created_at)
    INTO v_tids FROM public.users WHERE role='terapista';
  IF v_tids IS NULL OR array_length(v_tids,1) = 0 THEN
    v_tids := ARRAY[v_admin_id]; v_tcnt := 1;
  ELSE
    v_tcnt := array_length(v_tids,1);
  END IF;
  v_t1 := v_tids[1];
  v_t2 := v_tids[1 + (1 % v_tcnt)];
  v_t3 := v_tids[1 + (2 % v_tcnt)];
  v_t4 := v_tids[1 + (3 % v_tcnt)];

  -- ════════════════════════════════════════════════════════════════════════
  -- 2. Salarios del equipo (mensual_fijo para todos menos terapistas)
  -- ════════════════════════════════════════════════════════════════════════
  UPDATE public.users SET
    monthly_salary_usd=1400, contract_type='mensual_fijo', afp_provider='confia',
    hire_date='2021-06-01'
  WHERE role='admin';

  UPDATE public.users SET
    monthly_salary_usd=1200, contract_type='mensual_fijo', afp_provider='crecer',
    hire_date='2022-01-15'
  WHERE role='directora';

  UPDATE public.users SET
    monthly_salary_usd=900, contract_type='mensual_fijo', afp_provider='confia',
    hire_date='2022-03-01'
  WHERE role='coordinadora_familias';

  UPDATE public.users SET
    monthly_salary_usd=850, contract_type='mensual_fijo', afp_provider='crecer',
    hire_date='2022-06-01'
  WHERE role='coordinadora_terapias';

  UPDATE public.users SET
    monthly_salary_usd=550, contract_type='mensual_fijo', afp_provider='confia',
    hire_date='2023-01-10'
  WHERE role='recepcion';

  UPDATE public.users SET
    monthly_salary_usd=800, contract_type='mensual_fijo', afp_provider='crecer',
    hire_date='2022-09-01'
  WHERE role='contable';

  UPDATE public.users SET
    monthly_salary_usd=700, contract_type='mensual_fijo', afp_provider='confia',
    hire_date='2023-03-01'
  WHERE role='maestra';

  -- Terapistas: contrato por hora, tarifa $12.50
  UPDATE public.users SET
    hourly_rate_usd=12.50, contract_type='por_hora', afp_provider='crecer',
    hire_date='2023-01-01'
  WHERE role='terapista';

  -- Cap semanal de horas (para que el dashboard de capacidad muestre datos útiles)
  UPDATE public.users SET max_hours_per_week = 30 WHERE role='terapista' AND max_hours_per_week IS NULL;

  -- ════════════════════════════════════════════════════════════════════════
  -- 3. Fuentes de referido (4)
  -- ════════════════════════════════════════════════════════════════════════
  v_rs1 := gen_random_uuid();
  v_rs2 := gen_random_uuid();
  v_rs3 := gen_random_uuid();
  v_rs4 := gen_random_uuid();

  INSERT INTO public.referral_sources (id, type, name, specialty, partnership_active, can_receive_reports) VALUES
    (v_rs1, 'doctor',       'Dra. Ana Beltrán',          'Neurología pediátrica', true,  true),
    (v_rs2, 'school',        'Colegio Salesiano San José', NULL,                    true,  true),
    (v_rs3, 'social_media',  'Instagram Kinetic',          NULL,                    true,  false),
    (v_rs4, 'direct',        'Recomendación familia',      NULL,                    true,  false);

  -- ════════════════════════════════════════════════════════════════════════
  -- 4. Familias (22)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.families (
    id, primary_contact_name, primary_contact_email, primary_contact_phone,
    secondary_contact_name, secondary_contact_phone,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    fiscal_legal_name, fiscal_dui, fiscal_address, status, created_by_user_id
  ) VALUES
    (v_f01, 'Luis Zelaya / María Zelaya',       'familia.zelaya@ejemplo.com',     '+503 7100-0001', 'María Zelaya',     '+503 7100-1001', 'Carmen Zelaya',   '+503 7100-2001', 'Abuela',       'Luis Zelaya',       '01001001-1', 'San Salvador',   'active', v_rec_id),
    (v_f02, 'Carlos Escobar / Ana Escobar',     'familia.escobar@ejemplo.com',    '+503 7100-0002', 'Ana Escobar',      '+503 7100-1002', 'Roberto Escobar', '+503 7100-2002', 'Tío',          'Carlos Escobar',    '01001002-2', 'Santa Tecla',    'active', v_rec_id),
    (v_f03, 'Andrea Molina',                    'familia.molina@ejemplo.com',     '+503 7100-0003', NULL,               NULL,             'Sofía Molina',    '+503 7100-2003', 'Abuela',       'Andrea Molina',     '01001003-3', 'Antiguo Cuscatlán', 'active', v_rec_id),
    (v_f04, 'José Hernández / Patricia Hernández', 'familia.hernandez@ejemplo.com', '+503 7100-0004', 'Patricia Hernández', '+503 7100-1004', 'Eduardo Hernández', '+503 7100-2004', 'Padre',     'José Hernández',    '01001004-4', 'Soyapango',      'active', v_rec_id),
    (v_f05, 'Marta Ramos',                      'familia.ramos@ejemplo.com',      '+503 7100-0005', NULL,               NULL,             'Pedro Ramos',     '+503 7100-2005', 'Padre',        'Marta Ramos',       '01001005-5', 'San Salvador',   'active', v_rec_id),
    (v_f06, 'Daniel Flores / Lucía Flores',     'familia.flores@ejemplo.com',     '+503 7100-0006', 'Lucía Flores',     '+503 7100-1006', 'Carmen Flores',   '+503 7100-2006', 'Abuela',       'Daniel Flores',     '01001006-6', 'San Salvador',   'active', v_rec_id),
    (v_f07, 'Roberto Reyes / Karina Reyes',     'familia.reyes@ejemplo.com',      '+503 7100-0007', 'Karina Reyes',     '+503 7100-1007', 'Roberto Reyes Sr.', '+503 7100-2007', 'Abuelo',     'Roberto Reyes',     '01001007-7', 'Mejicanos',      'active', v_rec_id),
    (v_f08, 'Sandra Gutiérrez',                 'familia.gutierrez@ejemplo.com',  '+503 7100-0008', NULL,               NULL,             'Miguel Gutiérrez', '+503 7100-2008', 'Tío',         'Sandra Gutiérrez',  '01001008-8', 'San Salvador',   'active', v_rec_id),
    (v_f09, 'Javier Mendoza / Laura Mendoza',   'familia.mendoza@ejemplo.com',    '+503 7100-0009', 'Laura Mendoza',    '+503 7100-1009', 'Diego Mendoza',   '+503 7100-2009', 'Tío',          'Javier Mendoza',    '01001009-9', 'Santa Tecla',    'active', v_rec_id),
    (v_f10, 'Ricardo Castillo / Beatriz Castillo', 'familia.castillo@ejemplo.com', '+503 7100-0010', 'Beatriz Castillo', '+503 7100-1010', 'Verónica Castillo','+503 7100-2010', 'Tía',         'Ricardo Castillo',  '01001010-0', 'San Salvador',   'active', v_rec_id),
    (v_f11, 'Alejandra Aguilar',                'familia.aguilar@ejemplo.com',    '+503 7100-0011', NULL,               NULL,             'Manuel Aguilar',  '+503 7100-2011', 'Padre',        'Alejandra Aguilar', '01001011-1', 'Antiguo Cuscatlán', 'active', v_rec_id),
    (v_f12, 'Mario Vásquez / Cecilia Vásquez',  'familia.vasquez@ejemplo.com',    '+503 7100-0012', 'Cecilia Vásquez',  '+503 7100-1012', 'Hilda Vásquez',   '+503 7100-2012', 'Abuela',       'Mario Vásquez',     '01001012-2', 'San Salvador',   'active', v_rec_id),
    (v_f13, 'Patricia Romero',                  'familia.romero@ejemplo.com',     '+503 7100-0013', NULL,               NULL,             'Francisco Romero','+503 7100-2013', 'Padre',        'Patricia Romero',   '01001013-3', 'Soyapango',      'active', v_rec_id),
    (v_f14, 'Fernando Montes / Silvia Montes',  'familia.montes@ejemplo.com',     '+503 7100-0014', 'Silvia Montes',    '+503 7100-1014', 'Julio Montes',    '+503 7100-2014', 'Abuelo',       'Fernando Montes',   '01001014-4', 'San Salvador',   'active', v_rec_id),
    (v_f15, 'Carolina Torres / Esteban Torres', 'familia.torres@ejemplo.com',     '+503 7100-0015', 'Esteban Torres',   '+503 7100-1015', 'Marina Torres',   '+503 7100-2015', 'Abuela',       'Carolina Torres',   '01001015-5', 'Santa Tecla',    'active', v_rec_id),
    (v_f16, 'Hugo Castro / Norma Castro',       'familia.castro@ejemplo.com',     '+503 7100-0016', 'Norma Castro',     '+503 7100-1016', 'Daniel Castro',   '+503 7100-2016', 'Tío',          'Hugo Castro',       '01001016-6', 'San Salvador',   'paused', v_rec_id),
    (v_f17, 'Lorena Martínez',                  'familia.martinez@ejemplo.com',   '+503 7100-0017', NULL,               NULL,             'Antonio Martínez','+503 7100-2017', 'Padre',        'Lorena Martínez',   '01001017-7', 'San Salvador',   'active', v_rec_id),
    (v_f18, 'Enrique López / Mariana López',    'familia.lopez@ejemplo.com',      '+503 7100-0018', 'Mariana López',    '+503 7100-1018', 'Lupe López',      '+503 7100-2018', 'Abuela',       'Enrique López',     '01001018-8', 'Mejicanos',      'active', v_rec_id),
    (v_f19, 'Verónica Pérez',                   'familia.perez@ejemplo.com',      '+503 7100-0019', NULL,               NULL,             'Carlos Pérez',    '+503 7100-2019', 'Padre',        'Verónica Pérez',    '01001019-9', 'San Salvador',   'active', v_rec_id),
    (v_f20, 'Óscar Morales / Marina Morales',   'familia.morales@ejemplo.com',    '+503 7100-0020', 'Marina Morales',   '+503 7100-1020', 'Rafael Morales',  '+503 7100-2020', 'Abuelo',       'Óscar Morales',     '01001020-0', 'Antiguo Cuscatlán', 'active', v_rec_id),
    (v_f21, 'Adriana Sánchez / Pablo Sánchez',  'familia.sanchez@ejemplo.com',    '+503 7100-0021', 'Pablo Sánchez',    '+503 7100-1021', 'Elena Sánchez',   '+503 7100-2021', 'Abuela',       'Adriana Sánchez',   '01001021-1', 'San Salvador',   'active', v_rec_id),
    (v_f22, 'Tomás Rivera / Gloria Rivera',     'familia.rivera@ejemplo.com',     '+503 7100-0022', 'Gloria Rivera',    '+503 7100-1022', 'Roberto Rivera',  '+503 7100-2022', 'Tío',          'Tomás Rivera',      '01001022-2', 'San Salvador',   'active', v_rec_id);

  -- ════════════════════════════════════════════════════════════════════════
  -- 5. Niños (22)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.children (
    id, family_id, full_name, preferred_name, birth_date, gender,
    school_name, school_grade,
    diagnoses_json, diagnoses_display_text,
    referral_source_type, referral_source_id,
    enrolled_program, enrollment_started_at,
    current_phase_code, current_phase_changed_at,
    created_by_user_id
  ) VALUES
    (v_c01, v_f01, 'Sofía Zelaya Mejía',       'Sofía',     '2022-04-15', 'F', 'Kinder Mi Mundo',         'Parvulario 4',  '["retraso_lenguaje"]'::jsonb,         'Retraso de lenguaje expresivo',           'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2026-01-15', v_rec_id),
    (v_c02, v_f02, 'Mateo Escobar Linares',    'Mateo',     '2020-08-22', 'M', 'Colegio Británico',       'Primero',       '["tdah","sensorial"]'::jsonb,         'TDAH + procesamiento sensorial',          'school',       v_rs2, NULL, NULL, '3_3_activo_en_terapias', '2025-11-10', v_rec_id),
    (v_c03, v_f03, 'Valentina Molina Cáceres', 'Valentina', '2021-02-10', 'F', 'Colegio Bilingüe Maya',   'Kinder',        '["ansiedad"]'::jsonb,                 'Ansiedad generalizada',                   'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2025-12-05', v_rec_id),
    (v_c04, v_f04, 'Diego Hernández Soto',     'Diego',     '2019-06-30', 'M', 'Liceo San Luis',          'Segundo',       '["tea_nivel_1"]'::jsonb,              'TEA nivel 1 (Asperger)',                  'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2025-09-20', v_rec_id),
    (v_c05, v_f05, 'Isabella Ramos Galdámez',  'Isabella',  '2018-03-18', 'F', 'Colegio Don Bosco',       'Tercero',       '["dislexia"]'::jsonb,                 'Dislexia',                                'school',       v_rs2, NULL, NULL, '3_3_activo_en_terapias', '2025-10-15', v_rec_id),
    (v_c06, v_f06, 'Santiago Flores Bermúdez', 'Santi',     '2023-01-12', 'M', NULL,                       NULL,            '["retraso_lenguaje","tea_nivel_2"]'::jsonb, 'TEA nivel 2 + retraso de lenguaje',   'social_media', v_rs3, 'blue_kids', '2026-01-13', '3_3_activo_en_terapias', '2026-01-13', v_rec_id),
    (v_c07, v_f07, 'Camila Reyes Aguilar',     'Cami',      '2021-05-04', 'F', 'Kinder Pequeños Pasos',   'Parvulario 5',  '["torpeza_motora"]'::jsonb,           'Coordinación motora',                     'direct',       v_rs4, NULL, NULL, '3_3_activo_en_terapias', '2025-12-01', v_rec_id),
    (v_c08, v_f08, 'Lucas Gutiérrez Mejía',    'Lucas',     '2017-09-08', 'M', 'Liceo Salvadoreño',       'Cuarto',        '["tdah","conductual"]'::jsonb,        'TDAH + alteraciones conductuales',        'school',       v_rs2, NULL, NULL, '3_3_activo_en_terapias', '2025-08-15', v_rec_id),
    (v_c09, v_f09, 'Valentina Mendoza López',  'Vale',      '2022-07-25', 'F', 'Kinder Mi Mundo',         'Parvulario 4',  '["sensorial"]'::jsonb,                'Trastorno de procesamiento sensorial',    'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2026-01-22', v_rec_id),
    (v_c10, v_f10, 'Nicolás Castillo Pineda',  'Nico',      '2020-11-14', 'M', 'Colegio Británico',       'Primero',       '["retraso_lenguaje"]'::jsonb,         'Retraso de lenguaje',                     'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2025-10-08', v_rec_id),
    (v_c11, v_f11, 'Emma Aguilar Cruz',        'Emma',      '2019-04-02', 'F', 'Colegio Bilingüe Maya',   'Segundo',       '["ansiedad","tdah"]'::jsonb,          'TDAH + ansiedad escolar',                 'direct',       v_rs4, NULL, NULL, '3_3_activo_en_terapias', '2025-11-20', v_rec_id),
    (v_c12, v_f12, 'Pablo Vásquez Henríquez',  'Pablito',   '2021-08-17', 'M', 'Kinder Pequeños Pasos',   'Parvulario 5',  '["torpeza_motora"]'::jsonb,           'Hipotonía leve',                          'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2026-02-01', v_rec_id),
    (v_c13, v_f13, 'Ana Romero Quintanilla',   'Ana',       '2018-12-09', 'F', 'Liceo San Luis',          'Tercero',       '["funciones_ejecutivas"]'::jsonb,     'Dificultades de funciones ejecutivas',    'school',       v_rs2, NULL, NULL, '3_3_activo_en_terapias', '2025-09-05', v_rec_id),
    (v_c14, v_f14, 'Daniel Montes Romero',     'Dani',      '2020-03-21', 'M', 'Colegio Británico',       'Primero',       '["motricidad_fina"]'::jsonb,          'Dificultades de motricidad fina',         'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2025-11-12', v_rec_id),
    (v_c15, v_f15, 'María Torres Sánchez',     'Mariíta',   '2023-02-28', 'F', NULL,                       NULL,            '["retraso_global"]'::jsonb,           'Retraso global del desarrollo',           'social_media', v_rs3, 'blue_kids', '2026-01-13', '3_3_activo_en_terapias', '2026-01-13', v_rec_id),
    (v_c16, v_f16, 'Alejandro Castro Reyes',   'Alex',      '2016-07-11', 'M', 'Liceo Salvadoreño',       'Quinto',        '["dislexia","tdah"]'::jsonb,          'Dislexia + TDAH',                         'school',       v_rs2, NULL, NULL, '4_1_pausa_temporal',     '2026-05-01', v_rec_id),
    (v_c17, v_f17, 'Valeria Martínez Beltrán', 'Vale',      '2021-09-30', 'F', 'Colegio Bilingüe Maya',   'Kinder',        '["ansiedad"]'::jsonb,                 'Ansiedad de separación',                  'direct',       v_rs4, NULL, NULL, '3_3_activo_en_terapias', '2025-12-15', v_rec_id),
    (v_c18, v_f18, 'Carlos López Aguilar',     'Carlitos',  '2019-01-25', 'M', 'Colegio Don Bosco',       'Segundo',       '["motricidad_fina"]'::jsonb,          'Disgrafía',                               'school',       v_rs2, NULL, NULL, '3_3_activo_en_terapias', '2025-10-30', v_rec_id),
    (v_c19, v_f19, 'Lucía Pérez Galdámez',     'Lucy',      '2020-05-13', 'F', 'Kinder Mi Mundo',         'Primero',       '["dislexia","retraso_lenguaje"]'::jsonb, 'Dislexia + retraso de lenguaje',       'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2025-11-05', v_rec_id),
    (v_c20, v_f20, 'Gabriel Morales Cruz',     'Gabo',      '2017-04-18', 'M', 'Liceo Salvadoreño',       'Cuarto',        '["conductual"]'::jsonb,               'Alteraciones conductuales',               'direct',       v_rs4, NULL, NULL, '5_1_alta_terapeutica',   '2026-05-10', v_rec_id),
    (v_c21, v_f21, 'Ximena Sánchez Torres',    'Xime',      '2022-06-08', 'F', 'Kinder Pequeños Pasos',   'Parvulario 4',  '["sensorial","motricidad_fina"]'::jsonb, 'Procesamiento sensorial + motricidad', 'doctor',       v_rs1, NULL, NULL, '3_3_activo_en_terapias', '2026-01-08', v_rec_id),
    (v_c22, v_f22, 'Roberto Rivera Mejía',     'Robert',    '2021-10-19', 'M', 'Colegio Británico',       'Kinder',        '["retraso_lenguaje"]'::jsonb,         'Retraso de lenguaje',                     'social_media', v_rs3, NULL, NULL, '3_3_activo_en_terapias', '2025-12-20', v_rec_id);

  -- ════════════════════════════════════════════════════════════════════════
  -- 6. Treatment plans (uno por niño)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.treatment_plans (
    child_id, primary_therapist_id, diagnosis_text, starts_at,
    therapies_json, schedule_pattern_json, monthly_total_usd, active,
    created_by_user_id
  ) VALUES
    -- c01: Sofía — lenguaje 2/sem
    (v_c01, v_t1, 'Retraso de lenguaje expresivo', '2026-01-15',
      '[{"service":"lenguaje","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"09:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"wed","time_local":"09:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
      360, true, v_cot_id),
    -- c02: Mateo — motricidad_gruesa 2/sem
    (v_c02, v_t2, 'TDAH + procesamiento sensorial', '2025-11-10',
      '[{"service":"motricidad_gruesa","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"10:00","duration_minutes":45,"service":"motricidad_gruesa"},{"day_of_week":"thu","time_local":"10:00","duration_minutes":45,"service":"motricidad_gruesa"}]'::jsonb,
      360, true, v_cot_id),
    -- c03: Valentina — psicológica 2/sem
    (v_c03, v_t1, 'Ansiedad generalizada', '2025-12-05',
      '[{"service":"psicologica","active":true,"sessions_per_month":8,"unit_cost_usd":50}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"15:30","duration_minutes":45,"service":"psicologica"},{"day_of_week":"thu","time_local":"15:30","duration_minutes":45,"service":"psicologica"}]'::jsonb,
      400, true, v_cot_id),
    -- c04: Diego — lenguaje 2/sem + ocupacional 1/sem
    (v_c04, v_t2, 'TEA nivel 1', '2025-09-20',
      '[{"service":"lenguaje","active":true,"sessions_per_month":8,"unit_cost_usd":40},{"service":"ocupacional","active":true,"sessions_per_month":4,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"14:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"wed","time_local":"14:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"tue","time_local":"11:00","duration_minutes":45,"service":"ocupacional"}]'::jsonb,
      500, true, v_cot_id),
    -- c05: Isabella — lectoescritura 2/sem
    (v_c05, v_t4, 'Dislexia', '2025-10-15',
      '[{"service":"lectoescritura","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"10:00","duration_minutes":45,"service":"lectoescritura"},{"day_of_week":"fri","time_local":"10:00","duration_minutes":45,"service":"lectoescritura"}]'::jsonb,
      360, true, v_cot_id),
    -- c06: Santiago — BlueKids + lenguaje 1/sem
    (v_c06, v_t1, 'TEA nivel 2 + retraso de lenguaje', '2026-01-13',
      '[{"service":"blue_kids","active":true,"sessions_per_month":20,"unit_cost_usd":20},{"service":"lenguaje","active":true,"sessions_per_month":4,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"14:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
      580, true, v_cot_id),
    -- c07: Camila — motricidad_fina 2/sem
    (v_c07, v_t3, 'Coordinación motora', '2025-12-01',
      '[{"service":"motricidad_fina","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"11:00","duration_minutes":45,"service":"motricidad_fina"},{"day_of_week":"thu","time_local":"11:00","duration_minutes":45,"service":"motricidad_fina"}]'::jsonb,
      360, true, v_cot_id),
    -- c08: Lucas — conductual 2/sem
    (v_c08, v_t1, 'TDAH + conductual', '2025-08-15',
      '[{"service":"conductual","active":true,"sessions_per_month":8,"unit_cost_usd":50}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"16:00","duration_minutes":45,"service":"conductual"},{"day_of_week":"fri","time_local":"16:00","duration_minutes":45,"service":"conductual"}]'::jsonb,
      400, true, v_cot_id),
    -- c09: Valentina M. — sensorial 2/sem
    (v_c09, v_t4, 'Trastorno de procesamiento sensorial', '2026-01-22',
      '[{"service":"sensorial","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"16:00","duration_minutes":45,"service":"sensorial"},{"day_of_week":"wed","time_local":"16:00","duration_minutes":45,"service":"sensorial"}]'::jsonb,
      360, true, v_cot_id),
    -- c10: Nicolás — lenguaje 2/sem
    (v_c10, v_t2, 'Retraso de lenguaje', '2025-10-08',
      '[{"service":"lenguaje","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"09:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"thu","time_local":"09:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
      360, true, v_cot_id),
    -- c11: Emma — psicológica 2/sem
    (v_c11, v_t3, 'TDAH + ansiedad', '2025-11-20',
      '[{"service":"psicologica","active":true,"sessions_per_month":8,"unit_cost_usd":50}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"12:00","duration_minutes":45,"service":"psicologica"},{"day_of_week":"wed","time_local":"12:00","duration_minutes":45,"service":"psicologica"}]'::jsonb,
      400, true, v_cot_id),
    -- c12: Pablo — motricidad_gruesa 2/sem
    (v_c12, v_t1, 'Hipotonía leve', '2026-02-01',
      '[{"service":"motricidad_gruesa","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"wed","time_local":"14:00","duration_minutes":45,"service":"motricidad_gruesa"},{"day_of_week":"fri","time_local":"14:00","duration_minutes":45,"service":"motricidad_gruesa"}]'::jsonb,
      360, true, v_cot_id),
    -- c13: Ana — funciones ejecutivas 2/sem
    (v_c13, v_t4, 'Funciones ejecutivas', '2025-09-05',
      '[{"service":"funciones_ejecutivas","active":true,"sessions_per_month":8,"unit_cost_usd":50}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"14:30","duration_minutes":45,"service":"funciones_ejecutivas"},{"day_of_week":"thu","time_local":"14:30","duration_minutes":45,"service":"funciones_ejecutivas"}]'::jsonb,
      400, true, v_cot_id),
    -- c14: Daniel — ocupacional 2/sem
    (v_c14, v_t2, 'Motricidad fina', '2025-11-12',
      '[{"service":"ocupacional","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"16:30","duration_minutes":45,"service":"ocupacional"},{"day_of_week":"thu","time_local":"16:30","duration_minutes":45,"service":"ocupacional"}]'::jsonb,
      360, true, v_cot_id),
    -- c15: María — BlueKids + lenguaje 1/sem
    (v_c15, v_t3, 'Retraso global del desarrollo', '2026-01-13',
      '[{"service":"blue_kids","active":true,"sessions_per_month":20,"unit_cost_usd":20},{"service":"lenguaje","active":true,"sessions_per_month":4,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"14:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
      580, true, v_cot_id),
    -- c16: Alejandro — lenguaje 2/sem (PAUSADO)
    (v_c16, v_t1, 'Dislexia + TDAH', '2025-09-15',
      '[{"service":"lenguaje","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"11:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"wed","time_local":"11:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
      360, true, v_cot_id),
    -- c17: Valeria — psicológica 2/sem
    (v_c17, v_t4, 'Ansiedad de separación', '2025-12-15',
      '[{"service":"psicologica","active":true,"sessions_per_month":8,"unit_cost_usd":50}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"13:00","duration_minutes":45,"service":"psicologica"},{"day_of_week":"thu","time_local":"13:00","duration_minutes":45,"service":"psicologica"}]'::jsonb,
      400, true, v_cot_id),
    -- c18: Carlos — motricidad_fina 2/sem
    (v_c18, v_t3, 'Disgrafía', '2025-10-30',
      '[{"service":"motricidad_fina","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"15:00","duration_minutes":45,"service":"motricidad_fina"},{"day_of_week":"fri","time_local":"15:00","duration_minutes":45,"service":"motricidad_fina"}]'::jsonb,
      360, true, v_cot_id),
    -- c19: Lucía — lenguaje 2/sem + lectoescritura 1/sem
    (v_c19, v_t4, 'Dislexia + retraso lenguaje', '2025-11-05',
      '[{"service":"lenguaje","active":true,"sessions_per_month":8,"unit_cost_usd":40},{"service":"lectoescritura","active":true,"sessions_per_month":4,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"15:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"wed","time_local":"15:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"thu","time_local":"16:00","duration_minutes":45,"service":"lectoescritura"}]'::jsonb,
      500, true, v_cot_id),
    -- c20: Gabriel — conductual 2/sem (ALTA)
    (v_c20, v_t2, 'Conductual', '2025-06-10',
      '[{"service":"conductual","active":false,"sessions_per_month":8,"unit_cost_usd":50}]'::jsonb,
      '[{"day_of_week":"tue","time_local":"17:00","duration_minutes":45,"service":"conductual"},{"day_of_week":"fri","time_local":"17:00","duration_minutes":45,"service":"conductual"}]'::jsonb,
      400, false, v_cot_id),
    -- c21: Ximena — ocupacional 2/sem + sensorial 1/sem
    (v_c21, v_t3, 'Procesamiento sensorial + motricidad', '2026-01-08',
      '[{"service":"ocupacional","active":true,"sessions_per_month":8,"unit_cost_usd":45},{"service":"sensorial","active":true,"sessions_per_month":4,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"mon","time_local":"10:00","duration_minutes":45,"service":"ocupacional"},{"day_of_week":"thu","time_local":"10:00","duration_minutes":45,"service":"ocupacional"},{"day_of_week":"wed","time_local":"11:00","duration_minutes":45,"service":"sensorial"}]'::jsonb,
      540, true, v_cot_id),
    -- c22: Roberto — lenguaje 2/sem
    (v_c22, v_t2, 'Retraso de lenguaje', '2025-12-20',
      '[{"service":"lenguaje","active":true,"sessions_per_month":8,"unit_cost_usd":45}]'::jsonb,
      '[{"day_of_week":"wed","time_local":"09:00","duration_minutes":45,"service":"lenguaje"},{"day_of_week":"fri","time_local":"09:00","duration_minutes":45,"service":"lenguaje"}]'::jsonb,
      360, true, v_cot_id);

  -- ════════════════════════════════════════════════════════════════════════
  -- 7. Appointments (marzo–mayo 2026)
  --    Patrón: generate_series semanal por slot. Status auto:
  --      starts_at::date < '2026-05-21' → 'completed', else → 'scheduled'.
  --    Niños en pausa/alta (c16, c20) solo reciben citas hasta abr 30.
  -- ════════════════════════════════════════════════════════════════════════

  -- c01 — Mon/Wed 09:00 lenguaje
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c01, v_t1, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '9 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '9 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c01, v_t1, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '9 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '9 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c02 — Tue/Thu 10:00 motricidad_gruesa
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c02, v_t2, 'terapia', 'motricidad_gruesa', 'presencial',
    (gs + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c02, v_t2, 'terapia', 'motricidad_gruesa', 'presencial',
    (gs + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c03 — Mon/Thu 15:30 psicologica
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c03, v_t1, 'terapia', 'psicologica', 'presencial',
    (gs + INTERVAL '15 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '16 hours 15 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c03, v_t1, 'terapia', 'psicologica', 'presencial',
    (gs + INTERVAL '15 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '16 hours 15 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c04 — Mon/Wed 14:00 lenguaje + Tue 11:00 ocupacional
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c04, v_t2, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '14 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '14 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c04, v_t2, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '14 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '14 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c04, v_t2, 'terapia', 'ocupacional', 'presencial',
    (gs + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '11 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c05 — Tue/Fri 10:00 lectoescritura
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c05, v_t4, 'terapia', 'lectoescritura', 'presencial',
    (gs + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c05, v_t4, 'terapia', 'lectoescritura', 'presencial',
    (gs + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-06'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c06 — Tue 14:00 lenguaje (con v_t1) + Mon–Fri 07:30 BlueKids (con maestra)
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c06, v_t1, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '14 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '14 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c06, v_mae_id, 'programa_matutino', 'blue_kids', 'presencial',
    (gs + INTERVAL '7 hours 30 min')  AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-29'::timestamp, '1 day'::interval) AS gs
  WHERE EXTRACT(DOW FROM gs::date) BETWEEN 1 AND 5;

  -- c07 — Mon/Thu 11:00 motricidad_fina
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c07, v_t3, 'terapia', 'motricidad_fina', 'presencial',
    (gs + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '11 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c07, v_t3, 'terapia', 'motricidad_fina', 'presencial',
    (gs + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '11 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c08 — Tue/Fri 16:00 conductual
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c08, v_t1, 'terapia', 'conductual', 'presencial',
    (gs + INTERVAL '16 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '16 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c08, v_t1, 'terapia', 'conductual', 'presencial',
    (gs + INTERVAL '16 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '16 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-06'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c09 — Mon/Wed 16:00 sensorial
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c09, v_t4, 'terapia', 'sensorial', 'presencial',
    (gs + INTERVAL '16 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '16 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c09, v_t4, 'terapia', 'sensorial', 'presencial',
    (gs + INTERVAL '16 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '16 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c10 — Tue/Thu 09:00 lenguaje
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c10, v_t2, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '9 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '9 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c10, v_t2, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '9 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '9 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c11 — Mon/Wed 12:00 psicologica
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c11, v_t3, 'terapia', 'psicologica', 'presencial',
    (gs + INTERVAL '12 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '12 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c11, v_t3, 'terapia', 'psicologica', 'presencial',
    (gs + INTERVAL '12 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '12 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c12 — Wed/Fri 14:00 motricidad_gruesa
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c12, v_t1, 'terapia', 'motricidad_gruesa', 'presencial',
    (gs + INTERVAL '14 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '14 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c12, v_t1, 'terapia', 'motricidad_gruesa', 'presencial',
    (gs + INTERVAL '14 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '14 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-06'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c13 — Tue/Thu 14:30 funciones_ejecutivas
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c13, v_t4, 'terapia', 'funciones_ejecutivas', 'presencial',
    (gs + INTERVAL '14 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '15 hours 15 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c13, v_t4, 'terapia', 'funciones_ejecutivas', 'presencial',
    (gs + INTERVAL '14 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '15 hours 15 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c14 — Mon/Thu 16:30 ocupacional
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c14, v_t2, 'terapia', 'ocupacional', 'presencial',
    (gs + INTERVAL '16 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '17 hours 15 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c14, v_t2, 'terapia', 'ocupacional', 'presencial',
    (gs + INTERVAL '16 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '17 hours 15 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c15 — Mon 14:00 lenguaje (v_t3) + Mon–Fri 07:30 BlueKids (maestra)
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c15, v_t3, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '14 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '14 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c15, v_mae_id, 'programa_matutino', 'blue_kids', 'presencial',
    (gs + INTERVAL '7 hours 30 min')  AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 30 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-29'::timestamp, '1 day'::interval) AS gs
  WHERE EXTRACT(DOW FROM gs::date) BETWEEN 1 AND 5;

  -- c16 — Mon/Wed 11:00 lenguaje (PAUSADO desde mayo → solo mar+abr)
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c16, v_t1, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '11 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    'completed', v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-04-30'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c16, v_t1, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '11 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    'completed', v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-04-30'::timestamp, '7 days'::interval) AS gs;

  -- c17 — Tue/Thu 13:00 psicologica
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c17, v_t4, 'terapia', 'psicologica', 'presencial',
    (gs + INTERVAL '13 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '13 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c17, v_t4, 'terapia', 'psicologica', 'presencial',
    (gs + INTERVAL '13 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '13 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c18 — Tue/Fri 15:00 motricidad_fina
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c18, v_t3, 'terapia', 'motricidad_fina', 'presencial',
    (gs + INTERVAL '15 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '15 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c18, v_t3, 'terapia', 'motricidad_fina', 'presencial',
    (gs + INTERVAL '15 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '15 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-06'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c19 — Mon/Wed 15:00 lenguaje + Thu 16:00 lectoescritura
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c19, v_t4, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '15 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '15 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c19, v_t4, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '15 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '15 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c19, v_t4, 'terapia', 'lectoescritura', 'presencial',
    (gs + INTERVAL '16 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '16 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c20 — Tue/Fri 17:00 conductual (ALTA en mayo → solo mar+abr)
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c20, v_t2, 'terapia', 'conductual', 'presencial',
    (gs + INTERVAL '17 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '17 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    'completed', v_admin_id
  FROM generate_series('2026-03-03'::timestamp, '2026-04-30'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c20, v_t2, 'terapia', 'conductual', 'presencial',
    (gs + INTERVAL '17 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '17 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    'completed', v_admin_id
  FROM generate_series('2026-03-06'::timestamp, '2026-04-30'::timestamp, '7 days'::interval) AS gs;

  -- c21 — Mon 10:00 ocupacional + Wed 11:00 sensorial + Thu 10:00 ocupacional
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c21, v_t3, 'terapia', 'ocupacional', 'presencial',
    (gs + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-02'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c21, v_t3, 'terapia', 'ocupacional', 'presencial',
    (gs + INTERVAL '10 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '10 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-05'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c21, v_t3, 'terapia', 'sensorial', 'presencial',
    (gs + INTERVAL '11 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '11 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- c22 — Wed/Fri 09:00 lenguaje
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c22, v_t2, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '9 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '9 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-04'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;
  INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, created_by_user_id)
  SELECT v_c22, v_t2, 'terapia', 'lenguaje', 'presencial',
    (gs + INTERVAL '9 hours')        AT TIME ZONE 'America/El_Salvador',
    (gs + INTERVAL '9 hours 45 min') AT TIME ZONE 'America/El_Salvador',
    CASE WHEN gs::date < '2026-05-21' THEN 'completed' ELSE 'scheduled' END, v_admin_id
  FROM generate_series('2026-03-06'::timestamp, '2026-05-31'::timestamp, '7 days'::interval) AS gs;

  -- ════════════════════════════════════════════════════════════════════════
  -- 8. Monthly cycles + invoices (mar/abr/may 2026)
  --    c16 (pausa) y c20 (alta) solo reciben mar+abr.
  -- ════════════════════════════════════════════════════════════════════════
  DECLARE
    v_children uuid[];
    v_totals numeric[];
    v_includes_may bool[];
    v_i int;
    v_child uuid;
    v_total numeric;
    v_inc_may bool;
    v_child_name text;
  BEGIN
    v_children := ARRAY[
      v_c01, v_c02, v_c03, v_c04, v_c05, v_c06, v_c07, v_c08, v_c09, v_c10,
      v_c11, v_c12, v_c13, v_c14, v_c15, v_c16, v_c17, v_c18, v_c19, v_c20,
      v_c21, v_c22
    ];
    v_totals := ARRAY[
      360, 360, 400, 500, 360, 580, 360, 400, 360, 360,
      400, 360, 400, 360, 580, 360, 400, 360, 500, 400,
      540, 360
    ]::numeric[];
    v_includes_may := ARRAY[
      true, true, true, true, true, true, true, true, true, true,
      true, true, true, true, true, false, true, true, true, false,
      true, true
    ];

    v_months := ARRAY['2026-03-01'::date, '2026-04-01'::date, '2026-05-01'::date];

    FOR v_i IN 1..array_length(v_children, 1) LOOP
      v_child := v_children[v_i];
      v_total := v_totals[v_i];
      v_inc_may := v_includes_may[v_i];

      SELECT full_name INTO v_child_name FROM public.children WHERE id = v_child;

      FOREACH v_m IN ARRAY v_months LOOP
        -- Skip mayo si el niño está pausado/alta
        IF v_m = '2026-05-01' AND NOT v_inc_may THEN
          CONTINUE;
        END IF;

        v_invn := v_invn + 1;

        -- Crear invoice
        INSERT INTO public.invoices (
          invoice_number, client_id, child_id, issue_date,
          currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
          status, payment_date, payment_method, notes,
          client_snapshot_json, emitter_snapshot_json, created_by
        ) VALUES (
          'KIN-' || to_char(v_m, 'YYYYMM') || '-' || LPAD(v_invn::text, 4, '0'),
          NULL, v_child, v_m + INTERVAL '4 days',
          'USD', v_total, 0, 0, 0, v_total, v_total,
          'paid', (v_m + INTERVAL '4 days')::date, 'transfer',
          'Ciclo mensual ' || to_char(v_m, 'YYYY-MM') || ' (seed)',
          jsonb_build_object('child_id', v_child, 'child_full_name', v_child_name),
          '{"name":"Kinetic","note":"seed demo"}'::jsonb,
          v_rec_id
        ) RETURNING id INTO v_inv_id;

        -- Invoice item
        INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
        VALUES (v_inv_id, 'Servicios terapéuticos ' || to_char(v_m, 'YYYY-MM'), 1, v_total, v_total, 0);

        -- Monthly cycle
        INSERT INTO public.monthly_session_cycles (
          child_id, period_month, treatment_plan_snapshot,
          paid_at, paid_by_user_id, payment_method, payment_amount_usd,
          invoice_id, appointments_generated_at, appointments_generated_count,
          status
        ) VALUES (
          v_child, v_m,
          jsonb_build_object('monthly_total_usd', v_total, 'note', 'seed snapshot'),
          v_m + INTERVAL '4 days', v_rec_id, 'transfer', v_total,
          v_inv_id, v_m + INTERVAL '4 days', 8,
          'generated'
        );
      END LOOP;
    END LOOP;
  END;

  -- ════════════════════════════════════════════════════════════════════════
  -- 9. Appointment absences (4 inasistencias representativas)
  -- ════════════════════════════════════════════════════════════════════════
  -- 9.1 Inasistencia pendiente de reposición (c03 Valentina, mar 9 09:00 → no_show)
  SELECT id INTO v_appt_id FROM public.appointments
    WHERE child_id = v_c03 AND status = 'completed' AND starts_at >= '2026-03-09' AND starts_at < '2026-03-10'
    ORDER BY starts_at LIMIT 1;
  IF v_appt_id IS NOT NULL THEN
    UPDATE public.appointments SET status='no_show' WHERE id=v_appt_id;
    INSERT INTO public.appointment_absences (appointment_id, child_id, therapist_id, reported_by_user_id, reason, status)
    VALUES (v_appt_id, v_c03, v_t1, v_t1, 'Familia avisó misma mañana — gripe del niño', 'pending');
  END IF;

  -- 9.2 Inasistencia waived (c08 Lucas, abr 7 16:00 → no_show, sin reposición)
  SELECT id INTO v_appt_id FROM public.appointments
    WHERE child_id = v_c08 AND status = 'completed' AND starts_at >= '2026-04-07' AND starts_at < '2026-04-08'
    ORDER BY starts_at LIMIT 1;
  IF v_appt_id IS NOT NULL THEN
    UPDATE public.appointments SET status='no_show' WHERE id=v_appt_id;
    INSERT INTO public.appointment_absences (
      appointment_id, child_id, therapist_id, reported_by_user_id,
      reason, status, resolved_at, resolved_by_user_id, waive_reason
    ) VALUES (
      v_appt_id, v_c08, v_t1, v_t1,
      'Padre canceló sin aviso (>24h)', 'waived', '2026-04-08 14:00:00+00', v_dir_id,
      'Sin reposición — política de cancelación tardía'
    );
  END IF;

  -- 9.3 Inasistencia con reposición programada (c10 Nicolás, abr 14 → replaced)
  SELECT id INTO v_appt_id FROM public.appointments
    WHERE child_id = v_c10 AND status = 'completed' AND starts_at >= '2026-04-14' AND starts_at < '2026-04-15'
    ORDER BY starts_at LIMIT 1;
  IF v_appt_id IS NOT NULL THEN
    UPDATE public.appointments SET status='no_show' WHERE id=v_appt_id;
    INSERT INTO public.appointment_absences (
      appointment_id, child_id, therapist_id, reported_by_user_id,
      reason, status, resolved_at, resolved_by_user_id
    ) VALUES (
      v_appt_id, v_c10, v_t2, v_t2,
      'Niño con fiebre — familia avisó con anticipación', 'replaced',
      '2026-04-15 12:00:00+00', v_cot_id
    );
    -- Cita de reposición
    INSERT INTO public.appointments (child_id, therapist_id, event_type, service_type, modality, starts_at, ends_at, status, parent_appointment_id, created_by_user_id, notes)
    VALUES (v_c10, v_t2, 'terapia', 'lenguaje', 'presencial',
      '2026-04-18 15:00:00+00', '2026-04-18 15:45:00+00', 'completed',
      v_appt_id, v_cot_id, 'Reposición de cita del 14 abr');
  END IF;

  -- 9.4 Inasistencia pendiente (c14 Daniel, may 4 → no_show pending)
  SELECT id INTO v_appt_id FROM public.appointments
    WHERE child_id = v_c14 AND status = 'completed' AND starts_at >= '2026-05-04' AND starts_at < '2026-05-05'
    ORDER BY starts_at LIMIT 1;
  IF v_appt_id IS NOT NULL THEN
    UPDATE public.appointments SET status='no_show' WHERE id=v_appt_id;
    INSERT INTO public.appointment_absences (appointment_id, child_id, therapist_id, reported_by_user_id, reason, status)
    VALUES (v_appt_id, v_c14, v_t2, v_t2, 'No se presentó la familia, no hubo aviso previo', 'pending');
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- 10. Progress reports (cuatrimestrales)
  --     Período anterior (sep–dic 2025): la mayoría sent_to_family
  --     Período actual (ene–abr 2026): mezcla draft / submitted / approved
  -- ════════════════════════════════════════════════════════════════════════

  -- Período anterior: sep 2025 – dic 2025, sent_to_family
  INSERT INTO public.progress_reports (
    child_id, service_type, period_starts, period_ends, authored_by_user_id,
    sessions_attended_count, data_json, status, upload_kind, family_notes,
    submitted_at, approved_by_user_id, approved_at, sent_to_family_at
  ) VALUES
    (v_c02, 'motricidad_gruesa', '2025-09-01', '2025-12-31', v_t2, 28, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Adjunto informe completo. Avances muy positivos.', '2026-01-05 10:00+00', v_dir_id, '2026-01-08 14:00+00', '2026-01-10 09:00+00'),
    (v_c03, 'psicologica',       '2025-09-01', '2025-12-31', v_t1, 30, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Reducción notable en niveles de ansiedad.',         '2026-01-06 11:00+00', v_dir_id, '2026-01-09 15:00+00', '2026-01-12 10:00+00'),
    (v_c04, 'lenguaje',          '2025-09-01', '2025-12-31', v_t2, 30, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Continúa progreso en pragmática del lenguaje.',     '2026-01-07 09:00+00', v_dir_id, '2026-01-10 14:00+00', '2026-01-12 14:00+00'),
    (v_c05, 'lectoescritura',    '2025-09-01', '2025-12-31', v_t4, 28, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', NULL,                                                '2026-01-07 14:00+00', v_dir_id, '2026-01-10 16:00+00', '2026-01-13 09:00+00'),
    (v_c08, 'conductual',        '2025-09-01', '2025-12-31', v_t1, 26, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Estrategias conductuales implementadas con éxito.', '2026-01-08 10:00+00', v_dir_id, '2026-01-11 11:00+00', '2026-01-13 15:00+00'),
    (v_c10, 'lenguaje',          '2025-09-01', '2025-12-31', v_t2, 30, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', NULL,                                                '2026-01-08 15:00+00', v_dir_id, '2026-01-11 14:00+00', '2026-01-14 10:00+00'),
    (v_c11, 'psicologica',       '2025-09-01', '2025-12-31', v_t3, 30, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Manejo de ansiedad escolar en progreso.',           '2026-01-09 09:00+00', v_dir_id, '2026-01-12 09:00+00', '2026-01-14 14:00+00'),
    (v_c13, 'funciones_ejecutivas','2025-09-01','2025-12-31', v_t4, 29, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', NULL,                                                '2026-01-09 14:00+00', v_dir_id, '2026-01-12 15:00+00', '2026-01-15 09:00+00'),
    (v_c14, 'ocupacional',       '2025-09-01', '2025-12-31', v_t2, 29, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Avances en motricidad fina y grafomotricidad.',     '2026-01-10 10:00+00', v_dir_id, '2026-01-13 11:00+00', '2026-01-15 14:00+00'),
    (v_c16, 'lenguaje',          '2025-09-01', '2025-12-31', v_t1, 28, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', NULL,                                                '2026-01-10 15:00+00', v_dir_id, '2026-01-13 14:00+00', '2026-01-15 16:00+00'),
    (v_c18, 'motricidad_fina',   '2025-09-01', '2025-12-31', v_t3, 28, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Mejora notable en grafía.',                          '2026-01-11 09:00+00', v_dir_id, '2026-01-14 09:00+00', '2026-01-16 09:00+00'),
    (v_c19, 'lenguaje',          '2025-09-01', '2025-12-31', v_t4, 29, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', NULL,                                                '2026-01-11 14:00+00', v_dir_id, '2026-01-14 14:00+00', '2026-01-16 14:00+00'),
    (v_c20, 'conductual',        '2025-09-01', '2025-12-31', v_t2, 30, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Excelentes resultados — se considera alta.',         '2026-01-12 10:00+00', v_dir_id, '2026-01-15 10:00+00', '2026-01-17 09:00+00');

  -- Período actual (ene–abr 2026): mezcla de estados
  INSERT INTO public.progress_reports (
    child_id, service_type, period_starts, period_ends, authored_by_user_id,
    sessions_attended_count, data_json, status, upload_kind, family_notes,
    submitted_at, approved_by_user_id, approved_at, sent_to_family_at
  ) VALUES
    -- approved (esperando ser enviado a la familia)
    (v_c02, 'motricidad_gruesa', '2026-01-01', '2026-04-30', v_t2, 30, '{"note":"file-mode"}'::jsonb, 'approved',       'file', 'Avance constante en coordinación.',                 '2026-05-10 10:00+00', v_dir_id, '2026-05-15 14:00+00', NULL),
    (v_c03, 'psicologica',       '2026-01-01', '2026-04-30', v_t1, 28, '{"note":"file-mode"}'::jsonb, 'approved',       'file', NULL,                                                '2026-05-12 11:00+00', v_dir_id, '2026-05-16 09:00+00', NULL),
    -- submitted (esperando aprobación)
    (v_c04, 'lenguaje',          '2026-01-01', '2026-04-30', v_t2, 30, '{"note":"file-mode"}'::jsonb, 'submitted',      'file', NULL,                                                '2026-05-18 10:00+00', NULL,     NULL,                  NULL),
    (v_c05, 'lectoescritura',    '2026-01-01', '2026-04-30', v_t4, 28, '{"note":"file-mode"}'::jsonb, 'submitted',      'file', NULL,                                                '2026-05-19 09:00+00', NULL,     NULL,                  NULL),
    (v_c08, 'conductual',        '2026-01-01', '2026-04-30', v_t1, 26, '{"note":"file-mode"}'::jsonb, 'submitted',      'file', 'Sólida adherencia a estrategias trabajadas.',       '2026-05-19 14:00+00', NULL,     NULL,                  NULL),
    -- draft (terapista no ha terminado)
    (v_c10, 'lenguaje',          '2026-01-01', '2026-04-30', v_t2, 30, '{"note":"file-mode"}'::jsonb, 'draft',          'file', NULL,                                                NULL,                  NULL,     NULL,                  NULL),
    (v_c11, 'psicologica',       '2026-01-01', '2026-04-30', v_t3, 29, '{"note":"file-mode"}'::jsonb, 'draft',          'file', NULL,                                                NULL,                  NULL,     NULL,                  NULL),
    (v_c13, 'funciones_ejecutivas','2026-01-01','2026-04-30', v_t4, 28, '{"note":"file-mode"}'::jsonb, 'draft',          'file', NULL,                                                NULL,                  NULL,     NULL,                  NULL),
    (v_c14, 'ocupacional',       '2026-01-01', '2026-04-30', v_t2, 29, '{"note":"file-mode"}'::jsonb, 'draft',          'file', NULL,                                                NULL,                  NULL,     NULL,                  NULL),
    -- sent_to_family (ya cerrado)
    (v_c20, 'conductual',        '2026-01-01', '2026-04-30', v_t2, 16, '{"note":"file-mode"}'::jsonb, 'sent_to_family', 'file', 'Alta terapéutica — objetivos cumplidos.',           '2026-05-08 10:00+00', v_dir_id, '2026-05-09 14:00+00', '2026-05-10 16:00+00');

  -- ════════════════════════════════════════════════════════════════════════
  -- 11. Waitlist entries (16 prospectos, distribuidos en fases 1.x – 3.1)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.waitlist_entries (
    child_full_name, child_birthdate, child_diagnosis,
    parent_full_name, parent_phone, parent_email,
    requested_service_type, preferred_therapist_id, preferred_days, notes,
    referral_source_id, priority, current_phase_code,
    child_age_text, has_previous_evaluation, referral_channel, interest_text,
    added_by_user_id, added_at
  ) VALUES
    -- 1_1 Contacto Inicial (2)
    ('Andrés Velásquez Rivas',  '2022-09-10', NULL,                       'Carmen Velásquez',  '+503 7200-0001', 'velasquez@ejemplo.com',   'lenguaje',        NULL,  'lunes/miércoles tarde', 'Llamó por WhatsApp, pide info',                v_rs3, 0, '1_1_contacto_inicial',       '3 años', false, 'redes_sociales', 'Terapia de lenguaje',                 v_rec_id, '2026-05-19 09:00+00'),
    ('Diana Rosales Pérez',     '2020-04-22', 'TDAH posible',             'Marlene Rosales',   '+503 7200-0002', NULL,                       'psicologica',     NULL,  'martes/jueves mañana',  'Recomendada por pediatra',                     v_rs1, 1, '1_1_contacto_inicial',       '5 años', false, 'medico',         'Evaluación psicológica',              v_rec_id, '2026-05-20 10:00+00'),

    -- 1_2 Información Enviada (2)
    ('Jorge Funes Argueta',     '2019-11-08', 'Dislexia sospecha',        'Esteban Funes',     '+503 7200-0003', 'funes@ejemplo.com',       'lectoescritura',  v_t4,  'tarde',                  'Se envió brochure y costos',                  v_rs2, 0, '1_2_informacion_enviada',    '6 años', true,  'colegio',        'Apoyo en lectura y escritura',        v_cof_id, '2026-05-15 11:00+00'),
    ('Sara Quintanilla Mejía',  '2023-06-01', NULL,                       'Cinthya Quintanilla','+503 7200-0004', 'quintanilla@ejemplo.com', 'blue_kids',       NULL,  'mañana',                 'Interés en programa matutino',                v_rs3, 0, '1_2_informacion_enviada',    '2 años 11 meses', false, 'redes_sociales', 'BlueKids programa matutino',    v_cof_id, '2026-05-16 14:00+00'),

    -- 1_3 Entrevista Agendada (1)
    ('Marco Linares García',    '2021-03-14', NULL,                       'Rocío Linares',     '+503 7200-0005', 'linares@ejemplo.com',     'lenguaje',        v_t1,  'tarde',                  'Cita de conocimiento programada para may 22',  v_rs4, 0, '1_3_entrevista_agendada',    '5 años', false, 'amigo_familiar', 'Terapia de lenguaje',                 v_cof_id, '2026-05-10 09:00+00'),

    -- 2_1 Entrevista de Conocimiento (2)
    ('Helena Galdámez Soto',    '2019-08-25', 'Trastorno motriz',         'Beatriz Galdámez',  '+503 7200-0006', NULL,                       'motricidad_fina', v_t3,  'lunes y jueves',         'Entrevista hecha; pendiente plan',            v_rs1, 1, '2_1_entrevista_conocimiento','6 años', false, 'medico',         'Evaluación de motricidad fina',       v_dir_id, '2026-05-05 10:00+00'),
    ('Iván Bermúdez Cruz',      '2020-12-18', 'Sospecha TEA',             'Marta Bermúdez',    '+503 7200-0007', 'bermudez@ejemplo.com',    'psicologica',     NULL,  'cualquiera',             'Familia consultó después de entrevista',      v_rs1, 2, '2_1_entrevista_conocimiento','5 años', true,  'medico',         'Evaluación integral TEA',             v_dir_id, '2026-05-06 14:00+00'),

    -- 2_2 Observación Clínica (2)
    ('Karla Morán Vela',        '2022-01-30', NULL,                       'Diego Morán',       '+503 7200-0008', 'moran@ejemplo.com',       'sensorial',       v_t4,  'tarde',                  'Observación clínica esta semana',             v_rs4, 0, '2_2_observacion_clinica',    '4 años', false, 'amigo_familiar', 'Evaluación sensorial',                v_cof_id, '2026-05-01 09:00+00'),
    ('Tomás Vela Aguilar',      '2018-06-12', 'TDAH diagnosticado',       'Sofía Vela',        '+503 7200-0009', 'vela@ejemplo.com',        'conductual',      v_t1,  'tarde',                  NULL,                                          v_rs2, 1, '2_2_observacion_clinica',    '7 años', true,  'colegio',        'Manejo conductual',                   v_cof_id, '2026-04-28 11:00+00'),

    -- 2_3 Observación Escolar (1)
    ('Elena Pineda Hernández',  '2018-02-04', NULL,                       'Lucía Pineda',      '+503 7200-0010', NULL,                       'funciones_ejecutivas', v_t4, 'mañana',           'Se programó visita al colegio para may 25',   v_rs2, 0, '2_3_observacion_escolar',    '8 años', false, 'colegio',        'Funciones ejecutivas',                v_dir_id, '2026-04-20 09:00+00'),

    -- 2_4 Propuesta Evaluación (1)
    ('Renato Mejía Ortiz',      '2020-10-09', 'Posible dislexia',         'Eva Mejía',         '+503 7200-0011', 'mejia@ejemplo.com',       'lectoescritura',  v_t4,  'tarde',                  'Se envió propuesta de evaluación lectoescritura', v_rs1, 0, '2_4_propuesta_evaluacion',  '5 años', false, 'medico',         'Evaluación lectoescritura',           v_dir_id, '2026-04-15 14:00+00'),

    -- 2_5 Evaluación en Proceso (2)
    ('Mirna Argüello Castro',   '2019-09-30', 'Retraso global',           'Roberto Argüello',  '+503 7200-0012', NULL,                       'lenguaje',        v_t1,  'tarde',                  'Evaluación de lenguaje en curso',             v_rs4, 1, '2_5_evaluacion_en_proceso',  '6 años', true,  'amigo_familiar', 'Evaluación de lenguaje',              v_dir_id, '2026-04-08 10:00+00'),
    ('Sebastián Núñez Ávila',   '2017-05-17', 'TEA confirmado',           'Camila Núñez',      '+503 7200-0013', 'nunez@ejemplo.com',       'ocupacional',     v_t2,  'cualquiera',             'Múltiples evaluaciones en curso',             v_rs1, 2, '2_5_evaluacion_en_proceso',  '8 años', true,  'medico',         'Apoyo ocupacional + sensorial',       v_dir_id, '2026-04-10 11:00+00'),

    -- 2_6 Levantamiento de Informes (1)
    ('Daniela Bonilla Rivas',   '2018-07-21', NULL,                       'Marlon Bonilla',    '+503 7200-0014', 'bonilla@ejemplo.com',     'funciones_ejecutivas', v_t4, 'tarde',           'Equipo redactando informes',                  v_rs2, 0, '2_6_levantamiento_informes', '7 años', false, 'colegio',        'Funciones ejecutivas',                v_dir_id, '2026-03-25 09:00+00'),

    -- 2_7 Informes Entregados (1)
    ('Bruno Salazar Quintero',  '2020-08-14', 'TDAH',                     'Adriana Salazar',   '+503 7200-0015', 'salazar@ejemplo.com',     'psicologica',     v_t3,  'mañana',                 'Devolución hecha. Esperando confirmación.',   v_rs1, 0, '2_7_informes_entregados',    '5 años', false, 'medico',         'Apoyo psicológico',                   v_dir_id, '2026-03-15 10:00+00'),

    -- 3_1 Propuesta Terapéutica (1)
    ('Camila Rosales Bermúdez', '2021-11-02', 'Retraso lenguaje',         'Lorena Rosales',    '+503 7200-0016', 'rosales@ejemplo.com',     'lenguaje',        v_t1,  'lunes/miércoles tarde', 'Propuesta enviada. Familia analizando.',       v_rs1, 1, '3_1_propuesta_terapeutica',  '4 años', false, 'medico',         'Terapia de lenguaje 2/sem',           v_dir_id, '2026-03-10 11:00+00');

  -- ════════════════════════════════════════════════════════════════════════
  -- 12. Phase history (transiciones para c16 pausa y c20 alta)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.child_phase_history (child_id, from_phase_code, to_phase_code, notes, changed_by_user_id, changed_at) VALUES
    (v_c16, '3_3_activo_en_terapias', '4_1_pausa_temporal',
      'Familia solicita pausa por viaje familiar de un mes. Se acuerda reincorporación en junio.',
      v_cot_id, '2026-05-01 14:00+00'),
    (v_c20, '3_3_activo_en_terapias', '5_1_alta_terapeutica',
      'Objetivos terapéuticos cumplidos. Equipo recomienda alta. Familia de acuerdo.',
      v_dir_id, '2026-05-10 10:00+00');

  -- ════════════════════════════════════════════════════════════════════════
  -- 13. Discharge record para c20 (alta firmada)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.child_discharge_records (
    child_id, discharge_type, discharge_date,
    child_snapshot_json, therapies_snapshot_json,
    total_sessions_attended, attendance_rate_pct, total_replacements,
    objectives_achieved, recommendations, follow_up_plan,
    signed_by_therapist_id, signed_by_therapist_name, signed_by_therapist_at,
    signed_by_directora_id, signed_by_directora_name, signed_by_directora_at,
    status, created_by_user_id
  ) VALUES (
    v_c20, 'alta', '2026-05-10',
    jsonb_build_object(
      'full_name', 'Gabriel Morales Cruz',
      'preferred_name', 'Gabo',
      'birth_date', '2017-04-18',
      'diagnoses', '["conductual"]'::jsonb,
      'enrollment_period', '2025-06-10 a 2026-05-10'
    ),
    '[{"service":"conductual","sessions_per_month":8,"duration_minutes":45}]'::jsonb,
    72, 95.0, 2,
    'Reducción significativa en episodios disruptivos. Mejora en autoregulación emocional. Estrategias conductuales integradas en rutinas diarias.',
    'Mantener rutinas estructuradas en el hogar. Aplicar técnicas de respiración antes de situaciones estresantes. Revisión semestral preventiva.',
    'Seguimiento mensual por 3 meses via llamada. Reevaluación opcional en noviembre 2026.',
    v_t2, (SELECT full_name FROM public.users WHERE id = v_t2), '2026-05-10 11:00+00',
    v_dir_id, (SELECT full_name FROM public.users WHERE id = v_dir_id), '2026-05-10 14:30+00',
    'signed', v_t2
  );

  -- ════════════════════════════════════════════════════════════════════════
  -- 14. Dashboard alert para alta de c20 (banner 7 días)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.dashboard_alerts (alert_type, child_id, message, expires_at, created_by_user_id)
  VALUES (
    'discharge', v_c20,
    'Gabriel Morales Cruz recibió alta terapéutica el 10 de mayo de 2026 — felicitaciones al equipo.',
    '2026-05-17 23:59+00', v_dir_id
  );

  -- ════════════════════════════════════════════════════════════════════════
  -- 15. General expenses (renta, servicios, etc. — 3 meses)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.general_expenses (category, subcategory, description, amount_usd, expense_date, payment_method, provider, created_by_user_id) VALUES
    -- Marzo
    ('renta',               'oficina',  'Renta del centro Kinetic — marzo',           1200.00, '2026-03-01', 'transferencia', 'Inmobiliaria San Salvador',     v_cnt_id),
    ('servicios_publicos',  'luz',      'CAESS — energía eléctrica marzo',             185.50, '2026-03-08', 'transferencia', 'CAESS',                          v_cnt_id),
    ('servicios_publicos',  'agua',     'ANDA — agua marzo',                            42.00, '2026-03-10', 'transferencia', 'ANDA',                           v_cnt_id),
    ('servicios_publicos',  'internet', 'Tigo Business — internet marzo',               65.00, '2026-03-05', 'transferencia', 'Tigo Business',                  v_cnt_id),
    ('material_didactico',  NULL,       'Material sensorial nuevo',                    180.00, '2026-03-15', 'tarjeta',       'Librería pedagógica Pluma',      v_cnt_id),
    ('transporte',          'gasolina', 'Gasolina visitas a colegios',                  45.00, '2026-03-20', 'efectivo',      'Puma',                           v_cnt_id),
    -- Abril
    ('renta',               'oficina',  'Renta del centro Kinetic — abril',           1200.00, '2026-04-01', 'transferencia', 'Inmobiliaria San Salvador',     v_cnt_id),
    ('servicios_publicos',  'luz',      'CAESS — energía eléctrica abril',             192.30, '2026-04-08', 'transferencia', 'CAESS',                          v_cnt_id),
    ('servicios_publicos',  'agua',     'ANDA — agua abril',                            44.50, '2026-04-10', 'transferencia', 'ANDA',                           v_cnt_id),
    ('servicios_publicos',  'internet', 'Tigo Business — internet abril',               65.00, '2026-04-05', 'transferencia', 'Tigo Business',                  v_cnt_id),
    ('sistema_software',    'crm',      'Suscripción Supabase + Vercel',                85.00, '2026-04-15', 'tarjeta',       'Stripe',                         v_cnt_id),
    ('marketing',           'redes',    'Pauta Instagram abril',                       120.00, '2026-04-18', 'tarjeta',       'Meta Platforms',                 v_cnt_id),
    -- Mayo
    ('renta',               'oficina',  'Renta del centro Kinetic — mayo',            1200.00, '2026-05-01', 'transferencia', 'Inmobiliaria San Salvador',     v_cnt_id),
    ('servicios_publicos',  'luz',      'CAESS — energía eléctrica mayo (parcial)',   178.00, '2026-05-08', 'transferencia', 'CAESS',                          v_cnt_id),
    ('servicios_publicos',  'internet', 'Tigo Business — internet mayo',                65.00, '2026-05-05', 'transferencia', 'Tigo Business',                  v_cnt_id),
    ('mantenimiento',       NULL,       'Reparación de aire acondicionado sala 2',     250.00, '2026-05-12', 'efectivo',      'TecniFríoSV',                    v_cnt_id),
    ('material_didactico',  NULL,       'Reposición material BlueKids',                 95.00, '2026-05-15', 'tarjeta',       'Librería pedagógica Pluma',      v_cnt_id);

END;
$$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0127_seed_payroll_runs.sql
-- ────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 0127 — Seed de planillas mensuales (mar/abr/may 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Complementa 0126:
--   • Diversifica salarios por usuario (variación intra-rol)
--   • Crea 3 payroll_runs (mar/abr pagadas, may sellada pendiente de pago)
--   • Inserta payroll_items con ISSS / AFP / ISR calculados
--   • Algunos empleados ya firmaron su recibo en mar/abr
--
-- Constantes fiscales SV (mig 0117):
--   ISSS empleado 3%, patrono 7.5%, tope $1000
--   AFP   empleado 7.25%, patrono 8.75%, sin tope
--   ISR   4 tramos: 0% / 10%+17.67 / 20%+60 / 30%+288.57
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_id   uuid;
  v_dir_id     uuid;
  v_cnt_id     uuid;
  v_run_mar    uuid;
  v_run_apr    uuid;
  v_run_may    uuid;
  v_snapshot   jsonb;
BEGIN
  -- ── 1. Staff IDs ────────────────────────────────────────────────────────
  SELECT id INTO v_admin_id FROM public.users WHERE role='admin'     ORDER BY created_at LIMIT 1;
  SELECT id INTO v_dir_id   FROM public.users WHERE role='directora' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cnt_id   FROM public.users WHERE role='contable'  ORDER BY created_at LIMIT 1;
  v_dir_id := COALESCE(v_dir_id, v_admin_id);
  v_cnt_id := COALESCE(v_cnt_id, v_admin_id);

  -- ── 2. Diversificar salarios por usuario ───────────────────────────────
  -- Terapistas: $10.00–$15.00/hr según antigüedad
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role='terapista'
  )
  UPDATE public.users u
  SET hourly_rate_usd = (10.00 + (LEAST(ranked.rn, 11) * 0.50))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- Maestras: $650–$850/mes
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role='maestra'
  )
  UPDATE public.users u
  SET monthly_salary_usd = (650.00 + (LEAST(ranked.rn-1, 8) * 25))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- Recepción: $500–$650/mes
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role='recepcion'
  )
  UPDATE public.users u
  SET monthly_salary_usd = (500.00 + (LEAST(ranked.rn-1, 6) * 25))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- Coordinadoras: $850–$1000/mes
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE role IN ('coordinadora_familias','coordinadora_terapias')
  )
  UPDATE public.users u
  SET monthly_salary_usd = (850.00 + (LEAST(ranked.rn-1, 6) * 25))::numeric(10,2)
  FROM ranked WHERE u.id = ranked.id;

  -- DUI / ISSS / AFP únicos por usuario (placeholder)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.users WHERE contract_type <> 'sin_contrato'
  )
  UPDATE public.users u
  SET dui         = '0' || LPAD((10000000 + ranked.rn * 137)::text, 7, '0') || '-' || (ranked.rn % 10)::text,
      isss_number = 'ISSS-' || LPAD(ranked.rn::text, 5, '0'),
      afp_number  = 'NUP-'  || LPAD(ranked.rn::text, 6, '0')
  FROM ranked WHERE u.id = ranked.id AND u.dui IS NULL;

  -- ── 3. Snapshot del config fiscal ──────────────────────────────────────
  SELECT jsonb_build_object(
    'effective_from',      effective_from,
    'isss_employee_rate',  isss_employee_rate,
    'isss_employer_rate',  isss_employer_rate,
    'isss_cap_salary_usd', isss_cap_salary_usd,
    'afp_employee_rate',   afp_employee_rate,
    'afp_employer_rate',   afp_employer_rate,
    'afp_cap_salary_usd',  afp_cap_salary_usd,
    'isr_brackets_json',   isr_brackets_json
  )
  INTO v_snapshot
  FROM public.payroll_fiscal_config
  ORDER BY effective_from DESC LIMIT 1;

  -- ── 4. Crear los 3 payroll_runs ─────────────────────────────────────────
  -- Marzo: pagada
  INSERT INTO public.payroll_runs (
    period_year, period_month, status, fiscal_config_snapshot_json, notes,
    created_by_user_id, sealed_at, sealed_by_user_id, paid_at, paid_by_user_id
  ) VALUES (
    2026, 3, 'paid', v_snapshot, 'Planilla marzo 2026 — pagada por transferencia',
    v_cnt_id, '2026-03-27 14:00+00', v_dir_id, '2026-03-30 10:00+00', v_cnt_id
  ) RETURNING id INTO v_run_mar;

  -- Abril: pagada
  INSERT INTO public.payroll_runs (
    period_year, period_month, status, fiscal_config_snapshot_json, notes,
    created_by_user_id, sealed_at, sealed_by_user_id, paid_at, paid_by_user_id
  ) VALUES (
    2026, 4, 'paid', v_snapshot, 'Planilla abril 2026 — pagada por transferencia',
    v_cnt_id, '2026-04-28 14:00+00', v_dir_id, '2026-04-30 10:00+00', v_cnt_id
  ) RETURNING id INTO v_run_apr;

  -- Mayo: sellada, pendiente de pago
  INSERT INTO public.payroll_runs (
    period_year, period_month, status, fiscal_config_snapshot_json, notes,
    created_by_user_id, sealed_at, sealed_by_user_id
  ) VALUES (
    2026, 5, 'sealed', v_snapshot, 'Planilla mayo 2026 — sellada, pendiente de pago',
    v_cnt_id, '2026-05-20 14:00+00', v_dir_id
  ) RETURNING id INTO v_run_may;

  -- ── 5. Insertar payroll_items (3 pasadas) ──────────────────────────────
  DECLARE
    v_run uuid;
    v_period_start date;
    v_period_end date;
    v_signed_at timestamptz;
    v_i int;
  BEGIN
    FOR v_i IN 1..3 LOOP
      IF v_i = 1 THEN
        v_run := v_run_mar;
        v_period_start := '2026-03-01'::date;
        v_period_end   := '2026-04-01'::date;
        v_signed_at    := '2026-04-02 14:00+00'::timestamptz;
      ELSIF v_i = 2 THEN
        v_run := v_run_apr;
        v_period_start := '2026-04-01'::date;
        v_period_end   := '2026-05-01'::date;
        v_signed_at    := '2026-05-04 14:00+00'::timestamptz;
      ELSE
        v_run := v_run_may;
        v_period_start := '2026-05-01'::date;
        v_period_end   := '2026-06-01'::date;
        v_signed_at    := NULL;
      END IF;

      -- ── 5a. INSERT base: gross + ISSS + AFP + aportes patronales ──────
      WITH base AS (
        SELECT
          u.id AS user_id,
          jsonb_build_object(
            'full_name',     u.full_name,
            'dui',           u.dui,
            'isss_number',   u.isss_number,
            'afp_number',    u.afp_number,
            'afp_provider',  u.afp_provider,
            'role',          u.role,
            'contract_type', u.contract_type
          ) AS snap,
          u.contract_type,
          u.monthly_salary_usd,
          u.hourly_rate_usd,
          COALESCE(h.hours, 0)::numeric(8,2) AS hours_worked,
          (
            CASE
              WHEN u.contract_type = 'mensual_fijo' THEN u.monthly_salary_usd
              WHEN u.contract_type = 'por_hora'    THEN COALESCE(h.hours, 0) * COALESCE(u.hourly_rate_usd, 0)
              ELSE 0
            END
          )::numeric(10,2) AS gross
        FROM public.users u
        LEFT JOIN LATERAL (
          SELECT ROUND(SUM(EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 3600.0)::numeric, 2) AS hours
          FROM public.appointments a
          WHERE a.therapist_id = u.id
            AND a.status = 'completed'
            AND a.starts_at >= v_period_start
            AND a.starts_at <  v_period_end
        ) h ON true
        WHERE u.contract_type <> 'sin_contrato'
          AND (u.monthly_salary_usd > 0 OR u.hourly_rate_usd > 0)
      )
      INSERT INTO public.payroll_items (
        payroll_run_id, user_id, user_snapshot_json,
        base_salary_usd, extra_hours, extra_hours_rate_usd, extra_hours_amount_usd,
        bonus_usd, other_deductions_usd,
        gross_total_usd, isss_employee_usd, afp_employee_usd, isr_usd,
        total_deductions_usd, net_pay_usd,
        isss_employer_usd, afp_employer_usd, employer_cost_usd,
        hours_worked_from_appointments, signed_at
      )
      SELECT
        v_run, b.user_id, b.snap,
        CASE WHEN b.contract_type = 'mensual_fijo' THEN b.gross ELSE 0 END,
        CASE WHEN b.contract_type = 'por_hora'    THEN b.hours_worked ELSE 0 END,
        CASE WHEN b.contract_type = 'por_hora'    THEN b.hourly_rate_usd ELSE NULL END,
        CASE WHEN b.contract_type = 'por_hora'    THEN b.gross ELSE 0 END,
        0, 0,
        b.gross,
        (LEAST(b.gross, 1000) * 0.03)::numeric(10,2),
        (b.gross * 0.0725)::numeric(10,2),
        0,  -- ISR se calcula en UPDATE abajo
        0,  -- total_deductions ídem
        0,  -- net_pay ídem
        (LEAST(b.gross, 1000) * 0.075)::numeric(10,2),
        (b.gross * 0.0875)::numeric(10,2),
        0,  -- employer_cost ídem
        b.hours_worked,
        CASE
          WHEN v_signed_at IS NULL THEN NULL
          WHEN abs(hashtext(b.user_id::text)) % 10 < 7 THEN v_signed_at
          ELSE NULL
        END
      FROM base b;

      -- ── 5b. UPDATE: ISR por tramos + totales finales ──────────────────
      UPDATE public.payroll_items pi
      SET
        isr_usd = (
          CASE
            WHEN (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) <= 472     THEN 0
            WHEN (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) <= 895.24  THEN
                 ((pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) - 472)    * 0.10 + 17.67
            WHEN (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) <= 2038.10 THEN
                 ((pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) - 895.24) * 0.20 + 60.00
            ELSE ((pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd) - 2038.10)* 0.30 + 288.57
          END
        )::numeric(10,2)
      WHERE pi.payroll_run_id = v_run;

      UPDATE public.payroll_items pi
      SET
        total_deductions_usd = (pi.isss_employee_usd + pi.afp_employee_usd + pi.isr_usd),
        net_pay_usd          = (pi.gross_total_usd - pi.isss_employee_usd - pi.afp_employee_usd - pi.isr_usd),
        employer_cost_usd    = (pi.gross_total_usd + pi.isss_employer_usd + pi.afp_employer_usd)
      WHERE pi.payroll_run_id = v_run;

    END LOOP;
  END;

END;
$$;

