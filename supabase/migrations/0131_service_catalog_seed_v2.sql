-- Migración 0131 — Catálogo de servicios v2 — PARTE 2/2 (seed)
--
-- Inserta las 18 terapias individuales del Excel PRECIOS CLIENTES 2026
-- (categoría 'terapia_individual', nueva en este enum).
--
-- Las matrículas, mensualidades, materiales, uniformes, entrevistas,
-- evaluaciones y pruebas psicológicas YA fueron seedeados en mig 0107
-- con codes propios. Para evitar conflictos del unique index parcial
-- (morning_program, days_per_week), no las re-insertamos acá. Si los
-- precios del Excel 2026 difieren, se actualizan desde /reportes (admin)
-- o con UPDATE manual.
--
-- Idempotente: ON CONFLICT (code) DO UPDATE.

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

-- ── Refresh de precios BK en items existentes del 0107 ─────────────────
-- (Habla y Lenguaje + Psicológica genérica tienen variante BK en el Excel,
--  pero el seed 0107 las creó como entrevistas / asesorías sin BK price.
--  No las tocamos acá — el nuevo catálogo therapy_* es el canónico para
--  terapias individuales.)
