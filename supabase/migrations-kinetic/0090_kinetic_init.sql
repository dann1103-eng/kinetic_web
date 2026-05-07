-- =============================================================================
-- Kinetic — Init migration (Fase 0 del plan)
-- =============================================================================
-- Este es el primer cambio específico de Kinetic sobre el schema base de FM CRM.
-- Asume que las migraciones de FM (0001..0066) ya corrieron en el proyecto
-- Supabase nuevo y crearon: users, app_settings, company_settings, etc.
--
-- Este archivo:
--   1. Sobreescribe el seed de company_settings con datos de Kinetic / Beginnings.
--   2. Crea tabla `professional_signatures` con catálogo inicial de profesionales.
--   3. Crea tabla `test_catalog` con las 6 pruebas estandarizadas conocidas.
--
-- NOTA: NIT y NRC quedan vacíos como placeholder. Admin los edita por UI cuando
--       Beginnings los provea.
-- =============================================================================


-- ── 1. Re-seed company_settings con datos de Kinetic ─────────────────────────
-- Sobreescribe el row sembrado por la migración 0048 de FM.
-- Si no existe row (proyecto fresh sin migraciones FM), inserta uno nuevo.

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.company_settings limit 1;

  if v_id is null then
    insert into public.company_settings (
      legal_name, trade_name, nit, nrc,
      fiscal_address, giro, phone, email,
      invoice_footer_note,
      payment_methods_json, terms_and_conditions_json
    ) values (
      'BEGINNINGS, S.A. de C.V.',
      'Kinetic — Centro de Estimulación y Desarrollo Intelectual',
      '',                                      -- NIT pendiente
      '',                                      -- NRC pendiente
      'Colonia La Sultana, Calle Las Rosas #36 C, Antiguo Cuscatlán, La Libertad, El Salvador',
      'Servicios de educación especial y terapéuticos',
      '2243-9648 / 2243-7487 / 2243-7488',
      'mercadeo@kinetic.center',
      'Pagos en oficina (efectivo o cheque a nombre de "BEGINNINGS, S.A. de C.V.") o transferencia BAC 201028016. NO se recibe pago en la calle.',
      '[
        {"id":"pm_bac","type":"bank","label":"BAC (Banco de América Central)","account_holder":"BEGINNINGS, S.A. de C.V.","account_number":"201028016","account_type":"Cuenta corriente"},
        {"id":"pm_cash","type":"cash","label":"Efectivo en recepción","note":"Lunes a viernes, 8:00 a.m. – 5:30 p.m."},
        {"id":"pm_check","type":"check","label":"Cheque a nombre de BEGINNINGS, S.A. de C.V.","note":"Cheque devuelto genera recargo más mora si el pago resulta extemporáneo"},
        {"id":"pm_n1co","type":"card","label":"Tarjeta de crédito/débito (n1co)","note":"Link de pago disponible en el portal del cliente"}
      ]'::jsonb,
      '[
        {"id":"tc_01","order":1,"text":"La modalidad de pago es mensual y anticipado. Debe efectuarse en los primeros cinco días hábiles del mes."},
        {"id":"tc_02","order":2,"text":"Si el pago no se realiza en los primeros 5 días del mes, por cada 5 días de retraso se aplicará un recargo del 5% sobre la mensualidad."},
        {"id":"tc_03","order":3,"text":"Si la familia no se encuentra al día con el pago al día 8 del mes (sin notificación previa), se suspenderá automáticamente el derecho a recibir terapias."},
        {"id":"tc_04","order":4,"text":"Al realizar pago por transferencia o depósito debe colocar el nombre del niño/a como concepto y compartir el comprobante por el portal o WhatsApp 7743-8666."},
        {"id":"tc_05","order":5,"text":"Sobrepagos se acreditan automáticamente al mes siguiente. No se reembolsan ni se aplican a otro concepto."},
        {"id":"tc_06","order":6,"text":"Programas matutinos (BlueKids, LearningKids, Aula Educativa): mensualidad fija no devolvible. No se reponen días no asistidos."},
        {"id":"tc_07","order":7,"text":"Matrícula y materiales son anuales. Si el niño/a asiste menos meses, la matrícula se cancela en su totalidad."},
        {"id":"tc_08","order":8,"text":"Reposición de terapias individuales: solo dentro de las 4 semanas posteriores a la ausencia, por enfermedad o emergencia familiar, estando solvente y con aviso de al menos 1 día de anticipación."},
        {"id":"tc_09","order":9,"text":"Dos inasistencias consecutivas sin justificación liberan automáticamente el horario reservado del niño/a."},
        {"id":"tc_10","order":10,"text":"Cargos de $5.00 por cada media hora o fracción al recoger al niño/a más de 10 minutos después del término de su terapia o programa matutino."},
        {"id":"tc_11","order":11,"text":"En caso de aseguradora médica, el padre paga el 100% a Kinetic y gestiona el reembolso por su cuenta. Kinetic apoya con firma, sello y número de Junta de Vigilancia del profesional responsable."}
      ]'::jsonb
    );
  else
    update public.company_settings
    set
      legal_name = 'BEGINNINGS, S.A. de C.V.',
      trade_name = 'Kinetic — Centro de Estimulación y Desarrollo Intelectual',
      nit = '',
      nrc = '',
      fiscal_address = 'Colonia La Sultana, Calle Las Rosas #36 C, Antiguo Cuscatlán, La Libertad, El Salvador',
      giro = 'Servicios de educación especial y terapéuticos',
      phone = '2243-9648 / 2243-7487 / 2243-7488',
      email = 'mercadeo@kinetic.center',
      invoice_footer_note = 'Pagos en oficina (efectivo o cheque a nombre de "BEGINNINGS, S.A. de C.V.") o transferencia BAC 201028016. NO se recibe pago en la calle.',
      payment_methods_json = '[
        {"id":"pm_bac","type":"bank","label":"BAC (Banco de América Central)","account_holder":"BEGINNINGS, S.A. de C.V.","account_number":"201028016","account_type":"Cuenta corriente"},
        {"id":"pm_cash","type":"cash","label":"Efectivo en recepción","note":"Lunes a viernes, 8:00 a.m. – 5:30 p.m."},
        {"id":"pm_check","type":"check","label":"Cheque a nombre de BEGINNINGS, S.A. de C.V.","note":"Cheque devuelto genera recargo más mora si el pago resulta extemporáneo"},
        {"id":"pm_n1co","type":"card","label":"Tarjeta de crédito/débito (n1co)","note":"Link de pago disponible en el portal del cliente"}
      ]'::jsonb,
      terms_and_conditions_json = '[
        {"id":"tc_01","order":1,"text":"La modalidad de pago es mensual y anticipado. Debe efectuarse en los primeros cinco días hábiles del mes."},
        {"id":"tc_02","order":2,"text":"Si el pago no se realiza en los primeros 5 días del mes, por cada 5 días de retraso se aplicará un recargo del 5% sobre la mensualidad."},
        {"id":"tc_03","order":3,"text":"Si la familia no se encuentra al día con el pago al día 8 del mes (sin notificación previa), se suspenderá automáticamente el derecho a recibir terapias."},
        {"id":"tc_04","order":4,"text":"Al realizar pago por transferencia o depósito debe colocar el nombre del niño/a como concepto y compartir el comprobante por el portal o WhatsApp 7743-8666."},
        {"id":"tc_05","order":5,"text":"Sobrepagos se acreditan automáticamente al mes siguiente. No se reembolsan ni se aplican a otro concepto."},
        {"id":"tc_06","order":6,"text":"Programas matutinos (BlueKids, LearningKids, Aula Educativa): mensualidad fija no devolvible. No se reponen días no asistidos."},
        {"id":"tc_07","order":7,"text":"Matrícula y materiales son anuales. Si el niño/a asiste menos meses, la matrícula se cancela en su totalidad."},
        {"id":"tc_08","order":8,"text":"Reposición de terapias individuales: solo dentro de las 4 semanas posteriores a la ausencia, por enfermedad o emergencia familiar, estando solvente y con aviso de al menos 1 día de anticipación."},
        {"id":"tc_09","order":9,"text":"Dos inasistencias consecutivas sin justificación liberan automáticamente el horario reservado del niño/a."},
        {"id":"tc_10","order":10,"text":"Cargos de $5.00 por cada media hora o fracción al recoger al niño/a más de 10 minutos después del término de su terapia o programa matutino."},
        {"id":"tc_11","order":11,"text":"En caso de aseguradora médica, el padre paga el 100% a Kinetic y gestiona el reembolso por su cuenta. Kinetic apoya con firma, sello y número de Junta de Vigilancia del profesional responsable."}
      ]'::jsonb,
      updated_at = now()
    where id = v_id;
  end if;
end $$;


-- ── 2. professional_signatures (catálogo de profesionales firmantes) ────────
-- Usado en informes (post-terapia, avances, evaluaciones) y constancias.
-- council_type distingue entre JVPP (Psicología) y JVPM (Médica/Fisio).

create table if not exists public.professional_signatures (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references public.users(id) on delete set null,
  full_name                text not null,
  profession               text not null check (profession in (
    'psicologa', 'fisioterapeuta', 'terapista_ocupacional', 'terapista_lenguaje',
    'medico', 'directora', 'otra'
  )),
  council_type             text check (council_type in ('JVPP', 'JVPM', 'otro')),
  council_number           text,                          -- p.ej. "12141"
  council_label_full       text,                          -- p.ej. "J.V.P.P. No. 12141"
  signature_image_url      text,
  stamp_image_url          text,
  display_title            text,                          -- p.ej. "Psicóloga.", "Directora General."
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.professional_signatures enable row level security;

create policy "professional_signatures_select_agency"
  on public.professional_signatures for select
  using (public.is_agency_user());

create policy "professional_signatures_insert_admin"
  on public.professional_signatures for insert
  with check (public.is_admin());

create policy "professional_signatures_update_admin"
  on public.professional_signatures for update
  using (public.is_admin());

create policy "professional_signatures_delete_admin"
  on public.professional_signatures for delete
  using (public.is_admin());

grant all on public.professional_signatures to anon, authenticated, service_role;

-- Seed inicial con los 5 profesionales identificados en informes reales de Kinetic.
-- user_id queda NULL hasta que admin los vincule a su cuenta de usuario.

insert into public.professional_signatures
  (full_name, profession, council_type, council_number, council_label_full, display_title, active)
values
  ('Licda. Josselin Castro',                     'directora',         null,    null,    null,                  'Directora General.',           true),
  ('Licda. Tania Abigail Meléndez Mejía',        'psicologa',         'JVPP',  '12141', 'J.V.P.P. No. 12141',  'Psicóloga.',                   true),
  ('Licda. Estefany Judith Cruz Vásquez',        'psicologa',         'JVPP',  '11102', 'J.V.P.P. No. 11102',  'Psicóloga.',                   true),
  ('Licda. Diana Patricia Mancía Ayala',         'psicologa',         'JVPP',  '10989', 'J.V.P.P. No. 10989',  'Psicóloga.',                   true),
  ('Licda. Jenny Elizabeth Palacios Portillo',   'fisioterapeuta',    'JVPM',  '907',   'J.V.P.M. No. 907',    'Fisioterapeuta y T. Ocupacional.', true)
on conflict do nothing;


-- ── 3. test_catalog (catálogo de pruebas estandarizadas) ─────────────────────
-- Usado por evaluation_reports para estructurar tablas de puntuaciones.
-- scoring_system define cómo se interpretan los resultados (compuesto, eneatipo,
-- percentil, decatipo, T-score) y rating_scale_json contiene los rangos de
-- clasificación textual (Muy Bajo / Bajo / Medio / Alto / Muy Alto).

create table if not exists public.test_catalog (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  full_name       text,
  description     text,
  scoring_system  text not null check (scoring_system in (
    'compound_score', 'enneatype', 'percentile', 'decatype', 'T_score', 'mixed'
  )),
  rating_scale_json   jsonb,    -- ej: {"ranges":[{"min":0,"max":69,"label":"Muy Bajo"}, ...]}
  contexts_json       jsonb,    -- ej: ["AUTOINFORME","FAMILIA","ESCUELA"] o null
  subtests_json       jsonb,    -- estructura de subpruebas/escalas (para WISC V, SENA, etc.)
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.test_catalog enable row level security;

create policy "test_catalog_select_agency"
  on public.test_catalog for select
  using (public.is_agency_user());

create policy "test_catalog_insert_admin"
  on public.test_catalog for insert
  with check (public.is_admin());

create policy "test_catalog_update_admin"
  on public.test_catalog for update
  using (public.is_admin());

create policy "test_catalog_delete_admin"
  on public.test_catalog for delete
  using (public.is_admin());

grant all on public.test_catalog to anon, authenticated, service_role;

-- Seed con las 6 pruebas identificadas en informes reales de Kinetic.

insert into public.test_catalog (code, name, full_name, description, scoring_system, rating_scale_json, contexts_json, subtests_json) values

  ('WISC_V', 'WISC V', 'Wechsler Intelligence Scale for Children, 5ª edición',
   'Evaluación de capacidad cognoscitiva en niños de 6-16 años. Provee subpruebas y puntuaciones compuestas en dominios cognoscitivos específicos + CI total.',
   'compound_score',
   '{"ranges":[
     {"min":0,"max":69,"label":"Muy Bajo"},
     {"min":70,"max":79,"label":"Bajo"},
     {"min":80,"max":89,"label":"Medio Bajo"},
     {"min":90,"max":109,"label":"Medio"},
     {"min":110,"max":119,"label":"Medio Alto"},
     {"min":120,"max":129,"label":"Alto"},
     {"min":130,"max":999,"label":"Muy Alto"}
   ]}'::jsonb,
   null,
   '{"primary_scales":["Comprensión verbal","Visoespacial","Razonamiento fluido","Memoria de trabajo","Velocidad de procesamiento","Escala total"],
     "secondary_scales":["Razonamiento cuantitativo","Memoria de trabajo auditiva","No verbal","Capacidad General","Competencia Cognitiva"],
     "subtests":["Cubos","Analogías","Matrices","Dígitos","Claves","Vocabulario","Balanzas","Puzles Visuales","Spam de dibujos","Búsqueda de símbolos","Información","Letras y números","Cancelación","Comprensión","Aritmética"]}'::jsonb),

  ('CARAS', 'Test de Caras', 'Test de percepción de diferencias (CARAS)',
   '60 elementos gráficos de caras esquemáticas. Evalúa aspectos perceptivos y atencionales en contextos escolares, incluyendo control de impulsividad.',
   'enneatype',
   '{"ranges":[
     {"min":1,"max":1,"label":"Muy Bajo"},
     {"min":2,"max":2,"label":"Bajo"},
     {"min":3,"max":3,"label":"Medio Bajo"},
     {"min":4,"max":6,"label":"Medio"},
     {"min":7,"max":7,"label":"Medio Alto"},
     {"min":8,"max":8,"label":"Alto"},
     {"min":9,"max":9,"label":"Muy Alto"}
   ]}'::jsonb,
   null,
   '{"categories":["Aciertos (A)","Errores (E)","Aciertos Netos (A-E)","Índice de Control de la Impulsividad (ICI)"]}'::jsonb),

  ('E_TDAH', 'e-TDAH', 'Escala TDAH basada en criterios DSM-5',
   'Cuestionario estandarizado para valorar presencia y frecuencia de síntomas asociados al TDAH en niños y adolescentes. Aplicado a padres y docentes.',
   'percentile',
   '{"ranges":[
     {"min":0,"max":29,"label":"Bajo"},
     {"min":30,"max":69,"label":"Medio"},
     {"min":70,"max":89,"label":"Alto"},
     {"min":90,"max":100,"label":"Muy Alto"}
   ]}'::jsonb,
   '["FAMILIA","ESCUELA"]'::jsonb,
   '{"dimensions":["Inatención","Hiperactividad/Impulsividad","Dificultades concomitantes al TDAH"]}'::jsonb),

  ('SENA', 'SENA', 'Sistema de Evaluación de Niños y Adolescentes',
   'Detección de problemas emocionales y de conducta + áreas de vulnerabilidad psicológica + recursos personales. Cuestionarios para autoinforme, familia y escuela.',
   'T_score',
   '{"ranges":[
     {"min":10,"max":19,"label":"Muy bajo"},
     {"min":20,"max":29,"label":"Bajo"},
     {"min":30,"max":39,"label":"Medio Bajo"},
     {"min":40,"max":59,"label":"Medio"},
     {"min":60,"max":69,"label":"Medio alto (Zona de precaución)"},
     {"min":70,"max":79,"label":"Alto (Clínicamente significativa)"},
     {"min":80,"max":120,"label":"Muy Alto (Indicadores serios)"}
   ],
   "note":"Las escalas de recursos personales se valoran en sentido inverso (puntuación baja = déficit)."}'::jsonb,
   '["AUTOINFORME","FAMILIA","ESCUELA"]'::jsonb,
   '{"global_indices":["Índice global de problemas (GLO)","Índice de problemas emocionales (EMO)","Índice de problemas conductuales (CON)","Índice de problemas en funciones ejecutivas (EJE)","Índice de problemas contextuales (CTX)","Índice de recursos personales (REC)"],
     "internalized":["Depresión","Ansiedad","Ansiedad social","Quejas somáticas","Sintomatología postraumática"],
     "externalized":["Problemas de atención","Hiperactividad-impulsividad","Problemas de control de la ira","Agresión","Conducta desafiante","Problemas de conducta"],
     "contextual":["Problemas familiares","Problemas con la escuela","Problemas con los compañeros"],
     "vulnerabilities":["Problemas de regulación emocional","Rigidez","Aislamiento"],
     "resources":["Autoestima","Integración y competencia social","Inteligencia emocional","Disposición al estudio"],
     "control_scales":["Inconsistencia (INC)","Impresión negativa (NEG)","Impresión positiva (POS)"]}'::jsonb),

  ('ESPQ', 'ESPQ', 'Cuestionario de Personalidad para Niños (ESPQ)',
   '160 preguntas que permiten puntuaciones en 13 dimensiones de personalidad + 3 factores globales de segundo orden (Ansiedad, Extraversión, Excitabilidad/Dureza).',
   'decatype',
   '{"ranges":[
     {"min":1,"max":3,"label":"Bajo"},
     {"min":4,"max":7,"label":"Medio"},
     {"min":8,"max":10,"label":"Alto"}
   ]}'::jsonb,
   null,
   '{"first_order_factors":[
     {"code":"A","label":"Reservado-Abierto"},
     {"code":"B","label":"Inteligencia Baja-Alta"},
     {"code":"C","label":"Emocionalmente afectado-estable"},
     {"code":"D","label":"Calmoso-Excitable"},
     {"code":"E","label":"Sumiso-Dominante"},
     {"code":"F","label":"Sobrio-Entusiasta"},
     {"code":"G","label":"Despreocupado-Consciente"},
     {"code":"H","label":"Cohibido-Emprendedor"},
     {"code":"I","label":"Sensibilidad Dura-Blanda"},
     {"code":"J","label":"Seguro-Dubitativo"},
     {"code":"N","label":"Sencillo-Astuto"},
     {"code":"O","label":"Sereno-Aprensivo"},
     {"code":"Q4","label":"Relajado-Tenso"}
   ],
   "second_order_factors":[
     {"code":"QI","label":"Ajuste-Ansiedad"},
     {"code":"QII","label":"Introversión-Extraversión"},
     {"code":"QIII","label":"Excitabilidad/Dureza"}
   ]}'::jsonb),

  ('RAVEN', 'Raven (escala coloreada)', 'Test de Matrices Progresivas de Raven, escala coloreada',
   'Mide factor G (capacidad deductiva, razonamiento lógico, abstracción) mediante matrices y completar imágenes. No verbal.',
   'percentile',
   '{"ranges":[
     {"min":95,"max":100,"label":"Superior (I)"},
     {"min":75,"max":94,"label":"Superior al término medio (II)"},
     {"min":50,"max":74,"label":"Término medio (III)"},
     {"min":25,"max":49,"label":"Inferior al término medio (IV)"},
     {"min":0,"max":24,"label":"Deficiente (V)"}
   ]}'::jsonb,
   null,
   '{"subtests":["Serie A","Serie ab","Serie B"],
     "summary_metrics":["Puntaje","Percentil","Rango","Diagnóstico de capacidad","Discrepancia (validez)"]}'::jsonb)

on conflict (code) do nothing;


-- ── Fin de migración 0001_kinetic_init ─────────────────────────────────────
