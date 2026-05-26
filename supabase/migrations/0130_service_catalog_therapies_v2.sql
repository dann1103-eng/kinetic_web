-- Migración 0130 — Catálogo de servicios v2 (terapias + BK pricing)
--
-- Cambios:
--   1) Agrega 'terapia_individual' al enum service_category
--   2) Nueva columna service_catalog.unit_price_bk_usd (precio descontado
--      para niños de programa matutino: Blue Kids / Learning Kids / Aula)
--   3) Nueva columna service_catalog.service_type para enlazar items del
--      catálogo con el enum ServiceType usado en treatment_plans
--   4) Amplía appointments.service_type CHECK con 5 service_types nuevos
--   5) Seed con todos los precios del Excel PRECIOS CLIENTES 2026:
--      - Actualiza items de matrículas / mensualidades / materiales
--      - Agrega las 5 terapias nuevas (iLs, Forbrain, Concentración, etc.)
--      - Agrega pruebas psicológicas faltantes (NEUROPSIS, FACTOR G, etc.)
--      - Agrega precio BK donde aplica

-- ── 1. Enum: agregar terapia_individual ───────────────────────────────────
ALTER TYPE public.service_category ADD VALUE IF NOT EXISTS 'terapia_individual';

-- ── 2. Columnas nuevas ────────────────────────────────────────────────────
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS unit_price_bk_usd numeric(10, 2),
  ADD COLUMN IF NOT EXISTS service_type text;

COMMENT ON COLUMN public.service_catalog.unit_price_bk_usd IS
  'Precio descontado para niños inscritos en programa matutino (Blue Kids / Learning Kids / Aula). NULL = no aplica descuento.';
COMMENT ON COLUMN public.service_catalog.service_type IS
  'Enlace con el enum ServiceType del CRM (ej. lenguaje, sensorial). Permite que el TreatmentPlanEditor jale el precio del catálogo automáticamente.';

CREATE INDEX IF NOT EXISTS service_catalog_service_type_idx
  ON public.service_catalog (service_type) WHERE service_type IS NOT NULL;

-- ── 3. appointments.service_type: agregar 5 nuevos ────────────────────────
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_service_type_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_service_type_check CHECK (service_type IN (
    'lenguaje',
    'motricidad_gruesa',
    'motricidad_fina',
    'sensorial',
    'psicologica',
    'ocupacional',
    'fisica',
    'lectoescritura',
    'funciones_ejecutivas',
    'conductual',
    'blue_kids',
    'alim_deglu',
    'destreza_manual_pre_escritura',
    -- ─── Nuevos service_types (Excel 2026) ───
    'ils_escucha',                -- iLs Escucha Atenta
    'refuerzo_academico',         -- Refuerzo Académico / Lecto-escritura con Forbrain
    'concentracion_atencion',     -- Concentración y Atención
    'comunicacion_regulacion',    -- Comunicación y Regulación Emocional
    'estimulacion_juego',         -- Estimulación de Juego y Lenguaje (15-24 meses)
    'otra'
  ));

-- ── 4. Seed/Update: precios del Excel 2026 ─────────────────────────────
-- Estrategia: UPSERT por `code` para que sea idempotente.

-- ── 4.1 Terapias individuales (categoría = terapia_individual) ──────────
INSERT INTO public.service_catalog
  (code, category, name, description, unit_price_usd, unit_price_bk_usd, duration_minutes, service_type, sort_order)
VALUES
  ('therapy_ocupacional_30', 'terapia_individual', 'Terapia Ocupacional',
    'Terapia Ocupacional, Destrezas Manuales & Pre-escritura',
    20, NULL, 30, 'ocupacional', 100),
  ('therapy_destreza_manual_30', 'terapia_individual', 'Destrezas Manuales y Pre-escritura',
    'Sesión de 30 min',
    20, NULL, 30, 'destreza_manual_pre_escritura', 101),
  ('therapy_ils_30', 'terapia_individual', 'Terapia iLs (Escucha Atenta) 30 min',
    'Tiempo: 30 min',
    30, NULL, 30, 'ils_escucha', 110),
  ('therapy_ils_60', 'terapia_individual', 'Terapia iLs (Escucha Atenta) 1 hora',
    'Incluye los ejercicios',
    60, NULL, 60, 'ils_escucha', 111),
  ('therapy_habla_lenguaje_30', 'terapia_individual', 'Terapia de Habla y Lenguaje',
    'Sesión de 30 min. Niños BK tienen tarifa preferencial.',
    25, 22, 30, 'lenguaje', 120),
  ('therapy_estim_juego_30', 'terapia_individual', 'Estimulación de Juego y Lenguaje',
    'Para niños de 15 a 24 meses. Sesión de 30 min.',
    30, NULL, 30, 'estimulacion_juego', 121),
  ('therapy_alim_deglu_30', 'terapia_individual', 'Terapia de Alimentación y Deglución',
    'Sesión de 30 min',
    30, NULL, 30, 'alim_deglu', 130),
  ('therapy_fisica_30', 'terapia_individual', 'Terapia Física',
    'Sesión de 30 min',
    20, NULL, 30, 'fisica', 140),
  ('therapy_motricidad_gruesa_30', 'terapia_individual', 'Motricidad Gruesa',
    'Sesión de 30 min',
    20, NULL, 30, 'motricidad_gruesa', 141),
  ('therapy_motricidad_fina_30', 'terapia_individual', 'Motricidad Fina',
    'Sesión de 30 min',
    20, NULL, 30, 'motricidad_fina', 142),
  ('therapy_sensorial_30', 'terapia_individual', 'Terapia Sensorial',
    'Sesión de 30 min',
    25, NULL, 30, 'sensorial', 150),
  ('therapy_lectoescritura_30', 'terapia_individual', 'Refuerzo Académico / Lecto-escritura con Forbrain',
    'Sesión de 30 min con Forbrain',
    25, NULL, 30, 'refuerzo_academico', 160),
  ('therapy_lectoescritura_normal_30', 'terapia_individual', 'Terapia de Lecto-escritura',
    'Sesión de 30 min',
    25, NULL, 30, 'lectoescritura', 161),
  ('therapy_concentracion_30', 'terapia_individual', 'Concentración y Atención',
    'Sesión de 30 min',
    25, NULL, 30, 'concentracion_atencion', 170),
  ('therapy_funciones_ejecutivas_30', 'terapia_individual', 'Terapia Funciones Ejecutivas',
    'Sesión de 30 min',
    30, NULL, 30, 'funciones_ejecutivas', 180),
  ('therapy_comunicacion_regulacion_30', 'terapia_individual', 'Comunicación y Regulación Emocional',
    'Sesión de 30 min',
    25, NULL, 30, 'comunicacion_regulacion', 190),
  ('therapy_psicologica_30', 'terapia_individual', 'Terapia Psicológica Genérica (Educativa)',
    'Sesión de 30 min. Niños BK tienen tarifa preferencial.',
    40, 30, 30, 'psicologica', 200),
  ('therapy_conductual_30', 'terapia_individual', 'Terapia Conductual',
    'Sesión de 30 min',
    30, NULL, 30, 'conductual', 210)
ON CONFLICT (code) DO UPDATE
  SET name              = EXCLUDED.name,
      description       = EXCLUDED.description,
      unit_price_usd    = EXCLUDED.unit_price_usd,
      unit_price_bk_usd = EXCLUDED.unit_price_bk_usd,
      duration_minutes  = EXCLUDED.duration_minutes,
      service_type      = EXCLUDED.service_type,
      sort_order        = EXCLUDED.sort_order,
      updated_at        = now();

-- ── 4.2 Pruebas psicológicas adicionales del Excel ─────────────────────
INSERT INTO public.service_catalog
  (code, category, name, description, unit_price_usd, duration_minutes, sort_order)
VALUES
  ('test_neuropsis', 'evaluacion_psicologica', 'NEUROPSIS (Atención y Memoria)', NULL, 125, 60, 320),
  ('test_factor_g', 'evaluacion_psicologica', 'FACTOR G (Coeficiente Intelectual y Edad Mental)', NULL, 80, 30, 321),
  ('test_aei_r', 'evaluacion_psicologica', 'AEI-R', 'Medir aptitudes escolares y refuerzo académico', 100, 60, 322),
  ('test_boehm', 'evaluacion_psicologica', 'TEST BOEHM', 'Identifica riesgos de aprendizaje a niños 4-7 años', 100, 60, 323),
  ('test_raven_color', 'evaluacion_psicologica', 'RAVEN (Inteligencia no verbal)', 'Respaldo de la WICS', 50, 20, 324),
  ('test_dtvp_2', 'evaluacion_psicologica', 'DTVP-2', 'Coordinación ojo-mano, Figura-fondo, Constancia de forma', 80, 30, 325),
  ('test_stroop', 'evaluacion_psicologica', 'STROOP TEST', 'Atención selectiva, perc. visual, velocidad', 50, 20, 326),
  ('test_frostig', 'evaluacion_psicologica', 'FROSTIG', 'Perc. visual, coordinación visomotora', 80, 45, 327),
  ('test_itpa', 'evaluacion_psicologica', 'ITPA', NULL, 120, 60, 328),
  ('test_caras', 'evaluacion_psicologica', 'TEST CARAS', 'Para TDAH (6 a 18 años)', 60, 20, 340),
  ('test_e_tdah', 'evaluacion_psicologica', 'e-TDAH', 'Para TDAH (6 a 12 años) — cuestionario para papás', 80, 30, 341),
  ('test_sena', 'evaluacion_psicologica', 'SENA', 'Cuestionario para TDAH', 140, 90, 342),
  ('test_brief_2', 'evaluacion_psicologica', 'BRIEF-2', 'Desde los 5 a 18 años — cuestionario para papás', 140, 30, 343),
  ('test_atento', 'evaluacion_psicologica', 'ATENTO', 'Edad 3 años a 18 años 11 meses', 140, 45, 344),
  ('test_wppsi_iv', 'evaluacion_psicologica', 'WPPSI-IV', 'Edad 2 años 6 meses a 7 años 7 meses', 180, 210, 345)
ON CONFLICT (code) DO UPDATE
  SET name              = EXCLUDED.name,
      description       = EXCLUDED.description,
      unit_price_usd    = EXCLUDED.unit_price_usd,
      duration_minutes  = EXCLUDED.duration_minutes,
      sort_order        = EXCLUDED.sort_order,
      updated_at        = now();

-- ── 4.3 Reconfirmar precios de matrículas / mensualidades / materiales ──
-- (idempotente: si los items ya existen del 0107, los actualiza con los
-- precios del Excel 2026; si no existen, los crea.)
INSERT INTO public.service_catalog
  (code, category, name, unit_price_usd, morning_program, days_per_week,
   proration_group, applies_from_month, applies_to_month, sort_order)
VALUES
  -- Matrículas BK/LK (prorrateadas)
  ('matricula_bk_lk_q1', 'matricula', 'Matrícula BK/LK (Enero–Marzo)', 200, NULL, NULL,
    'matricula_bk_lk', 1, 3, 10),
  ('matricula_bk_lk_q2', 'matricula', 'Matrícula BK/LK (Abril–Junio)', 175, NULL, NULL,
    'matricula_bk_lk', 4, 6, 11),
  ('matricula_bk_lk_q3', 'matricula', 'Matrícula BK/LK (Julio–Septiembre)', 150, NULL, NULL,
    'matricula_bk_lk', 7, 9, 12),
  ('matricula_bk_lk_q4', 'matricula', 'Matrícula BK/LK (Octubre–Diciembre)', 100, NULL, NULL,
    'matricula_bk_lk', 10, 12, 13),
  -- Matrículas Aula
  ('matricula_aula_q1', 'matricula', 'Matrícula Aula Educativa (Enero–Marzo)', 200, NULL, NULL,
    'matricula_aula', 1, 3, 14),
  ('matricula_aula_q2', 'matricula', 'Matrícula Aula Educativa (Abril–Junio)', 175, NULL, NULL,
    'matricula_aula', 4, 6, 15),
  ('matricula_aula_q3', 'matricula', 'Matrícula Aula Educativa (Julio–Septiembre)', 150, NULL, NULL,
    'matricula_aula', 7, 9, 16),
  ('matricula_aula_q4', 'matricula', 'Matrícula Aula Educativa (Octubre–Diciembre)', 100, NULL, NULL,
    'matricula_aula', 10, 12, 17)
ON CONFLICT (code) DO UPDATE
  SET unit_price_usd     = EXCLUDED.unit_price_usd,
      name               = EXCLUDED.name,
      proration_group    = EXCLUDED.proration_group,
      applies_from_month = EXCLUDED.applies_from_month,
      applies_to_month   = EXCLUDED.applies_to_month,
      updated_at         = now();

-- Mensualidades BK/LK
INSERT INTO public.service_catalog
  (code, category, name, unit_price_usd, morning_program, days_per_week, sort_order)
VALUES
  ('mensualidad_bk_5d',   'mensualidad', 'Mensualidad Blue Kids · 5 días/sem', 250, 'blue_kids', 5, 20),
  ('mensualidad_bk_4d',   'mensualidad', 'Mensualidad Blue Kids · 4 días/sem', 225, 'blue_kids', 4, 21),
  ('mensualidad_bk_3d',   'mensualidad', 'Mensualidad Blue Kids · 3 días/sem', 200, 'blue_kids', 3, 22),
  ('mensualidad_bk_2d',   'mensualidad', 'Mensualidad Blue Kids · 2 días/sem', 170, 'blue_kids', 2, 23),
  ('mensualidad_lk_5d',   'mensualidad', 'Mensualidad Learning Kids · 5 días/sem', 250, 'learning_kids', 5, 24),
  ('mensualidad_lk_4d',   'mensualidad', 'Mensualidad Learning Kids · 4 días/sem', 225, 'learning_kids', 4, 25),
  ('mensualidad_lk_3d',   'mensualidad', 'Mensualidad Learning Kids · 3 días/sem', 200, 'learning_kids', 3, 26),
  ('mensualidad_lk_2d',   'mensualidad', 'Mensualidad Learning Kids · 2 días/sem', 170, 'learning_kids', 2, 27),
  ('mensualidad_aula_5d', 'mensualidad', 'Mensualidad Aula Educativa · 5 días/sem', 275, 'aula_educativa', 5, 28),
  ('mensualidad_aula_3d', 'mensualidad', 'Mensualidad Aula Educativa · 3 días/sem', 250, 'aula_educativa', 3, 29),
  ('mensualidad_aula_2d', 'mensualidad', 'Mensualidad Aula Educativa · 2 días/sem', 200, 'aula_educativa', 2, 30)
ON CONFLICT (code) DO UPDATE
  SET unit_price_usd  = EXCLUDED.unit_price_usd,
      name            = EXCLUDED.name,
      morning_program = EXCLUDED.morning_program,
      days_per_week   = EXCLUDED.days_per_week,
      updated_at      = now();

-- Material didáctico (prorrateado por mes de inicio)
INSERT INTO public.service_catalog
  (code, category, name, unit_price_usd,
   proration_group, applies_from_month, applies_to_month, sort_order)
VALUES
  ('material_didactico_anual',    'material_didactico', 'Material Didáctico BK/AE — Anual (Enero–Mayo)',          100, 'material_bk_ae', 1, 5, 40),
  ('material_didactico_6m',       'material_didactico', 'Material Didáctico BK/AE — Primeros 6 meses (Jun–Ago)',  75,  'material_bk_ae', 6, 8, 41),
  ('material_didactico_7m',       'material_didactico', 'Material Didáctico BK/AE — A partir del 7mo mes (Sep–Oct)', 50, 'material_bk_ae', 9, 10, 42),
  ('material_didactico_ultimos3', 'material_didactico', 'Material Didáctico BK/AE — Últimos 3 meses (Nov–Dic)',    35,  'material_bk_ae', 11, 12, 43)
ON CONFLICT (code) DO UPDATE
  SET unit_price_usd     = EXCLUDED.unit_price_usd,
      name               = EXCLUDED.name,
      applies_from_month = EXCLUDED.applies_from_month,
      applies_to_month   = EXCLUDED.applies_to_month,
      updated_at         = now();

-- Uniformes
INSERT INTO public.service_catalog (code, category, name, unit_price_usd, sort_order)
VALUES
  ('uniforme_camisa', 'uniforme', 'Camisa de uniforme', 15, 50),
  ('uniforme_short',  'uniforme', 'Short de uniforme',  13, 51),
  ('uniforme_pants',  'uniforme', 'Pants de uniforme',  16, 52)
ON CONFLICT (code) DO UPDATE
  SET unit_price_usd = EXCLUDED.unit_price_usd,
      name           = EXCLUDED.name,
      updated_at     = now();

-- Entrevistas / Asesorías / Evaluaciones clínicas + TEA
INSERT INTO public.service_catalog (code, category, name, description, unit_price_usd, duration_minutes, sort_order)
VALUES
  ('entrevista_antecedentes',  'entrevista', 'Entrevista de Antecedentes/Anamnesis',
    'Cualquier programa. 1h 30min', 40, 90, 60),
  ('entrevista_informacion',   'entrevista', 'Entrevista de información/conocimiento',
    'Sin costo — primera reunión informativa', 0, 30, 61),
  ('asesoria_familiar',        'asesoria',   'Asesoría Familiar', NULL, 40, 45, 70),
  ('eval_neuromotor',          'evaluacion', 'Evaluación Neuromotora', NULL, 50, 45, 80),
  ('eval_sensorial',           'evaluacion', 'Evaluación Sensorial', NULL, 50, 45, 81),
  ('eval_habla_lenguaje',      'evaluacion', 'Evaluación de Habla y Lenguaje', NULL, 50, 45, 82),
  ('eval_alim_deglu',          'evaluacion', 'Evaluación Alimentación y Deglución', NULL, 50, 60, 83),
  ('eval_estim_temprana',      'evaluacion', 'Evaluación de Estimulación Temprana', NULL, 50, 30, 84),
  ('eval_fisica',              'evaluacion', 'Evaluación Física', NULL, 50, 60, 85),
  ('eval_ocupacional',         'evaluacion', 'Evaluación Ocupacional', NULL, 50, 60, 86),
  ('eval_destrezas_manuales',  'evaluacion', 'Evaluación Destrezas Manuales y Pre-escritura', NULL, 50, 45, 87),
  ('eval_dx_entrevista',       'evaluacion_dx_tea', 'Entrevista General de Antecedentes (TEA)', NULL, 40, 90, 90),
  ('eval_ados_2',              'evaluacion_dx_tea', 'Evaluación ADOS-2 (Autismo)', NULL, 100, 60, 91),
  ('eval_adi_r',               'evaluacion_dx_tea', 'Evaluación ADI-R', NULL, 150, 120, 92),
  ('eval_dx_tea_paquete',      'evaluacion_dx_tea', 'Paquete completo: Entrevista + ADOS-2 + ADI-R',
    'Incluye las 3 pruebas de diagnóstico TEA', 250, 240, 93),
  ('eval_observacion_clinica', 'evaluacion_dx_tea', 'Observación Clínica',
    '1h 30min presencial. La licenciada decidirá si se realiza.', 25, 90, 94)
ON CONFLICT (code) DO UPDATE
  SET unit_price_usd  = EXCLUDED.unit_price_usd,
      name            = EXCLUDED.name,
      description     = EXCLUDED.description,
      duration_minutes= EXCLUDED.duration_minutes,
      sort_order      = EXCLUDED.sort_order,
      updated_at      = now();
