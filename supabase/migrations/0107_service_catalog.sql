-- 0107_service_catalog.sql
-- Catálogo único de tarifas Kinetic: matrículas, mensualidades, materiales,
-- uniformes, entrevistas, asesorías, evaluaciones clínicas y tests
-- psicológicos. Conecta a invoices via FK opcional + service_code denormalizado.

-- =============================================================================
-- 1. Enum de categorías
-- =============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'service_category') then
    create type public.service_category as enum (
      'matricula',
      'mensualidad',
      'material_didactico',
      'uniforme',
      'entrevista',
      'asesoria',
      'evaluacion',
      'evaluacion_dx_tea',
      'evaluacion_psicologica'
    );
  end if;
end $$;

-- =============================================================================
-- 2. Tabla service_catalog
-- =============================================================================
create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  category public.service_category not null,
  name text not null,
  description text,
  unit_price_usd numeric(10, 2) not null,
  duration_minutes integer,

  -- Mensualidades:
  morning_program public.morning_program,
  days_per_week integer check (days_per_week between 1 and 7),

  -- Items prorrateados por mes:
  proration_group text,
  applies_from_month integer check (applies_from_month between 1 and 12),
  applies_to_month integer check (applies_to_month between 1 and 12),

  active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mensualidad_requires_program check (
    category != 'mensualidad' or (morning_program is not null and days_per_week is not null)
  ),
  constraint proration_requires_months check (
    proration_group is null or (applies_from_month is not null and applies_to_month is not null)
  )
);

create index if not exists service_catalog_active_category_idx
  on public.service_catalog (category, sort_order) where active;
create index if not exists service_catalog_proration_idx
  on public.service_catalog (proration_group, applies_from_month) where proration_group is not null;
create unique index if not exists service_catalog_mensualidad_unique
  on public.service_catalog (morning_program, days_per_week)
  where category = 'mensualidad' and active;

-- Trigger updated_at (defensivo: crea la función si no existe en el repo)
create or replace function public.tg_service_catalog_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists service_catalog_updated_at on public.service_catalog;
create trigger service_catalog_updated_at
  before update on public.service_catalog
  for each row execute function public.tg_service_catalog_updated_at();

-- =============================================================================
-- 3. RLS
-- =============================================================================
alter table public.service_catalog enable row level security;

drop policy if exists service_catalog_select on public.service_catalog;
create policy service_catalog_select on public.service_catalog
  for select using (auth.role() = 'authenticated');

drop policy if exists service_catalog_admin_write on public.service_catalog;
create policy service_catalog_admin_write on public.service_catalog
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  ) with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- =============================================================================
-- 4. FK opcional en invoice_items y quote_items
-- =============================================================================
alter table public.invoice_items
  add column if not exists service_catalog_id uuid references public.service_catalog(id) on delete set null,
  add column if not exists service_code text;

create index if not exists invoice_items_service_idx
  on public.invoice_items (service_catalog_id);

alter table public.quote_items
  add column if not exists service_catalog_id uuid references public.service_catalog(id) on delete set null,
  add column if not exists service_code text;

create index if not exists quote_items_service_idx
  on public.quote_items (service_catalog_id);

-- =============================================================================
-- 5. Seed inicial (Excel del usuario, mayo 2026)
-- =============================================================================

-- Idempotencia: si ya hay rows con estos codes, no duplicar
insert into public.service_catalog
  (code, category, name, description, unit_price_usd, duration_minutes,
   morning_program, days_per_week, proration_group, applies_from_month, applies_to_month, sort_order)
values
  -- ─── Matrícula Blue Kids / Learning Kids (4 brackets) ──────────────────────
  ('matricula_bk_lk_q1', 'matricula', 'Matrícula anual Blue Kids / Learning Kids — Enero a marzo',
   'Matrícula vigente para inscripciones entre enero y marzo.', 200.00, null, null, null,
   'matricula_bk_lk', 1, 3, 10),
  ('matricula_bk_lk_q2', 'matricula', 'Matrícula anual Blue Kids / Learning Kids — Abril a junio',
   'Matrícula prorrateada para inscripciones entre abril y junio.', 175.00, null, null, null,
   'matricula_bk_lk', 4, 6, 11),
  ('matricula_bk_lk_q3', 'matricula', 'Matrícula anual Blue Kids / Learning Kids — Julio a septiembre',
   'Matrícula prorrateada para inscripciones entre julio y septiembre.', 150.00, null, null, null,
   'matricula_bk_lk', 7, 9, 12),
  ('matricula_bk_lk_q4', 'matricula', 'Matrícula anual Blue Kids / Learning Kids — Octubre a diciembre',
   'Matrícula prorrateada para inscripciones entre octubre y diciembre.', 100.00, null, null, null,
   'matricula_bk_lk', 10, 12, 13),

  -- ─── Matrícula Aula Educativa (4 brackets) ────────────────────────────────
  ('matricula_ae_q1', 'matricula', 'Matrícula anual Aula Educativa — Enero a marzo',
   'Matrícula vigente para inscripciones entre enero y marzo.', 200.00, null, null, null,
   'matricula_ae', 1, 3, 20),
  ('matricula_ae_q2', 'matricula', 'Matrícula anual Aula Educativa — Abril a junio',
   'Matrícula prorrateada para inscripciones entre abril y junio.', 175.00, null, null, null,
   'matricula_ae', 4, 6, 21),
  ('matricula_ae_q3', 'matricula', 'Matrícula anual Aula Educativa — Julio a septiembre',
   'Matrícula prorrateada para inscripciones entre julio y septiembre.', 150.00, null, null, null,
   'matricula_ae', 7, 9, 22),
  ('matricula_ae_q4', 'matricula', 'Matrícula anual Aula Educativa — Octubre a diciembre',
   'Matrícula prorrateada para inscripciones entre octubre y diciembre.', 100.00, null, null, null,
   'matricula_ae', 10, 12, 23),

  -- ─── Mensualidades Blue Kids / Learning Kids ──────────────────────────────
  ('mensualidad_blue_kids_5d', 'mensualidad', 'Mensualidad Blue Kids — 5 días a la semana',
   null, 250.00, null, 'blue_kids', 5, null, null, null, 30),
  ('mensualidad_blue_kids_4d', 'mensualidad', 'Mensualidad Blue Kids — 4 días a la semana',
   null, 225.00, null, 'blue_kids', 4, null, null, null, 31),
  ('mensualidad_blue_kids_3d', 'mensualidad', 'Mensualidad Blue Kids — 3 días a la semana',
   null, 200.00, null, 'blue_kids', 3, null, null, null, 32),
  ('mensualidad_blue_kids_2d', 'mensualidad', 'Mensualidad Blue Kids — 2 días a la semana',
   null, 170.00, null, 'blue_kids', 2, null, null, null, 33),

  ('mensualidad_learning_kids_5d', 'mensualidad', 'Mensualidad Learning Kids — 5 días a la semana',
   null, 250.00, null, 'learning_kids', 5, null, null, null, 40),
  ('mensualidad_learning_kids_4d', 'mensualidad', 'Mensualidad Learning Kids — 4 días a la semana',
   null, 225.00, null, 'learning_kids', 4, null, null, null, 41),
  ('mensualidad_learning_kids_3d', 'mensualidad', 'Mensualidad Learning Kids — 3 días a la semana',
   null, 200.00, null, 'learning_kids', 3, null, null, null, 42),
  ('mensualidad_learning_kids_2d', 'mensualidad', 'Mensualidad Learning Kids — 2 días a la semana',
   null, 170.00, null, 'learning_kids', 2, null, null, null, 43),

  -- ─── Mensualidades Aula Educativa (sin opción de 4 días) ──────────────────
  ('mensualidad_aula_educativa_5d', 'mensualidad', 'Mensualidad Aula Educativa — 5 días a la semana',
   null, 275.00, null, 'aula_educativa', 5, null, null, null, 50),
  ('mensualidad_aula_educativa_3d', 'mensualidad', 'Mensualidad Aula Educativa — 3 días a la semana',
   null, 250.00, null, 'aula_educativa', 3, null, null, null, 51),
  ('mensualidad_aula_educativa_2d', 'mensualidad', 'Mensualidad Aula Educativa — 2 días a la semana',
   null, 200.00, null, 'aula_educativa', 2, null, null, null, 52),

  -- ─── Material didáctico (Blue Kids / Aula Educativa, prorrateado) ─────────
  ('material_q1', 'material_didactico', 'Material didáctico — Anual (Enero a mayo)',
   'Material didáctico anual completo, vigente para ingresos entre enero y mayo.', 100.00, null, null, null,
   'material_bk_ae', 1, 5, 60),
  ('material_q2', 'material_didactico', 'Material didáctico — Primeros 6 meses (Junio a agosto)',
   'Material didáctico prorrateado para ingresos entre junio y agosto.', 75.00, null, null, null,
   'material_bk_ae', 6, 8, 61),
  ('material_q3', 'material_didactico', 'Material didáctico — A partir del 7° mes (Septiembre a octubre)',
   'Material didáctico prorrateado para ingresos entre septiembre y octubre.', 50.00, null, null, null,
   'material_bk_ae', 9, 10, 62),
  ('material_q4', 'material_didactico', 'Material didáctico — Últimos 3 meses (Noviembre a diciembre)',
   'Material didáctico prorrateado para ingresos entre noviembre y diciembre.', 35.00, null, null, null,
   'material_bk_ae', 11, 12, 63),

  -- ─── Uniformes ────────────────────────────────────────────────────────────
  ('uniforme_camisa', 'uniforme', 'Camisa de uniforme', null, 15.00, null, null, null, null, null, null, 70),
  ('uniforme_short', 'uniforme', 'Short de uniforme', null, 13.00, null, null, null, null, null, null, 71),
  ('uniforme_pants', 'uniforme', 'Pants de uniforme', null, 16.00, null, null, null, null, null, null, 72),

  -- ─── Entrevistas ──────────────────────────────────────────────────────────
  ('entrevista_anamnesis', 'entrevista',
   'Entrevista de antecedentes / anamnesis (Dirección General)',
   'Aplica para cualquier programa.', 40.00, 90, null, null, null, null, null, 80),
  ('entrevista_informacion', 'entrevista',
   'Entrevista para solicitar información y/o conocer Kinetic',
   'Sin costo.', 0.00, null, null, null, null, null, null, 81),

  -- ─── Asesoría ─────────────────────────────────────────────────────────────
  ('asesoria_familiar', 'asesoria', 'Asesoría familiar',
   'Atención a padres.', 40.00, 45, null, null, null, null, null, 90),

  -- ─── Evaluaciones clínicas frecuentes ($50 c/u) ───────────────────────────
  ('eval_neuromotor', 'evaluacion', 'Evaluación Neuromotor', null, 50.00, 45, null, null, null, null, null, 100),
  ('eval_sensorial', 'evaluacion', 'Evaluación Sensorial', null, 50.00, 45, null, null, null, null, null, 101),
  ('eval_habla_lenguaje', 'evaluacion', 'Evaluación de Habla y Lenguaje', null, 50.00, 45, null, null, null, null, null, 102),
  ('eval_alim_deglu', 'evaluacion', 'Evaluación Alimentación y Deglución', null, 50.00, 60, null, null, null, null, null, 103),
  ('eval_estimulacion_temprana', 'evaluacion', 'Evaluación de Estimulación Temprana', null, 50.00, 30, null, null, null, null, null, 104),
  ('eval_fisica', 'evaluacion', 'Evaluación Física', null, 50.00, 60, null, null, null, null, null, 105),
  ('eval_ocupacional', 'evaluacion', 'Evaluación Ocupacional', null, 50.00, 60, null, null, null, null, null, 106),
  ('eval_destrezas_pre_escritura', 'evaluacion',
   'Evaluación Destrezas Manuales y Pre-escritura (niños escolarizados)',
   null, 50.00, 45, null, null, null, null, null, 107),

  -- ─── Evaluaciones DX TEA ──────────────────────────────────────────────────
  ('eval_tea_entrevista_general', 'evaluacion_dx_tea',
   'Entrevista general de antecedentes (DX TEA)',
   'Programar antes de las evaluaciones.', 40.00, 90, null, null, null, null, null, 110),
  ('eval_tea_ados_2', 'evaluacion_dx_tea', 'Evaluación ADOS-2 (Autismo)',
   'Aplicación con el niño/a.', 100.00, 60, null, null, null, null, null, 111),
  ('eval_tea_adi_r', 'evaluacion_dx_tea', 'Evaluación ADI-R',
   'Aplicación con padres.', 150.00, 120, null, null, null, null, null, 112),
  ('eval_tea_combo_completo', 'evaluacion_dx_tea',
   'Combo: Entrevista + ADOS-2 + ADI-R',
   'Incluye todas las sesiones, entrevistas, informes y socialización de resultados.',
   250.00, null, null, null, null, null, null, 113),
  ('eval_tea_observacion_clinica', 'evaluacion_dx_tea',
   'Observación clínica (DX TEA)',
   'Presencial 1 hr 30 min, incluye informe. Recomendación profesional define si se lleva a cabo.',
   25.00, 90, null, null, null, null, null, 114),

  -- ─── Evaluaciones psicológicas — Inteligencia / Atención / Aprendizaje ────
  ('test_wisc_iv', 'evaluacion_psicologica',
   'WISC-IV (6 años — 16 años, 11 meses)', null, 180.00, 210, null, null, null, null, null, 200),
  ('test_baneta', 'evaluacion_psicologica', 'BANETA',
   'Duración 3 a 4 horas.', 160.00, 210, null, null, null, null, null, 201),
  ('test_abas', 'evaluacion_psicologica', 'ABAS',
   'Cuestionario que contestan los padres.', 80.00, null, null, null, null, null, null, 202),
  ('test_banfe', 'evaluacion_psicologica', 'BANFE',
   'Duración 2 a 3 horas.', 140.00, 150, null, null, null, null, null, 203),
  ('test_adi_r_psico', 'evaluacion_psicologica', 'ADI-R',
   'Aplicación de 2 horas (área psicológica).', 150.00, 120, null, null, null, null, null, 204),
  ('test_ados_2_psico', 'evaluacion_psicologica', 'ADOS-2',
   'Aplicación de 1 hora (área psicológica).', 100.00, 60, null, null, null, null, null, 205),
  ('test_wppsi_iv', 'evaluacion_psicologica',
   'WPPSI-IV (2 años 6 meses — 7 años 7 meses)', null, 180.00, 210, null, null, null, null, null, 206),
  ('test_cumanin', 'evaluacion_psicologica', 'CUMANIN', null, 80.00, 60, null, null, null, null, null, 207),
  ('test_prolec_r', 'evaluacion_psicologica', 'PROLEC-R', null, 80.00, 45, null, null, null, null, null, 208),
  ('test_proesc', 'evaluacion_psicologica', 'PROESC', null, 60.00, 20, null, null, null, null, null, 209),
  ('test_prolexia', 'evaluacion_psicologica', 'PROLEXIA (dislexia)', null, 150.00, 60, null, null, null, null, null, 210),
  ('test_dst_j', 'evaluacion_psicologica',
   'DST-J (test para detección de dislexia en niños)', null, 100.00, 60, null, null, null, null, null, 211),
  ('test_espq', 'evaluacion_psicologica', 'ESPQ', null, 80.00, 60, null, null, null, null, null, 212),
  ('test_raven', 'evaluacion_psicologica', 'Test de Raven', null, 80.00, 60, null, null, null, null, null, 213),
  ('test_pcm', 'evaluacion_psicologica',
   'PCM — Prueba de Comportamiento Matemático',
   '1 a 2 sesiones de 1 hora cada una.', 150.00, 60, null, null, null, null, null, 214),
  ('test_neuropsis', 'evaluacion_psicologica',
   'NEUROPSIS (atención y memoria)', null, 125.00, 60, null, null, null, null, null, 215),
  ('test_factor_g', 'evaluacion_psicologica',
   'Factor G (coeficiente intelectual y edad mental)', null, 80.00, 30, null, null, null, null, null, 216),
  ('test_aei_r', 'evaluacion_psicologica',
   'AEI-R — aptitudes escolares y áreas de refuerzo (4 a 6 años)',
   null, 100.00, 60, null, null, null, null, null, 217),
  ('test_boehm', 'evaluacion_psicologica',
   'Test BOEHM — riesgos de aprendizaje a nivel escolar (4 a 7 años)',
   null, 100.00, 60, null, null, null, null, null, 218),
  ('test_raven_no_verbal', 'evaluacion_psicologica',
   'RAVEN — inteligencia no verbal (respaldo de WISC o WPPSI)',
   null, 50.00, 20, null, null, null, null, null, 219),
  ('test_dtvp_2', 'evaluacion_psicologica',
   'DTVP-2 — coordinación ojo-mano, figura-fondo, constancia, posición espacial, relaciones espaciales, cierre visual, copia y velocidad visomotora',
   null, 80.00, 30, null, null, null, null, null, 220),
  ('test_stroop', 'evaluacion_psicologica',
   'STROOP — atención selectiva, percepción visual, velocidad y precisión',
   null, 50.00, 20, null, null, null, null, null, 221),
  ('test_frostig', 'evaluacion_psicologica',
   'FROSTIG — percepción visual, coordinación visomotora (importante lecto)',
   null, 80.00, 45, null, null, null, null, null, 222),
  ('test_itpa', 'evaluacion_psicologica', 'ITPA', null, 120.00, 60, null, null, null, null, null, 223),

  -- ─── Pruebas específicas para DX TDAH ─────────────────────────────────────
  ('test_caras', 'evaluacion_psicologica', 'Test CARAS (6 a 18 años)', null, 60.00, 20, null, null, null, null, null, 230),
  ('test_e_tdah', 'evaluacion_psicologica',
   'e-TDAH (6 a 12 años) — cuestionario para padres', null, 60.00, 30, null, null, null, null, null, 231),
  ('test_sena_tdah', 'evaluacion_psicologica', 'SENA (DX TDAH)', null, 140.00, 90, null, null, null, null, null, 232),
  ('test_brief_2', 'evaluacion_psicologica',
   'BRIEF 2 (5 a 18 años) — cuestionario para padres', null, 120.00, 30, null, null, null, null, null, 233),
  ('test_atento', 'evaluacion_psicologica',
   'ATENTO (3 años a 18 años, 11 meses)', null, 140.00, 45, null, null, null, null, null, 234),
  ('test_wipps_iv', 'evaluacion_psicologica', 'WIPPS-IV', null, 180.00, 210, null, null, null, null, null, 235),
  ('test_brief_p', 'evaluacion_psicologica',
   'BRIEF P (2 a 5 años, 11 meses)', null, 120.00, 30, null, null, null, null, null, 236),
  ('test_good_enough_harris', 'evaluacion_psicologica',
   'Test de Goodenough-Harris', null, 60.00, 30, null, null, null, null, null, 237),
  ('test_bender', 'evaluacion_psicologica', 'BENDER (niño)', null, 80.00, 30, null, null, null, null, null, 238),

  -- ─── Relaciones familiares / Ansiedad / Depresión ─────────────────────────
  ('test_sena_rel', 'evaluacion_psicologica',
   'SENA (relaciones familiares / ansiedad / depresión)', null, 140.00, 90, null, null, null, null, null, 240),
  ('test_bdi_bai', 'evaluacion_psicologica', 'BDI + BAI', null, 80.00, 30, null, null, null, null, null, 241),
  ('test_cy_bocs', 'evaluacion_psicologica', 'Cy-BOCS', null, 50.00, 20, null, null, null, null, null, 242),
  ('test_fes', 'evaluacion_psicologica', 'FES', null, 50.00, 20, null, null, null, null, null, 243)

on conflict (code) do nothing;

-- =============================================================================
-- 6. Comentarios para PostgREST / docs
-- =============================================================================
comment on table public.service_catalog is
  'Catálogo único de tarifas Kinetic. Cubre matrícula prorrateada por trimestre, mensualidades por programa × días/semana, materiales prorrateados, uniformes, entrevistas, asesorías, evaluaciones clínicas y tests psicológicos.';
comment on column public.service_catalog.code is
  'Identificador estable y legible para referenciar desde código y desde invoice_items.service_code (denormalizado para audit).';
comment on column public.service_catalog.proration_group is
  'Agrupa filas de un mismo servicio prorrateado mensualmente. Ejemplos: matricula_bk_lk, matricula_ae, material_bk_ae.';
comment on column public.invoice_items.service_catalog_id is
  'FK opcional al item del catálogo. Si la fila del catálogo se borra, esto pasa a NULL pero service_code preserva la trazabilidad.';
comment on column public.invoice_items.service_code is
  'Snapshot del code del catálogo al momento de emitir la factura. Sobrevive cambios y borrados del catálogo.';
