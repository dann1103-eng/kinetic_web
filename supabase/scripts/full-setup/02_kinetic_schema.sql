-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Parte 2: Schema Kinetic (migraciones 0090 → 0124)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar DESPUÉS de Parte 1.
-- Crea: families, children, appointments, treatment_plans, progress_reports,
--       waitlist, payroll, general_expenses, intake_pipeline, etc.
-- ═══════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0090_kinetic_init.sql
-- ────────────────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0091_kinetic_families_and_children.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- Kinetic — Fase 1: Núcleo familiar/clínico
-- =============================================================================
-- Crea las tablas core del dominio Kinetic:
--   1. families              — cuenta familiar (1 por familia, no por niño)
--   2. family_users          — bridge auth user ↔ family (acceso al portal de padres)
--   3. referral_sources      — colegios y médicos externos referentes
--   4. children              — niños/pacientes, FK a families
--
-- Plus:
--   - Helper RLS `is_family_member(family_id)` análogo a `is_client_of`
--   - Función generadora de código del niño (iniciales + sufijo si colisión)
--   - Ampliación del check constraint de `users.role` para roles Kinetic
--
-- COEXISTENCIA: estas tablas conviven con `clients`, `client_users`, etc. del
-- schema FM. La migración a Kinetic-only se hace gradualmente en fases siguientes.
-- =============================================================================


-- ── 0. Ampliar roles de users ────────────────────────────────────────────────
-- El schema base FM tenía: 'admin' | 'operator' (0001), luego se agregó 'supervisor'
-- (0015) y 'client' (0052). Kinetic agrega los roles del dominio clínico.

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in (
  'admin',
  'supervisor',
  'operator',
  'client',                  -- portal padres (legacy nombre, mantenido)
  -- Roles Kinetic:
  'directora',               -- Directora General — aprueba reportes
  'coordinadora_familias',   -- captación + intake (fases 1-3 del pipeline)
  'coordinadora_terapias',   -- gestión de horarios y reposiciones
  'terapista',               -- terapista individual
  'maestra',                 -- programas matutinos (BlueKids/Learning/Aula)
  'recepcion',               -- agenda, cobros pendientes
  'contable',                -- facturación + contabilidad sin acceso clínico
  'family'                   -- portal padres (alias semántico de 'client')
));


-- ── 1. families ──────────────────────────────────────────────────────────────
create table if not exists public.families (
  id                       uuid primary key default gen_random_uuid(),
  code                     text unique,                            -- ej. "MOR" (apellido), libre opcional
  primary_contact_name     text not null,                          -- ej. "Daniel Mancia / Laura Morataya"
  primary_contact_email    text,
  primary_contact_phone    text,
  secondary_contact_name   text,
  secondary_contact_phone  text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  emergency_contact_relation text,
  fiscal_legal_name        text,                                   -- snapshot para facturas
  fiscal_nit               text,
  fiscal_dui               text,
  fiscal_address           text,
  status                   text not null default 'active'
                             check (status in ('active','paused','overdue','dropped')),
  notes                    text,
  created_at               timestamptz not null default now(),
  created_by_user_id       uuid references public.users(id) on delete set null,
  updated_at               timestamptz not null default now()
);

create index if not exists families_status_idx on public.families(status);
create index if not exists families_primary_email_idx on public.families(primary_contact_email);


-- ── 2. family_users (bridge auth user ↔ family) ──────────────────────────────
-- Equivale a `client_users` para Kinetic.

create table if not exists public.family_users (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','viewer')),
  -- Capabilities granulares del portal:
  can_billing  boolean not null default true,    -- ver/pagar facturas
  can_work     boolean not null default true,    -- ver agenda + reportes + cuadernillo
  created_at   timestamptz not null default now(),
  unique (family_id, user_id)
);

create index if not exists family_users_user_id_idx on public.family_users(user_id);
create index if not exists family_users_family_id_idx on public.family_users(family_id);


-- ── 3. referral_sources (colegios + médicos externos) ───────────────────────
create table if not exists public.referral_sources (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('school','doctor','direct','social_media','walk_in','referral_other')),
  name            text not null,                                   -- ej. "Colegio Salesiano San José", "Dr. Juan Pérez"
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  specialty       text,                                            -- si type='doctor': "Neurología pediátrica", etc.
  address         text,
  notes           text,
  can_receive_reports     boolean not null default false,          -- si reciben copia de informes
  partnership_active      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (type, name)
);

create index if not exists referral_sources_type_idx on public.referral_sources(type);
create index if not exists referral_sources_active_idx on public.referral_sources(partnership_active);


-- ── 4. children (niños / pacientes) ─────────────────────────────────────────
create table if not exists public.children (
  id                       uuid primary key default gen_random_uuid(),
  family_id                uuid not null references public.families(id) on delete cascade,
  code                     text unique,                            -- iniciales de apellidos + sufijo (ej. "MR", "MR2")
  full_name                text not null,
  preferred_name           text,                                   -- nombre como le dicen
  birth_date               date,
  gender                   text check (gender in ('M','F','other')),
  -- Datos clínicos (críticos para emergencias)
  blood_type               text,                                   -- ej. "O+"
  allergies_text           text,
  medications_text         text,
  preferred_hospital       text,
  -- Escolaridad
  school_name              text,                                   -- ej. "Liceo San Luis, Santa Ana"
  school_grade             text,                                   -- ej. "Preparatoria", "Segundo grado"
  -- Diagnósticos (visibles en header de informes)
  diagnoses_json           jsonb not null default '[]'::jsonb,     -- ej. ["tdah","altas_capacidades"]
  diagnoses_display_text   text,                                   -- override editorial: "Doble excepcionalidad: TDAH y Altas Capacidades"
  -- Origen del paciente
  referral_source_type     text check (referral_source_type in ('school','doctor','direct','social_media','walk_in','referral_other')),
  referral_source_id       uuid references public.referral_sources(id) on delete set null,
  referral_notes           text,
  -- Pipeline de atención (12 fases, ver plan v0.7)
  intake_phase             text not null default 'solicitud_informacion'
                             check (intake_phase in (
                               'solicitud_informacion',
                               'bateria_preguntas',
                               'entrevista_directora',
                               'propuesta_observacion_evaluacion',
                               'propuesta_economica_evaluacion',
                               'agenda_observacion',
                               'en_observacion_evaluacion',
                               'informe_resultados',
                               'propuesta_plan_terapias',
                               'propuesta_economica_terapias',
                               'en_terapias',
                               'alta'
                             )),
  intake_phase_changed_at  timestamptz not null default now(),
  -- Estado del tratamiento
  treatment_status         text not null default 'active'
                             check (treatment_status in (
                               'active',
                               'considering_discharge',
                               'discharged_conditional',
                               'discharged_final',
                               'paused',
                               'dropped'
                             )),
  treatment_status_changed_at  timestamptz not null default now(),
  treatment_status_notes   text,
  -- Inscripción en programa matutino (si aplica)
  enrolled_program         text check (enrolled_program in ('blue_kids','learning_kids','aula_educativa')),
  enrollment_started_at    date,
  enrollment_ended_at      date,
  -- Notas libres
  notes                    text,
  -- Auditoría
  created_at               timestamptz not null default now(),
  created_by_user_id       uuid references public.users(id) on delete set null,
  updated_at               timestamptz not null default now()
);

create index if not exists children_family_idx on public.children(family_id);
create index if not exists children_intake_phase_idx on public.children(intake_phase);
create index if not exists children_treatment_status_idx on public.children(treatment_status);
create index if not exists children_enrolled_program_idx on public.children(enrolled_program) where enrolled_program is not null;
create index if not exists children_referral_source_idx on public.children(referral_source_id) where referral_source_id is not null;


-- ── 5. Helper RLS: is_family_member ─────────────────────────────────────────
-- Análogo a is_client_of, para el portal de padres.

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.family_users
    where user_id = auth.uid()
      and family_id = target_family_id
  );
$$;


-- ── 6. Función para generar código del niño ──────────────────────────────────
-- Genera código basado en iniciales de apellidos del full_name, con sufijo si colisiona.
-- Lógica: tomar las 2 últimas palabras del nombre (apellidos), inicial de cada una.
--   Ej: "Roberto Andrés Flores Morataya" → "FM"
--   Si "FM" ya existe → "FM2", "FM3", etc.

create or replace function public.generate_child_code(p_full_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_words text[];
  v_n int;
  v_base text;
  v_candidate text;
  v_suffix int := 0;
begin
  v_words := regexp_split_to_array(trim(p_full_name), '\s+');
  v_n := array_length(v_words, 1);

  if v_n is null or v_n < 1 then
    return 'XX';
  end if;

  -- Si solo 1 palabra: primera letra duplicada
  if v_n = 1 then
    v_base := upper(left(v_words[1], 1)) || upper(left(v_words[1], 1));
  -- Si 2 palabras: inicial de cada una
  elsif v_n = 2 then
    v_base := upper(left(v_words[1], 1)) || upper(left(v_words[2], 1));
  -- Si 3+ palabras: tomar las 2 ÚLTIMAS (apellidos)
  else
    v_base := upper(left(v_words[v_n - 1], 1)) || upper(left(v_words[v_n], 1));
  end if;

  -- Buscar primer sufijo libre
  loop
    v_candidate := case when v_suffix = 0 then v_base else v_base || v_suffix::text end;
    if not exists (select 1 from public.children where code = v_candidate) then
      return v_candidate;
    end if;
    v_suffix := v_suffix + 1;
    -- Safety: evitar loop infinito
    if v_suffix > 9999 then
      return v_base || extract(epoch from now())::text;
    end if;
  end loop;
end;
$$;


-- ── 7. Trigger: auto-asignar code al insertar children sin code ─────────────
create or replace function public.children_auto_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.generate_child_code(new.full_name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_children_auto_code on public.children;
create trigger trg_children_auto_code
  before insert on public.children
  for each row execute function public.children_auto_code();


-- ── 8. Trigger: actualizar timestamps ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_families_touch on public.families;
create trigger trg_families_touch before update on public.families
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_children_touch on public.children;
create trigger trg_children_touch before update on public.children
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_referral_sources_touch on public.referral_sources;
create trigger trg_referral_sources_touch before update on public.referral_sources
  for each row execute function public.touch_updated_at();


-- ── 9. RLS — families ──────────────────────────────────────────────────────
alter table public.families enable row level security;

create policy "families_select_agency"
  on public.families for select
  using (public.is_agency_user());

create policy "families_select_member"
  on public.families for select
  using (public.is_family_member(id));

create policy "families_insert_agency"
  on public.families for insert
  with check (public.is_agency_user());

create policy "families_update_agency"
  on public.families for update
  using (public.is_agency_user());

create policy "families_delete_admin"
  on public.families for delete
  using (public.is_admin());


-- ── 10. RLS — family_users ──────────────────────────────────────────────────
alter table public.family_users enable row level security;

create policy "family_users_select_agency"
  on public.family_users for select
  using (public.is_agency_user());

create policy "family_users_select_self"
  on public.family_users for select
  using (user_id = auth.uid());

create policy "family_users_insert_admin"
  on public.family_users for insert
  with check (public.is_admin());

create policy "family_users_update_admin"
  on public.family_users for update
  using (public.is_admin());

create policy "family_users_delete_admin"
  on public.family_users for delete
  using (public.is_admin());


-- ── 11. RLS — children ──────────────────────────────────────────────────────
alter table public.children enable row level security;

create policy "children_select_agency"
  on public.children for select
  using (public.is_agency_user());

create policy "children_select_family_member"
  on public.children for select
  using (public.is_family_member(family_id));

create policy "children_insert_agency"
  on public.children for insert
  with check (public.is_agency_user());

create policy "children_update_agency"
  on public.children for update
  using (public.is_agency_user());

create policy "children_delete_admin"
  on public.children for delete
  using (public.is_admin());


-- ── 12. RLS — referral_sources ──────────────────────────────────────────────
alter table public.referral_sources enable row level security;

create policy "referral_sources_select_agency"
  on public.referral_sources for select
  using (public.is_agency_user());

create policy "referral_sources_insert_agency"
  on public.referral_sources for insert
  with check (public.is_agency_user());

create policy "referral_sources_update_agency"
  on public.referral_sources for update
  using (public.is_agency_user());

create policy "referral_sources_delete_admin"
  on public.referral_sources for delete
  using (public.is_admin());


-- ── 13. Grants ──────────────────────────────────────────────────────────────
grant all on public.families         to anon, authenticated, service_role;
grant all on public.family_users     to anon, authenticated, service_role;
grant all on public.children         to anon, authenticated, service_role;
grant all on public.referral_sources to anon, authenticated, service_role;


-- ── 14. Realtime (familias y niños — para que padres vean cambios live) ────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'families') then
      execute 'alter publication supabase_realtime add table public.families';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'children') then
      execute 'alter publication supabase_realtime add table public.children';
    end if;
  end if;
end $$;


-- ── Fin de migración 0091_kinetic_families_and_children ───────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0092_kinetic_appointments.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- Kinetic — Fase 2 (slice C): Agenda + cierres institucionales
-- =============================================================================
-- Crea las tablas core de la agenda clínica:
--   1. appointments              — todas las citas (terapias + entrevistas + reuniones + evaluaciones + matutino)
--   2. institutional_calendar    — cierres oficiales (Semana Santa, asuetos, decretos)
--   3. virtual_meetings          — registro provider-agnostic de meetings (preparado para Meet)
--   4. google_workspace_config   — singleton (vacío en este slice)
--
-- Plus:
--   - Helper RLS is_family_of_child(child_id) para portal padres
--   - RLS policies completas (agency / therapist / family)
--   - Realtime habilitado en appointments
-- =============================================================================


-- ── 0. Helper RLS: is_family_of_child ───────────────────────────────────────
-- Análogo a is_family_member pero recibe child_id y resuelve via children.family_id.

create or replace function public.is_family_of_child(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.children c
    join public.family_users fu on fu.family_id = c.family_id
    where c.id = target_child_id
      and fu.user_id = auth.uid()
  );
$$;


-- ── 1. appointments ─────────────────────────────────────────────────────────
create table if not exists public.appointments (
  id                          uuid primary key default gen_random_uuid(),
  child_id                    uuid not null references public.children(id) on delete cascade,
  therapist_id                uuid references public.users(id) on delete set null,
  event_type                  text not null check (event_type in (
    'terapia',
    'entrevista_directora',
    'reunion_padres',
    'reunion_colegio',
    'evaluacion',
    'programa_matutino'
  )),
  service_type                text check (service_type in (
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
    'otra'
  )),
  modality                    text not null default 'presencial' check (modality in ('presencial','virtual')),
  starts_at                   timestamptz not null,
  ends_at                     timestamptz not null,
  status                      text not null default 'scheduled' check (status in (
    'scheduled',
    'in_progress',
    'completed',
    'no_show',
    'late_cancel',
    'rescheduled',
    'replacement'
  )),
  parent_appointment_id       uuid references public.appointments(id) on delete set null,
  recurrence_rule             text,                                  -- rrule, placeholder Fase 4
  google_calendar_event_id    text,                                  -- placeholder Fase 2 next
  meet_link                   text,
  notification_sent_24h       boolean not null default false,
  notification_sent_1h        boolean not null default false,
  notes                       text,
  created_by_user_id          uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- Constraint: ends_at > starts_at y duración mínima 15 min
  constraint appointments_duration_check check (ends_at >= starts_at + interval '15 minutes'),
  -- Constraint: terapia requiere service_type y therapist_id
  constraint appointments_terapia_requires_service_and_therapist check (
    event_type <> 'terapia'
    or (service_type is not null and therapist_id is not null)
  )
);

create index if not exists appointments_therapist_starts_idx on public.appointments(therapist_id, starts_at);
create index if not exists appointments_child_starts_idx on public.appointments(child_id, starts_at);
create index if not exists appointments_starts_idx on public.appointments(starts_at desc);
create index if not exists appointments_active_idx on public.appointments(status) where status not in ('completed','rescheduled');
create index if not exists appointments_parent_idx on public.appointments(parent_appointment_id) where parent_appointment_id is not null;


-- ── 2. institutional_calendar ───────────────────────────────────────────────
create table if not exists public.institutional_calendar (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  type            text not null check (type in ('holiday','closure','gov_decree','kinetic_break')),
  name            text not null,
  description     text,
  all_day         boolean not null default true,
  year_recurring  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists institutional_calendar_date_idx on public.institutional_calendar(date);


-- ── 3. virtual_meetings ─────────────────────────────────────────────────────
create table if not exists public.virtual_meetings (
  id                  uuid primary key default gen_random_uuid(),
  appointment_id      uuid references public.appointments(id) on delete cascade,
  context             text not null check (context in (
    'therapy','directora_interview','parents_meeting','school_meeting','evaluation'
  )),
  provider            text not null default 'google_meet',
  external_event_id   text,
  join_url            text,
  scheduled_for       timestamptz not null,
  ends_at             timestamptz,
  status              text not null default 'scheduled' check (status in ('scheduled','started','ended','cancelled')),
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists virtual_meetings_appointment_idx on public.virtual_meetings(appointment_id) where appointment_id is not null;


-- ── 4. google_workspace_config (singleton) ──────────────────────────────────
create table if not exists public.google_workspace_config (
  id                          uuid primary key default gen_random_uuid(),
  service_account_email       text,
  calendar_id_master          text,
  dwd_active                  boolean not null default false,
  default_owner_email         text,
  configured_at               timestamptz,
  updated_at                  timestamptz not null default now()
);


-- ── 5. Triggers de updated_at ───────────────────────────────────────────────
drop trigger if exists trg_appointments_touch on public.appointments;
create trigger trg_appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_institutional_calendar_touch on public.institutional_calendar;
create trigger trg_institutional_calendar_touch before update on public.institutional_calendar
  for each row execute function public.touch_updated_at();


-- ── 6. RLS — appointments ───────────────────────────────────────────────────
alter table public.appointments enable row level security;

create policy "appointments_select_agency"
  on public.appointments for select
  using (public.is_agency_user());

create policy "appointments_select_therapist"
  on public.appointments for select
  using (therapist_id = auth.uid());

create policy "appointments_select_family"
  on public.appointments for select
  using (public.is_family_of_child(child_id));

create policy "appointments_insert_staff"
  on public.appointments for insert
  with check (
    public.is_agency_user()
    and (
      (select role from public.users where id = auth.uid()) in
      ('admin','supervisor','directora','coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

create policy "appointments_update_staff"
  on public.appointments for update
  using (
    public.is_agency_user()
    and (
      (select role from public.users where id = auth.uid()) in
      ('admin','supervisor','directora','coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

create policy "appointments_update_therapist"
  on public.appointments for update
  using (therapist_id = auth.uid());

create policy "appointments_delete_admin"
  on public.appointments for delete
  using (public.is_admin());


-- ── 7. RLS — institutional_calendar ─────────────────────────────────────────
alter table public.institutional_calendar enable row level security;

create policy "inst_cal_select_all_authed"
  on public.institutional_calendar for select
  using (auth.uid() is not null);

create policy "inst_cal_insert_admin"
  on public.institutional_calendar for insert
  with check (
    public.is_admin()
    or (select role from public.users where id = auth.uid()) = 'directora'
  );

create policy "inst_cal_update_admin"
  on public.institutional_calendar for update
  using (
    public.is_admin()
    or (select role from public.users where id = auth.uid()) = 'directora'
  );

create policy "inst_cal_delete_admin"
  on public.institutional_calendar for delete
  using (public.is_admin());


-- ── 8. RLS — virtual_meetings ──────────────────────────────────────────────
alter table public.virtual_meetings enable row level security;

create policy "virtual_meetings_select_agency"
  on public.virtual_meetings for select
  using (public.is_agency_user());

create policy "virtual_meetings_select_appointment_visible"
  on public.virtual_meetings for select
  using (
    appointment_id is not null
    and exists (
      select 1 from public.appointments a
      where a.id = virtual_meetings.appointment_id
        and (a.therapist_id = auth.uid() or public.is_family_of_child(a.child_id))
    )
  );

create policy "virtual_meetings_insert_staff"
  on public.virtual_meetings for insert
  with check (public.is_agency_user());

create policy "virtual_meetings_update_staff"
  on public.virtual_meetings for update
  using (public.is_agency_user());

create policy "virtual_meetings_delete_admin"
  on public.virtual_meetings for delete
  using (public.is_admin());


-- ── 9. RLS — google_workspace_config (admin-only) ──────────────────────────
alter table public.google_workspace_config enable row level security;

create policy "gw_config_select_admin"
  on public.google_workspace_config for select
  using (public.is_admin());

create policy "gw_config_insert_admin"
  on public.google_workspace_config for insert
  with check (public.is_admin());

create policy "gw_config_update_admin"
  on public.google_workspace_config for update
  using (public.is_admin());


-- ── 10. Grants ──────────────────────────────────────────────────────────────
grant all on public.appointments              to anon, authenticated, service_role;
grant all on public.institutional_calendar    to anon, authenticated, service_role;
grant all on public.virtual_meetings          to anon, authenticated, service_role;
grant all on public.google_workspace_config   to anon, authenticated, service_role;


-- ── 11. Realtime — appointments (para vista live de la agenda) ──────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'appointments') then
      execute 'alter publication supabase_realtime add table public.appointments';
    end if;
  end if;
end $$;


-- ── Fin de migración 0092_kinetic_appointments ─────────────────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0093_kinetic_sessions_and_journal.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0093 — therapy_sessions + child_journal_entries
-- =============================================================================

-- ── 1. therapy_sessions ──────────────────────────────────────────────────────

create table if not exists public.therapy_sessions (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  therapist_id   uuid not null references public.users(id) on delete set null,
  child_id       uuid not null references public.children(id) on delete cascade,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  status         text not null default 'active'
                   check (status in ('active', 'completed')),
  created_at     timestamptz not null default now()
);

create index if not exists therapy_sessions_therapist_started
  on public.therapy_sessions (therapist_id, started_at desc);
create index if not exists therapy_sessions_appointment
  on public.therapy_sessions (appointment_id);

-- Trigger: protect immutable fields (appointment_id, child_id)
create or replace function public.trg_therapy_sessions_immutable_fields()
returns trigger language plpgsql as $$
begin
  if new.appointment_id is distinct from old.appointment_id
     or new.child_id is distinct from old.child_id then
    raise exception 'appointment_id y child_id son inmutables en therapy_sessions';
  end if;
  return new;
end;
$$;

drop trigger if exists therapy_sessions_immutable on public.therapy_sessions;
create trigger therapy_sessions_immutable
  before update on public.therapy_sessions
  for each row execute function public.trg_therapy_sessions_immutable_fields();

-- ── 2. child_journal_entries ─────────────────────────────────────────────────

create table if not exists public.child_journal_entries (
  id                    uuid primary key default gen_random_uuid(),
  child_id              uuid not null references public.children(id) on delete cascade,
  author_user_id        uuid references public.users(id) on delete set null,
  category              text not null
                          check (category in ('home_exercise','observation','question','response')),
  body                  text not null,
  attachments_json      jsonb not null default '[]',
  visible_to_family     boolean not null default false,
  linked_appointment_id uuid references public.appointments(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists child_journal_entries_child_created
  on public.child_journal_entries (child_id, created_at desc);
create index if not exists child_journal_entries_author
  on public.child_journal_entries (author_user_id);

-- updated_at trigger via moddatetime extension
create extension if not exists moddatetime schema extensions;

drop trigger if exists child_journal_entries_updated_at on public.child_journal_entries;
create trigger child_journal_entries_updated_at
  before update on public.child_journal_entries
  for each row execute function extensions.moddatetime(updated_at);

-- ── 3. PL/pgSQL: start_therapy_session ───────────────────────────────────────
-- Atomic: INSERT session + UPDATE appointment.status in one transaction.
-- Uses FOR UPDATE lock to prevent concurrent starts for the same appointment.

create or replace function public.start_therapy_session(
  p_appointment_id uuid,
  p_therapist_id   uuid
) returns public.therapy_sessions language plpgsql security definer as $$
declare
  v_appt    public.appointments;
  v_session public.therapy_sessions;
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
     and therapist_id = p_therapist_id
     and status = 'scheduled'
   for update;

  if not found then
    raise exception 'appointment_not_found_or_not_eligible';
  end if;

  insert into public.therapy_sessions (appointment_id, therapist_id, child_id)
    values (p_appointment_id, p_therapist_id, v_appt.child_id)
    returning * into v_session;

  update public.appointments
     set status = 'in_progress'
   where id = p_appointment_id;

  return v_session;
end;
$$;

-- ── 4. PL/pgSQL: finish_therapy_session ──────────────────────────────────────

create or replace function public.finish_therapy_session(
  p_session_id   uuid,
  p_therapist_id uuid
) returns public.therapy_sessions language plpgsql security definer as $$
declare
  v_session public.therapy_sessions;
begin
  select * into v_session
    from public.therapy_sessions
   where id = p_session_id
   for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  if v_session.therapist_id is distinct from p_therapist_id then
    raise exception 'not_authorized';
  end if;

  -- Idempotent: already completed → return current state
  if v_session.status = 'completed' then
    return v_session;
  end if;

  update public.therapy_sessions
     set ended_at = now(),
         status   = 'completed'
   where id = p_session_id
   returning * into v_session;

  update public.appointments
     set status = 'completed'
   where id = v_session.appointment_id;

  return v_session;
end;
$$;

-- ── 5. RLS: therapy_sessions ─────────────────────────────────────────────────

alter table public.therapy_sessions enable row level security;

drop policy if exists "ts select staff or own" on public.therapy_sessions;
create policy "ts select staff or own"
  on public.therapy_sessions for select
  using (public.is_agency_user() or therapist_id = auth.uid());

drop policy if exists "ts insert own or admin" on public.therapy_sessions;
create policy "ts insert own or admin"
  on public.therapy_sessions for insert
  with check (therapist_id = auth.uid() or public.is_admin());

drop policy if exists "ts update own" on public.therapy_sessions;
create policy "ts update own"
  on public.therapy_sessions for update
  using  (therapist_id = auth.uid())
  with check (therapist_id = auth.uid());

drop policy if exists "ts update admin" on public.therapy_sessions;
create policy "ts update admin"
  on public.therapy_sessions for update
  using  (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ts delete admin" on public.therapy_sessions;
create policy "ts delete admin"
  on public.therapy_sessions for delete
  using (public.is_admin());

-- ── 6. RLS: child_journal_entries ────────────────────────────────────────────

alter table public.child_journal_entries enable row level security;

drop policy if exists "cje select staff" on public.child_journal_entries;
create policy "cje select staff"
  on public.child_journal_entries for select
  using (public.is_agency_user());

drop policy if exists "cje select family" on public.child_journal_entries;
create policy "cje select family"
  on public.child_journal_entries for select
  using (visible_to_family = true and public.is_family_of_child(child_id));

drop policy if exists "cje insert staff" on public.child_journal_entries;
create policy "cje insert staff"
  on public.child_journal_entries for insert
  with check (public.is_agency_user() and author_user_id = auth.uid());

drop policy if exists "cje insert family" on public.child_journal_entries;
create policy "cje insert family"
  on public.child_journal_entries for insert
  with check (
    public.is_family_of_child(child_id)
    and category = 'response'
    and visible_to_family = true
    and author_user_id = auth.uid()
  );

drop policy if exists "cje update staff author or admin" on public.child_journal_entries;
create policy "cje update staff author or admin"
  on public.child_journal_entries for update
  using  (public.is_agency_user() and (author_user_id = auth.uid() or public.is_admin()))
  with check (public.is_agency_user() and (author_user_id = auth.uid() or public.is_admin()));

drop policy if exists "cje delete admin" on public.child_journal_entries;
create policy "cje delete admin"
  on public.child_journal_entries for delete
  using (public.is_admin());

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

grant all on public.therapy_sessions to anon, authenticated, service_role;
grant all on public.child_journal_entries to anon, authenticated, service_role;

-- ── 8. Realtime ───────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'therapy_sessions'
    ) then
      execute 'alter publication supabase_realtime add table public.therapy_sessions';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'child_journal_entries'
    ) then
      execute 'alter publication supabase_realtime add table public.child_journal_entries';
    end if;
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0094_kinetic_session_reports.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0094 — session_reports (Fase 3-B)
-- Reporte por sesión con flujo de aprobación: terapista → directora → familia.
-- =============================================================================

-- ── 1. Helper: is_directora_or_admin ─────────────────────────────────────────

create or replace function public.is_directora_or_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('directora','admin')
  );
$$;

-- ── 2. session_reports table ─────────────────────────────────────────────────

create table if not exists public.session_reports (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null unique references public.therapy_sessions(id) on delete cascade,
  appointment_id           uuid not null references public.appointments(id) on delete cascade,
  child_id                 uuid not null references public.children(id) on delete cascade,
  therapist_id             uuid references public.users(id) on delete set null,
  actividades              text not null default '',
  respuesta_del_nino       text not null default '',
  tarea_para_casa          text not null default '',
  observaciones_internas   text not null default '',
  visible_to_family        boolean not null default true,
  status                   text not null default 'draft'
                             check (status in ('draft','submitted','approved','rejected','sent_to_family')),
  submitted_at             timestamptz,
  approved_by_user_id      uuid references public.users(id) on delete set null,
  approved_at              timestamptz,
  rejected_by_user_id      uuid references public.users(id) on delete set null,
  rejected_at              timestamptz,
  rejection_reason         text,
  sent_to_family_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists session_reports_status_submitted
  on public.session_reports (status, submitted_at desc)
  where status = 'submitted';
create index if not exists session_reports_child_sent
  on public.session_reports (child_id, sent_to_family_at desc)
  where status = 'sent_to_family';
create index if not exists session_reports_therapist
  on public.session_reports (therapist_id);

-- updated_at trigger (moddatetime ya está habilitada en 0093)
drop trigger if exists session_reports_updated_at on public.session_reports;
create trigger session_reports_updated_at
  before update on public.session_reports
  for each row execute function extensions.moddatetime(updated_at);

-- ── 3. RPC: submit_session_report ────────────────────────────────────────────
-- Terapista marca el borrador como listo para revisión.

create or replace function public.submit_session_report(
  p_report_id uuid
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.therapist_id is distinct from auth.uid() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  -- Validación mínima: al menos actividades llenas.
  if length(trim(v_report.actividades)) = 0 then
    raise exception 'actividades_required';
  end if;

  update public.session_reports
     set status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;

-- ── 4. RPC: approve_session_report ───────────────────────────────────────────
-- Directora/admin aprueba. Si visible_to_family, además marca sent_to_family.

create or replace function public.approve_session_report(
  p_report_id uuid
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Idempotente: si ya está aprobado, devuelve estado actual.
  if v_report.status in ('approved','sent_to_family') then
    return v_report;
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_approve';
  end if;

  if v_report.visible_to_family then
    update public.session_reports
       set status = 'sent_to_family',
           approved_by_user_id = auth.uid(),
           approved_at = now(),
           sent_to_family_at = now()
     where id = p_report_id
     returning * into v_report;
  else
    update public.session_reports
       set status = 'approved',
           approved_by_user_id = auth.uid(),
           approved_at = now()
     where id = p_report_id
     returning * into v_report;
  end if;

  return v_report;
end;
$$;

-- ── 5. RPC: reject_session_report ────────────────────────────────────────────
-- Directora/admin rechaza con motivo.

create or replace function public.reject_session_report(
  p_report_id uuid,
  p_reason    text
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'reason_too_short';
  end if;

  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_reject';
  end if;

  update public.session_reports
     set status = 'rejected',
         rejected_by_user_id = auth.uid(),
         rejected_at = now(),
         rejection_reason = trim(p_reason)
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;

-- ── 6. RLS: session_reports ──────────────────────────────────────────────────

alter table public.session_reports enable row level security;

-- SELECT: staff completo, terapista autor, o familia (solo aprobados+visibles)
drop policy if exists "sr select staff or own or family" on public.session_reports;
create policy "sr select staff or own or family"
  on public.session_reports for select
  using (
    public.is_agency_user()
    or therapist_id = auth.uid()
    or (
      status = 'sent_to_family'
      and visible_to_family = true
      and public.is_family_of_child(child_id)
    )
  );

-- INSERT: el terapista de la sesión, o admin
drop policy if exists "sr insert own or admin" on public.session_reports;
create policy "sr insert own or admin"
  on public.session_reports for insert
  with check (therapist_id = auth.uid() or public.is_admin());

-- UPDATE (terapista): solo edición de contenido en estados draft/rejected.
-- Las transiciones de aprobación/rechazo van por RPC, no por UPDATE directo.
drop policy if exists "sr update own draft" on public.session_reports;
create policy "sr update own draft"
  on public.session_reports for update
  using  (therapist_id = auth.uid() and status in ('draft','rejected'))
  with check (therapist_id = auth.uid() and status in ('draft','rejected','submitted'));
  -- with check permite la transición a submitted que hace el RPC.

-- UPDATE (admin override total)
drop policy if exists "sr update admin" on public.session_reports;
create policy "sr update admin"
  on public.session_reports for update
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE: solo admin
drop policy if exists "sr delete admin" on public.session_reports;
create policy "sr delete admin"
  on public.session_reports for delete
  using (public.is_admin());

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

grant all on public.session_reports to anon, authenticated, service_role;

-- ── 8. Realtime ───────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'session_reports'
    ) then
      execute 'alter publication supabase_realtime add table public.session_reports';
    end if;
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0095_kinetic_session_reports_impersonation.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0095 — Permitir impersonación en submit_session_report
-- Fix: el RPC original chequea auth.uid() == therapist_id, lo que falla cuando
-- un admin está impersonando a la terapista. Cambio a un check que también
-- acepta is_admin() — el admin real puede actuar en nombre de la terapista
-- impersonada (mismo patrón que el resto de las acciones bajo impersonación).
-- =============================================================================

create or replace function public.submit_session_report(
  p_report_id uuid
) returns public.session_reports language plpgsql security definer as $$
declare
  v_report public.session_reports;
begin
  select * into v_report
    from public.session_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Autoriza al terapista autor o, durante impersonación, al admin real.
  if v_report.therapist_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  if length(trim(v_report.actividades)) = 0 then
    raise exception 'actividades_required';
  end if;

  update public.session_reports
     set status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0096_kinetic_journal_impersonation.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0096 — Permitir impersonación al insertar entradas en child_journal_entries
-- Fix: la policy "cje insert staff" exigía author_user_id = auth.uid(), lo que
-- bloquea cuando el admin impersona a una terapista. Acepta también is_admin().
-- =============================================================================

drop policy if exists "cje insert staff" on public.child_journal_entries;
create policy "cje insert staff"
  on public.child_journal_entries for insert
  with check (
    public.is_agency_user()
    and (author_user_id = auth.uid() or public.is_admin())
  );


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0097_kinetic_progress_reports.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0097 — progress_reports (Fase 3-C1)
-- Informe de avances cuatrimestral. Uno por (niño, tipo de terapia, período).
-- Mismo flujo de aprobación que session_reports: terapista → directora → familia.
-- =============================================================================

-- ── 1. progress_reports table ────────────────────────────────────────────────

create table if not exists public.progress_reports (
  id                       uuid primary key default gen_random_uuid(),
  child_id                 uuid not null references public.children(id) on delete cascade,
  service_type             text not null,
    -- Espejado de appointments.service_type / plan_services.service_type:
    -- 'lenguaje' | 'motricidad_gruesa' | 'motricidad_fina' | 'sensorial' |
    -- 'psicologica' | 'ocupacional' | 'fisica' | 'lectoescritura' |
    -- 'funciones_ejecutivas' | 'conductual'
  period_starts            date not null,
  period_ends              date not null,
  authored_by_user_id      uuid references public.users(id) on delete set null,
  sessions_attended_count  int not null default 0,
  data_json                jsonb not null default '{}',
    -- Estructura del template hardcoded v0.7 (Fase 3-C1):
    -- {
    --   seguimiento: text,
    --   dificultades_ingreso: text,
    --   objetivos_terapeuticos: text,
    --   actividades_ejercicios: text,
    --   logros_obtenidos: text,
    --   orientaciones_casa: text,
    --   recomendaciones: text
    -- }
  status                   text not null default 'draft'
                             check (status in ('draft','submitted','approved','rejected','sent_to_family')),
  visible_to_family        boolean not null default true,
  submitted_at             timestamptz,
  approved_by_user_id      uuid references public.users(id) on delete set null,
  approved_at              timestamptz,
  rejected_by_user_id      uuid references public.users(id) on delete set null,
  rejected_at              timestamptz,
  rejection_reason         text,
  sent_to_family_at        timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Solo un informe por niño + servicio + fecha de inicio de período.
  unique (child_id, service_type, period_starts)
);

create index if not exists progress_reports_status_submitted
  on public.progress_reports (status, submitted_at desc)
  where status = 'submitted';
create index if not exists progress_reports_child_period
  on public.progress_reports (child_id, period_ends desc);
create index if not exists progress_reports_author
  on public.progress_reports (authored_by_user_id);

-- updated_at trigger
drop trigger if exists progress_reports_updated_at on public.progress_reports;
create trigger progress_reports_updated_at
  before update on public.progress_reports
  for each row execute function extensions.moddatetime(updated_at);

-- ── 2. RPC: submit_progress_report ───────────────────────────────────────────

create or replace function public.submit_progress_report(
  p_report_id uuid
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Autoriza al autor o, durante impersonación, al admin real.
  if v_report.authored_by_user_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  -- Valida contenido mínimo: seguimiento + logros llenos.
  if length(trim(coalesce(v_report.data_json->>'seguimiento', ''))) = 0 then
    raise exception 'seguimiento_required';
  end if;
  if length(trim(coalesce(v_report.data_json->>'logros_obtenidos', ''))) = 0 then
    raise exception 'logros_required';
  end if;

  update public.progress_reports
     set status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;

-- ── 3. RPC: approve_progress_report ──────────────────────────────────────────

create or replace function public.approve_progress_report(
  p_report_id uuid
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.status in ('approved','sent_to_family') then
    return v_report;
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_approve';
  end if;

  if v_report.visible_to_family then
    update public.progress_reports
       set status = 'sent_to_family',
           approved_by_user_id = auth.uid(),
           approved_at = now(),
           sent_to_family_at = now()
     where id = p_report_id
     returning * into v_report;
  else
    update public.progress_reports
       set status = 'approved',
           approved_by_user_id = auth.uid(),
           approved_at = now()
     where id = p_report_id
     returning * into v_report;
  end if;

  return v_report;
end;
$$;

-- ── 4. RPC: reject_progress_report ───────────────────────────────────────────

create or replace function public.reject_progress_report(
  p_report_id uuid,
  p_reason    text
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  if not public.is_directora_or_admin() then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'reason_too_short';
  end if;

  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  if v_report.status <> 'submitted' then
    raise exception 'invalid_state_for_reject';
  end if;

  update public.progress_reports
     set status = 'rejected',
         rejected_by_user_id = auth.uid(),
         rejected_at = now(),
         rejection_reason = trim(p_reason)
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

alter table public.progress_reports enable row level security;

-- SELECT: staff completo, autor, o familia (solo aprobados+visibles)
drop policy if exists "pr select staff or own or family" on public.progress_reports;
create policy "pr select staff or own or family"
  on public.progress_reports for select
  using (
    public.is_agency_user()
    or authored_by_user_id = auth.uid()
    or (
      status = 'sent_to_family'
      and visible_to_family = true
      and public.is_family_of_child(child_id)
    )
  );

-- INSERT: staff agencia (la directora puede crear en nombre de otros, terapista crea las suyas)
drop policy if exists "pr insert staff" on public.progress_reports;
create policy "pr insert staff"
  on public.progress_reports for insert
  with check (
    public.is_agency_user()
    and (authored_by_user_id = auth.uid() or public.is_admin())
  );

-- UPDATE (autor): solo edita en draft/rejected.
drop policy if exists "pr update own draft" on public.progress_reports;
create policy "pr update own draft"
  on public.progress_reports for update
  using  (authored_by_user_id = auth.uid() and status in ('draft','rejected'))
  with check (authored_by_user_id = auth.uid() and status in ('draft','rejected','submitted'));

-- UPDATE (admin override)
drop policy if exists "pr update admin" on public.progress_reports;
create policy "pr update admin"
  on public.progress_reports for update
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE: solo admin
drop policy if exists "pr delete admin" on public.progress_reports;
create policy "pr delete admin"
  on public.progress_reports for delete
  using (public.is_admin());

-- ── 6. Grants ────────────────────────────────────────────────────────────────

grant all on public.progress_reports to anon, authenticated, service_role;

-- ── 7. Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'progress_reports'
    ) then
      execute 'alter publication supabase_realtime add table public.progress_reports';
    end if;
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0098_kinetic_report_templates.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0098 — report_templates (Fase 3-C2)
-- Plantillas DB-driven para informes de avances. Reemplaza la plantilla
-- hardcoded de C1 (src/lib/domain/progress-report-template.ts).
--
-- Decisiones (ver docs/superpowers/specs/2026-05-08-c2-plantillas-design.md):
--   - Versionado in-place: ediciones sobrescriben (la columna `version` queda
--     por si después se quiere usar, pero no se bumpea automáticamente).
--   - Block kinds soportados desde el día 1: rich_text + numbered_list.
--   - service_type opcional (NULL = aplica a cualquier terapia).
--   - CRUD restringido a admin/directora; SELECT abierto a todo el staff.
--   - Validación de submit pasa de hardcoded ('seguimiento'+'logros_obtenidos')
--     a leer `blocks_json` y exigir cada `required=true`.
-- =============================================================================


-- ── 1. report_templates table ────────────────────────────────────────────────

create table if not exists public.report_templates (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  kind                  text not null
                          check (kind in ('progress','session','evaluation','morning_program_quarterly')),
  service_type          text,                            -- NULL = aplica a cualquier terapia
  blocks_json           jsonb not null,                  -- ver schema en src/types/db.ts (ReportTemplateBlock)
  default_signers_role  text,
  active                boolean not null default true,
  version               int not null default 1,          -- placeholder; no se auto-bumpea
  created_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists report_templates_kind_service
  on public.report_templates(kind, service_type) where active;
create index if not exists report_templates_active
  on public.report_templates(active);

-- updated_at trigger (moddatetime ya está habilitada en 0093)
drop trigger if exists report_templates_updated_at on public.report_templates;
create trigger report_templates_updated_at
  before update on public.report_templates
  for each row execute function extensions.moddatetime(updated_at);


-- ── 2. progress_reports.template_id ─────────────────────────────────────────
-- FK al template usado. Nullable de entrada (reportes legacy pre-C2).
-- El UPDATE bulk del Stage 6 los apunta al seed "Genérica".

alter table public.progress_reports
  add column if not exists template_id uuid references public.report_templates(id) on delete restrict;

create index if not exists progress_reports_template_id
  on public.progress_reports(template_id);


-- ── 3. Helper: validate_progress_report_against_template ────────────────────
-- Recorre blocks_json y exige que cada bloque required=true esté lleno
-- en data_json (según el block.kind).

create or replace function public.validate_progress_report_against_template(
  p_report_id uuid
) returns void language plpgsql security definer as $$
declare
  v_report   public.progress_reports;
  v_template public.report_templates;
  v_block    jsonb;
  v_key      text;
  v_kind     text;
  v_value    jsonb;
  v_text     text;
  v_arr_len  int;
begin
  select * into v_report from public.progress_reports where id = p_report_id;
  if not found then raise exception 'report_not_found'; end if;

  -- Si el reporte no tiene template_id (legacy), validar como antes.
  if v_report.template_id is null then
    if length(trim(coalesce(v_report.data_json->>'seguimiento', ''))) = 0 then
      raise exception 'seguimiento_required';
    end if;
    if length(trim(coalesce(v_report.data_json->>'logros_obtenidos', ''))) = 0 then
      raise exception 'logros_required';
    end if;
    return;
  end if;

  select * into v_template from public.report_templates where id = v_report.template_id;
  if not found then raise exception 'template_not_found'; end if;

  for v_block in select * from jsonb_array_elements(v_template.blocks_json)
  loop
    if coalesce((v_block->>'required')::boolean, false) then
      v_key  := v_block->>'key';
      v_kind := v_block->>'kind';
      v_value := v_report.data_json->v_key;

      if v_value is null or v_value = 'null'::jsonb then
        raise exception 'required_block_empty: %', v_key;
      end if;

      if v_kind = 'rich_text' then
        v_text := v_value #>> '{}';
        if v_text is null or length(trim(v_text)) = 0 then
          raise exception 'required_block_empty: %', v_key;
        end if;
      elsif v_kind = 'numbered_list' then
        if jsonb_typeof(v_value) <> 'array' then
          raise exception 'required_block_invalid: %', v_key;
        end if;
        select count(*) into v_arr_len
          from jsonb_array_elements_text(v_value) as item
         where length(trim(item)) > 0;
        if v_arr_len = 0 then
          raise exception 'required_block_empty: %', v_key;
        end if;
      else
        -- recommendations_by_area, categorized_text → tratar como object con
        -- al menos una key con texto no vacío.
        if jsonb_typeof(v_value) <> 'object' then
          raise exception 'required_block_invalid: %', v_key;
        end if;
        select count(*) into v_arr_len
          from jsonb_each_text(v_value) as e
         where length(trim(e.value)) > 0;
        if v_arr_len = 0 then
          raise exception 'required_block_empty: %', v_key;
        end if;
      end if;
    end if;
  end loop;
end;
$$;


-- ── 4. Re-emitir submit_progress_report con validación template-aware ──────

create or replace function public.submit_progress_report(
  p_report_id uuid
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Autoriza al autor o, durante impersonación, al admin real.
  if v_report.authored_by_user_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  -- Validación contra template (o legacy si template_id es null).
  perform public.validate_progress_report_against_template(p_report_id);

  update public.progress_reports
     set status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;


-- ── 5. RLS — report_templates ──────────────────────────────────────────────

alter table public.report_templates enable row level security;

drop policy if exists "rt select all staff" on public.report_templates;
create policy "rt select all staff"
  on public.report_templates for select
  using (public.is_agency_user());

drop policy if exists "rt insert directora admin" on public.report_templates;
create policy "rt insert directora admin"
  on public.report_templates for insert
  with check (public.is_directora_or_admin());

drop policy if exists "rt update directora admin" on public.report_templates;
create policy "rt update directora admin"
  on public.report_templates for update
  using  (public.is_directora_or_admin())
  with check (public.is_directora_or_admin());

drop policy if exists "rt delete admin" on public.report_templates;
create policy "rt delete admin"
  on public.report_templates for delete
  using (public.is_admin());


-- ── 6. Grants ────────────────────────────────────────────────────────────────

grant all on public.report_templates to anon, authenticated, service_role;


-- ── 7. Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'report_templates'
    ) then
      execute 'alter publication supabase_realtime add table public.report_templates';
    end if;
  end if;
end $$;


-- ── 8. Seed inicial: plantilla "Genérica de avances" ───────────────────────
-- Idempotente vía nombre único. Refleja los 7 bloques de
-- src/lib/domain/progress-report-template.ts (Fase 3-C1).

insert into public.report_templates (name, kind, service_type, blocks_json, active, version)
select
  'Informe de avances — Genérica',
  'progress',
  null,
  jsonb_build_array(
    jsonb_build_object(
      'key', 'seguimiento',
      'label', 'Seguimiento',
      'description', 'Resumen del proceso del niño/a durante el período. Contexto familiar y escolar relevante.',
      'required', true,
      'kind', 'rich_text',
      'placeholder', 'Durante este cuatrimestre se trabajó con… El niño/a asistió a X sesiones. Contexto familiar: …'
    ),
    jsonb_build_object(
      'key', 'dificultades_ingreso',
      'label', 'Dificultades al ingreso',
      'description', 'Áreas donde se identificaron dificultades al inicio del período.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'Al ingresar al período se observó dificultad en…\n• Área motora: …\n• Área cognitiva: …'
    ),
    jsonb_build_object(
      'key', 'objetivos_terapeuticos',
      'label', 'Objetivos terapéuticos',
      'description', 'Metas planteadas para el período.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'1. Fortalecer…\n2. Mejorar la…\n3. Desarrollar…'
    ),
    jsonb_build_object(
      'key', 'actividades_ejercicios',
      'label', 'Actividades y ejercicios realizados',
      'description', 'Tipos de actividades que se trabajaron en sesión.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'Se trabajaron actividades de…\n• Coordinación: …\n• Lenguaje expresivo: …'
    ),
    jsonb_build_object(
      'key', 'logros_obtenidos',
      'label', 'Logros obtenidos',
      'description', 'Avances concretos observados durante el período.',
      'required', true,
      'kind', 'rich_text',
      'placeholder', E'El niño/a logró…\n\n• Avance #1: …\n• Avance #2: …'
    ),
    jsonb_build_object(
      'key', 'orientaciones_casa',
      'label', 'Orientaciones para casa',
      'description', 'Recomendaciones específicas para la familia, ejercicios o rutinas a reforzar fuera de sesión.',
      'required', false,
      'kind', 'rich_text',
      'placeholder', E'Se sugiere a la familia:\n• Reforzar diariamente…\n• Establecer rutina de…'
    ),
    jsonb_build_object(
      'key', 'recomendaciones',
      'label', 'Recomendaciones',
      'description', 'Recomendaciones generales (académicas, conductuales, derivaciones, próximos pasos).',
      'required', true,
      'kind', 'rich_text',
      'placeholder', E'Se recomienda…\n• Continuar el proceso terapéutico\n• Coordinar con el colegio para…'
    )
  ),
  true,
  1
where not exists (
  select 1 from public.report_templates
  where name = 'Informe de avances — Genérica' and kind = 'progress' and service_type is null
);


-- ── 9. Backfill: apuntar progress_reports legacy al seed Genérica ──────────

update public.progress_reports
   set template_id = (
     select id from public.report_templates
     where kind = 'progress' and service_type is null
       and name = 'Informe de avances — Genérica'
     limit 1
   )
 where template_id is null;


-- ── Fin de migración 0098_kinetic_report_templates ────────────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0099_kinetic_extend_is_agency_user.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0099 — Extender is_agency_user() para reconocer roles Kinetic
-- =============================================================================
-- Bug detectado en producción: cuando un terapista, maestra, directora,
-- coordinadora_*, recepcion o contable se logueaba DIRECTAMENTE (no
-- impersonado), el RLS de tablas como `children`, `progress_reports`,
-- `report_templates`, etc. lo trataba como "no staff" porque la función
-- helper is_agency_user() solo aceptaba 'admin','supervisor','operator'
-- (roles FM legacy), heredado de migración 0002_to_0079_merged.
--
-- Fix: agregar los roles Kinetic a la lista. Excluye explícitamente
-- 'client' y 'family' (esos son portal-only).
--
-- Síntomas que cura:
--   - Banner de informes pendientes en /mi-dia salía vacío al logueo directo
--     pero funcionaba al impersonar.
--   - Las terapistas no podían leer niños ni plantillas (afectaba editor de
--     informes, /admin/plantillas si entraran como directora-no-impersonada,
--     etc.).
-- =============================================================================

create or replace function public.is_agency_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in (
        -- FM legacy
        'admin',
        'supervisor',
        'operator',
        -- Kinetic
        'directora',
        'coordinadora_familias',
        'coordinadora_terapias',
        'terapista',
        'maestra',
        'recepcion',
        'contable'
      )
  );
$$;

-- ── Fin de migración 0099_kinetic_extend_is_agency_user ──────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0100_kinetic_treatment_plans_and_absences.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0100 — Treatment plans + audit log + appointment absences (Ronda 1)
-- =============================================================================
-- Captura digital de la "Ficha de acuerdo final" del Excel:
--   * Qué terapias recibe el niño (chechbox del formato)
--   * Patrón de horario semanal recurrente (grilla días × horas)
--   * Costos por terapia (cantidad/mes + costo unitario)
--
-- Plus: workflow de inasistencias — la terapista marca "Inasistencia" desde
-- /mi-dia, queda una solicitud en `appointment_absences` que la directora
-- procesa en /aprobaciones (reagenda a nuevo slot O hace waive con motivo).
--
-- Decisiones cerradas (ver plan):
--   - Versionado in-place + audit log (no snapshot por versión)
--   - Auto-agendamiento mensual NO está acá (Ronda 2)
--   - Service types extendidos con 3 nuevos para alinear con el Excel
-- =============================================================================


-- ── 1. Extender service_type del Excel ──────────────────────────────────────
-- El checkbox del Excel incluye 3 servicios que no estaban en el enum de
-- Fase 2 (mig 0092): BlueKids, Alimentación y deglución, Destreza manual y
-- pre-escritura. Los demás (THL=lenguaje, T.Ocupacional=ocupacional, etc.)
-- ya existían.

alter table public.appointments
  drop constraint if exists appointments_service_type_check;

alter table public.appointments
  add constraint appointments_service_type_check check (service_type in (
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
    'otra'
  ));


-- ── 2. treatment_plans ──────────────────────────────────────────────────────

create table if not exists public.treatment_plans (
  id                       uuid primary key default gen_random_uuid(),
  child_id                 uuid not null unique references public.children(id) on delete cascade,
  primary_therapist_id     uuid references public.users(id) on delete set null,
  diagnosis_text           text,
  starts_at                date,
  age_at_start_text        text,
  -- Array<{ service, active, sessions_per_month, unit_cost_usd }>
  therapies_json           jsonb not null default '[]',
  -- Array<{ day_of_week, time_local 'HH:MM', duration_minutes, service }>
  schedule_pattern_json    jsonb not null default '[]',
  observations             text,
  monthly_total_usd        numeric(10,2),
  signed_at                timestamptz,
  signed_by_user_id        uuid references public.users(id) on delete set null,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  created_by_user_id       uuid references public.users(id) on delete set null,
  updated_at               timestamptz not null default now(),
  updated_by_user_id       uuid references public.users(id) on delete set null
);

create index if not exists treatment_plans_child_id on public.treatment_plans(child_id);
create index if not exists treatment_plans_therapist
  on public.treatment_plans(primary_therapist_id) where primary_therapist_id is not null;

drop trigger if exists treatment_plans_updated_at on public.treatment_plans;
create trigger treatment_plans_updated_at
  before update on public.treatment_plans
  for each row execute function extensions.moddatetime(updated_at);

alter table public.treatment_plans enable row level security;

drop policy if exists "tp select staff" on public.treatment_plans;
create policy "tp select staff"
  on public.treatment_plans for select using (public.is_agency_user());

drop policy if exists "tp insert mgmt" on public.treatment_plans;
create policy "tp insert mgmt"
  on public.treatment_plans for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

drop policy if exists "tp update mgmt" on public.treatment_plans;
create policy "tp update mgmt"
  on public.treatment_plans for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

drop policy if exists "tp delete admin" on public.treatment_plans;
create policy "tp delete admin"
  on public.treatment_plans for delete using (public.is_admin());

grant all on public.treatment_plans to anon, authenticated, service_role;


-- ── 3. treatment_plan_changes (append-only audit) ───────────────────────────

create table if not exists public.treatment_plan_changes (
  id                  uuid primary key default gen_random_uuid(),
  treatment_plan_id   uuid not null references public.treatment_plans(id) on delete cascade,
  changed_at          timestamptz not null default now(),
  changed_by_user_id  uuid references public.users(id) on delete set null,
  before_json         jsonb not null,
  after_json          jsonb not null,
  kind                text not null check (kind in ('create','update','deactivate')),
  notes               text
);

create index if not exists treatment_plan_changes_plan_id
  on public.treatment_plan_changes(treatment_plan_id, changed_at desc);

alter table public.treatment_plan_changes enable row level security;

drop policy if exists "tpc select staff" on public.treatment_plan_changes;
create policy "tpc select staff"
  on public.treatment_plan_changes for select using (public.is_agency_user());

drop policy if exists "tpc insert mgmt" on public.treatment_plan_changes;
create policy "tpc insert mgmt"
  on public.treatment_plan_changes for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

-- No update ni delete: append-only.

grant all on public.treatment_plan_changes to anon, authenticated, service_role;


-- ── 4. appointment_absences (solicitudes de reposición) ─────────────────────

create table if not exists public.appointment_absences (
  id                           uuid primary key default gen_random_uuid(),
  appointment_id               uuid not null unique references public.appointments(id) on delete cascade,
  child_id                     uuid not null references public.children(id) on delete cascade,
  therapist_id                 uuid references public.users(id) on delete set null,
  reported_by_user_id          uuid references public.users(id) on delete set null,
  reported_at                  timestamptz not null default now(),
  reason                       text,
  status                       text not null default 'pending'
                                 check (status in ('pending','replaced','waived')),
  resolved_at                  timestamptz,
  resolved_by_user_id          uuid references public.users(id) on delete set null,
  replacement_appointment_id   uuid references public.appointments(id) on delete set null,
  waive_reason                 text,
  created_at                   timestamptz not null default now()
);

create index if not exists appointment_absences_status_pending
  on public.appointment_absences(status, reported_at desc) where status = 'pending';
create index if not exists appointment_absences_child
  on public.appointment_absences(child_id);

alter table public.appointment_absences enable row level security;

drop policy if exists "aa select staff" on public.appointment_absences;
create policy "aa select staff"
  on public.appointment_absences for select using (public.is_agency_user());

drop policy if exists "aa insert therapist or admin" on public.appointment_absences;
create policy "aa insert therapist or admin"
  on public.appointment_absences for insert
  with check (
    therapist_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "aa update mgmt" on public.appointment_absences;
create policy "aa update mgmt"
  on public.appointment_absences for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias')
    )
  );

drop policy if exists "aa delete admin" on public.appointment_absences;
create policy "aa delete admin"
  on public.appointment_absences for delete using (public.is_admin());

grant all on public.appointment_absences to anon, authenticated, service_role;


-- ── 5. RPC: mark_appointment_absence ────────────────────────────────────────
-- Atómico: cambia appointment.status='no_show' + inserta/upsert absence pending.

create or replace function public.mark_appointment_absence(
  p_appointment_id uuid,
  p_reason         text default null
) returns public.appointment_absences language plpgsql security definer as $$
declare
  v_appt    public.appointments;
  v_absence public.appointment_absences;
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
   for update;

  if not found then
    raise exception 'appointment_not_found';
  end if;

  -- Autoriza al terapista del appt o admin (impersonación)
  if v_appt.therapist_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_appt.status not in ('scheduled','in_progress') then
    raise exception 'invalid_state_for_absence';
  end if;

  update public.appointments
     set status = 'no_show'
   where id = p_appointment_id;

  insert into public.appointment_absences (
    appointment_id, child_id, therapist_id, reported_by_user_id, reason
  ) values (
    p_appointment_id,
    v_appt.child_id,
    v_appt.therapist_id,
    auth.uid(),
    nullif(trim(coalesce(p_reason,'')),'')
  )
  on conflict (appointment_id) do update set
    status = 'pending',
    reported_at = now(),
    reported_by_user_id = auth.uid(),
    reason = excluded.reason,
    resolved_at = null,
    resolved_by_user_id = null,
    replacement_appointment_id = null,
    waive_reason = null
  returning * into v_absence;

  return v_absence;
end;
$$;


-- ── 6. RPC: resolve_absence_with_replacement ────────────────────────────────
-- Crea un appointment de status='replacement' apuntando al original via
-- parent_appointment_id, y marca la solicitud como 'replaced'.

create or replace function public.resolve_absence_with_replacement(
  p_absence_id   uuid,
  p_starts_at    timestamptz,
  p_ends_at      timestamptz,
  p_therapist_id uuid,
  p_modality     text default 'presencial',
  p_notes        text default null
) returns public.appointments language plpgsql security definer as $$
declare
  v_absence    public.appointment_absences;
  v_orig       public.appointments;
  v_replacement public.appointments;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias')
  ) then
    raise exception 'not_authorized';
  end if;

  select * into v_absence
    from public.appointment_absences
   where id = p_absence_id
   for update;

  if not found then raise exception 'absence_not_found'; end if;
  if v_absence.status <> 'pending' then
    raise exception 'absence_already_resolved';
  end if;

  select * into v_orig
    from public.appointments
   where id = v_absence.appointment_id;

  if not found then raise exception 'original_appointment_missing'; end if;

  if p_ends_at <= p_starts_at then
    raise exception 'invalid_time_range';
  end if;

  insert into public.appointments (
    child_id, therapist_id, event_type, service_type, modality,
    starts_at, ends_at, status, parent_appointment_id, created_by_user_id, notes
  ) values (
    v_orig.child_id,
    p_therapist_id,
    v_orig.event_type,
    v_orig.service_type,
    p_modality,
    p_starts_at,
    p_ends_at,
    'replacement',
    v_orig.id,
    auth.uid(),
    p_notes
  )
  returning * into v_replacement;

  update public.appointment_absences
     set status = 'replaced',
         resolved_at = now(),
         resolved_by_user_id = auth.uid(),
         replacement_appointment_id = v_replacement.id
   where id = p_absence_id;

  return v_replacement;
end;
$$;


-- ── 7. RPC: waive_absence (no reponer con motivo) ──────────────────────────

create or replace function public.waive_absence(
  p_absence_id uuid,
  p_reason     text
) returns public.appointment_absences language plpgsql security definer as $$
declare
  v_absence public.appointment_absences;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias')
  ) then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'reason_too_short';
  end if;

  update public.appointment_absences
     set status = 'waived',
         resolved_at = now(),
         resolved_by_user_id = auth.uid(),
         waive_reason = trim(p_reason)
   where id = p_absence_id and status = 'pending'
   returning * into v_absence;

  if not found then
    raise exception 'absence_not_found_or_resolved';
  end if;

  return v_absence;
end;
$$;


-- ── 8. Realtime para la bandeja en /aprobaciones ────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'appointment_absences'
    ) then
      execute 'alter publication supabase_realtime add table public.appointment_absences';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'treatment_plans'
    ) then
      execute 'alter publication supabase_realtime add table public.treatment_plans';
    end if;
  end if;
end $$;


-- ── Fin de migración 0100_kinetic_treatment_plans_and_absences ────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0101_kinetic_monthly_cycles_and_billing.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0101 — Monthly session cycles + billing acoplado a niños (Ronda 2)
-- =============================================================================
-- Captura el flujo mensual de Kinetic:
--   1. Recepción/admin marca "pago recibido del mes X" para un niño.
--   2. El sistema:
--      a) Toma snapshot del treatment_plan (terapias + horario + costo).
--      b) Crea invoice + invoice_items con line items por terapia.
--      c) Genera appointments del mes según el schedule_pattern_json,
--         saltando holidays/closures de institutional_calendar.
--      d) Bloquea TODA la operación si hay conflicto de horario con
--         appointments existentes del mismo terapista.
--
-- Decisiones cerradas con el usuario (ver plan):
--   - Terapista: siempre el primary_therapist_id del plan.
--   - Conflictos: bloquear y reportar (no genera nada del mes).
--   - Cuota vs patrón: validar al guardar el plan, generar por patrón.
--   - Invoice: ligada al niño (invoices.child_id), no a la familia.
-- =============================================================================


-- ── 1. Extender invoices: agregar child_id ──────────────────────────────────
-- Las invoices del mundo FM siguen usando client_id (FK a clients).
-- Las invoices Kinetic usan child_id (FK a children). Exactamente uno
-- de los dos debe estar definido.

alter table public.invoices
  add column if not exists child_id uuid references public.children(id) on delete restrict;

create index if not exists invoices_child_id_idx on public.invoices(child_id) where child_id is not null;

-- Hacer client_id nullable (las nuevas Kinetic no lo van a usar).
alter table public.invoices
  alter column client_id drop not null;

-- CHECK: exactamente uno de (client_id, child_id) — no ambos, no ninguno.
alter table public.invoices
  drop constraint if exists invoices_client_or_child_check;
alter table public.invoices
  add constraint invoices_client_or_child_check check (
    (client_id is not null and child_id is null)
    or (client_id is null and child_id is not null)
  );

-- RLS adicional para invoices Kinetic: staff agencia ve y crea invoices con
-- child_id. (Las policies FM existentes se mantienen para client_id.)
drop policy if exists "invoices_insert_kinetic_mgmt" on public.invoices;
create policy "invoices_insert_kinetic_mgmt"
  on public.invoices for insert
  with check (
    child_id is not null
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

drop policy if exists "invoices_update_kinetic_mgmt" on public.invoices;
create policy "invoices_update_kinetic_mgmt"
  on public.invoices for update
  using (
    child_id is not null
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

-- invoice_items mismo deal: si el invoice padre es Kinetic, el staff puede.
drop policy if exists "invoice_items_insert_kinetic" on public.invoice_items;
create policy "invoice_items_insert_kinetic"
  on public.invoice_items for insert
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and i.child_id is not null
    )
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );


-- ── 2. monthly_session_cycles ───────────────────────────────────────────────

create table if not exists public.monthly_session_cycles (
  id                          uuid primary key default gen_random_uuid(),
  child_id                    uuid not null references public.children(id) on delete cascade,
  -- Año y mes del ciclo (1ro de mes en zona SV — guardamos la fecha del 1ro).
  period_month                date not null,  -- siempre día 1: '2026-04-01'
  -- Snapshot del treatment_plan al momento de pago (congelado).
  treatment_plan_snapshot     jsonb not null,
  -- Datos del pago
  paid_at                     timestamptz not null default now(),
  paid_by_user_id             uuid references public.users(id) on delete set null,
  payment_method              text,                          -- 'cash'|'transfer'|'card'|'other'
  payment_reference           text,
  payment_amount_usd          numeric(12,2) not null,
  -- Invoice generada (FK)
  invoice_id                  uuid references public.invoices(id) on delete set null,
  -- Resultado de generación de citas
  appointments_generated_at   timestamptz,
  appointments_generated_count int not null default 0,
  -- Workflow
  status                      text not null default 'paid_pending_generation'
                                check (status in (
                                  'paid_pending_generation', -- pago registrado, falta generar
                                  'generated',               -- citas creadas
                                  'cancelled'                -- anulado (ej. error)
                                )),
  cancel_reason               text,
  cancelled_at                timestamptz,
  cancelled_by_user_id        uuid references public.users(id) on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (child_id, period_month)
);

create index if not exists monthly_session_cycles_child
  on public.monthly_session_cycles(child_id, period_month desc);
create index if not exists monthly_session_cycles_status
  on public.monthly_session_cycles(status, paid_at desc);

drop trigger if exists monthly_session_cycles_updated_at on public.monthly_session_cycles;
create trigger monthly_session_cycles_updated_at
  before update on public.monthly_session_cycles
  for each row execute function extensions.moddatetime(updated_at);

alter table public.monthly_session_cycles enable row level security;

create policy "msc select staff" on public.monthly_session_cycles for select
  using (public.is_agency_user());

create policy "msc insert mgmt" on public.monthly_session_cycles for insert
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

create policy "msc update mgmt" on public.monthly_session_cycles for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
    )
  );

create policy "msc delete admin" on public.monthly_session_cycles for delete
  using (public.is_admin());

grant all on public.monthly_session_cycles to anon, authenticated, service_role;


-- ── 3. Helper: expand un slot a fechas concretas del mes ────────────────────

create or replace function public._kn_dow_to_int(p_dow text) returns int language sql immutable as $$
  select case p_dow
    when 'sun' then 0
    when 'mon' then 1
    when 'tue' then 2
    when 'wed' then 3
    when 'thu' then 4
    when 'fri' then 5
    when 'sat' then 6
  end;
$$;

create or replace function public._kn_slot_dates_in_month(
  p_period_month date,        -- 1ro del mes
  p_day_of_week  text,        -- 'mon'..'sun'
  p_time_local   text,        -- 'HH:MM'
  p_duration_min int
) returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql immutable as $$
declare
  v_dow_int int := public._kn_dow_to_int(p_day_of_week);
  v_first   date := date_trunc('month', p_period_month)::date;
  v_last    date := (v_first + interval '1 month' - interval '1 day')::date;
  v_d       date;
begin
  if v_dow_int is null then return; end if;
  for v_d in select generate_series(v_first, v_last, interval '1 day')::date loop
    if extract(dow from v_d)::int = v_dow_int then
      starts_at := (v_d::text || ' ' || p_time_local)::timestamp at time zone 'America/El_Salvador';
      ends_at   := starts_at + (p_duration_min || ' minutes')::interval;
      return next;
    end if;
  end loop;
end;
$$;


-- ── 4. RPC: compute_monthly_appointment_candidates ──────────────────────────
-- Read-only: devuelve qué citas se generarían y qué conflictos hay.
-- Estructura del JSONB:
--   {
--     "candidates": [
--       { "service": "lenguaje", "starts_at": "...", "ends_at": "...",
--         "duration_minutes": 45, "skipped_reason": null }
--     ],
--     "skipped_holidays": [ { ... slot info, "date": "..." } ],
--     "conflicts": [
--       { "candidate": {...}, "conflicting_appointment_id": "...",
--         "conflict_starts_at": "...", "conflict_child_id": "..." }
--     ],
--     "summary": {
--       "candidate_count": int,
--       "conflict_count": int,
--       "skipped_holiday_count": int
--     }
--   }

create or replace function public.compute_monthly_appointment_candidates(
  p_child_id     uuid,
  p_period_month date    -- 1ro del mes en SV
) returns jsonb
language plpgsql security definer as $$
declare
  v_plan            public.treatment_plans;
  v_slot            jsonb;
  v_first           date := date_trunc('month', p_period_month)::date;
  v_last            date := (v_first + interval '1 month' - interval '1 day')::date;
  v_candidates      jsonb := '[]';
  v_holidays_skip   jsonb := '[]';
  v_conflicts       jsonb := '[]';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
begin
  if not public.is_agency_user() then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active;

  if not found then
    raise exception 'no_active_treatment_plan';
  end if;

  if v_plan.primary_therapist_id is null then
    raise exception 'plan_has_no_primary_therapist';
  end if;

  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30)
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_slot->>'service',
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30)
      );

      -- ¿Cae en holiday/closure?
      select count(*) into v_holiday_count
        from public.institutional_calendar ic
       where ic.date = v_slot_dates.starts_at::date
         and ic.type in ('holiday','closure','gov_decree','kinetic_break');

      if v_holiday_count > 0 then
        v_holidays_skip := v_holidays_skip || jsonb_build_array(v_cand_obj);
        continue;
      end if;

      -- ¿Choca con un appointment existente del terapista (cualquier estado activo)?
      for v_conflict in
        select a.id, a.starts_at, a.child_id
          from public.appointments a
         where a.therapist_id = v_plan.primary_therapist_id
           and a.status not in ('rescheduled','no_show','late_cancel')
           and a.starts_at < v_slot_dates.ends_at
           and a.ends_at   > v_slot_dates.starts_at
      loop
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'candidate', v_cand_obj,
          'conflicting_appointment_id', v_conflict.id,
          'conflict_starts_at', v_conflict.starts_at,
          'conflict_child_id', v_conflict.child_id
        ));
      end loop;

      v_candidates := v_candidates || jsonb_build_array(v_cand_obj);
    end loop;
  end loop;

  return jsonb_build_object(
    'candidates', v_candidates,
    'skipped_holidays', v_holidays_skip,
    'conflicts', v_conflicts,
    'summary', jsonb_build_object(
      'candidate_count', jsonb_array_length(v_candidates),
      'conflict_count', jsonb_array_length(v_conflicts),
      'skipped_holiday_count', jsonb_array_length(v_holidays_skip)
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'primary_therapist_id', v_plan.primary_therapist_id,
      'monthly_total_usd', v_plan.monthly_total_usd
    )
  );
end;
$$;


-- ── 5. Helper: número correlativo de invoice ────────────────────────────────
-- Las invoices FM ya tienen su propio formato. Para Kinetic uso el prefix
-- 'KIN-YYYYMM-XXXX' contando solo invoices Kinetic del mes.

create or replace function public._kn_next_invoice_number(p_period_month date) returns text
language plpgsql security definer as $$
declare
  v_count int;
  v_yyyymm text := to_char(p_period_month, 'YYYYMM');
begin
  select count(*) into v_count
    from public.invoices
   where child_id is not null
     and to_char(issue_date, 'YYYYMM') = v_yyyymm;
  return 'KIN-' || v_yyyymm || '-' || lpad((v_count + 1)::text, 4, '0');
end;
$$;


-- ── 6. RPC: confirm_monthly_payment_and_generate ────────────────────────────
-- Atómico. Re-evalúa conflictos dentro de la transacción (anti TOCTOU).
-- Crea invoice + invoice_items + appointments + cycle. Si hay conflictos,
-- raise y nada se commitea.

create or replace function public.confirm_monthly_payment_and_generate(
  p_child_id        uuid,
  p_period_month    date,
  p_payment_amount  numeric,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now(),
  p_notes           text default null
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_invoice_id  uuid;
  v_invoice_no  text;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_line_total  numeric(12,2);
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_emitter     jsonb;
  v_client_snap jsonb;
begin
  -- Authz
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
  ) then
    raise exception 'not_authorized';
  end if;

  -- Lock plan
  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  -- Idempotencia: si ya existe cycle para (child, period_month) en estado generated, error.
  if exists (
    select 1 from public.monthly_session_cycles
    where child_id = p_child_id
      and period_month = v_period
      and status <> 'cancelled'
  ) then
    raise exception 'cycle_already_exists_for_period';
  end if;

  -- Re-evaluar candidatos+conflictos (anti TOCTOU). Si conflictos > 0, abortar.
  v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period);
  v_summary := v_compute->'summary';

  if (v_summary->>'conflict_count')::int > 0 then
    raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
  end if;

  -- Snapshot mínimo para invoice client_snapshot_json (la tabla lo exige NOT NULL).
  -- Para Kinetic guardamos los datos del NIÑO (substituye al cliente FM).
  select jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    into v_client_snap
    from public.children c
   where c.id = p_child_id;

  -- Emitter snapshot — placeholder. Cuando company_settings tenga datos
  -- BEGINNINGS reales se reemplaza acá.
  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  -- Crear invoice
  v_invoice_no := public._kn_next_invoice_number(v_period);
  insert into public.invoices (
    invoice_number, client_id, child_id, issue_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) values (
    v_invoice_no, null, p_child_id, current_date,
    'USD', 0, 0, 0, 0, 0,
    'paid', p_paid_at::date, p_payment_method, p_payment_reference,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM')),
    v_client_snap, v_emitter, auth.uid()
  )
  returning id into v_invoice_id;

  -- Insertar items del invoice (1 por terapia activa, snapshot del plan)
  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_line_total := round(
        (v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric,
        2
      );
      v_subtotal := v_subtotal + v_line_total;
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
      values (
        v_invoice_id,
        v_therapy->>'service',
        (v_therapy->>'sessions_per_month')::numeric,
        (v_therapy->>'unit_cost_usd')::numeric,
        v_line_total,
        0
      );
    end if;
  end loop;

  update public.invoices
     set subtotal = v_subtotal,
         total = v_subtotal
   where id = v_invoice_id;

  -- Crear appointments para cada candidato
  for v_candidate in select * from jsonb_array_elements(v_compute->'candidates')
  loop
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      p_child_id,
      v_plan.primary_therapist_id,
      'terapia',
      v_candidate->>'service',
      'presencial',
      (v_candidate->>'starts_at')::timestamptz,
      (v_candidate->>'ends_at')::timestamptz,
      'scheduled',
      auth.uid(),
      'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  -- Crear cycle row
  insert into public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, notes
  ) values (
    p_child_id, v_period, to_jsonb(v_plan),
    p_paid_at, auth.uid(), p_payment_method, p_payment_reference, p_payment_amount,
    v_invoice_id, now(), v_appt_count,
    'generated', p_notes
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;


-- ── 7. RPC: cancel_monthly_cycle ────────────────────────────────────────────
-- Anula el cycle: marca cancelled, void la invoice, cancela los appointments
-- 'scheduled' que se generaron (no toca los ya iniciados/completed).

create or replace function public.cancel_monthly_cycle(
  p_cycle_id uuid,
  p_reason   text
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_cycle public.monthly_session_cycles;
  v_first_day date;
  v_last_day  date;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora')
  ) then
    raise exception 'not_authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'reason_too_short';
  end if;

  select * into v_cycle
    from public.monthly_session_cycles
   where id = p_cycle_id
   for update;

  if not found then raise exception 'cycle_not_found'; end if;
  if v_cycle.status = 'cancelled' then return v_cycle; end if;

  v_first_day := v_cycle.period_month;
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  -- Void la invoice asociada
  if v_cycle.invoice_id is not null then
    update public.invoices
       set status = 'void',
           void_reason = trim(p_reason),
           void_by = auth.uid(),
           void_at = now()
     where id = v_cycle.invoice_id;
  end if;

  -- Cancelar appointments scheduled del periodo (los ya iniciados/completed se respetan)
  update public.appointments
     set status = 'rescheduled',
         notes = coalesce(notes,'') || E'\nCiclo cancelado: ' || trim(p_reason)
   where child_id = v_cycle.child_id
     and starts_at >= v_first_day
     and starts_at <  (v_last_day + interval '1 day')
     and status = 'scheduled'
     and (notes like '%Auto-generado del ciclo%' or notes is null);

  update public.monthly_session_cycles
     set status = 'cancelled',
         cancel_reason = trim(p_reason),
         cancelled_at = now(),
         cancelled_by_user_id = auth.uid()
   where id = p_cycle_id
   returning * into v_cycle;

  return v_cycle;
end;
$$;


-- ── 8. Realtime ─────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'monthly_session_cycles'
    ) then
      execute 'alter publication supabase_realtime add table public.monthly_session_cycles';
    end if;
  end if;
end $$;


-- ── Fin de migración 0101_kinetic_monthly_cycles_and_billing ──────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0102_kinetic_monthly_quota_clamp.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0102 — Cuota manda en la generación mensual
-- =============================================================================
-- Cambio de semántica respecto a 0101:
--   ANTES: el patrón semanal mandaba — si el patrón generaba 5 sesiones
--   pero la cuota era 2, se creaban las 5.
--   AHORA: la cuota (sessions_per_month por servicio del plan) manda —
--   si el patrón genera 5 pero la cuota es 2, se crean 2 (las primeras
--   cronológicamente) y las 3 restantes se reportan en
--   `skipped_overquota`.
--
-- Orden de procesamiento por servicio:
--   1. Expandir el patrón a candidatos del mes
--   2. Filtrar candidatos en holidays/closures → skipped_holidays
--   3. Si quedan más que la cuota → trim al primero N → skipped_overquota
--   4. Detectar conflictos sobre los que quedan
--
-- Razón: el usuario reportó confusión cuando un mes con 5 lunes generaba
-- 5 sesiones de Ocupacional aunque su cuota fuera 2. La cuota es el
-- contrato facturado y debe coincidir con la realidad agendada.
-- =============================================================================

create or replace function public.compute_monthly_appointment_candidates(
  p_child_id     uuid,
  p_period_month date
) returns jsonb
language plpgsql security definer as $$
declare
  v_plan            public.treatment_plans;
  v_slot            jsonb;
  v_first           date := date_trunc('month', p_period_month)::date;
  v_last            date := (v_first + interval '1 month' - interval '1 day')::date;
  v_candidates      jsonb := '[]';
  v_holidays_skip   jsonb := '[]';
  v_overquota_skip  jsonb := '[]';
  v_conflicts       jsonb := '[]';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
  v_per_service     jsonb := '{}';     -- map service → array de candidatos pre-trim
  v_service_key     text;
  v_service_arr     jsonb;
  v_quota_map       jsonb := '{}';     -- map service → sessions_per_month (de la therapy entry activa)
  v_therapy         jsonb;
  v_kept_arr        jsonb;
  v_quota           int;
  v_idx             int;
begin
  if not public.is_agency_user() then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active;

  if not found then
    raise exception 'no_active_treatment_plan';
  end if;

  if v_plan.primary_therapist_id is null then
    raise exception 'plan_has_no_primary_therapist';
  end if;

  -- Construir map de cuota por servicio (solo terapias activas).
  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_quota_map := v_quota_map || jsonb_build_object(
        v_therapy->>'service',
        coalesce((v_therapy->>'sessions_per_month')::int, 0)
      );
    end if;
  end loop;

  -- Paso 1+2: expandir slots, filtrar holidays, agrupar por servicio.
  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    v_service_key := v_slot->>'service';
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30)
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_service_key,
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30)
      );

      -- Holiday check
      select count(*) into v_holiday_count
        from public.institutional_calendar ic
       where ic.date = v_slot_dates.starts_at::date
         and ic.type in ('holiday','closure','gov_decree','kinetic_break');

      if v_holiday_count > 0 then
        v_holidays_skip := v_holidays_skip || jsonb_build_array(v_cand_obj);
        continue;
      end if;

      -- Acumular en bucket por servicio
      v_service_arr := coalesce(v_per_service->v_service_key, '[]'::jsonb);
      v_per_service := v_per_service || jsonb_build_object(
        v_service_key,
        v_service_arr || jsonb_build_array(v_cand_obj)
      );
    end loop;
  end loop;

  -- Paso 3: para cada servicio, ordenar por starts_at y recortar a la cuota.
  for v_service_key in select jsonb_object_keys(v_per_service)
  loop
    v_service_arr := v_per_service->v_service_key;
    v_quota := coalesce((v_quota_map->>v_service_key)::int, 0);

    -- Ordenar por starts_at (jsonb_path_query no ordena; lo hago via subquery con jsonb_array_elements)
    select coalesce(jsonb_agg(elem order by (elem->>'starts_at')::timestamptz), '[]'::jsonb)
      into v_service_arr
      from jsonb_array_elements(v_service_arr) as elem;

    if v_quota <= 0 then
      -- Sin cuota: todos van a overquota
      v_overquota_skip := v_overquota_skip || v_service_arr;
      continue;
    end if;

    if jsonb_array_length(v_service_arr) <= v_quota then
      -- Cabe todo
      v_candidates := v_candidates || v_service_arr;
    else
      -- Trim: keep[0..quota-1], overquota[quota..]
      v_kept_arr := '[]'::jsonb;
      v_idx := 0;
      for v_cand_obj in select * from jsonb_array_elements(v_service_arr)
      loop
        if v_idx < v_quota then
          v_kept_arr := v_kept_arr || jsonb_build_array(v_cand_obj);
        else
          v_overquota_skip := v_overquota_skip || jsonb_build_array(v_cand_obj);
        end if;
        v_idx := v_idx + 1;
      end loop;
      v_candidates := v_candidates || v_kept_arr;
    end if;
  end loop;

  -- Paso 4: chequear conflictos solo sobre los que quedan en v_candidates.
  for v_cand_obj in select * from jsonb_array_elements(v_candidates)
  loop
    for v_conflict in
      select a.id, a.starts_at, a.child_id
        from public.appointments a
       where a.therapist_id = v_plan.primary_therapist_id
         and a.status not in ('rescheduled','no_show','late_cancel')
         and a.starts_at < (v_cand_obj->>'ends_at')::timestamptz
         and a.ends_at   > (v_cand_obj->>'starts_at')::timestamptz
    loop
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'candidate', v_cand_obj,
        'conflicting_appointment_id', v_conflict.id,
        'conflict_starts_at', v_conflict.starts_at,
        'conflict_child_id', v_conflict.child_id
      ));
    end loop;
  end loop;

  return jsonb_build_object(
    'candidates', v_candidates,
    'skipped_holidays', v_holidays_skip,
    'skipped_overquota', v_overquota_skip,
    'conflicts', v_conflicts,
    'summary', jsonb_build_object(
      'candidate_count', jsonb_array_length(v_candidates),
      'conflict_count', jsonb_array_length(v_conflicts),
      'skipped_holiday_count', jsonb_array_length(v_holidays_skip),
      'skipped_overquota_count', jsonb_array_length(v_overquota_skip)
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'primary_therapist_id', v_plan.primary_therapist_id,
      'monthly_total_usd', v_plan.monthly_total_usd
    )
  );
end;
$$;

-- ── Fin de migración 0102_kinetic_monthly_quota_clamp ──────────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0103_kinetic_invoices_total_a_pagar.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0103 — Hotfix: invoices.total_a_pagar NOT NULL en confirm_monthly_payment_and_generate
-- =============================================================================
-- Bug: el RPC de Ronda 2 (mig 0101) insertaba en invoices sin setear
-- `total_a_pagar`, que es NOT NULL desde la migración FM 0062 (renta retenida).
-- Postgres rechazaba la transacción al confirmar pago.
--
-- Fix: re-emitir la RPC seteando `total_a_pagar = 0` en el INSERT inicial y
-- `total_a_pagar = v_subtotal` en el UPDATE final junto con `subtotal`/`total`.
--
-- Para invoices Kinetic NO aplica retención (MVP); cuando exista soporte de
-- agente de retención por niño/familia se calculará v_subtotal - retencion.
-- =============================================================================

create or replace function public.confirm_monthly_payment_and_generate(
  p_child_id        uuid,
  p_period_month    date,
  p_payment_amount  numeric,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now(),
  p_notes           text default null
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_invoice_id  uuid;
  v_invoice_no  text;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_line_total  numeric(12,2);
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_emitter     jsonb;
  v_client_snap jsonb;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
  ) then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  if exists (
    select 1 from public.monthly_session_cycles
    where child_id = p_child_id
      and period_month = v_period
      and status <> 'cancelled'
  ) then
    raise exception 'cycle_already_exists_for_period';
  end if;

  v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period);
  v_summary := v_compute->'summary';

  if (v_summary->>'conflict_count')::int > 0 then
    raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
  end if;

  select jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    into v_client_snap
    from public.children c
   where c.id = p_child_id;

  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  v_invoice_no := public._kn_next_invoice_number(v_period);
  insert into public.invoices (
    invoice_number, client_id, child_id, issue_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) values (
    v_invoice_no, null, p_child_id, current_date,
    'USD', 0, 0, 0, 0, 0, 0,
    'paid', p_paid_at::date, p_payment_method, p_payment_reference,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM')),
    v_client_snap, v_emitter, auth.uid()
  )
  returning id into v_invoice_id;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_line_total := round(
        (v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric,
        2
      );
      v_subtotal := v_subtotal + v_line_total;
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
      values (
        v_invoice_id,
        v_therapy->>'service',
        (v_therapy->>'sessions_per_month')::numeric,
        (v_therapy->>'unit_cost_usd')::numeric,
        v_line_total,
        0
      );
    end if;
  end loop;

  -- MVP Kinetic: sin renta retenida → total_a_pagar = total = subtotal.
  update public.invoices
     set subtotal = v_subtotal,
         total = v_subtotal,
         total_a_pagar = v_subtotal
   where id = v_invoice_id;

  for v_candidate in select * from jsonb_array_elements(v_compute->'candidates')
  loop
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      p_child_id,
      v_plan.primary_therapist_id,
      'terapia',
      v_candidate->>'service',
      'presencial',
      (v_candidate->>'starts_at')::timestamptz,
      (v_candidate->>'ends_at')::timestamptz,
      'scheduled',
      auth.uid(),
      'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  insert into public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, notes
  ) values (
    p_child_id, v_period, to_jsonb(v_plan),
    p_paid_at, auth.uid(), p_payment_method, p_payment_reference, p_payment_amount,
    v_invoice_id, now(), v_appt_count,
    'generated', p_notes
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- ── Fin de migración 0103_kinetic_invoices_total_a_pagar ───────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0104_kinetic_slot_frequency.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0104 — Frecuencia (semanal / quincenal / mensual) por slot del horario
-- =============================================================================
-- Hasta ahora cada slot del schedule_pattern_json se interpretaba como
-- "todos los <día> del mes" (semanal). Esto causaba que terapias con cuota
-- mensual baja se concentraran en las primeras semanas (cuota clamp).
--
-- Nueva opción `frequency` por slot:
--   'weekly'    (default si no está) → todos los matches del mes
--   'biweekly'  → cada 14 días desde el primer match del mes
--   'monthly'   → solo el primer match del mes
--
-- Ejemplo: Ocupacional, Lunes 14:00, frequency='biweekly' en junio 2026:
--   Mondays = [1, 8, 15, 22, 29], biweekly → [1, 15, 29].
--   Si la cuota es 2, el clamp de 0102 deja [1, 15] (distribuido).
--
-- Backward compat: slots sin frequency se tratan como 'weekly'.
-- =============================================================================

-- ── 1. Helper: expand un slot con frecuencia ────────────────────────────────

create or replace function public._kn_slot_dates_in_month(
  p_period_month date,
  p_day_of_week  text,
  p_time_local   text,
  p_duration_min int,
  p_frequency    text default 'weekly'   -- nuevo arg (sobrecarga)
) returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql immutable as $$
declare
  v_dow_int int := public._kn_dow_to_int(p_day_of_week);
  v_first   date := date_trunc('month', p_period_month)::date;
  v_last    date := (v_first + interval '1 month' - interval '1 day')::date;
  v_d       date;
  v_match_idx int := 0;       -- contador de matches (0-indexed)
  v_freq    text := lower(coalesce(p_frequency, 'weekly'));
begin
  if v_dow_int is null then return; end if;

  for v_d in select generate_series(v_first, v_last, interval '1 day')::date loop
    if extract(dow from v_d)::int = v_dow_int then
      -- Decidir si este match cuenta según la frecuencia
      if v_freq = 'monthly' then
        if v_match_idx > 0 then
          v_match_idx := v_match_idx + 1;
          continue;
        end if;
      elsif v_freq = 'biweekly' then
        if (v_match_idx % 2) <> 0 then
          v_match_idx := v_match_idx + 1;
          continue;
        end if;
      end if;
      -- weekly: siempre incluir

      starts_at := (v_d::text || ' ' || p_time_local)::timestamp at time zone 'America/El_Salvador';
      ends_at   := starts_at + (p_duration_min || ' minutes')::interval;
      return next;
      v_match_idx := v_match_idx + 1;
    end if;
  end loop;
end;
$$;


-- ── 2. compute_monthly_appointment_candidates: pasar frequency del slot ────
-- (mismo cuerpo que 0102, solo cambio la llamada al helper para pasar frequency)

create or replace function public.compute_monthly_appointment_candidates(
  p_child_id     uuid,
  p_period_month date
) returns jsonb
language plpgsql security definer as $$
declare
  v_plan            public.treatment_plans;
  v_slot            jsonb;
  v_first           date := date_trunc('month', p_period_month)::date;
  v_last            date := (v_first + interval '1 month' - interval '1 day')::date;
  v_candidates      jsonb := '[]';
  v_holidays_skip   jsonb := '[]';
  v_overquota_skip  jsonb := '[]';
  v_conflicts       jsonb := '[]';
  v_slot_dates      record;
  v_holiday_count   int;
  v_conflict        record;
  v_cand_obj        jsonb;
  v_per_service     jsonb := '{}';
  v_service_key     text;
  v_service_arr     jsonb;
  v_quota_map       jsonb := '{}';
  v_therapy         jsonb;
  v_kept_arr        jsonb;
  v_quota           int;
  v_idx             int;
begin
  if not public.is_agency_user() then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_quota_map := v_quota_map || jsonb_build_object(
        v_therapy->>'service',
        coalesce((v_therapy->>'sessions_per_month')::int, 0)
      );
    end if;
  end loop;

  for v_slot in select * from jsonb_array_elements(coalesce(v_plan.schedule_pattern_json,'[]'::jsonb))
  loop
    v_service_key := v_slot->>'service';
    for v_slot_dates in
      select starts_at, ends_at
        from public._kn_slot_dates_in_month(
          v_first,
          v_slot->>'day_of_week',
          v_slot->>'time_local',
          coalesce((v_slot->>'duration_minutes')::int, 30),
          coalesce(v_slot->>'frequency', 'weekly')   -- nuevo
        )
    loop
      v_cand_obj := jsonb_build_object(
        'service', v_service_key,
        'starts_at', v_slot_dates.starts_at,
        'ends_at', v_slot_dates.ends_at,
        'duration_minutes', coalesce((v_slot->>'duration_minutes')::int, 30)
      );

      select count(*) into v_holiday_count
        from public.institutional_calendar ic
       where ic.date = v_slot_dates.starts_at::date
         and ic.type in ('holiday','closure','gov_decree','kinetic_break');

      if v_holiday_count > 0 then
        v_holidays_skip := v_holidays_skip || jsonb_build_array(v_cand_obj);
        continue;
      end if;

      v_service_arr := coalesce(v_per_service->v_service_key, '[]'::jsonb);
      v_per_service := v_per_service || jsonb_build_object(
        v_service_key,
        v_service_arr || jsonb_build_array(v_cand_obj)
      );
    end loop;
  end loop;

  for v_service_key in select jsonb_object_keys(v_per_service)
  loop
    v_service_arr := v_per_service->v_service_key;
    v_quota := coalesce((v_quota_map->>v_service_key)::int, 0);

    select coalesce(jsonb_agg(elem order by (elem->>'starts_at')::timestamptz), '[]'::jsonb)
      into v_service_arr
      from jsonb_array_elements(v_service_arr) as elem;

    if v_quota <= 0 then
      v_overquota_skip := v_overquota_skip || v_service_arr;
      continue;
    end if;

    if jsonb_array_length(v_service_arr) <= v_quota then
      v_candidates := v_candidates || v_service_arr;
    else
      v_kept_arr := '[]'::jsonb;
      v_idx := 0;
      for v_cand_obj in select * from jsonb_array_elements(v_service_arr)
      loop
        if v_idx < v_quota then
          v_kept_arr := v_kept_arr || jsonb_build_array(v_cand_obj);
        else
          v_overquota_skip := v_overquota_skip || jsonb_build_array(v_cand_obj);
        end if;
        v_idx := v_idx + 1;
      end loop;
      v_candidates := v_candidates || v_kept_arr;
    end if;
  end loop;

  for v_cand_obj in select * from jsonb_array_elements(v_candidates)
  loop
    for v_conflict in
      select a.id, a.starts_at, a.child_id
        from public.appointments a
       where a.therapist_id = v_plan.primary_therapist_id
         and a.status not in ('rescheduled','no_show','late_cancel')
         and a.starts_at < (v_cand_obj->>'ends_at')::timestamptz
         and a.ends_at   > (v_cand_obj->>'starts_at')::timestamptz
    loop
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'candidate', v_cand_obj,
        'conflicting_appointment_id', v_conflict.id,
        'conflict_starts_at', v_conflict.starts_at,
        'conflict_child_id', v_conflict.child_id
      ));
    end loop;
  end loop;

  return jsonb_build_object(
    'candidates', v_candidates,
    'skipped_holidays', v_holidays_skip,
    'skipped_overquota', v_overquota_skip,
    'conflicts', v_conflicts,
    'summary', jsonb_build_object(
      'candidate_count', jsonb_array_length(v_candidates),
      'conflict_count', jsonb_array_length(v_conflicts),
      'skipped_holiday_count', jsonb_array_length(v_holidays_skip),
      'skipped_overquota_count', jsonb_array_length(v_overquota_skip)
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'primary_therapist_id', v_plan.primary_therapist_id,
      'monthly_total_usd', v_plan.monthly_total_usd
    )
  );
end;
$$;

-- ── Fin de migración 0104_kinetic_slot_frequency ───────────────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0105_kinetic_invoice_number_fix.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0105 — Hotfix: contador de invoice_number Kinetic (counting por prefix)
-- =============================================================================
-- Bug: `_kn_next_invoice_number(p_period_month)` contaba invoices con
-- `issue_date YYYYMM = period_month YYYYMM`. Pero `issue_date` se setea
-- a `current_date` al crear la invoice, NO al period_month del ciclo.
-- Resultado:
--   - Crear ciclo de junio 2026 hoy (mayo 2026): issue_date=2026-05-XX,
--     prefix='KIN-202606-', counter contaba YYYYMM='202606' → 0 →
--     número 'KIN-202606-0001'.
--   - Re-intentar (ej. después de anular el primero): same counter → 0
--     → 'KIN-202606-0001' otra vez → DUPLICATE KEY.
--
-- Fix: contar por el prefix del invoice_number en lugar de por
-- issue_date. Garantiza unicidad dentro del prefix sin importar qué
-- día se haya emitido.
-- =============================================================================

create or replace function public._kn_next_invoice_number(p_period_month date) returns text
language plpgsql security definer as $$
declare
  v_count int;
  v_prefix text;
  v_yyyymm text := to_char(p_period_month, 'YYYYMM');
begin
  v_prefix := 'KIN-' || v_yyyymm || '-';
  select count(*) into v_count
    from public.invoices
   where invoice_number like v_prefix || '%';
  return v_prefix || lpad((v_count + 1)::text, 4, '0');
end;
$$;

-- ── Fin de migración 0105_kinetic_invoice_number_fix ──────────────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0106_kinetic_cycle_appointments_override.sql
-- ────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 0106 — Permitir override de citas al confirmar el ciclo mensual
-- =============================================================================
-- El usuario quiere ver un preview de las citas que se van a generar y poder
-- mover individualmente alguna a otro día (manteniendo la hora) por excepciones
-- (asueto puntual, familia avisa que no van a estar, etc.).
--
-- Nuevo argumento opcional `p_appointments_override` en la RPC:
--   - Si NULL → comportamiento anterior (auto-compute + cuota clamp + holidays)
--   - Si JSONB array → usar esos appointments tal cual (re-validando conflictos
--     de horario contra appointments existentes del terapista). Útil cuando el
--     usuario movió fechas en el preview drag-and-drop.
--
-- Schema esperado de cada elemento del array:
--   { service: text, starts_at: timestamptz, ends_at: timestamptz,
--     duration_minutes: int }
--
-- Anti TOCTOU: aunque el usuario haya validado conflictos en el dry-run,
-- entre dry-run y confirm puede haber aparecido otra cita que choque.
-- La RPC re-valida conflictos sobre el override antes de crear.
-- =============================================================================

create or replace function public.confirm_monthly_payment_and_generate(
  p_child_id        uuid,
  p_period_month    date,
  p_payment_amount  numeric,
  p_payment_method  text default 'cash',
  p_payment_reference text default null,
  p_paid_at         timestamptz default now(),
  p_notes           text default null,
  p_appointments_override jsonb default null    -- nuevo
) returns public.monthly_session_cycles
language plpgsql security definer as $$
declare
  v_plan        public.treatment_plans;
  v_period      date := date_trunc('month', p_period_month)::date;
  v_compute     jsonb;
  v_summary     jsonb;
  v_candidate   jsonb;
  v_appointments_to_create jsonb;
  v_invoice_id  uuid;
  v_invoice_no  text;
  v_subtotal    numeric(12,2) := 0;
  v_therapy     jsonb;
  v_line_total  numeric(12,2);
  v_appt_count  int := 0;
  v_cycle       public.monthly_session_cycles;
  v_emitter     jsonb;
  v_client_snap jsonb;
  v_conflict_count int := 0;
  v_period_start_iso timestamptz;
  v_period_end_iso   timestamptz;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','directora','coordinadora_terapias','recepcion','contable')
  ) then
    raise exception 'not_authorized';
  end if;

  select * into v_plan
    from public.treatment_plans
   where child_id = p_child_id
     and active
   for update;

  if not found then raise exception 'no_active_treatment_plan'; end if;
  if v_plan.primary_therapist_id is null then raise exception 'plan_has_no_primary_therapist'; end if;

  if exists (
    select 1 from public.monthly_session_cycles
    where child_id = p_child_id
      and period_month = v_period
      and status <> 'cancelled'
  ) then
    raise exception 'cycle_already_exists_for_period';
  end if;

  -- Decidir qué appointments crear
  if p_appointments_override is not null and jsonb_typeof(p_appointments_override) = 'array' then
    v_appointments_to_create := p_appointments_override;

    -- Re-validar conflictos sobre el override (anti TOCTOU para drags)
    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
      select count(*) into v_conflict_count
        from public.appointments a
       where a.therapist_id = v_plan.primary_therapist_id
         and a.status not in ('rescheduled','no_show','late_cancel')
         and a.starts_at < (v_candidate->>'ends_at')::timestamptz
         and a.ends_at   > (v_candidate->>'starts_at')::timestamptz;
      if v_conflict_count > 0 then
        raise exception 'has_conflicts: 1';
      end if;
    end loop;

    -- Validar que las fechas caen dentro del periodo (no fuera del mes)
    v_period_start_iso := (v_period::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';
    v_period_end_iso   := ((v_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone 'America/El_Salvador';

    for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
    loop
      if (v_candidate->>'starts_at')::timestamptz < v_period_start_iso
         or (v_candidate->>'starts_at')::timestamptz >= v_period_end_iso then
        raise exception 'override_date_out_of_period';
      end if;
    end loop;
  else
    -- Auto-compute como antes
    v_compute := public.compute_monthly_appointment_candidates(p_child_id, v_period);
    v_summary := v_compute->'summary';
    if (v_summary->>'conflict_count')::int > 0 then
      raise exception 'has_conflicts: %', (v_summary->>'conflict_count');
    end if;
    v_appointments_to_create := v_compute->'candidates';
  end if;

  -- Snapshots para invoice
  select jsonb_build_object(
    'child_id', c.id,
    'child_full_name', c.full_name,
    'child_code', c.code,
    'family_id', c.family_id
  )
    into v_client_snap
    from public.children c
   where c.id = p_child_id;

  v_emitter := jsonb_build_object(
    'name', 'BEGINNINGS, S.A. de C.V.',
    'note', 'placeholder hasta que se carguen datos fiscales reales'
  );

  -- Invoice
  v_invoice_no := public._kn_next_invoice_number(v_period);
  insert into public.invoices (
    invoice_number, client_id, child_id, issue_date,
    currency, subtotal, discount_amount, tax_rate, tax_amount, total, total_a_pagar,
    status, payment_date, payment_method, payment_reference, notes,
    client_snapshot_json, emitter_snapshot_json, created_by
  ) values (
    v_invoice_no, null, p_child_id, current_date,
    'USD', 0, 0, 0, 0, 0, 0,
    'paid', p_paid_at::date, p_payment_method, p_payment_reference,
    coalesce(p_notes, 'Ciclo mensual ' || to_char(v_period,'YYYY-MM')),
    v_client_snap, v_emitter, auth.uid()
  )
  returning id into v_invoice_id;

  -- Items del invoice
  for v_therapy in select * from jsonb_array_elements(coalesce(v_plan.therapies_json,'[]'::jsonb))
  loop
    if (v_therapy->>'active')::boolean then
      v_line_total := round(
        (v_therapy->>'sessions_per_month')::numeric * (v_therapy->>'unit_cost_usd')::numeric,
        2
      );
      v_subtotal := v_subtotal + v_line_total;
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
      values (
        v_invoice_id,
        v_therapy->>'service',
        (v_therapy->>'sessions_per_month')::numeric,
        (v_therapy->>'unit_cost_usd')::numeric,
        v_line_total,
        0
      );
    end if;
  end loop;

  update public.invoices
     set subtotal = v_subtotal,
         total = v_subtotal,
         total_a_pagar = v_subtotal
   where id = v_invoice_id;

  -- Crear appointments (override o auto)
  for v_candidate in select * from jsonb_array_elements(v_appointments_to_create)
  loop
    insert into public.appointments (
      child_id, therapist_id, event_type, service_type, modality,
      starts_at, ends_at, status, created_by_user_id, notes
    ) values (
      p_child_id,
      v_plan.primary_therapist_id,
      'terapia',
      v_candidate->>'service',
      'presencial',
      (v_candidate->>'starts_at')::timestamptz,
      (v_candidate->>'ends_at')::timestamptz,
      'scheduled',
      auth.uid(),
      'Auto-generado del ciclo ' || to_char(v_period,'YYYY-MM')
    );
    v_appt_count := v_appt_count + 1;
  end loop;

  -- Cycle row
  insert into public.monthly_session_cycles (
    child_id, period_month, treatment_plan_snapshot,
    paid_at, paid_by_user_id, payment_method, payment_reference, payment_amount_usd,
    invoice_id, appointments_generated_at, appointments_generated_count,
    status, notes
  ) values (
    p_child_id, v_period, to_jsonb(v_plan),
    p_paid_at, auth.uid(), p_payment_method, p_payment_reference, p_payment_amount,
    v_invoice_id, now(), v_appt_count,
    'generated', p_notes
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- ── Fin de migración 0106_kinetic_cycle_appointments_override ─────────────


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations-kinetic/0107_fix_submit_progress_report_file.sql
-- ────────────────────────────────────────────────────────────────────────
-- Corrige submit_progress_report para que NO valide data_json cuando
-- upload_kind = 'file'. Los informes basados en archivo no tienen data_json
-- y la validación del template siempre fallaba con "required_block_empty".

create or replace function public.submit_progress_report(
  p_report_id uuid
) returns public.progress_reports language plpgsql security definer as $$
declare
  v_report public.progress_reports;
begin
  select * into v_report
    from public.progress_reports
   where id = p_report_id
   for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  -- Autoriza al autor o, durante impersonación, al admin real.
  if v_report.authored_by_user_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_report.status not in ('draft','rejected') then
    raise exception 'invalid_state_for_submit';
  end if;

  -- Solo validar data_json cuando el informe es de tipo editor.
  -- Informes tipo 'file' no tienen data_json y no deben validarse.
  if coalesce(v_report.upload_kind, 'editor') = 'editor' then
    perform public.validate_progress_report_against_template(p_report_id);
  end if;

  update public.progress_reports
     set status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   where id = p_report_id
   returning * into v_report;

  return v_report;
end;
$$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0107_service_catalog.sql
-- ────────────────────────────────────────────────────────────────────────
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
  -- (morning_program se modela como text+check porque la DB usa text en
  -- children.enrolled_program; no existe enum public.morning_program)
  morning_program text check (
    morning_program is null
    or morning_program in ('blue_kids', 'learning_kids', 'aula_educativa')
  ),
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


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0108_reports_file_upload.sql
-- ────────────────────────────────────────────────────────────────────────
-- 0108_reports_file_upload.sql
-- Soporte para upload de archivos (PDF/Word/Excel/imagen) en informes
-- cuatrimestrales (progress_reports) y reportes de sesion (session_reports).
-- Bucket privado reports-files; las write policies bypasean via service role
-- desde server actions (mismo patron que agency-assets).

-- =============================================================================
-- 1. Columnas en progress_reports
-- =============================================================================
alter table public.progress_reports
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes integer,
  add column if not exists file_mime_type text,
  add column if not exists upload_kind text default 'editor';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'progress_reports_upload_kind_check'
  ) then
    alter table public.progress_reports
      add constraint progress_reports_upload_kind_check
      check (upload_kind in ('editor', 'file'));
  end if;
end $$;

-- =============================================================================
-- 2. Columnas en session_reports
-- =============================================================================
alter table public.session_reports
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes integer,
  add column if not exists file_mime_type text,
  add column if not exists upload_kind text default 'editor';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'session_reports_upload_kind_check'
  ) then
    alter table public.session_reports
      add constraint session_reports_upload_kind_check
      check (upload_kind in ('editor', 'file'));
  end if;
end $$;

-- =============================================================================
-- 3. Bucket reports-files (privado)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports-files',
  'reports-files',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- =============================================================================
-- 4. Policies storage: SELECT para autenticados; write via service role
-- =============================================================================
drop policy if exists reports_files_select on storage.objects;
create policy reports_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reports-files');

-- INSERT/UPDATE/DELETE intencionalmente sin policy: solo el service role del
-- server action puede escribir. Mismo patron de agency-assets para evitar el
-- problema de JWT-no-propagado de Supabase Storage.

-- =============================================================================
-- 5. Comentarios
-- =============================================================================
comment on column public.progress_reports.upload_kind is
  'Origen del informe: editor (formato estructurado en data_json) o file (archivo subido al bucket reports-files).';
comment on column public.session_reports.upload_kind is
  'Origen del reporte: editor (campos de texto actividades/respuesta/tarea/observaciones) o file (archivo subido).';
comment on column public.progress_reports.file_url is
  'Path en el bucket reports-files. La URL firmada se genera on-demand al servir el archivo.';
comment on column public.session_reports.file_url is
  'Path en el bucket reports-files. La URL firmada se genera on-demand al servir el archivo.';


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0109_treatment_plan_discounts.sql
-- ────────────────────────────────────────────────────────────────────────
-- 0109_treatment_plan_discounts.sql
-- Descuentos en treatment_plans y monthly_session_cycles.
-- discount_kind: 'none' | 'percent' | 'fixed'
-- discount_value: para 'percent' es 0-100, para 'fixed' es monto USD.

-- =============================================================================
-- 1. treatment_plans
-- =============================================================================
alter table public.treatment_plans
  add column if not exists discount_kind text default 'none',
  add column if not exists discount_value numeric(10, 2) default 0,
  add column if not exists discount_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'treatment_plans_discount_kind_check'
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_discount_kind_check
      check (discount_kind in ('none', 'percent', 'fixed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'treatment_plans_discount_value_check'
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_discount_value_check
      check (discount_value >= 0);
  end if;
end $$;

-- =============================================================================
-- 2. monthly_session_cycles
-- =============================================================================
alter table public.monthly_session_cycles
  add column if not exists discount_kind text default 'none',
  add column if not exists discount_value numeric(10, 2) default 0,
  add column if not exists discount_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'monthly_cycles_discount_kind_check'
  ) then
    alter table public.monthly_session_cycles
      add constraint monthly_cycles_discount_kind_check
      check (discount_kind in ('none', 'percent', 'fixed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'monthly_cycles_discount_value_check'
  ) then
    alter table public.monthly_session_cycles
      add constraint monthly_cycles_discount_value_check
      check (discount_value >= 0);
  end if;
end $$;

-- =============================================================================
-- 3. Comentarios
-- =============================================================================
comment on column public.treatment_plans.discount_kind is
  'Tipo de descuento aplicado al subtotal mensual: none, percent (0-100), o fixed (monto USD).';
comment on column public.treatment_plans.discount_value is
  'Magnitud del descuento. Si kind=percent, es porcentaje 0-100. Si kind=fixed, es USD.';
comment on column public.monthly_session_cycles.discount_kind is
  'Snapshot del descuento aplicado al ciclo. Default desde el treatment_plan pero editable por ciclo.';


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0110_kinetic_invoices.sql
-- ────────────────────────────────────────────────────────────────────────
-- 0110_kinetic_invoices.sql
-- Extiende la tabla invoices para soportar facturas ligadas a niños (Kinetic)
-- en lugar de solo clientes (FM CRM).
--
-- El constraint vigente en 0048 hace client_id NOT NULL.
-- Aquí lo relajamos y añadimos child_id para poder emitir facturas por ciclo mensual.

-- 1. Quitar NOT NULL de client_id
ALTER TABLE public.invoices
  ALTER COLUMN client_id DROP NOT NULL;

-- 2. Agregar child_id FK
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS child_id uuid
    REFERENCES public.children(id) ON DELETE SET NULL;

-- 3. Constraint: al menos uno de los dos debe estar presente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoices'
      AND constraint_name = 'invoices_requires_owner'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_requires_owner
        CHECK (client_id IS NOT NULL OR child_id IS NOT NULL);
  END IF;
END $$;

-- 4. Índice para consultas por child_id (historial de facturas de un niño/familia)
CREATE INDEX IF NOT EXISTS idx_invoices_child_id
  ON public.invoices (child_id)
  WHERE child_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0111_cycles_partial_unique.sql
-- ────────────────────────────────────────────────────────────────────────
-- 0111_cycles_partial_unique.sql
-- El constraint UNIQUE en (child_id, period_month) impedía crear un nuevo ciclo
-- para un mes en el que ya había existido un ciclo cancelado.
-- Se reemplaza por un índice parcial que solo aplica a ciclos NO cancelados.

-- 1. Eliminar el constraint de unicidad global
ALTER TABLE public.monthly_session_cycles
  DROP CONSTRAINT IF EXISTS monthly_session_cycles_child_id_period_month_key;

-- 2. Crear índice único parcial: solo aplica a ciclos que NO están cancelados
CREATE UNIQUE INDEX IF NOT EXISTS monthly_session_cycles_active_unique
  ON public.monthly_session_cycles (child_id, period_month)
  WHERE status != 'cancelled';


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0112_children_photo.sql
-- ────────────────────────────────────────────────────────────────────────
-- 0112_children_photo.sql
-- Agrega foto del niño + bucket de almacenamiento

-- Columna photo_url en children (URL pública del bucket child-photos)
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Bucket child-photos (público, 5 MB máx, solo imágenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'child-photos',
  'child-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy SELECT para usuarios autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'child_photos_select'
  ) THEN
    CREATE POLICY child_photos_select
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'child-photos');
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0113_family_portal_invoice_rls.sql
-- ────────────────────────────────────────────────────────────────────────
-- 0113_family_portal_invoice_rls.sql
-- Portal de Padres — Fase D
-- Permite que usuarios de familia con can_billing=true vean facturas
-- Kinetic (child_id) de sus niños.

-- ── 1. RLS SELECT en invoices para familia ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoices'
      AND policyname = 'invoices_select_family'
  ) THEN
    CREATE POLICY invoices_select_family
      ON public.invoices FOR SELECT
      USING (
        child_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM public.family_users fu
            JOIN public.children c ON c.family_id = fu.family_id
           WHERE fu.user_id  = auth.uid()
             AND c.id        = invoices.child_id
             AND fu.can_billing = true
        )
      );
  END IF;
END $$;

-- ── 2. RLS SELECT en invoice_items para familia ──────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoice_items'
      AND policyname = 'invoice_items_select_family'
  ) THEN
    CREATE POLICY invoice_items_select_family
      ON public.invoice_items FOR SELECT
      USING (
        EXISTS (
          SELECT 1
            FROM public.invoices i
            JOIN public.family_users fu ON true
            JOIN public.children c ON c.family_id = fu.family_id
           WHERE i.id         = invoice_items.invoice_id
             AND i.child_id   = c.id
             AND fu.user_id   = auth.uid()
             AND fu.can_billing = true
        )
      );
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0114_progress_report_family_notes.sql
-- ────────────────────────────────────────────────────────────────────────
-- Notas opcionales del terapeuta visibles para la familia en informes cuatrimestrales.
-- Se muestran junto al archivo cuando el informe llega a la familia.

alter table public.progress_reports
  add column if not exists family_notes text;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0115_therapist_work_schedule.sql
-- ────────────────────────────────────────────────────────────────────────
-- Stage B: horarios laborales configurables por terapista + max horas semanales
-- Permite calcular ocupación real (horas agendadas / horas contractuales) y
-- detectar terapistas sobrecargadas o subutilizadas.

create table if not exists public.therapist_work_schedule (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=dom, 6=sáb
  start_time time not null,
  end_time time not null check (end_time > start_time),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists therapist_work_schedule_therapist_idx
  on public.therapist_work_schedule(therapist_id, day_of_week);

-- Máximo de horas semanales contractadas (opcional). Si null, se asume el
-- agregado de los bloques en therapist_work_schedule como capacidad teórica.
alter table public.users
  add column if not exists max_hours_per_week numeric(5,2);

-- RLS
alter table public.therapist_work_schedule enable row level security;

drop policy if exists "tws read agency" on public.therapist_work_schedule;
create policy "tws read agency" on public.therapist_work_schedule
  for select using (public.is_agency_user());

drop policy if exists "tws insert directora admin" on public.therapist_work_schedule;
create policy "tws insert directora admin" on public.therapist_work_schedule
  for insert with check (public.is_directora_or_admin());

drop policy if exists "tws update directora admin" on public.therapist_work_schedule;
create policy "tws update directora admin" on public.therapist_work_schedule
  for update using (public.is_directora_or_admin())
  with check (public.is_directora_or_admin());

drop policy if exists "tws delete directora admin" on public.therapist_work_schedule;
create policy "tws delete directora admin" on public.therapist_work_schedule
  for delete using (public.is_directora_or_admin());

-- Trigger updated_at
create trigger therapist_work_schedule_updated_at
  before update on public.therapist_work_schedule
  for each row execute function extensions.moddatetime(updated_at);

-- Grants
grant all on public.therapist_work_schedule to anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0116_waitlist_entries.sql
-- ────────────────────────────────────────────────────────────────────────
-- Stage C: lista de espera interna para familias que solicitan cita y no
-- pueden agendarse inmediatamente. Gestionada por coordinadora_familias /
-- coordinadora_terapias / directora / admin / recepcion.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'waitlist_status') then
    create type public.waitlist_status as enum (
      'waiting',
      'contacted',
      'scheduled',
      'dropped'
    );
  end if;
end $$;

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),

  -- Datos del niño
  child_full_name text not null,
  child_birthdate date,
  child_diagnosis text,

  -- Contacto del padre/madre
  parent_full_name text not null,
  parent_phone text not null,
  parent_email text,

  -- Necesidad terapéutica
  requested_service_type text not null check (requested_service_type in (
    'lenguaje', 'motricidad_gruesa', 'motricidad_fina', 'sensorial',
    'psicologica', 'ocupacional', 'fisica', 'lectoescritura',
    'funciones_ejecutivas', 'conductual', 'blue_kids', 'alim_deglu',
    'destreza_manual_pre_escritura', 'otra'
  )),
  preferred_therapist_id uuid references public.users(id) on delete set null,
  preferred_days text,  -- texto libre: "lunes/miércoles tarde"
  notes text,

  -- Origen (referido por médico, colegio, etc.)
  referral_source_id uuid references public.referral_sources(id) on delete set null,

  -- Estado y prioridad
  status public.waitlist_status not null default 'waiting',
  priority smallint not null default 0 check (priority between 0 and 2), -- 0=normal,1=alta,2=urgente

  -- Auditoría
  added_by_user_id uuid references public.users(id) on delete set null,
  added_at timestamptz not null default now(),
  contacted_at timestamptz,
  contacted_by_user_id uuid references public.users(id) on delete set null,
  dropped_at timestamptz,
  dropped_reason text,
  scheduled_child_id uuid references public.children(id) on delete set null,

  updated_at timestamptz not null default now()
);

create index if not exists waitlist_status_idx
  on public.waitlist_entries(status, requested_service_type);
create index if not exists waitlist_priority_idx
  on public.waitlist_entries(priority desc, added_at);

-- RLS
alter table public.waitlist_entries enable row level security;

drop policy if exists "waitlist read coord" on public.waitlist_entries;
create policy "waitlist read coord" on public.waitlist_entries
  for select using (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "waitlist insert coord" on public.waitlist_entries;
create policy "waitlist insert coord" on public.waitlist_entries
  for insert with check (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "waitlist update coord" on public.waitlist_entries;
create policy "waitlist update coord" on public.waitlist_entries
  for update using (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  )
  with check (
    public.is_directora_or_admin()
    or exists (
      select 1 from public.users
      where id = auth.uid()
      and role in ('coordinadora_familias','coordinadora_terapias','recepcion')
    )
  );

drop policy if exists "waitlist delete admin" on public.waitlist_entries;
create policy "waitlist delete admin" on public.waitlist_entries
  for delete using (public.is_directora_or_admin());

-- Trigger updated_at
create trigger waitlist_entries_updated_at
  before update on public.waitlist_entries
  for each row execute function extensions.moddatetime(updated_at);

-- Grants
grant all on public.waitlist_entries to anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0117_payroll.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0117 — Módulo de Planillas (payroll) Kinetic
--
-- Estructura para Fase 8 del plan estratégico: gestión de planillas mensuales
-- con cálculo automático de ISSS, AFP e ISR (El Salvador), sellado de período
-- (immutable tras cerrar), y firma digital del empleado al recibir su recibo.
--
-- Tablas nuevas:
--   payroll_fiscal_config   — constantes legales SV (versionadas por effective_from)
--   payroll_runs            — una fila por planilla mensual (cabecera)
--   payroll_items           — una fila por empleado dentro de una planilla
--
-- Columnas nuevas en users: campos salariales y fiscales.

-- ──────────────────────────────────────────────────────────────────────────
-- USERS — campos salariales y fiscales (todos nullable para retro-compat)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_salary_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS hourly_rate_usd    numeric(10,2),
  ADD COLUMN IF NOT EXISTS contract_type      text
    NOT NULL DEFAULT 'sin_contrato'
    CHECK (contract_type IN ('mensual_fijo', 'por_hora', 'sin_contrato')),
  ADD COLUMN IF NOT EXISTS dui                text,
  ADD COLUMN IF NOT EXISTS isss_number        text,
  ADD COLUMN IF NOT EXISTS afp_number         text,
  ADD COLUMN IF NOT EXISTS afp_provider       text
    CHECK (afp_provider IS NULL OR afp_provider IN ('crecer', 'confia')),
  ADD COLUMN IF NOT EXISTS hire_date          date;

COMMENT ON COLUMN users.monthly_salary_usd IS 'Salario base mensual fijo en USD. Null si contract_type != mensual_fijo.';
COMMENT ON COLUMN users.hourly_rate_usd    IS 'Tarifa por hora opcional para horas extras o contratos por hora.';
COMMENT ON COLUMN users.contract_type      IS 'mensual_fijo | por_hora | sin_contrato (default: no entra en planillas).';
COMMENT ON COLUMN users.dui                IS 'Documento Único de Identidad (formato libre 9 dígitos con guión).';
COMMENT ON COLUMN users.isss_number        IS 'Número de afiliación al ISSS.';
COMMENT ON COLUMN users.afp_number         IS 'Número único previsional (NUP) o equivalente.';
COMMENT ON COLUMN users.afp_provider       IS 'crecer | confia. Solo informativo para reportes.';
COMMENT ON COLUMN users.hire_date          IS 'Fecha de contratación. Útil para calcular aguinaldo y antigüedad.';

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_fiscal_config — constantes legales SV (versionadas)
-- ──────────────────────────────────────────────────────────────────────────
-- Una sola fila "activa" a la vez: la de mayor effective_from <= now().
-- Permite tener historial cuando cambien las leyes y mantener planillas
-- antiguas con sus números originales.

CREATE TABLE IF NOT EXISTS payroll_fiscal_config (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from         date NOT NULL,
  isss_employee_rate     numeric(6,4) NOT NULL,   -- 0.0300 = 3%
  isss_employer_rate     numeric(6,4) NOT NULL,   -- 0.0750 = 7.5%
  isss_cap_salary_usd    numeric(10,2) NOT NULL,  -- 1000.00
  afp_employee_rate      numeric(6,4) NOT NULL,   -- 0.0725
  afp_employer_rate      numeric(6,4) NOT NULL,   -- 0.0875
  afp_cap_salary_usd     numeric(10,2),           -- null = sin tope para MVP
  isr_brackets_json      jsonb NOT NULL,
    -- [
    --   { "from": 0, "to": 472, "rate": 0, "fixed": 0, "baseSubtract": 0 },
    --   { "from": 472.01, "to": 895.24, "rate": 0.10, "fixed": 17.67, "baseSubtract": 472 },
    --   { "from": 895.25, "to": 2038.10, "rate": 0.20, "fixed": 60, "baseSubtract": 895.24 },
    --   { "from": 2038.11, "to": null, "rate": 0.30, "fixed": 288.57, "baseSubtract": 2038.10 }
    -- ]
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid REFERENCES users(id),
  UNIQUE (effective_from)
);

COMMENT ON TABLE payroll_fiscal_config IS 'Constantes legales SV para cálculo de planilla. Versionable por effective_from.';

-- Seed con valores vigentes 2024-2026 (verificar con contador antes de planillas reales).
INSERT INTO payroll_fiscal_config (
  effective_from,
  isss_employee_rate, isss_employer_rate, isss_cap_salary_usd,
  afp_employee_rate, afp_employer_rate, afp_cap_salary_usd,
  isr_brackets_json,
  notes
)
VALUES (
  '2024-01-01',
  0.03, 0.075, 1000.00,
  0.0725, 0.0875, NULL,
  '[
    {"from": 0,       "to": 472,    "rate": 0.0,  "fixed": 0,      "baseSubtract": 0},
    {"from": 472.01,  "to": 895.24, "rate": 0.10, "fixed": 17.67,  "baseSubtract": 472},
    {"from": 895.25,  "to": 2038.10,"rate": 0.20, "fixed": 60.00,  "baseSubtract": 895.24},
    {"from": 2038.11, "to": null,   "rate": 0.30, "fixed": 288.57, "baseSubtract": 2038.10}
  ]'::jsonb,
  'Valores referenciales 2024-2026 (verificar con contador). ISSS 3%/7.5% tope $1000. AFP 7.25%/8.75% sin tope. ISR 4 tramos progresivos sobre base = bruto - ISSS - AFP.'
)
ON CONFLICT (effective_from) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_runs — cabecera de planilla mensual
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year              int NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month             int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status                   text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sealed', 'paid', 'cancelled')),
  fiscal_config_snapshot_json jsonb,   -- llenado al sellar (status='sealed')
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by_user_id       uuid REFERENCES users(id),
  sealed_at                timestamptz,
  sealed_by_user_id        uuid REFERENCES users(id),
  paid_at                  timestamptz,
  paid_by_user_id          uuid REFERENCES users(id),
  cancelled_at             timestamptz,
  cancelled_by_user_id     uuid REFERENCES users(id),
  cancel_reason            text,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE payroll_runs IS 'Cabecera de planilla mensual. Una por mes (active = status != cancelled).';

-- Una sola planilla activa por (año, mes). Permite múltiples canceladas.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_active_unique
  ON payroll_runs (period_year, period_month)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS payroll_runs_period_idx
  ON payroll_runs (period_year DESC, period_month DESC);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION trg_payroll_runs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_runs_updated_at ON payroll_runs;
CREATE TRIGGER payroll_runs_updated_at
  BEFORE UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION trg_payroll_runs_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- payroll_items — una fila por empleado en una planilla
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id           uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users(id),

  -- Snapshot del usuario al momento de sellar (jsonb con: full_name, dui,
  -- isss_number, afp_number, afp_provider, role, contract_type)
  user_snapshot_json       jsonb,

  -- Entradas
  base_salary_usd          numeric(10,2) NOT NULL DEFAULT 0,
  extra_hours              numeric(8,2)  NOT NULL DEFAULT 0,
  extra_hours_rate_usd     numeric(10,2),                 -- snapshot del hourly_rate
  extra_hours_amount_usd   numeric(10,2) NOT NULL DEFAULT 0,
  bonus_usd                numeric(10,2) NOT NULL DEFAULT 0,    -- bono o pago adicional
  other_deductions_usd     numeric(10,2) NOT NULL DEFAULT 0,    -- p.ej. anticipo de salario

  -- Cálculos
  gross_total_usd          numeric(10,2) NOT NULL DEFAULT 0,
  isss_employee_usd        numeric(10,2) NOT NULL DEFAULT 0,
  afp_employee_usd         numeric(10,2) NOT NULL DEFAULT 0,
  isr_usd                  numeric(10,2) NOT NULL DEFAULT 0,
  total_deductions_usd     numeric(10,2) NOT NULL DEFAULT 0,
  net_pay_usd              numeric(10,2) NOT NULL DEFAULT 0,

  -- Aportes patronales (no afectan al neto del empleado, pero se reportan)
  isss_employer_usd        numeric(10,2) NOT NULL DEFAULT 0,
  afp_employer_usd         numeric(10,2) NOT NULL DEFAULT 0,
  employer_cost_usd        numeric(10,2) NOT NULL DEFAULT 0,    -- gross + isss_emp + afp_emp

  -- Métricas opcionales (informativas, para validar el sueldo si es por horas)
  hours_worked_from_appointments numeric(8,2),
  hours_worked_from_sessions     numeric(8,2),

  notes                    text,

  -- Firma del empleado
  signed_at                timestamptz,
  signed_ip                text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (payroll_run_id, user_id)
);

COMMENT ON TABLE payroll_items IS 'Detalle de planilla por empleado.';

CREATE INDEX IF NOT EXISTS payroll_items_user_idx ON payroll_items (user_id);
CREATE INDEX IF NOT EXISTS payroll_items_run_idx  ON payroll_items (payroll_run_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_payroll_items_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_items_updated_at ON payroll_items;
CREATE TRIGGER payroll_items_updated_at
  BEFORE UPDATE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION trg_payroll_items_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — Row Level Security
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE payroll_fiscal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items         ENABLE ROW LEVEL SECURITY;

-- Helper: rol del usuario actual
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- ── payroll_fiscal_config ──
DROP POLICY IF EXISTS payroll_fiscal_config_select ON payroll_fiscal_config;
CREATE POLICY payroll_fiscal_config_select ON payroll_fiscal_config
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_fiscal_config_write ON payroll_fiscal_config;
CREATE POLICY payroll_fiscal_config_write ON payroll_fiscal_config
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');

-- ── payroll_runs: solo admin/directora/contable ──
DROP POLICY IF EXISTS payroll_runs_select ON payroll_runs;
CREATE POLICY payroll_runs_select ON payroll_runs
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_runs_insert ON payroll_runs;
CREATE POLICY payroll_runs_insert ON payroll_runs
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_runs_update ON payroll_runs;
CREATE POLICY payroll_runs_update ON payroll_runs
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_runs_delete ON payroll_runs;
CREATE POLICY payroll_runs_delete ON payroll_runs
  FOR DELETE TO authenticated
  USING (current_user_role() = 'admin' AND status = 'draft');

-- ── payroll_items: admin/directora/contable + empleado lee SU item ──
DROP POLICY IF EXISTS payroll_items_select ON payroll_items;
CREATE POLICY payroll_items_select ON payroll_items
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('admin', 'directora', 'contable')
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS payroll_items_insert ON payroll_items;
CREATE POLICY payroll_items_insert ON payroll_items
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS payroll_items_update_admin ON payroll_items;
CREATE POLICY payroll_items_update_admin ON payroll_items
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

-- Empleado puede firmar SU item (UPDATE solo permitido vía RPC, ver abajo)

DROP POLICY IF EXISTS payroll_items_delete ON payroll_items;
CREATE POLICY payroll_items_delete ON payroll_items
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

-- ──────────────────────────────────────────────────────────────────────────
-- RPC sign_my_payroll_item — empleado firma recepción de su recibo
-- ──────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER para evitar política de UPDATE adicional. Solo permite
-- al dueño del item firmar, y solo si el run está sealed o paid.

CREATE OR REPLACE FUNCTION sign_my_payroll_item(p_item_id uuid, p_signed_ip text)
RETURNS payroll_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item payroll_items;
  v_run  payroll_runs;
BEGIN
  SELECT * INTO v_item FROM payroll_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;
  IF v_item.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_item.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_signed';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = v_item.payroll_run_id;
  IF v_run.status NOT IN ('sealed', 'paid') THEN
    RAISE EXCEPTION 'run_not_sealed';
  END IF;

  UPDATE payroll_items
    SET signed_at = now(),
        signed_ip = COALESCE(p_signed_ip, signed_ip)
    WHERE id = p_item_id
    RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION sign_my_payroll_item(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_my_payroll_item(uuid, text) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0118_general_expenses.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0118 — Egresos / gastos generales Kinetic
--
-- Tabla para registrar gastos operativos del centro que NO son planilla:
-- renta, servicios públicos (luz/agua/internet/teléfono), transporte,
-- suscripciones de software, material didáctico, mantenimiento, marketing,
-- impuestos no-laborales, etc.
--
-- Las planillas (payroll_runs + payroll_items) se agregan aparte en los
-- reportes de egresos. Esta tabla solo es para "todo lo demás".

CREATE TABLE IF NOT EXISTS general_expenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category            text NOT NULL
    CHECK (category IN (
      'renta',
      'servicios_publicos',
      'transporte',
      'sistema_software',
      'material_didactico',
      'mantenimiento',
      'marketing',
      'comunicacion',
      'profesional',
      'impuestos',
      'otros'
    )),
  /** Sub-categoría libre (ej. 'agua', 'luz', 'gasolina', 'hosting'). */
  subcategory         text,
  description         text,
  amount_usd          numeric(10,2) NOT NULL CHECK (amount_usd >= 0),
  /** Fecha en que se incurrió o pagó el gasto. */
  expense_date        date NOT NULL,
  payment_method      text,            -- 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque'
  provider            text,            -- a quién se le pagó (CAESS, ANDA, etc.)
  invoice_reference   text,            -- nº de factura/recibo

  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by_user_id  uuid REFERENCES users(id)
);

COMMENT ON TABLE general_expenses IS 'Gastos operativos del centro (no incluye planillas, que tienen su propia tabla).';

CREATE INDEX IF NOT EXISTS general_expenses_date_idx
  ON general_expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS general_expenses_category_idx
  ON general_expenses (category, expense_date DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_general_expenses_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS general_expenses_updated_at ON general_expenses;
CREATE TRIGGER general_expenses_updated_at
  BEFORE UPDATE ON general_expenses
  FOR EACH ROW EXECUTE FUNCTION trg_general_expenses_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — solo admin / directora / contable
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE general_expenses ENABLE ROW LEVEL SECURITY;

-- current_user_role() ya existe (creada en 0117_payroll.sql)

DROP POLICY IF EXISTS general_expenses_select ON general_expenses;
CREATE POLICY general_expenses_select ON general_expenses
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS general_expenses_insert ON general_expenses;
CREATE POLICY general_expenses_insert ON general_expenses
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS general_expenses_update ON general_expenses;
CREATE POLICY general_expenses_update ON general_expenses
  FOR UPDATE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'))
  WITH CHECK (current_user_role() IN ('admin', 'directora', 'contable'));

DROP POLICY IF EXISTS general_expenses_delete ON general_expenses;
CREATE POLICY general_expenses_delete ON general_expenses
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin', 'directora', 'contable'));


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0119_child_attachments.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0119 — Adjuntos unificados por niño (cross-entity)
--
-- Tabla única `child_attachments` que reemplaza el modelo "1 archivo por
-- session_report" y "1 archivo por progress_report". Cada fila representa un
-- archivo subido al bucket `reports-files` y puede estar opcionalmente
-- vinculada a una cita, un session_report o un progress_report (one-of).
--
-- Usos:
--   - Notas/tareas post-sesión con varios adjuntos por cita visibles a la
--     familia desde /portal/agenda.
--   - Documentos adicionales al cierre de un informe cuatrimestral.
--   - Biblioteca unificada de descargas en /portal/descargas.

CREATE TABLE IF NOT EXISTS child_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,

  -- Vinculación opcional (idealmente solo uno seteado por fila — no se fuerza
  -- vía CHECK para permitir flexibilidad futura, pero la UI sube con uno solo).
  appointment_id      uuid REFERENCES appointments(id) ON DELETE CASCADE,
  session_report_id   uuid REFERENCES session_reports(id) ON DELETE CASCADE,
  progress_report_id  uuid REFERENCES progress_reports(id) ON DELETE CASCADE,

  -- Archivo en bucket reports-files (path completo)
  file_url            text NOT NULL,
  file_name           text NOT NULL,
  file_size_bytes     integer,
  file_mime_type      text,

  -- Meta visibles a la familia
  title               text,
  description         text,
  kind                text NOT NULL DEFAULT 'otro'
    CHECK (kind IN ('tarea', 'evaluacion', 'imagen', 'informe_adicional', 'otro')),

  -- Visibilidad / audit
  visible_to_family   boolean NOT NULL DEFAULT true,
  uploaded_by_user_id uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_attachments IS
  'Adjuntos unificados por niño: tareas, imágenes, evaluaciones, documentos extra. Visible a la familia si visible_to_family=true.';

CREATE INDEX IF NOT EXISTS child_attachments_child_idx
  ON child_attachments (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS child_attachments_appointment_idx
  ON child_attachments (appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS child_attachments_session_report_idx
  ON child_attachments (session_report_id)
  WHERE session_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS child_attachments_progress_report_idx
  ON child_attachments (progress_report_id)
  WHERE progress_report_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_child_attachments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_attachments_updated_at ON child_attachments;
CREATE TRIGGER child_attachments_updated_at
  BEFORE UPDATE ON child_attachments
  FOR EACH ROW EXECUTE FUNCTION trg_child_attachments_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE child_attachments ENABLE ROW LEVEL SECURITY;

-- current_user_role() ya existe (creada en 0117_payroll.sql)

-- Staff (admin / directora / coordinadora_* / terapista / maestra / recepcion /
-- contable / supervisor) puede leer todos los adjuntos.
DROP POLICY IF EXISTS child_attachments_select_staff ON child_attachments;
CREATE POLICY child_attachments_select_staff ON child_attachments
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion', 'contable'
    )
  );

-- Family ve solo adjuntos visibles de sus propios niños.
DROP POLICY IF EXISTS child_attachments_select_family ON child_attachments;
CREATE POLICY child_attachments_select_family ON child_attachments
  FOR SELECT TO authenticated
  USING (
    visible_to_family = true
    AND EXISTS (
      SELECT 1
      FROM children c
      JOIN family_users fu ON fu.family_id = c.family_id
      WHERE c.id = child_attachments.child_id
        AND fu.user_id = auth.uid()
    )
  );

-- Staff con permiso operativo puede insertar.
DROP POLICY IF EXISTS child_attachments_insert ON child_attachments;
CREATE POLICY child_attachments_insert ON child_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion'
    )
  );

-- Staff puede actualizar (toggle visible_to_family, editar título/descripción).
DROP POLICY IF EXISTS child_attachments_update ON child_attachments;
CREATE POLICY child_attachments_update ON child_attachments
  FOR UPDATE TO authenticated
  USING (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion'
    )
  )
  WITH CHECK (
    current_user_role() IN (
      'admin', 'directora', 'supervisor',
      'coordinadora_familias', 'coordinadora_terapias',
      'terapista', 'maestra', 'recepcion'
    )
  );

-- Borrado: solo el autor o admin/directora.
DROP POLICY IF EXISTS child_attachments_delete ON child_attachments;
CREATE POLICY child_attachments_delete ON child_attachments
  FOR DELETE TO authenticated
  USING (
    current_user_role() IN ('admin', 'directora')
    OR uploaded_by_user_id = auth.uid()
  );


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0120_session_report_optional_morning.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0120 — submit_session_report: actividades opcional para
-- niños en programa matutino.
--
-- Antes: el RPC siempre exigía `actividades` no vacío.
-- Ahora: si `children.enrolled_program IS NOT NULL` (el niño está inscrito
-- en programa matutino tipo blue_kids / learning_kids / aula_educativa),
-- el reporte puede enviarse sin actividades. Para terapias 1-a-1 sigue
-- siendo obligatorio.

CREATE OR REPLACE FUNCTION public.submit_session_report(
  p_report_id uuid
) RETURNS public.session_reports LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report public.session_reports;
  v_enrolled_program text;
BEGIN
  SELECT * INTO v_report
    FROM public.session_reports
   WHERE id = p_report_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found';
  END IF;

  -- Autoriza al terapista autor o, durante impersonación, al admin real.
  IF v_report.therapist_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_report.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'invalid_state_for_submit';
  END IF;

  -- Buscar si el niño está en programa matutino (entonces actividades opcional).
  SELECT enrolled_program INTO v_enrolled_program
    FROM public.children
   WHERE id = v_report.child_id;

  -- Solo exigir actividades cuando NO hay programa matutino y NO es upload_kind='file'.
  IF (v_enrolled_program IS NULL)
     AND (COALESCE(v_report.upload_kind, 'editor') = 'editor')
     AND length(trim(COALESCE(v_report.actividades, ''))) = 0 THEN
    RAISE EXCEPTION 'actividades_required';
  END IF;

  UPDATE public.session_reports
     SET status = 'submitted',
         submitted_at = now(),
         rejected_by_user_id = null,
         rejected_at = null,
         rejection_reason = null
   WHERE id = p_report_id
   RETURNING * INTO v_report;

  RETURN v_report;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0121_intake_pipeline.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0121 — Pipeline completo de admisión Kinetic
--
-- Crea:
--   1. intake_phase_catalog (17 fases sembradas)
--   2. waitlist_entries.current_phase_code (+ backfill)
--   3. children.current_phase_code (+ backfill)
--   4. trigger sync_legacy_phase_fields (back-compat con intake_phase + treatment_status)
--   5. child_phase_history (audit log de transiciones)
--   6. child_discharge_records (alta / retiro firmable)
--   7. dashboard_alerts (banner notificaciones)
--
-- Reusa current_user_role() (creada en 0117_payroll.sql) para RLS.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CATÁLOGO DE FASES
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intake_phase_catalog (
  code                         text PRIMARY KEY,
  group_number                 smallint NOT NULL CHECK (group_number BETWEEN 1 AND 5),
  group_name                   text NOT NULL,
  sub_order                    smallint NOT NULL CHECK (sub_order >= 1),
  label                        text NOT NULL,
  description                  text,
  is_optional                  boolean NOT NULL DEFAULT false,
  is_waitlist_visible          boolean NOT NULL DEFAULT true,
  is_terminal                  boolean NOT NULL DEFAULT false,
  creates_child                boolean NOT NULL DEFAULT false,
  cancels_future_appointments  boolean NOT NULL DEFAULT false,
  active                       boolean NOT NULL DEFAULT true,
  sort_order                   integer NOT NULL,
  created_at                   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE intake_phase_catalog IS
  'Catálogo editable de las 17 sub-fases del pipeline de admisión Kinetic (5 grupos). Referenciado por waitlist_entries.current_phase_code y children.current_phase_code.';

CREATE UNIQUE INDEX IF NOT EXISTS intake_phase_catalog_order_idx
  ON intake_phase_catalog (group_number, sub_order);

-- Seed (idempotente)
INSERT INTO intake_phase_catalog (
  code, group_number, group_name, sub_order, label, description,
  is_optional, is_waitlist_visible, is_terminal,
  creates_child, cancels_future_appointments, sort_order
) VALUES
  ('1_1_contacto_inicial',       1, 'Primer contacto',        1, 'Contacto Inicial',
    'Familia realizó consulta por WhatsApp, llamada, redes o referencia.', false, true,  false, false, false, 11),
  ('1_2_informacion_enviada',    1, 'Primer contacto',        2, 'Información Enviada',
    'Se compartió información institucional, servicios, costos o proceso.', false, true,  false, false, false, 12),
  ('1_3_entrevista_agendada',    1, 'Primer contacto',        3, 'Entrevista Agendada',
    'La familia confirmó cita de conocimiento.', false, true,  false, false, false, 13),

  ('2_1_entrevista_conocimiento', 2, 'Proceso de Admisión',   1, 'Entrevista de Conocimiento',
    'Primera reunión con padres/familia.', false, true,  false, false, false, 21),
  ('2_2_observacion_clinica',    2, 'Proceso de Admisión',    2, 'Observación Clínica',
    'Observación inicial del niño dentro del centro.', false, true,  false, false, false, 22),
  ('2_3_observacion_escolar',    2, 'Proceso de Admisión',    3, 'Observación Escolar',
    'Observación en colegio, kínder o entorno educativo.', true,  true,  false, false, false, 23),
  ('2_4_propuesta_evaluacion',   2, 'Proceso de Admisión',    4, 'Propuesta de Evaluación',
    'Se sugieren áreas a evaluar según hallazgos.', false, true,  false, false, false, 24),
  ('2_5_evaluacion_en_proceso',  2, 'Proceso de Admisión',    5, 'Evaluación en Proceso',
    'El niño está siendo evaluado.', false, true,  false, false, false, 25),
  ('2_6_levantamiento_informes', 2, 'Proceso de Admisión',    6, 'Levantamiento de Informes',
    'Profesionales redactando resultados e interpretación.', false, true,  false, false, false, 26),
  ('2_7_informes_entregados',    2, 'Proceso de Admisión',    7, 'Informes Entregados',
    'Se entregaron resultados y devolución a familia.', false, true,  false, false, false, 27),

  ('3_1_propuesta_terapeutica',  3, 'Inicio Terapéutico',     1, 'Propuesta Terapéutica',
    'Se recomienda plan de terapias y frecuencia.', false, true,  false, false, false, 31),
  ('3_2_inscripcion_activa',     3, 'Inicio Terapéutico',     2, 'Inscripción / Ingreso Activo',
    'Familia acepta proceso — se crea automáticamente el registro del niño.', false, true,  false, true,  false, 32),
  ('3_3_activo_en_terapias',     3, 'Inicio Terapéutico',     3, 'Activo en Terapias',
    'Recibiendo terapias regularmente.', false, false, false, false, false, 33),

  ('4_1_pausa_temporal',         4, 'Seguimiento',            1, 'Pausa Temporal',
    'Suspensión temporal por vacaciones, salud, economía, etc.', false, false, false, false, true,  41),
  ('4_2_seguimiento_pendiente',  4, 'Seguimiento',            2, 'Seguimiento Pendiente',
    'Familia no confirma continuidad pero sigue en contacto.', false, false, false, false, true,  42),

  ('5_1_alta_terapeutica',       5, 'Cierre',                 1, 'Alta Terapéutica',
    'Objetivos cumplidos; egreso positivo.', false, false, true,  false, true,  51),
  ('5_2_retirado',               5, 'Cierre',                 2, 'Retirado',
    'Finalización por decisión familiar, cambio de centro u otras razones.', false, false, true,  false, true,  52)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE intake_phase_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_phase_catalog_select ON intake_phase_catalog;
CREATE POLICY intake_phase_catalog_select ON intake_phase_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS intake_phase_catalog_modify ON intake_phase_catalog;
CREATE POLICY intake_phase_catalog_modify ON intake_phase_catalog
  FOR ALL TO authenticated
  USING (current_user_role() IN ('admin', 'directora'))
  WITH CHECK (current_user_role() IN ('admin', 'directora'));

-- ──────────────────────────────────────────────────────────────────────────
-- 2. EXTENSIÓN waitlist_entries
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS current_phase_code text
    REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE;

UPDATE waitlist_entries SET current_phase_code = CASE
  WHEN status = 'waiting'   THEN '1_1_contacto_inicial'
  WHEN status = 'contacted' THEN '1_2_informacion_enviada'
  WHEN status = 'scheduled' THEN '3_2_inscripcion_activa'
  WHEN status = 'dropped'   THEN '5_2_retirado'
  ELSE '1_1_contacto_inicial'
END
WHERE current_phase_code IS NULL;

ALTER TABLE waitlist_entries
  ALTER COLUMN current_phase_code SET DEFAULT '1_1_contacto_inicial',
  ALTER COLUMN current_phase_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS waitlist_current_phase_idx
  ON waitlist_entries (current_phase_code);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. EXTENSIÓN children
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS current_phase_code text
    REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE;

UPDATE children SET current_phase_code = CASE
  WHEN treatment_status IN ('discharged_conditional','discharged_final') THEN '5_1_alta_terapeutica'
  WHEN treatment_status = 'dropped'                                     THEN '5_2_retirado'
  WHEN treatment_status = 'paused'                                      THEN '4_1_pausa_temporal'
  WHEN intake_phase = 'alta'                                            THEN '5_1_alta_terapeutica'
  WHEN intake_phase = 'en_terapias'                                     THEN '3_3_activo_en_terapias'
  WHEN intake_phase IN ('propuesta_plan_terapias',
                        'propuesta_economica_terapias')                 THEN '3_1_propuesta_terapeutica'
  WHEN intake_phase = 'informe_resultados'                              THEN '2_7_informes_entregados'
  WHEN intake_phase IN ('en_observacion_evaluacion',
                        'agenda_observacion')                           THEN '2_5_evaluacion_en_proceso'
  WHEN intake_phase IN ('propuesta_observacion_evaluacion',
                        'propuesta_economica_evaluacion')               THEN '2_4_propuesta_evaluacion'
  WHEN intake_phase = 'entrevista_directora'                            THEN '2_1_entrevista_conocimiento'
  WHEN intake_phase IN ('bateria_preguntas','solicitud_informacion')    THEN '1_1_contacto_inicial'
  ELSE '3_3_activo_en_terapias'
END
WHERE current_phase_code IS NULL;

ALTER TABLE children
  ALTER COLUMN current_phase_code SET DEFAULT '3_3_activo_en_terapias',
  ALTER COLUMN current_phase_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS children_current_phase_idx
  ON children (current_phase_code);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER de sincronización legacy (intake_phase + treatment_status)
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_legacy_phase_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_phase_code IS DISTINCT FROM OLD.current_phase_code THEN
    NEW.intake_phase_changed_at := now();
    NEW.treatment_status_changed_at := now();

    CASE NEW.current_phase_code
      WHEN '1_1_contacto_inicial'        THEN NEW.intake_phase := 'solicitud_informacion';        NEW.treatment_status := 'active';
      WHEN '1_2_informacion_enviada'     THEN NEW.intake_phase := 'solicitud_informacion';        NEW.treatment_status := 'active';
      WHEN '1_3_entrevista_agendada'     THEN NEW.intake_phase := 'bateria_preguntas';            NEW.treatment_status := 'active';
      WHEN '2_1_entrevista_conocimiento' THEN NEW.intake_phase := 'entrevista_directora';         NEW.treatment_status := 'active';
      WHEN '2_2_observacion_clinica'     THEN NEW.intake_phase := 'agenda_observacion';           NEW.treatment_status := 'active';
      WHEN '2_3_observacion_escolar'     THEN NEW.intake_phase := 'agenda_observacion';           NEW.treatment_status := 'active';
      WHEN '2_4_propuesta_evaluacion'    THEN NEW.intake_phase := 'propuesta_observacion_evaluacion'; NEW.treatment_status := 'active';
      WHEN '2_5_evaluacion_en_proceso'   THEN NEW.intake_phase := 'en_observacion_evaluacion';    NEW.treatment_status := 'active';
      WHEN '2_6_levantamiento_informes'  THEN NEW.intake_phase := 'informe_resultados';           NEW.treatment_status := 'active';
      WHEN '2_7_informes_entregados'     THEN NEW.intake_phase := 'informe_resultados';           NEW.treatment_status := 'active';
      WHEN '3_1_propuesta_terapeutica'   THEN NEW.intake_phase := 'propuesta_plan_terapias';      NEW.treatment_status := 'active';
      WHEN '3_2_inscripcion_activa'      THEN NEW.intake_phase := 'propuesta_economica_terapias'; NEW.treatment_status := 'active';
      WHEN '3_3_activo_en_terapias'      THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'active';
      WHEN '4_1_pausa_temporal'          THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'paused';
      WHEN '4_2_seguimiento_pendiente'   THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'active';
      WHEN '5_1_alta_terapeutica'        THEN NEW.intake_phase := 'alta';                         NEW.treatment_status := 'discharged_final';
      WHEN '5_2_retirado'                THEN NEW.intake_phase := 'en_terapias';                  NEW.treatment_status := 'dropped';
      ELSE -- noop
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS children_sync_legacy_phase ON children;
CREATE TRIGGER children_sync_legacy_phase
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION sync_legacy_phase_fields();

-- ──────────────────────────────────────────────────────────────────────────
-- 5. child_phase_history (audit log de transiciones)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS child_phase_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            uuid REFERENCES children(id) ON DELETE CASCADE,
  waitlist_entry_id   uuid REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  from_phase_code     text REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE,
  to_phase_code       text NOT NULL REFERENCES intake_phase_catalog(code) ON UPDATE CASCADE,
  notes               text,
  changed_by_user_id  uuid REFERENCES users(id),
  changed_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_phase_history_target CHECK (
    (child_id IS NOT NULL AND waitlist_entry_id IS NULL)
    OR (child_id IS NULL AND waitlist_entry_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS child_phase_history_child_idx
  ON child_phase_history (child_id, changed_at DESC) WHERE child_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS child_phase_history_waitlist_idx
  ON child_phase_history (waitlist_entry_id, changed_at DESC) WHERE waitlist_entry_id IS NOT NULL;

ALTER TABLE child_phase_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_phase_history_select_staff ON child_phase_history;
CREATE POLICY child_phase_history_select_staff ON child_phase_history
  FOR SELECT TO authenticated
  USING (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','maestra','recepcion','contable'
  ));

DROP POLICY IF EXISTS child_phase_history_insert ON child_phase_history;
CREATE POLICY child_phase_history_insert ON child_phase_history
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','maestra','recepcion'
  ));

-- ──────────────────────────────────────────────────────────────────────────
-- 6. child_discharge_records (alta / retiro firmable)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS child_discharge_records (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                  uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  discharge_type            text NOT NULL CHECK (discharge_type IN ('alta','retiro')),
  discharge_date            date NOT NULL DEFAULT CURRENT_DATE,

  child_snapshot_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  therapies_snapshot_json   jsonb NOT NULL DEFAULT '[]'::jsonb,

  total_sessions_attended   integer,
  attendance_rate_pct       numeric(5,2),
  total_replacements        integer,

  objectives_achieved       text,
  recommendations           text,
  follow_up_plan            text,
  discharge_reason          text,

  signed_by_therapist_id    uuid REFERENCES users(id),
  signed_by_therapist_name  text,
  signed_by_therapist_at    timestamptz,
  signed_by_directora_id    uuid REFERENCES users(id),
  signed_by_directora_name  text,
  signed_by_directora_at    timestamptz,

  status                    text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','signed','sent_to_family')),
  pdf_generated_at          timestamptz,
  created_by_user_id        uuid REFERENCES users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_discharge_records IS
  'Cartas de alta terapéutica y constancias de retiro. Snapshots de datos al momento del cierre. Firmadas por terapista y directora.';

CREATE INDEX IF NOT EXISTS child_discharge_records_child_idx
  ON child_discharge_records (child_id, discharge_date DESC);

CREATE OR REPLACE FUNCTION trg_child_discharge_records_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_discharge_records_updated_at ON child_discharge_records;
CREATE TRIGGER child_discharge_records_updated_at
  BEFORE UPDATE ON child_discharge_records
  FOR EACH ROW EXECUTE FUNCTION trg_child_discharge_records_updated_at();

ALTER TABLE child_discharge_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_discharge_records_select_staff ON child_discharge_records;
CREATE POLICY child_discharge_records_select_staff ON child_discharge_records
  FOR SELECT TO authenticated
  USING (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','maestra','recepcion','contable'
  ));

DROP POLICY IF EXISTS child_discharge_records_select_family ON child_discharge_records;
CREATE POLICY child_discharge_records_select_family ON child_discharge_records
  FOR SELECT TO authenticated
  USING (
    status = 'sent_to_family'
    AND EXISTS (
      SELECT 1 FROM children c
      JOIN family_users fu ON fu.family_id = c.family_id
      WHERE c.id = child_discharge_records.child_id
        AND fu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS child_discharge_records_insert ON child_discharge_records;
CREATE POLICY child_discharge_records_insert ON child_discharge_records
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ));

DROP POLICY IF EXISTS child_discharge_records_update ON child_discharge_records;
CREATE POLICY child_discharge_records_update ON child_discharge_records
  FOR UPDATE TO authenticated
  USING (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ))
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ));

DROP POLICY IF EXISTS child_discharge_records_delete ON child_discharge_records;
CREATE POLICY child_discharge_records_delete ON child_discharge_records
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','directora'));

-- ──────────────────────────────────────────────────────────────────────────
-- 7. dashboard_alerts (banner en dashboards)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_alerts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type          text NOT NULL CHECK (alert_type IN ('discharge','dropout','phase_milestone')),
  child_id            uuid REFERENCES children(id) ON DELETE CASCADE,
  message             text NOT NULL,
  visible_to_roles    text[] NOT NULL DEFAULT ARRAY[
    'admin','directora','coordinadora_familias','coordinadora_terapias'
  ],
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_user_id  uuid REFERENCES users(id)
);

COMMENT ON TABLE dashboard_alerts IS
  'Banners temporales (típicamente 7 días) en dashboards de coordinación. Para alta/retiro y otros milestones de fase.';

-- now() no es IMMUTABLE, no puede ir en un WHERE de índice. Usamos un
-- índice simple sobre expires_at; las queries filtran con `expires_at > now()`.
CREATE INDEX IF NOT EXISTS dashboard_alerts_active_idx
  ON dashboard_alerts (expires_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_alerts_child_idx
  ON dashboard_alerts (child_id) WHERE child_id IS NOT NULL;

ALTER TABLE dashboard_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_alerts_select ON dashboard_alerts;
CREATE POLICY dashboard_alerts_select ON dashboard_alerts
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY(visible_to_roles));

DROP POLICY IF EXISTS dashboard_alerts_insert ON dashboard_alerts;
CREATE POLICY dashboard_alerts_insert ON dashboard_alerts
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() IN (
    'admin','directora','supervisor',
    'coordinadora_familias','coordinadora_terapias',
    'terapista','recepcion'
  ));

DROP POLICY IF EXISTS dashboard_alerts_delete ON dashboard_alerts;
CREATE POLICY dashboard_alerts_delete ON dashboard_alerts
  FOR DELETE TO authenticated
  USING (current_user_role() IN ('admin','directora'));


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0122_waitlist_form_fields.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0122 — Campos del formulario de prospectos (Google Form 2022 → CRM)
--
-- Recepción levantará el form de "Prospectos Kinetic" directamente desde el
-- CRM (reemplaza Google Forms). Estos son los campos que tiene el form vivo
-- y que faltan en `waitlist_entries`:
--
--   - Edad (texto libre — "5", "3 años 8 meses", etc.)
--   - Tiene evaluación previa (Sí/No)
--   - Cómo se enteró: Redes Sociales | Médico | Amigo o familiar |
--                     Reingreso | Colegio | Otro
--   - Interesado en (texto libre — qué quiere la familia)
--
-- "Estado del prospecto" del form se mapea a `current_phase_code` (mig 0121).
-- "Fecha" se mapea a `added_at`.
-- Nombre niño/a, padre/madre, correo, celular, diagnóstico ya existían.

ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS child_age_text          text,
  ADD COLUMN IF NOT EXISTS has_previous_evaluation boolean,
  ADD COLUMN IF NOT EXISTS referral_channel        text
    CHECK (referral_channel IS NULL OR referral_channel IN (
      'redes_sociales', 'medico', 'amigo_familiar',
      'reingreso', 'colegio', 'otro'
    )),
  ADD COLUMN IF NOT EXISTS referral_channel_other  text,
  ADD COLUMN IF NOT EXISTS interest_text           text;

COMMENT ON COLUMN waitlist_entries.child_age_text IS
  'Edad del niño tal como la entró recepción (puede ser libre: "5", "3 años 8 meses").';
COMMENT ON COLUMN waitlist_entries.has_previous_evaluation IS
  'La familia trae evaluación previa de otro centro.';
COMMENT ON COLUMN waitlist_entries.referral_channel IS
  'Canal por el que se enteró del centro (cómo nos conoció).';
COMMENT ON COLUMN waitlist_entries.referral_channel_other IS
  'Texto libre cuando referral_channel = otro.';
COMMENT ON COLUMN waitlist_entries.interest_text IS
  'Qué programa o terapia le interesa, en palabras de recepción.';


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0123_drop_waitlist_status_legacy.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0123 — Limpieza legacy de waitlist
--
-- El status enum era del modelo viejo de 4 estados antes de mig 0121.
-- Ahora cada waitlist_entry vive en una sub-fase del catálogo (current_phase_code).
-- Eliminar:
--   - waitlist_entries.status (columna)
--   - enum waitlist_status (tipo)
--   - trigger children_sync_legacy_phase + función sync_legacy_phase_fields
--     (mantenía intake_phase/treatment_status legacy en sync — ya no aplica para waitlist;
--     se conserva el mapeo en children porque otros módulos aún lo leen, fase 2)

ALTER TABLE waitlist_entries DROP COLUMN IF EXISTS status CASCADE;

-- El enum puede dropearse cuando ya nadie lo referencia.
DROP TYPE IF EXISTS waitlist_status CASCADE;


-- ────────────────────────────────────────────────────────────────────────
-- supabase/migrations/0124_drop_children_legacy_phase_fields.sql
-- ────────────────────────────────────────────────────────────────────────
-- Migración 0124 — Limpieza fase 2: drop intake_phase / treatment_status
--
-- Estos campos eran del modelo pre-pipeline. Ahora `current_phase_code`
-- (FK a intake_phase_catalog) cubre ambos roles: fase del intake +
-- estado del tratamiento.
--
-- Borrar:
--   - Trigger children_sync_legacy_phase + función sync_legacy_phase_fields
--   - children.intake_phase + intake_phase_changed_at
--   - children.treatment_status + treatment_status_changed_at + treatment_status_notes
--   - índices asociados
--
-- Conservar (porque modelan otra dimensión):
--   - children.enrolled_program (programa matutino — blue_kids / learning_kids / aula_educativa)
--   - children.enrollment_started_at / enrollment_ended_at

-- ── 1. Drop trigger + función de sync legacy ────────────────────────
DROP TRIGGER IF EXISTS children_sync_legacy_phase ON children;
DROP FUNCTION IF EXISTS sync_legacy_phase_fields() CASCADE;

-- ── 2. Drop columnas legacy ─────────────────────────────────────────
DROP INDEX IF EXISTS children_intake_phase_idx;
DROP INDEX IF EXISTS children_treatment_status_idx;

ALTER TABLE children
  DROP COLUMN IF EXISTS intake_phase CASCADE,
  DROP COLUMN IF EXISTS intake_phase_changed_at CASCADE,
  DROP COLUMN IF EXISTS treatment_status CASCADE,
  DROP COLUMN IF EXISTS treatment_status_changed_at CASCADE,
  DROP COLUMN IF EXISTS treatment_status_notes CASCADE;

-- ── 3. Agregar audit timestamp + notas en la columna nueva ──────────
-- (Lo que antes vivía en intake_phase_changed_at + treatment_status_notes
-- ahora se consolida; la fuente de verdad para historial es child_phase_history.)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS current_phase_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS current_phase_notes text;

