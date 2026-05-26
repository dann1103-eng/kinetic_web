-- ═══════════════════════════════════════════════════════════════════════════
-- KINETIC — Import de niños desde Excel 2026
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado automáticamente. NO editar a mano.
-- Requiere migración 0128 (campos workplace, pediatra, photo_consent).
-- Ejecutar en Supabase SQL Editor — corre dentro de un solo BEGIN/COMMIT
-- así que si algo falla no deja datos a medio crear.
-- Niños a importar: 105
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Excel row 24 — Aaron Esmith Alvarenga Chávez (BLUE KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '85984dbe-f36c-4b16-ac51-83657e7c0875',
  'Sara Esmeralda Chávez de Alvarenga', NULL, '7253-04-96',
  'Julios Antonio Alvarenga', '2229-5441',
  NULL, '7137-7725',
  'Hotel la campana (jefe de personal)', '7137-7725',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'be17e0a5-3f5b-491c-bee8-867359beb112', '85984dbe-f36c-4b16-ac51-83657e7c0875',
  'Aaron Esmith Alvarenga Chávez',
  '2014-12-15',
  NULL,
  'No escolarizado',
  'blue_kids',
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS · Programa Excel: BLUE KIDS' WHERE id = 'be17e0a5-3f5b-491c-bee8-867359beb112';

-- Excel row 26 — Ángel Daniel Ayala Navas (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ddb0bc62-2710-43b6-91f2-6ec4503c1b17',
  'Karen Daniela Navas', 'Karendimitra@hotmail.com', '7285-0396',
  'Gonzalo Ernesto Ayala', '7203-4305',
  'Bailarina', NULL,
  'Casa Presidencial', NULL,
  'Dra. Karla Vaquerano', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd4677e83-cf42-4c6d-988c-14cca7def53c', 'ddb0bc62-2710-43b6-91f2-6ec4503c1b17',
  'Ángel Daniel Ayala Navas',
  '2022-08-20',
  'Sospecha TEA',
  NULL,
  'blue_kids',
  '2025-01-13',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 3 años' WHERE id = 'd4677e83-cf42-4c6d-988c-14cca7def53c';

-- Excel row 27 — Lionel Xavier Ayala Clavel (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'da501e84-2266-4800-bfb7-be7f4cf349ba',
  'Julia Roxana Clavel Martínez', 'rclavel20128g@mail.com', '2519-2389',
  'Jesús Xavier Ayala Tarez', 'Luz de Maria Torres de Ayala  tel: 6205-6913 Abuela de Lionel',
  'Soyapango', '73262213',
  'Farmacia Value', '7617-9264',
  'Dra. Karla Flores', '2532-6847',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '083f6b56-da26-489e-b6a0-bace8477f22a', 'da501e84-2266-4800-bfb7-be7f4cf349ba',
  'Lionel Xavier Ayala Clavel',
  '2020-04-18',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2024-01-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 6 años' WHERE id = '083f6b56-da26-489e-b6a0-bace8477f22a';

-- Excel row 28 — Daniel André Campos Línares (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '386d511f-aee6-4f49-94b7-39271a56dcb4',
  'Mónica Alejandra Linares', 'mónicalinares898@gmail.com', '7995-0005',
  'José Alberto Campos López', '7691-7728',
  'Comunicadora', NULL,
  'Telecorporación Slavadoreña', NULL,
  'Dra.  Nathaly Huezo', '7827-7728',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'a6e1135c-991a-413f-8595-fd0fe63a16b5', '386d511f-aee6-4f49-94b7-39271a56dcb4',
  'Daniel André Campos Línares',
  '2023-03-17',
  'TEA',
  NULL,
  'blue_kids',
  '2026-01-07',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 3 años' WHERE id = 'a6e1135c-991a-413f-8595-fd0fe63a16b5';

-- Excel row 29 — Josué René Claros Saca (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '467313c1-2e63-4bf8-bb94-122167af1003',
  'Estela de Claros', 'vitirix@hotmail.com', '2593-7300',
  'Josué Claros', NULL,
  'FGR', '7071-9153 // 2529-3698',
  'CAPRES', '7009-5002',
  'Dra. Karla Flores', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'a16c0d46-37e7-4cc8-afb2-6e32d0503edf', '467313c1-2e63-4bf8-bb94-122167af1003',
  'Josué René Claros Saca',
  '2021-01-23',
  'TEA',
  'Mis PrimerosAmiguitos',
  'blue_kids',
  '2025-02-04',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 5 años' WHERE id = 'a16c0d46-37e7-4cc8-afb2-6e32d0503edf';

-- Excel row 30 — Gabriel Adriano Guerrero Antognelle (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a42437e1-e572-4e55-abbc-35331c032086',
  'Karla Sabrina de Guerrero', 'sabrina.antognelli@gmail.com', '7877-9490',
  'Aldo Moises Guerrero', '2513-5640',
  'Banco Cuscatlán', NULL,
  'Banco Promerica', '7877-9485',
  'Dr. Mario Callejas', '7830-2754',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'bc2c9ec0-6bd9-4bb9-93ed-0f871fdfedca', 'a42437e1-e572-4e55-abbc-35331c032086',
  'Gabriel Adriano Guerrero Antognelle',
  '2021-10-25',
  NULL,
  'Aprendo kids merliot',
  'blue_kids',
  '2024-06-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 4 años' WHERE id = 'bc2c9ec0-6bd9-4bb9-93ed-0f871fdfedca';

-- Excel row 31 — Emilio Misael Leonel Martinez (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '894f08f5-fa55-4adb-b9f0-75cf214d210d',
  'María Estefanía Martínez', 'tobarestefania@gmail.com', '2563-8830',
  'Eli Misael Leonel', NULL,
  'Equisele, S.A de C.V', '7679-2334',
  'Distribuidora Granda', '7459-8760',
  '-', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'b4fd2625-181f-4860-8d7b-f61873a5858a', '894f08f5-fa55-4adb-b9f0-75cf214d210d',
  'Emilio Misael Leonel Martinez',
  '2020-06-23',
  'TEA',
  NULL,
  'blue_kids',
  '2023-02-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 5 años' WHERE id = 'b4fd2625-181f-4860-8d7b-f61873a5858a';

-- Excel row 32 — Monica Lucía Zelaya Ruiz (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '5681b190-383a-4c49-9c8a-0fdb40ea1256',
  'Carolina Ruiz', NULL, NULL,
  'Reymundo  Antonio Zelaya', NULL,
  NULL, '7797-7699',
  NULL, '7797-7699',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '0d2038fb-3384-41c2-8f54-d1109f45456e', '5681b190-383a-4c49-9c8a-0fdb40ea1256',
  'Monica Lucía Zelaya Ruiz',
  '2020-05-13',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 6 años' WHERE id = '0d2038fb-3384-41c2-8f54-d1109f45456e';

-- Excel row 36 — Manuel Alessandro Aguilar Alferez (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '50ddf893-f0ef-4f61-985f-a4e9f48d7a2a',
  'Roxana Elvira Alferez Quezada', 'roxna_alferez2611@gmail.com', '7170-4640',
  'Manuel Antonio Aguilar Alfaro', '7170-4640',
  'Focus', '7253-7038',
  'Excel Automotriz', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'bb136140-aacc-4fb4-b9ac-7c3bcb98ba79', '50ddf893-f0ef-4f61-985f-a4e9f48d7a2a',
  'Manuel Alessandro Aguilar Alferez',
  '2016-11-26',
  'TEA',
  NULL,
  'blue_kids',
  '2023-03-06',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 8 años' WHERE id = 'bb136140-aacc-4fb4-b9ac-7c3bcb98ba79';

-- Excel row 37 — Juan Pablo Caceres Hernández (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '26067cd7-e21e-4197-883b-446c20ce8d90',
  'Lizza Maria Hernández', 'lizzadecaceres@gmail.com', '23673000',
  'Mario Angel Cáceres Rodas', '2233-7906',
  'Liceo Castilla', '7940-6049             23062724',
  'Consejo de Energia', '7885-5496',
  'Dr. Gustavo Escobar- Dr. Manuel Vides', '2264-6622               75448400',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '6f8153be-0d40-420f-9f1f-4f387477cb5f', '26067cd7-e21e-4197-883b-446c20ce8d90',
  'Juan Pablo Caceres Hernández',
  '2013-01-11',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2019-04-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 12 años' WHERE id = '6f8153be-0d40-420f-9f1f-4f387477cb5f';

-- Excel row 38 — José Andrés Funes Alvarenga (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '0f1e4ca9-ac00-4d74-8990-2f7d1d23bfbf',
  'Melissa Inés Alvarenga Velásquez', 'mely.alve@gmail.com', '6420-5762',
  'José Leonardo Funes Ayala', '2456-1062 oficina',
  'Ing Indust....FISDL', '2278-7319 casa 2133-1362 oficina',
  'Lic. Admon Empresa ... Chevron', '7888-2302',
  'José Enrique Ascencio', '2328-9441         7602-0474',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '6d64355f-3207-48a9-984e-e67169278516', '0f1e4ca9-ac00-4d74-8990-2f7d1d23bfbf',
  'José Andrés Funes Alvarenga',
  '2014-08-13',
  'TEA',
  'Kinder Amiguitos',
  'blue_kids',
  '2018-10-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 11 años' WHERE id = '6d64355f-3207-48a9-984e-e67169278516';

-- Excel row 39 — Kylian Alessandro Henriquez Navarro (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2e8a0016-e25c-4f7f-8f4e-5d52ed3d6102',
  'Sonia del Carmen Navarro de Henriquez', 'snavarro9@gmail.com', NULL,
  'Manuel de Jesús Henrríquez', NULL,
  NULL, '7013-7756',
  'PNC', '7645-9412',
  'Dra. Karla Flores', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '50dc538d-91f5-4181-864d-1846cc9fc25c', '2e8a0016-e25c-4f7f-8f4e-5d52ed3d6102',
  'Kylian Alessandro Henriquez Navarro',
  '2020-01-07',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-05',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 5 años' WHERE id = '50dc538d-91f5-4181-864d-1846cc9fc25c';

-- Excel row 40 — Enrique Merari Montoya (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3a6946c3-9735-486c-9607-73ac3b56bda1',
  'Claudia Susana Montoya', 'claudiamontoya_23@hotmail.com', '7602-6129',
  'Manuel Enrique Montoya Perez', NULL,
  'Tool Solutions S.A de C.V', NULL,
  'Abuelo', NULL,
  'Dr. Ronald Argueta', '7118-8483',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '2922dae5-89db-44bf-b564-3192c2c824c9', '3a6946c3-9735-486c-9607-73ac3b56bda1',
  'Enrique Merari Montoya',
  '2017-03-28',
  'TEA',
  NULL,
  'blue_kids',
  '2024-01-25',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 8 años' WHERE id = '2922dae5-89db-44bf-b564-3192c2c824c9';

-- Excel row 41 — Fernando Alejandro Tejada Llanes (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e37fd160-0afc-4775-8556-521925022c10',
  'Cindie Alejandra Llanes', 'cindie458@hotmail.com', '2273-6964',
  'Rolando Carlos Tejada Escamilla', '2289-5632',
  'Foundever SYKES', '75649229',
  'Particular (Reimsa)', '7571-5996',
  'Neurologo Raul Muñoz Bell', '22709761',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '22713d6d-8ae1-4cd2-aa68-1219ba91847d', 'e37fd160-0afc-4775-8556-521925022c10',
  'Fernando Alejandro Tejada Llanes',
  '2014-05-09',
  'TEA',
  NULL,
  'blue_kids',
  '2024-01-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2' WHERE id = '22713d6d-8ae1-4cd2-aa68-1219ba91847d';

-- Excel row 42 — Andrés Isaías Molina Molina (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '19c21d2c-c436-498e-9d22-ec4f83016327',
  'Fátima Alexandra Molina', 'fatimamolina0708@gmail.com', NULL,
  'José Osvaldo Molina Larin', NULL,
  'Ama de casa', '7724-1564',
  'Taller Molina', '7683-1823',
  'Dra. glenda María Villalta', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '5b3cd6a3-cafc-45cc-b399-c9320a1216f3', '19c21d2c-c436-498e-9d22-ec4f83016327',
  'Andrés Isaías Molina Molina',
  '2018-01-18',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-05',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 7 años' WHERE id = '5b3cd6a3-cafc-45cc-b399-c9320a1216f3';

-- Excel row 45 — Mathias Carranza Pineda (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '462bdb64-7718-4c64-ac73-953ef556a282',
  'Lissette Pineda', 'Lisspineda@hotmail.com', '2280-0495',
  'Carlos Carranza', NULL,
  NULL, '7969-1718',
  NULL, '7742-9378',
  'Dr. Gustavo Escobar', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '6742d46f-9502-494c-983d-14c8a1791f9a', '462bdb64-7718-4c64-ac73-953ef556a282',
  'Mathias Carranza Pineda',
  '2018-11-02',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 7 años' WHERE id = '6742d46f-9502-494c-983d-14c8a1791f9a';

-- Excel row 46 — Marco Andrés Iraheta Palma (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '467e5a32-1772-4871-be0d-83b304865f8e',
  'Xiomara Palma', 'xiomarapalma2789@gmail.com', NULL,
  'Marco Iraheta', NULL,
  'Ministerio de Obras Publicas', '7538-7485',
  'Oficina Particular', '7587-8705',
  'Dra. Ingrid Lizma- Dra. Karla Flores', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'f9c7959b-dfa9-4516-9e52-4121a306f497', '467e5a32-1772-4871-be0d-83b304865f8e',
  'Marco Andrés Iraheta Palma',
  '2016-09-01',
  'TEA',
  NULL,
  'blue_kids',
  '2023-11-21',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 9 años' WHERE id = 'f9c7959b-dfa9-4516-9e52-4121a306f497';

-- Excel row 47 — Jhonatan Isaias Galvez Ulloa (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '38480aa3-ed67-4032-b5fb-55f4485372f4',
  'Ismara López Ulloa', NULL, NULL,
  'Erick Arnoldo Galvez', NULL,
  'Apoya en casa', '72293493',
  'Alcaldía Municipal de antiguo Cuscatlan', NULL,
  'Dr. Karla Flores', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '2d357ce5-6468-4998-bfd2-6d007cc21baa', '38480aa3-ed67-4032-b5fb-55f4485372f4',
  'Jhonatan Isaias Galvez Ulloa',
  '2015-02-13',
  'TEA',
  NULL,
  'blue_kids',
  '2023-01-30',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 10 años' WHERE id = '2d357ce5-6468-4998-bfd2-6d007cc21baa';

-- Excel row 48 — Esteban Francisco Romero Velásquez (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'd75f43f2-e363-4b25-a671-1bda7f67c528',
  'Kenia Velásquez de Romero', 'kenyavel@hotmail.com', '2319-0104',
  'Marvin Stanley Romero Arias', '2319-0109',
  'Swisstex El Salvador, S.A. de C.V.', '7748-8683                   2288-0173',
  'Swisstex EL Salvador, S.A. de C.V.', '7803-8223',
  'Dra. Yohamy Villeda', '7170-0892                   7180-0587',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '386e9826-7794-461f-8ebc-2b64ab9ab9b6', 'd75f43f2-e363-4b25-a671-1bda7f67c528',
  'Esteban Francisco Romero Velásquez',
  '2015-12-01',
  'TEA',
  NULL,
  'blue_kids',
  '2023-11-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 9 años' WHERE id = '386e9826-7794-461f-8ebc-2b64ab9ab9b6';

-- Excel row 49 — Carlos René Quintanilla Díaz (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c9f2755c-8f6d-4e95-9294-1082b1fa1788',
  'Ana Graciela Diaz de Quintanilla', 'grace_22die@hotmail,.com', NULL,
  'Carlos Neftali Quintanilla H.', NULL,
  NULL, '7115-4780',
  'SAVONA, S.A. de C.V.', '7022-5943',
  'Dr. Gustavo Fuentes', '7840-0697                    7140-7621',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '434596a4-585e-49d4-9f20-e9af4bebf14c', 'c9f2755c-8f6d-4e95-9294-1082b1fa1788',
  'Carlos René Quintanilla Díaz',
  '2014-10-25',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2023-03-14',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 10 años' WHERE id = '434596a4-585e-49d4-9f20-e9af4bebf14c';

-- Excel row 50 — Franco Alejandro Rivera Roverso (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '1e84f2f3-c553-45b6-ba7d-70d30b0b4eaa',
  'Maria de los Angeles Roverso', 'mariaroverso26@gmail.com', '7627 0513',
  'Fredy Edgardo Rivera', '--',
  'Ria de Centro America', 'Abuela, 7080 9707',
  'Negocio propio', '7013-6378',
  'Dr. Leonel Alvarado', '2225-0834',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'ea788e8a-a310-4fa7-8c5c-db8374b67693', '1e84f2f3-c553-45b6-ba7d-70d30b0b4eaa',
  'Franco Alejandro Rivera Roverso',
  '2018-11-09',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2021-10-13',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 6 años' WHERE id = 'ea788e8a-a310-4fa7-8c5c-db8374b67693';

-- Excel row 51 — Sofía Giselle Fuentes Mulato (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e5696fe3-286f-4bf8-a18c-4ca363955fd9',
  'Gabriela Mulato', 'gabrielamulato7@gmail.com', '7084-3813',
  'Raúl Alejandro Fuentes', '7484-3813',
  'Vendedor (Panadería)', NULL,
  'Vendedor (Vidrí)', NULL,
  'Dra. Raquel Espinoza', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'a9868b8c-0a56-46e9-b65b-e6f799b50237', 'e5696fe3-286f-4bf8-a18c-4ca363955fd9',
  'Sofía Giselle Fuentes Mulato',
  '2018-01-18',
  NULL,
  NULL,
  'blue_kids',
  '2025-02-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 7 años' WHERE id = 'a9868b8c-0a56-46e9-b65b-e6f799b50237';

-- Excel row 54 — Danny Elias Alvarenga Herrera (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e7b61ce6-43cc-47e8-a6fd-b1a145f5ebfa',
  'Rebeca Carolina Herrera', 'rbk_hrr_mjv@hotmail.com', '7069-3228',
  'Eduardo Danny Alvarenga Campos', '7069-3980',
  'Anway El Salvador', NULL,
  'Bambú Lourdes S.A  de C.V', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd3ea9a7b-f5bc-4ee6-a382-0098353ffa78', 'e7b61ce6-43cc-47e8-a6fd-b1a145f5ebfa',
  'Danny Elias Alvarenga Herrera',
  '2019-04-12',
  'TEA',
  NULL,
  'blue_kids',
  '2025-07-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 6 años' WHERE id = 'd3ea9a7b-f5bc-4ee6-a382-0098353ffa78';

-- Excel row 55 — Eduardo Mateo Galdamez Figueroa (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '9bbd0fd1-ca0b-4f48-aea9-609b095e920b',
  'Sydia Tatiana Figueroa', 'statianafigueroa@gmail.com', '2278-4401            2289-1039',
  'Oscar Eduardo Galdamez Villacorta', '2397-2215/2397-2254',
  'Soc. Importadora y exportadora Ls Nenes', '7143-1428',
  'CENTA', '7118-5043',
  'Dr. jose Eduardo Carillo', '2931-9143   7465-5959',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'f6b85da6-2434-4c7e-8ddd-645d53dd3b92', '9bbd0fd1-ca0b-4f48-aea9-609b095e920b',
  'Eduardo Mateo Galdamez Figueroa',
  '2017-10-13',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2021-08-09',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 7 años' WHERE id = 'f6b85da6-2434-4c7e-8ddd-645d53dd3b92';

-- Excel row 56 — André Javier García Madrid (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '89ccb25c-7f76-446b-9717-736e9d97ad6f',
  'Jocelyn Guadalupe Madrid Alfaro', 'jocelynmadrid28@gmail.com', '2251-0727',
  '-', '-',
  '7595-9242', '7595-9242',
  '-', '-',
  'Dra. Vaquerano', '2532-6847',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '0dc1ed1f-2508-43e6-b805-6df161cdaaae', '89ccb25c-7f76-446b-9717-736e9d97ad6f',
  'André Javier García Madrid',
  '2020-09-10',
  'TEA',
  NULL,
  'blue_kids',
  '2024-01-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 5 años' WHERE id = '0dc1ed1f-2508-43e6-b805-6df161cdaaae';

-- Excel row 57 — Daniel Andrés Pérez Rubio (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '14181da7-69d8-4244-8b8f-4567ba1ebd15',
  'Deborah Nathalia Rubio', 'debie.nathaliar@gmail.com', '7748-1928',
  'Erick Abel Perez', '2361-0032',
  'Banco de America Central', '2206-4248',
  'Ministerio de Salud', '7748-5146',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '4260e7ef-f6c5-4209-be7c-3120477d8d73', '14181da7-69d8-4244-8b8f-4567ba1ebd15',
  'Daniel Andrés Pérez Rubio',
  '2020-05-18',
  'TEA',
  'San José Olocuilta',
  'blue_kids',
  '2024-02-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 5 años' WHERE id = '4260e7ef-f6c5-4209-be7c-3120477d8d73';

-- Excel row 58 — Mattheo Recinos Mendez (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a2b82e21-ab2b-4866-b54f-62a3b2469bd8',
  'Idalia Beatriz Méndez Sandoval', 'idaliadez@outlook.es', 'Mario tío 7968-7628',
  'Walter Vicente Recinos Lemus', '7862-6044',
  'Universidad Don Bosco', '6166-6946',
  'GEO Ahuachapan', NULL,
  'Dra. Karla Campos', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'cf3388c8-82e2-473a-8faf-8fafe93d8396', 'a2b82e21-ab2b-4866-b54f-62a3b2469bd8',
  'Mattheo Recinos Mendez',
  '2020-09-26',
  'TEA',
  NULL,
  'blue_kids',
  '2024-02-09',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = 'cf3388c8-82e2-473a-8faf-8fafe93d8396';

-- Excel row 59 — Víctor André Melgar Rousseau (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e8d2611c-20a7-4c9f-a564-c5d791c1b53e',
  'Katia Alejandra Rousseau', 'rousseau1502@gmail.com', '7234-8047',
  'Víctor Manuel Melgar', '7888-3576',
  'Alejandra Beauty Loung', NULL,
  'Cuidad del Espacio S.A de C.V', NULL,
  'Dr. Sánchez Vides.', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '542d0eab-0a84-435d-a0bd-aad73883710d', 'e8d2611c-20a7-4c9f-a564-c5d791c1b53e',
  'Víctor André Melgar Rousseau',
  '2020-07-23',
  'Sospecha TEA',
  'Agustin Fernandez Santos',
  'blue_kids',
  '2025-09-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '542d0eab-0a84-435d-a0bd-aad73883710d';

-- Excel row 65 — Elián Carlos Hidalgo López (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'eee11b2b-cc3c-47b1-a5cf-22a1bcae1433',
  'Karolyn López de Hidalgo', 'karoliin.lomontz@gmail.com', '6146-4788',
  'Carlos Antonio Hidalgo', '7064-3437',
  'Ama de Casa', NULL,
  'Teleperformance', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '36244bbd-a35d-443c-81a2-ffb497eb33bd', 'eee11b2b-cc3c-47b1-a5cf-22a1bcae1433',
  'Elián Carlos Hidalgo López',
  '2020-10-24',
  'TDAH. + R.G Neuro.',
  NULL,
  'learning_kids',
  '2026-02-02',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: LEARNING KIDS · Edad al importar: 5 años' WHERE id = '36244bbd-a35d-443c-81a2-ffb497eb33bd';

-- Excel row 66 — Fiorella Carolina Fuentes Hernández (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'd76c771b-882e-460f-b5ab-c2ddadeae30d',
  'Carolina de Fuentes', NULL, '7118-2753',
  'Oscar Fuentes', '7833-0483',
  'Empleada', NULL,
  'Consultor Marjeting', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '5fd2c9fd-aa12-4d72-8328-7e8912c2865b', 'd76c771b-882e-460f-b5ab-c2ddadeae30d',
  'Fiorella Carolina Fuentes Hernández',
  '2019-10-07',
  'TEA',
  NULL,
  'learning_kids',
  '2025-06-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: LEARNING KIDS · Edad al importar: 6 años' WHERE id = '5fd2c9fd-aa12-4d72-8328-7e8912c2865b';

-- Excel row 67 — Minerva Jazmin Roman Vivas (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '96b9a612-5070-422c-a9ed-2d318a55acca',
  'Jazmin Vivas', 'jazminvivas@gmail.com', NULL,
  'José Salvador Román Chevez', NULL,
  'Trinidad Menjivar (abuela) 6065-0248', '7866-2064',
  'Partido de Concentración Nacional', '7747-7846',
  'Dr. Heriberto Contreras', '7465-5959   7150-7913',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'cdbd70a9-ddc1-478d-9f72-02210b66dff4', '96b9a612-5070-422c-a9ed-2d318a55acca',
  'Minerva Jazmin Roman Vivas',
  '2018-02-09',
  'TEA',
  'No escolarizado',
  'learning_kids',
  '2021-09-21',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: LEARNING KIDS · Edad al importar: 8 años' WHERE id = 'cdbd70a9-ddc1-478d-9f72-02210b66dff4';

-- Excel row 68 — Adrian Valentin Vásquez Hernández (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '367a5166-d67c-4152-8f59-b6c92455647e',
  'Marta de Vásquez', 'ceciliahernandez1912@outlook.es', '2520-2919',
  'José Adrian Vasquez', '7989-6099',
  'Pollos Don San Valentín', '7018-1274',
  'Pollos Don San Valentín', NULL,
  'Dr. Jorge Pleitez', '2214-7179',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd9b68881-215c-410a-9167-d994192492e2', '367a5166-d67c-4152-8f59-b6c92455647e',
  'Adrian Valentin Vásquez Hernández',
  '2017-08-15',
  'Síndrome Down',
  'Kinder Amiguitos',
  'learning_kids',
  '2024-01-31',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = 'd9b68881-215c-410a-9167-d994192492e2';

-- Excel row 74 — Lourdes Adriana Carranza García (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2f9ebb84-538a-4620-9c47-c81d82ac0c42',
  'Cristina García', 'mcgarcia_@outlok.com', NULL,
  'Edwin Carranza', NULL,
  'Lancasco Salvadoreño', '7850-2705',
  'Regional', '7669-1229',
  'Dr. Luis Guzman', '2530-2044         7318-4077',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '1df7f946-e5db-4662-95c0-6bb827f313f9', '2f9ebb84-538a-4620-9c47-c81d82ac0c42',
  'Lourdes Adriana Carranza García',
  '2013-07-29',
  NULL,
  'Amiguitos',
  'aula_educativa',
  '2024-01-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 12 años' WHERE id = '1df7f946-e5db-4662-95c0-6bb827f313f9';

-- Excel row 75 — Daniella Belén Cornejo Crúz (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '96a2883e-db37-44b1-a470-e641457c2c7a',
  'Marcela Crúz', 'amcgaldamez@gmail.com', NULL,
  'Arturo Cornejo', NULL,
  'Dr. en medicina', '7101-4339            2340-0107',
  'ARK', '73404628',
  'Dr. Luis José Guzman', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '6cab7ac2-5e71-4cd8-98b7-6a67833b9749', '96a2883e-db37-44b1-a470-e641457c2c7a',
  'Daniella Belén Cornejo Crúz',
  '2014-02-01',
  NULL,
  NULL,
  'aula_educativa',
  '2022-10-10',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 11 años' WHERE id = '6cab7ac2-5e71-4cd8-98b7-6a67833b9749';

-- Excel row 76 — Sophia Rebeca Girón Sansivirini (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '680472ee-70d3-44ab-b8fc-1b972d45f8ed',
  'Evelyn Arely Sansivirini', 'evsansito0104@hotmail.com', '7105-1093  ABUELA',
  'Erick Francisco Girón Mendoza', '7105-1093  ABUELA',
  'Casa', '62021922               25191641',
  'HERO El Salvador', '76972986 / 69653089',
  'Dra. Rosario Vasquez', '78552163',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd135824f-efca-42d5-903a-0fd739256277', '680472ee-70d3-44ab-b8fc-1b972d45f8ed',
  'Sophia Rebeca Girón Sansivirini',
  '2016-06-20',
  NULL,
  NULL,
  'aula_educativa',
  '2023-05-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 9 años' WHERE id = 'd135824f-efca-42d5-903a-0fd739256277';

-- Excel row 77 — Federico Mendoza Lemus (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'd1cef368-ae57-42eb-be50-08b85f560c71',
  'Ana María Lemus de Mendoza', 'amarlem@hotmail.com', 'Sra. Reina 6131-7715 (Transporte)                                 2288-1232',
  'Gerardo Mendoza', NULL,
  'Academia Británica Cuscatleca', '7842-2384',
  'Embotelladora la Cascada', '7860-0709',
  'Dr. Rivera Richareson', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '04f550e6-b971-413a-a250-569418a05a71', 'd1cef368-ae57-42eb-be50-08b85f560c71',
  'Federico Mendoza Lemus',
  '2006-09-08',
  NULL,
  'KINETIC',
  'aula_educativa',
  '2022-10-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 19 años' WHERE id = '04f550e6-b971-413a-a250-569418a05a71';

-- Excel row 78 — Teresa Natalia Villeda López (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a101358b-e3d1-4ac3-b9e6-d5612255a579',
  'Teresa López de Villeda', 'tslopez19@yahoo.es', NULL,
  'Jose Villeda', NULL,
  'Universidad Matias Delgado', '7841-7041',
  NULL, NULL,
  'Dra. Valencia de Mena', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '03534d49-e471-439c-bc62-08fad3a839b9', 'a101358b-e3d1-4ac3-b9e6-d5612255a579',
  'Teresa Natalia Villeda López',
  '2006-07-22',
  NULL,
  NULL,
  'aula_educativa',
  '2022-10-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 19 años' WHERE id = '03534d49-e471-439c-bc62-08fad3a839b9';

-- Excel row 79 — Daniela Guadalupe Engelhard Parada (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '95e2aac8-0791-44a6-b2e0-4c7f7e488440',
  'Cecilia Parada de Engelhard', 'cepp8@hotmail.com', '2242-3600',
  'Alberto A. Engelhard Bustillo', '2242-3600',
  'EPASS', NULL,
  'EPASS', '7888-6210',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'dee96d4d-1198-40f8-aea4-10ff9f098eac', '95e2aac8-0791-44a6-b2e0-4c7f7e488440',
  'Daniela Guadalupe Engelhard Parada',
  '2003-04-04',
  NULL,
  NULL,
  'aula_educativa',
  '2022-11-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 22 años' WHERE id = 'dee96d4d-1198-40f8-aea4-10ff9f098eac';

-- Excel row 80 — Sabrina María Risi Morán (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'aa9a6237-4978-42f3-b80a-bf3e4097e152',
  'Fátima de Risi', 'fatimarisi@hotmail.com', '22633264',
  'Pablo Risi', '22633264',
  'Ama de casa', '7730-9827',
  'Universal Trading', '78881596',
  'Dr. Jaime Escolán', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'af0b7b69-3422-4727-96ae-3b53db36d1a6', 'aa9a6237-4978-42f3-b80a-bf3e4097e152',
  'Sabrina María Risi Morán',
  '2009-06-25',
  NULL,
  NULL,
  'aula_educativa',
  '2023-03-02',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 16 años' WHERE id = 'af0b7b69-3422-4727-96ae-3b53db36d1a6';

-- Excel row 87 — David Emmanuel Orellana Paz (TERAPIAS MATUTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '85bfa8d6-6c79-45ee-9e38-cf0ed4568a21',
  'Maria de los Ángeles Paz de ORellana', 'dramariapazn20@hotmail.com', '7190-0917',
  'Josúe Isaí Orellana Claros', '7190-0917',
  'Hospital San Francisco Gotera  Morazán', '78191564',
  'Consultorio Médico Especializado  JIREH', '2654-1950',
  'Dra. Karla Rauda', '7180-8357',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '1cb4b5de-207a-4024-879d-3ad5e2db62e1', '85bfa8d6-6c79-45ee-9e38-cf0ed4568a21',
  'David Emmanuel Orellana Paz',
  '2024-07-25',
  NULL,
  '-',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS MATUTINAS · Programa Excel: EST. H Y L · Edad al importar: 1 año' WHERE id = '1cb4b5de-207a-4024-879d-3ad5e2db62e1';

-- Excel row 88 — Josías Isaí Orellana Paz (TERAPIAS MATUTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '4ccf015b-b876-4f58-8601-6b47c66e2201',
  'Maria de los Ángeles Paz de ORellana', 'dramariapazn20@hotmail.com', '7190-0918',
  'Josúe Isaí Orellana Claros', '7190-0918',
  'Hospital San Francisco Gotera  Morazán', '78191564',
  'Consultorio Médico Especializado  JIREH', '2654-1951',
  'Dra. Karla Rauda', '7180-8358',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '67c59849-7461-40e2-8379-18bb689384b2', '4ccf015b-b876-4f58-8601-6b47c66e2201',
  'Josías Isaí Orellana Paz',
  '2024-05-27',
  NULL,
  'Col. Adventista Cantón El norto',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

INSERT INTO public.treatment_plans (
  child_id, primary_therapist_id, diagnosis_text, starts_at,
  therapies_json, schedule_pattern_json, monthly_total_usd, active
) VALUES (
  '67c59849-7461-40e2-8379-18bb689384b2', NULL,
  NULL,
  '2026-02-04',
  '[{"service":"lenguaje", "active":true, "sessions_per_month":8, "unit_cost_usd":45, "therapist_id":null}, {"service":"sensorial", "active":true, "sessions_per_month":8, "unit_cost_usd":45, "therapist_id":null}]'::jsonb,
  '[]'::jsonb,
  720,
  true
);
UPDATE public.children SET notes = 'Sección Excel: TERAPIAS MATUTINAS · Programa Excel: THL + Sensorial · Edad al importar: 5 años' WHERE id = '67c59849-7461-40e2-8379-18bb689384b2';

-- Excel row 89 — Marcos Joel García Molina (TERAPIAS MATUTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '896f3e14-8df9-43f3-aee1-d811adaabca9',
  'Odaly Molina Castro', NULL, NULL,
  'Humberto García', NULL,
  'Exportadora Río Grande Kilometro 15 1/2', '7633-6105  / 7321-7696',
  'Exportadora Río Grande Kilometro 15 1/2', '7321-7696',
  'Dra. Laura Rivera', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '090bec67-5972-467c-b1d8-ff0aaffedc85', '896f3e14-8df9-43f3-aee1-d811adaabca9',
  'Marcos Joel García Molina',
  '2020-07-04',
  NULL,
  'Margarita Ovidia de Venutolo',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS MATUTINAS · Programa Excel: EST. DE H Y L · Edad al importar: 5 años' WHERE id = '090bec67-5972-467c-b1d8-ff0aaffedc85';

-- Excel row 97 — Emma Veronica Aguilar Guzmán (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e5724c2e-a835-40f3-b25e-92584efa4e2b',
  'Karen Jocelyne Guzmán', 'guzman1998melara@gmail.com', '7467-9666',
  'Adonis Antonio Aguilar Gonzales', NULL,
  'Salón de belleza Antiguo C.', '7467-9666',
  NULL, '7413-7035',
  'Dr. Walter Sanchez Vides', '7768-7888',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '71312a06-3664-436b-a273-f4677a46e6fe', 'e5724c2e-a835-40f3-b25e-92584efa4e2b',
  'Emma Veronica Aguilar Guzmán',
  '2018-01-29',
  'TEA',
  'Cristobal Colón',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '71312a06-3664-436b-a273-f4677a46e6fe';

-- Excel row 98 — Francella Celeste Argueta Vanegas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '300c7e15-00f2-4c78-b08b-8424dd1385b1',
  'Veronica Liseth Vanegas de Argueta', 'verovanegasv@gmail.com', '7318-9549',
  'Oswaldo Dagoberto Argueta', '7748-8024',
  'Centro Judicial de Santa Tecla', NULL,
  'Juzgado de Familia de Ahuachapán', NULL,
  'Dra. Claudia de Mena', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'c0e905c5-45ca-4ead-9076-9133d4fade7c', '300c7e15-00f2-4c78-b08b-8424dd1385b1',
  'Francella Celeste Argueta Vanegas',
  '2018-02-28',
  'PCI',
  'Árbol de Dios',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = 'c0e905c5-45ca-4ead-9076-9133d4fade7c';

-- Excel row 99 — Lila Franceska Argueta Retana (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'f6ead44e-e77e-4089-8210-bd9c17801174',
  'Johanna Veralisse Retana Argueta', 'johanna.retana01@gmail.com', '7926-7806',
  'Francisco Israel Argueta Soto', '63055852',
  'Raun', NULL,
  'Hielo', NULL,
  'Dr. David Valencia', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '7398f6ee-a642-429a-9b6a-5607881b8921', 'f6ead44e-e77e-4089-8210-bd9c17801174',
  'Lila Franceska Argueta Retana',
  '2023-12-04',
  '-',
  'Kids Lourdes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 2 años' WHERE id = '7398f6ee-a642-429a-9b6a-5607881b8921';

-- Excel row 100 — Mateo Alessandro Alvarenga Cortez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '6091d9d4-915e-4ac1-b4df-191443be7c35',
  'Andrea Cortez de Alvarenga', 'gal.cortez@outlook.com', '7931-7781',
  'Gustavo Alvarenga', '7901-1929',
  'Las tilapias hotel y restaurante', NULL,
  'Fiscalia general de la republica', NULL,
  'Dr. Ronald Argueta', '7118-8483',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '1b294a01-c322-47e6-9b64-81e0d3638ece', '6091d9d4-915e-4ac1-b4df-191443be7c35',
  'Mateo Alessandro Alvarenga Cortez',
  '2022-04-05',
  'Sospecha TEA',
  'Kinder Little Giant',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = '1b294a01-c322-47e6-9b64-81e0d3638ece';

-- Excel row 101 — Thiago André Alvarenga Cortez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '1ca799c9-b9a3-45c4-9d71-95b7b0500b25',
  'Andrea Cortez de Alvarenga', 'gal.cortez@outlook.com', '7931-7781',
  'Gustavo Alvarenga', '7901-1929',
  'Las tilapias hotel y restaurante', NULL,
  'Fiscalia general de la republica', NULL,
  'Dr. Ronald Argueta', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '4e74fea6-b9d5-420b-bf85-94bd91e6cee2', '1ca799c9-b9a3-45c4-9d71-95b7b0500b25',
  'Thiago André Alvarenga Cortez',
  '2022-04-05',
  'Sospecha TEA',
  'Kinder Little Giant',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = '4e74fea6-b9d5-420b-bf85-94bd91e6cee2';

-- Excel row 102 — Daniela Alejandra Bermudez Montes (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '5c90d319-ae52-4b92-bfe6-3c70532ed116',
  'Lissette Margarita Mondes de  Bermudez', 'lissmontes@hotmail.com', '7835-8917',
  'Oscar Alejandro Bermúdez', '7630-9671',
  NULL, NULL,
  'Comité  Internacional de la  Cruz Roja UCRANIA', NULL,
  'Dr. Luis Alberto Valencia', '7829-3849',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'f1b68d38-cf4b-4c1e-b7f7-ea4a221da936', '5c90d319-ae52-4b92-bfe6-3c70532ed116',
  'Daniela Alejandra Bermudez Montes',
  '29-01/19',
  NULL,
  'Colegio Maya',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7a' WHERE id = 'f1b68d38-cf4b-4c1e-b7f7-ea4a221da936';

-- Excel row 103 — Rodrigo José Call Gonzáles (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b880ce4a-714b-4f20-9b66-5186f7e3b00c',
  'Lourdes Gonzales', 'alegzz11@gmail.com', '77877891',
  'Rodrigo Call Mena', '74758991',
  'Licda. en negocios', NULL,
  'Lic. ADMON', NULL,
  'Dr. Eduardo Carrillo', '22780911',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'a868d595-d0c4-461d-92d9-673425a9ffcb', 'b880ce4a-714b-4f20-9b66-5186f7e3b00c',
  'Rodrigo José Call Gonzáles',
  '2021-04-10',
  'Problemas THL',
  'ABC',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = 'a868d595-d0c4-461d-92d9-673425a9ffcb';

-- Excel row 104 — Lukas Carranza Pineda (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '50659da6-efba-4749-8fb0-45b8255369d4',
  'Lissette Pineda', 'Lisspineda@hotmail.com', '2280-0495',
  'Carlos Carranza', NULL,
  NULL, '7969-1718',
  NULL, '7742-9378',
  'Dr. Gustavo Escobar', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '4bec1e5e-eccb-4ad6-beb1-e676e27f28be', '50659da6-efba-4749-8fb0-45b8255369d4',
  'Lukas Carranza Pineda',
  '2016-10-25',
  'Problemas Psicológicos',
  'Lamatepeque',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '4bec1e5e-eccb-4ad6-beb1-e676e27f28be';

-- Excel row 105 — Mateo Daniel Cerón Aguilar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'df63116d-2374-4a11-b12c-4f27f31c279e',
  'Julia Inés Cerón Aguilar', 'juliainesceronaguilar@yahoo.com', NULL,
  NULL, NULL,
  'TIGO', '7259-3786 Casa 2511-0265',
  NULL, NULL,
  'Dra. Karla Flores', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'c33ed51d-5dbd-4d92-84ab-88c5939cc525', 'df63116d-2374-4a11-b12c-4f27f31c279e',
  'Mateo Daniel Cerón Aguilar',
  '2020-05-17',
  'TEA',
  'Happy Angels',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'c33ed51d-5dbd-4d92-84ab-88c5939cc525';

-- Excel row 106 — Nicolás André Comandarí Escobar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '9ef27a87-a357-478e-a731-c55def39569e',
  'Johana Comandarí', 'JoaComandarib@hotmail.com', '7533-7114',
  'David', '-',
  'Slime San Benito', 'Marco Comandari (hermano de Nicolás)7933-0857',
  '-', '-',
  'Dra. Karla Vaquerano', '7865-5269',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '125a47f5-de12-48b9-9c53-208bdaeb38b1', '9ef27a87-a357-478e-a731-c55def39569e',
  'Nicolás André Comandarí Escobar',
  '2020-04-20',
  'TEA',
  'Power Kids.',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '125a47f5-de12-48b9-9c53-208bdaeb38b1';

-- Excel row 107 — José Alberto Chacón Vasquez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '285512d9-96ff-4ff1-bdcb-362c4cf2d46f',
  'Arelis de Chacón', 'vonisu@gmail.com', '7237-1676',
  'José Alberto Chacón', NULL,
  NULL, NULL,
  'Cocinero', '7947-9111',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'bfb32191-0c7b-4491-b858-2fdc6d07349c', '285512d9-96ff-4ff1-bdcb-362c4cf2d46f',
  'José Alberto Chacón Vasquez',
  '2018-03-19',
  'TDEA',
  'Laura Lehtinen',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = 'bfb32191-0c7b-4491-b858-2fdc6d07349c';

-- Excel row 108 — Lucas Nicolás Chavarría Abullarade (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '709c85e0-b317-4e22-a0b4-2bd4d0707d01',
  'Salma Gabriela Abullarade de Chavarría', 'salma_ga16hotmail.com', NULL,
  'Juan Carlos Chavarría', NULL,
  'GVM', '7928-6306',
  'ADRESAL, S.A de C.V', '7892-8960',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '71516871-f258-47a4-b7df-64f8c8ea2b12', '709c85e0-b317-4e22-a0b4-2bd4d0707d01',
  'Lucas Nicolás Chavarría Abullarade',
  '2022-02-15',
  'Retraso del Lenguaje',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = '71516871-f258-47a4-b7df-64f8c8ea2b12';

-- Excel row 109 — Sebastián Enmanuel Chinchilla Alvarenga (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ecfeffb0-107d-4d67-ba08-be9228d6b189',
  'Liliana Yamileth Chinchilla', 'liliana.alvarenga@gmail.com', '7877-9542',
  'Jorge Antonio Ochoa', NULL,
  'Plan Internacional', NULL,
  'Mauser', NULL,
  'Dr. Sánchez Vides', '7697-0133',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '39d73012-2f22-4a11-9145-3149abbf8c7a', 'ecfeffb0-107d-4d67-ba08-be9228d6b189',
  'Sebastián Enmanuel Chinchilla Alvarenga',
  '2022-05-23',
  'TEA',
  'Kinder Nacional de Chalatenango',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = '39d73012-2f22-4a11-9145-3149abbf8c7a';

-- Excel row 110 — Manuel de Jesús Escobar Mejía (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ea2e91de-e33b-425c-afdf-19171e45f973',
  'Karla de Escobar', 'kgmejia89@gmail.com', '7696-3956',
  'Manuel de Jesús Escobar', '7855-2281',
  'CNR', NULL,
  'Cikume Sotfware', NULL,
  'Dra. Ángelica Lobos', '7170-8253',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'c23e7b9a-ab67-4f70-9cfd-64104f132a6d', 'ea2e91de-e33b-425c-afdf-19171e45f973',
  'Manuel de Jesús Escobar Mejía',
  '2020-09-30',
  NULL,
  'Kínder Campo Verde',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'c23e7b9a-ab67-4f70-9cfd-64104f132a6d';

-- Excel row 111 — Matías Elián Flores Zaldívar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'f4ba5b82-acc3-4359-9002-2bc538700e8b',
  'Susana Carolina Zaldívar', 'sczaldivarflores@gmail.com', '2322-1034',
  'David Enohc Flores', NULL,
  'Telemóvil', '7596-8844',
  'Telus', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '8b27dc83-0bae-415c-9bb3-154155eea581', 'f4ba5b82-acc3-4359-9002-2bc538700e8b',
  'Matías Elián Flores Zaldívar',
  '2020-11-24',
  'Altas Capacidades',
  'Maquilishuat',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '8b27dc83-0bae-415c-9bb3-154155eea581';

-- Excel row 112 — Sofía Flores Morataya (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '7cf2018a-440d-4a5b-b22b-7b32741dd5be',
  'Laura de Flores', 'iamove07@gmail.com', NULL,
  'Roberto Samuel Flores', NULL,
  'Kinetic', '7797-7822',
  'FM Comunication', '79300698',
  'Dra. Rhina Ramos', '7883-5308',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '27a2b85f-2b2a-4cc7-8ed0-658186c51c64', '7cf2018a-440d-4a5b-b22b-7b32741dd5be',
  'Sofía Flores Morataya',
  '2016-07-20',
  NULL,
  'Colegio Salesiano San José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '27a2b85f-2b2a-4cc7-8ed0-658186c51c64';

-- Excel row 113 — Roberto Andrés Flores Morataya (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e1a59a81-88c2-47b9-94b0-4e4a64fcfeac',
  'Laura de Flores', 'iamove07@gmail.com', NULL,
  'Carlos Franco', NULL,
  'Kinetic', '7797-7822',
  'FM Comunication', '79300698',
  'Dra. Rhina Ramos', '7883-5308',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '143a4a73-ccf9-4195-976c-6d7c3b5c9e30', 'e1a59a81-88c2-47b9-94b0-4e4a64fcfeac',
  'Roberto Andrés Flores Morataya',
  '2018-01-04',
  'TDAH',
  'Colegio Salesiano San José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '143a4a73-ccf9-4195-976c-6d7c3b5c9e30';

-- Excel row 114 — Natalia Alexandra Franco Maza (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3da871c6-3e45-42a0-a56d-ccf13ac41ed9',
  'Alexandra Maza', 'dra.ale.maza@gmail.com', NULL,
  'Carlos Franco', NULL,
  'HNZ(Dermatóloga)', '7150-6215',
  'MQ', '7155-0380',
  'Dr. NAtali Huezo', '7827-6205',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '579dc321-fea8-4721-ad96-b54bb0c41844', '3da871c6-3e45-42a0-a56d-ccf13ac41ed9',
  'Natalia Alexandra Franco Maza',
  '2019-04-29',
  NULL,
  'Floresta',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = '579dc321-fea8-4721-ad96-b54bb0c41844';

-- Excel row 115 — Andrés Benjamín Guzmán Rodríguez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '4a281a20-3551-441b-8ccb-c22c5d6ac6f2',
  'Yanira Marisol Rodríguez de Guzmán', 'maryjrr1993@gmail.com', '2281-2495',
  'José Mario Guzmán Cañas', '7638-7231',
  'Optómetra', '6983-2583',
  'Comerciante', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'c0add54e-add0-43f3-8c4d-d1b591572ee4', '4a281a20-3551-441b-8ccb-c22c5d6ac6f2',
  'Andrés Benjamín Guzmán Rodríguez',
  '2019-04-07',
  'TEA',
  'Colegio Maya',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'c0add54e-add0-43f3-8c4d-d1b591572ee4';

-- Excel row 116 — Xochitl Valentina Henriquez Navarro (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '0288c22f-ce74-44b0-ac2f-e33e67f32acb',
  'Sonia Navarro de Henriquez', 'Snavarro9@gmail.com', NULL,
  'Manuel de Jesús Henriquez', NULL,
  'Ama de casa', '7013-7756',
  'PNC', '7645-9412',
  'Dr. Franklin Guevara', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'eb6a32ea-e73a-4851-9924-7dd9c52b66a2', '0288c22f-ce74-44b0-ac2f-e33e67f32acb',
  'Xochitl Valentina Henriquez Navarro',
  '2018-08-31',
  NULL,
  'Colegio el camino',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = 'eb6a32ea-e73a-4851-9924-7dd9c52b66a2';

-- Excel row 117 — Angel Andrés Hernández Pineda (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '95175e6a-61a1-49be-8ec2-8df7d788696b',
  'Lourdes de Hernández', 'leupalome93@gmail.com', '6116-1022',
  'Hector David Hernández Monge', '7153-5303',
  'ADMON', NULL,
  'Médico', NULL,
  'Hector David', '2530-2000',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd93bf1b0-d3cc-4378-96ba-51a457d7a5d6', '95175e6a-61a1-49be-8ec2-8df7d788696b',
  'Angel Andrés Hernández Pineda',
  '2018-09-06',
  NULL,
  'Liceo Salvadoreño',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'd93bf1b0-d3cc-4378-96ba-51a457d7a5d6';

-- Excel row 118 — Leonardo José Infantozzi Villeda (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a08d8f17-27d1-4d34-b99d-4f3ceb1211f2',
  'Victoria Villeda', 'vicksvilleda@gmail.com', '6978-8233',
  'Giampero Infantozzi', '6821-8352',
  NULL, NULL,
  'Cementos Fortaleza', NULL,
  'Marco Ayala', '7039-8418',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'a28167c6-1f6b-49be-9cca-b5235a6926bb', 'a08d8f17-27d1-4d34-b99d-4f3ceb1211f2',
  'Leonardo José Infantozzi Villeda',
  '2020-06-11',
  NULL,
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'a28167c6-1f6b-49be-9cca-b5235a6926bb';

-- Excel row 119 — Diego Antonio Lozano Rivera (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '649e2512-69cd-4878-aa31-0b3ff8826652',
  'Karla Erika Lizeth Rivera de Lozano', 'erikalozano.krea@gmail.com', NULL,
  'Gustavo Arnoldo Lozano Melara', NULL,
  'Profesional Independiente', '7856-3800',
  NULL, '7850-3453',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '2712c616-ae09-497d-a305-8b82765c8475', '649e2512-69cd-4878-aa31-0b3ff8826652',
  'Diego Antonio Lozano Rivera',
  '2019-12-12',
  'TEA',
  'Augusto Walte',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = '2712c616-ae09-497d-a305-8b82765c8475';

-- Excel row 120 — Bella Lozano Rivera (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b372a4ee-1a7a-4c29-9cb8-d82c616c03e9',
  'Erika de Lozano', 'erickalozano.Krea@gmail.com', '7856-3800',
  'Gustavo Lozano', '7850-3453',
  'Profesional Independiente', '2273-5436',
  'Profesional Independiente', NULL,
  'Dr. Gustavo Escobar', '7544-8400',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '74867667-d576-483b-b963-4538e4298daf', 'b372a4ee-1a7a-4c29-9cb8-d82c616c03e9',
  'Bella Lozano Rivera',
  '2018-02-24',
  'Problemas Conductuales',
  'Augusto Walte',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '74867667-d576-483b-b963-4538e4298daf';

-- Excel row 121 — David Ernesto Matamoros Ramírez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e517e2a0-1a8c-44e1-b084-b850a1552dea',
  'Griselda María Ramírez', 'grisma2910@gmail.com', '7140-0112',
  'David Ernesto Matamoros Bonilla', '7160-7718',
  'Latid Fertility Center', NULL,
  'San Rafael', NULL,
  'Dr. Patricia Recinos', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '937bfd1d-4665-4b7e-98d8-e7e73990a585', 'e517e2a0-1a8c-44e1-b084-b850a1552dea',
  'David Ernesto Matamoros Ramírez',
  '2022-11-07',
  NULL,
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = '937bfd1d-4665-4b7e-98d8-e7e73990a585';

-- Excel row 122 — Javier Enrique Morales Montoya (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '06e3e16f-e071-439f-99b8-ca124fbb986c',
  'Stephanie Vanessa Montoya de Morales', 'svmontoya@gmail.com', '7736-4405',
  'Manuel Eduardo Morales Montoya', '7605-5821',
  'Unilever', NULL,
  'Banco Cúscatlan', NULL,
  'Dr. Mauricio Flores', '2257-3370 /2225-3439',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '519f2cdf-b07e-44a3-8989-f02609a82d5f', '06e3e16f-e071-439f-99b8-ca124fbb986c',
  'Javier Enrique Morales Montoya',
  '2016-09-27',
  NULL,
  'Lamatepec',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '519f2cdf-b07e-44a3-8989-f02609a82d5f';

-- Excel row 123 — Derek Miguel Ortiz Bonilla (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ee7a6b0f-23ed-4560-b616-540557dd46d6',
  'Yuris Maricela Bonilla de Ortiz', 'yuris.bonilla1006@gmail.com', '7468-7105',
  'Carlos Miguel Ortiz Gónzalez', 'Abuela Sra. Maria Angela Gonzalez tel: 7101-0073',
  'Banco Abank, S.A.', NULL,
  'Aseguradora SISA', '7959-5891',
  'Dr. Huezo', '7768-8300',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd6d3b152-ba70-4582-86dc-f75bf7a7fe44', 'ee7a6b0f-23ed-4560-b616-540557dd46d6',
  'Derek Miguel Ortiz Bonilla',
  '2020-11-30',
  NULL,
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = 'd6d3b152-ba70-4582-86dc-f75bf7a7fe44';

-- Excel row 124 — Sailhy Antonella Parada Arevalo (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a627c000-10ae-4441-a526-4519b07fdd75',
  'Xiomara Griselda Areválo', 'Fparada71@gmail.com', '7947-6545',
  'Manuel Francis Parada Sorto', NULL,
  'Alcaldía Municipal de Armenia', '2511-0130',
  'PNC', '7887-0497',
  'Dr. Muñoz Bell (En caso de Emer. llamar después de la madre)', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '690b67fe-4ab2-431d-9978-bfaf9b48ae0f', 'a627c000-10ae-4441-a526-4519b07fdd75',
  'Sailhy Antonella Parada Arevalo',
  '2019-05-23',
  'TEA (Convulsivo)',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = '690b67fe-4ab2-431d-9978-bfaf9b48ae0f';

-- Excel row 125 — Eugenia Beatriz Peralta Alvarenga (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '700440b6-d1e1-478d-b735-f7d790ccd568',
  'Marta  Marcela Alvarenga', 'mmalvarenga86@gmail.com', '7894-2545',
  'Luis Roberto Peralta Murcia', '7859-3534',
  'SUCESS', NULL,
  'DZUCAR', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'cbc6399a-4af5-42a3-9fa3-4dd4ce7dd608', '700440b6-d1e1-478d-b735-f7d790ccd568',
  'Eugenia Beatriz Peralta Alvarenga',
  '2020-06-15',
  'Difiucltades Sensoriales',
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'cbc6399a-4af5-42a3-9fa3-4dd4ce7dd608';

-- Excel row 126 — Andrés Pecorini Villafranco (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '0816956e-8935-4f9f-885b-ff9c103fae23',
  'Meybelin Villafranco', 'meybelin.villafranco@gmail.com', NULL,
  'Eduardo Pecorini', NULL,
  NULL, '6300-9471',
  'Olimpo Tecnologias SA de CV', '63104850',
  'Dr. Gustavo Escobar', '2264-6622          7691-6997',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'e2629604-7b59-4cfb-b737-0ca5037736fe', '0816956e-8935-4f9f-885b-ff9c103fae23',
  'Andrés Pecorini Villafranco',
  '2017-05-22',
  'TEA',
  'Kinder Arbol de Dios',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = 'e2629604-7b59-4cfb-b737-0ca5037736fe';

-- Excel row 127 — José Luis Padilla Santamaria (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '57b15844-bdef-4517-810c-20578a27b245',
  'Sara Elena Santamaria', 'saraelensl2@gmail.com', 'Abuela Guadalupe Lobo 7815-2889',
  'Luis Adán F. Padilla', NULL,
  'CEPA', '7815-2818',
  'Corte Suprema de Justicia', '7450-2857',
  'Dra. Karla Campos de Cañada', '7165-8944',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'f248a490-54e5-42bb-919d-d0ffa1020a89', '57b15844-bdef-4517-810c-20578a27b245',
  'José Luis Padilla Santamaria',
  '2019-02-07',
  '-',
  'Montessoriano',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'f248a490-54e5-42bb-919d-d0ffa1020a89';

-- Excel row 128 — Felipe Andrés Pérez García (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '68b554e8-476d-49fe-82b5-869fbb603937',
  'Alejandra Estefanni García de Pérez', 'alejandra.gpérez09@gmail.com', '7887-9500',
  'José Gustavo Pérez Calderón', '7591-2221',
  'Print Xpress', NULL,
  'Print Xpress', NULL,
  'Dra. Glenda Villalta de  Paúl', '7170-7187',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '4946ae0e-5796-4c34-ae71-27641fd144e5', '68b554e8-476d-49fe-82b5-869fbb603937',
  'Felipe Andrés Pérez García',
  '2022-01-17',
  '-',
  'Colegio Agusto Walte',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4a' WHERE id = '4946ae0e-5796-4c34-ae71-27641fd144e5';

-- Excel row 129 — Kelly Víctoria Pocasangre Meza (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'bb0cdd33-fa74-4492-a0ff-b560e94de277',
  'Kelly Elizabeth Meza', 'meza.kelly@gmail.com', '7854-1343',
  'Carlos  Osmin Pocasangre', '7641-4567',
  'Bambu', NULL,
  'UES', NULL,
  'Dr. Rolando Espinoza', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '55c4d0cd-0ff0-47ad-9bd6-84180ca31b0f', 'bb0cdd33-fa74-4492-a0ff-b560e94de277',
  'Kelly Víctoria Pocasangre Meza',
  '2021-10-06',
  '-',
  'Escuela Bilingue Maquilishuat',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '55c4d0cd-0ff0-47ad-9bd6-84180ca31b0f';

-- Excel row 130 — Mathias Leandro Pérez Ledezma (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c20d89e0-e25e-455a-8201-5acf50b2c4f1',
  'Karla Marielos Ledezma Alvarado', 'karla.ledezma1806@gmail.com', '6421-1149',
  'Carlos Vladimir Perez Chicas', '7039-2098',
  'Negocio propio', '2510-3016',
  'Reciclador I CG de El Salvador', '2510-316',
  'Dra. Guadalupe', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '42ebc24a-9be5-47f5-87dc-cd535189f66b', 'c20d89e0-e25e-455a-8201-5acf50b2c4f1',
  'Mathias Leandro Pérez Ledezma',
  '2019-04-29',
  'TEA',
  'Los Robles',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '42ebc24a-9be5-47f5-87dc-cd535189f66b';

-- Excel row 131 — Madeline Susabeth Ramírez Melara (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'fd590f7c-50ce-4332-a65a-4caeb75c6533',
  'Liliana Susabeth Ramírez', 'susabeth2009@hotmail.com', '77490475',
  'Guillermo Alberto Ramírez', NULL,
  'ISS', NULL,
  'Alcaldía de San Sanlvador', NULL,
  'Dr. Bairos Neuroologo Dr. Sánchez Vides', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '6546a957-7112-4b03-b7cd-64d49cd63a93', 'fd590f7c-50ce-4332-a65a-4caeb75c6533',
  'Madeline Susabeth Ramírez Melara',
  '2025-04-10',
  'TEA',
  'Don Bosco',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '6546a957-7112-4b03-b7cd-64d49cd63a93';

-- Excel row 132 — Josías Saúl Rodriguez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'd968b9d4-4e81-426f-b029-a5af2ce96f8f',
  'Yanira Marisol Rodríguez de Guzmán', 'maryjrr1993@gmail.com', '2281-2495',
  'Saúl Neris Marroquin Maravilla', '7670-0598',
  'Optómetra', '6983-2583',
  NULL, NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '371596b3-9fcd-4bc8-9c92-491068501005', 'd968b9d4-4e81-426f-b029-a5af2ce96f8f',
  'Josías Saúl Rodriguez',
  '2014-10-13',
  NULL,
  'Colegio JESHUA esta en 3er grado',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 10 años' WHERE id = '371596b3-9fcd-4bc8-9c92-491068501005';

-- Excel row 133 — Elián André Reales Menjivar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2e325f54-f53e-43e6-bdab-41ddf1581784',
  'Selenia Menjivar', 'Bettyna.she@gmail.com', '7055-5686',
  NULL, NULL,
  'Bettyna Boutique', NULL,
  NULL, NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '72e33af5-50d5-4e10-9cd6-09383fe9b818', '2e325f54-f53e-43e6-bdab-41ddf1581784',
  'Elián André Reales Menjivar',
  '2016-08-31',
  'TEA',
  'Colegio Santa Cecilia',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '72e33af5-50d5-4e10-9cd6-09383fe9b818';

-- Excel row 134 — Diego Alejandro Ruiz Arteaga (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'f9516e15-18c9-40a8-b25b-ffd41261bf95',
  'Fátima Georgina Arteaga', 'fatimaarteaga@gmail.com', '7657-4803',
  'Fernando Miguel Ruiz', NULL,
  'TMC, Agencia  Gigital', NULL,
  NULL, NULL,
  '-', '-',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '0b8a950f-224c-4232-9bf5-f65b1425af30', 'f9516e15-18c9-40a8-b25b-ffd41261bf95',
  'Diego Alejandro Ruiz Arteaga',
  '2022-06-03',
  'Sospecha TEA',
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE' WHERE id = '0b8a950f-224c-4232-9bf5-f65b1425af30';

-- Excel row 135 — Rodrigo Nicolas Santos Acevedo (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '0e8df8b8-faf9-4fd1-90d6-c975fd8adc3f',
  'Florence Patricia Acevedo', 'florencesantosa@gmail.com', '7499-8761',
  'Rodrigo Andrés Santos Díaz', '7897-4693',
  'Multimoney', NULL,
  '1907 Property Managenent', NULL,
  'Dr. Leonel Alvarado', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '63cef229-519a-4475-a60c-1cc9d1a40e09', '0e8df8b8-faf9-4fd1-90d6-c975fd8adc3f',
  'Rodrigo Nicolas Santos Acevedo',
  '2017-08-11',
  '-',
  'Escuela Panamericana',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = '63cef229-519a-4475-a60c-1cc9d1a40e09';

-- Excel row 136 — Ariel Giuliana Santos Chicas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3386499f-d0eb-4bb2-afba-ca0bad458a0d',
  'Ulmis Maydel Chicas', 'ulmis10@gmail.com', '7654-5145',
  'Brigham Emerito Santos', '7166-8877',
  'ama de Casa', NULL,
  'Remoto', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '42e56186-2600-457a-a26b-3061781a7fbf', '3386499f-d0eb-4bb2-afba-ca0bad458a0d',
  'Ariel Giuliana Santos Chicas',
  '2014-09-08',
  'TEA',
  'Es. Especial de Santa Tecla',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 11 años' WHERE id = '42e56186-2600-457a-a26b-3061781a7fbf';

-- Excel row 137 — Andre Luciano Santos Chicas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '15f82c92-4901-4989-b846-8399b7b99ec2',
  'Ulmis Maydel Chicas', 'ulmis10@gmail.com', '7654-5145',
  'Brigham Emerito Santos', '7166-8877',
  'ama de Casa', NULL,
  'Remoto', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '0a21428f-b820-410b-8f60-a222e9ea945e', '15f82c92-4901-4989-b846-8399b7b99ec2',
  'Andre Luciano Santos Chicas',
  '2014-08-01',
  'TEA',
  'Es. Especial de Santa Tecla',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 14 años' WHERE id = '0a21428f-b820-410b-8f60-a222e9ea945e';

-- Excel row 138 — Brigham Alessadnro Santos Chicas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '815aaac6-2f71-46c7-ba76-6b7f6873ce2b',
  'Ulmis Maydel Chicas', 'ulmis10@gmail.com', '7654-5145',
  'Brigham Emerito Santos', '7166-8877',
  'ama de Casa', NULL,
  'Remoto', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '9ad7fede-9d3a-4233-8480-f084826da7ab', '815aaac6-2f71-46c7-ba76-6b7f6873ce2b',
  'Brigham Alessadnro Santos Chicas',
  '2010-02-21',
  'TEA',
  'Es. Especial de Santa Tecla',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 15 años' WHERE id = '9ad7fede-9d3a-4233-8480-f084826da7ab';

-- Excel row 139 — Jesús Alejandro Sánchez Elías (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '8cef046c-2805-4425-ab0b-60227c2559a3',
  'Ingrid Marilyn Elías Rivera', 'ingrideliasr@gmail.com', '6117-1041',
  'Jesús Roberto Sánchez', '7988-8968',
  'Call Center', NULL,
  'Call Center', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd52787f5-6c13-4daa-8661-e63d1a5ec83f', '8cef046c-2805-4425-ab0b-60227c2559a3',
  'Jesús Alejandro Sánchez Elías',
  '2017-11-24',
  'TEA',
  'Sagrado Corazón',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'd52787f5-6c13-4daa-8661-e63d1a5ec83f';

-- Excel row 140 — Fiorella Camila Sánchez Salazar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '893a9e45-8067-42c4-a15e-d3df04e077bc',
  'Maria Elena Salazar', 'mariaelenasalazar04@gmail.com', '2228-2319',
  'Julio Amilcar Sánchez', NULL,
  NULL, '7594-8091',
  NULL, '7222-4605',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd8c7c17a-e35a-4265-afa5-ec2010a4aa0d', '893a9e45-8067-42c4-a15e-d3df04e077bc',
  'Fiorella Camila Sánchez Salazar',
  '2016-04-12',
  'TEA',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = 'd8c7c17a-e35a-4265-afa5-ec2010a4aa0d';

-- Excel row 141 — Ana Sofía Sorto Estévez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a82e23e5-d09f-4923-8016-79a3673a2b13',
  'Dircia  Margarita Estevez de Sorto', 'dircia_estevez@yahoo.com', '7987-9707',
  'José Israel Sorto Ortiz', '7987-9616',
  'Admon. de Empresas', NULL,
  'Walmart', NULL,
  'Dr. Gustvo Cardona', '2247-1156',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '798adc7c-b2ae-4c62-aa2e-f5597d2798be', 'a82e23e5-d09f-4923-8016-79a3673a2b13',
  'Ana Sofía Sorto Estévez',
  '2017-02-08',
  'TEA',
  'Col. Americano de El Salvador',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '798adc7c-b2ae-4c62-aa2e-f5597d2798be';

-- Excel row 142 — Carlos Emiliano Sanchez Calderón (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '015fb73a-0108-4eda-8ff5-79519a19f237',
  'Karla Maria Calderón', 'Karlacalderonson@gmail.com', '7403 9468',
  'Carlos Roberto Sánchez', NULL,
  'Uno Renta Car S. A de C.V', NULL,
  'Negocio propio', '7939-0039',
  'Dra. Alicia Cruz', '7741-5072',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '247f3e0e-58a5-4321-9dfc-8b00b32757d4', '015fb73a-0108-4eda-8ff5-79519a19f237',
  'Carlos Emiliano Sanchez Calderón',
  '2020-02-11',
  NULL,
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '247f3e0e-58a5-4321-9dfc-8b00b32757d4';

-- Excel row 143 — Emily Montserrat Urrutia Urrutia (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ea091ab4-319f-47d2-ba8f-f552aecefb26',
  'Gregory Elizabeth de Urrutia', 'eli_portillo@yahoo.com', '6013-2427',
  'José Luis Urrutia', '6013-2427',
  'Abogado', NULL,
  'Dine Brands', NULL,
  'Dr. Roberto Zablah', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'b71e7329-c258-4dc3-ac50-022ec92f8239', 'ea091ab4-319f-47d2-ba8f-f552aecefb26',
  'Emily Montserrat Urrutia Urrutia',
  '2021-08-31',
  NULL,
  'Colegio Maya',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = 'b71e7329-c258-4dc3-ac50-022ec92f8239';

-- Excel row 144 — Lucas Alfredo Urías Iraheta (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ba9a7934-7031-473e-a0d8-50c3c5c76faa',
  'Sonaya Malbina Iraheta', NULL, '7854-1145',
  'Carlos Norberto Urías', '7854-1145',
  'Etesal', NULL,
  NULL, NULL,
  'Dra. Jessica Posada / Dr. Sánchez Vides', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '1bf67bc3-d933-46bd-9550-e2db916b1934', 'ba9a7934-7031-473e-a0d8-50c3c5c76faa',
  'Lucas Alfredo Urías Iraheta',
  '2020-04-09',
  'Baja Visión',
  'Eugenia de Dueñas',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '1bf67bc3-d933-46bd-9550-e2db916b1934';

-- Excel row 145 — Adrian Vargas Paz (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '1cdf6c61-1f83-413e-9a16-2a32bd3227c4',
  'Ana Marcela Paz Marin', 'ann_marce01@hotmail.com', NULL,
  'José María Vargas Torrico', NULL,
  'Hotel Sheraton', '7870-4605',
  'Hotel Hyatt', '7910-4124',
  'Dra. Angela de Baños', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '21c69f59-3fab-4633-980e-aeeb110d1fe1', '1cdf6c61-1f83-413e-9a16-2a32bd3227c4',
  'Adrian Vargas Paz',
  '2021-03-08',
  'Sospecha TEA',
  'No escolarizado',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '21c69f59-3fab-4633-980e-aeeb110d1fe1';

-- Excel row 146 — Adrian Valentin Vásquez Hernández (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '8cc82e29-8a26-424e-8d36-f757a641b6b9',
  'Marta de Vásquez', 'ceciliahernandez1912@outlook.es', '2520-2919',
  'José Adrian Vasquez', '7989-6099',
  'Pollos Don San Valentín', '7018-1274',
  'Pollos Don San Valentín', NULL,
  'Dr. Jorge Pleitez', '2214-7179',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'e1abe7dc-92e9-4264-874a-9c18fde87bfa', '8cc82e29-8a26-424e-8d36-f757a641b6b9',
  'Adrian Valentin Vásquez Hernández',
  '2017-08-15',
  'Síndrome Down',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = 'e1abe7dc-92e9-4264-874a-9c18fde87bfa';

-- Excel row 147 — Anika Zablah Massis (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '5a63c90f-c089-4fe5-bd73-f8a4f579a321',
  'Ana  Lucia Massis', 'luciamassisb@hotmail.com', '7850-2704',
  'Alfonso Zablah', '7850-2704',
  'Ama de casa', '7744-5479',
  'Conos y  Pajilla Sol', NULL,
  'Dr. Jaime Escolan', '2263-3073',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '831da0e3-08aa-4e43-9635-e3cca55feee4', '5a63c90f-c089-4fe5-bd73-f8a4f579a321',
  'Anika Zablah Massis',
  '2023-06-29',
  'Dificultades Sensoriales',
  'Kínder Horízontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 2 años' WHERE id = '831da0e3-08aa-4e43-9635-e3cca55feee4';

-- Excel row 152 — Levi Manuel Alfaro Paniagua (PROGRAMA ADAPTATIVO)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c6440d91-4d7a-4adf-acc4-efe6e3b717f5',
  'Elsy de Alfaro', 'victor_2788@hotmail.com', NULL,
  'Víctor Manuel Alfaro', NULL,
  'Ama de Casa', '7989-0970',
  'Multiriesgos', NULL,
  'Dra. Roxana Marrenco', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '7c4cd972-1202-47fc-9327-40580c79ee93', 'c6440d91-4d7a-4adf-acc4-efe6e3b717f5',
  'Levi Manuel Alfaro Paniagua',
  '2018-11-15',
  'TEA',
  'Semillitas',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: PROGRAMA ADAPTATIVO · Programa Excel: Programa adaptativo · Edad al importar: 6 años' WHERE id = '7c4cd972-1202-47fc-9327-40580c79ee93';

-- Excel row 153 — Kylian Alessandro Henriquez Navarro (PROGRAMA ADAPTATIVO)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'cc50d581-9fbf-424d-a93a-1933ef460891',
  'Sonia del Carmen Navarro de Henriquez', 'snavarro9@gmail.com', NULL,
  'Manuel de Jesús Henrríquez', NULL,
  NULL, '7013-7756',
  'PNC', '7645-9412',
  'Dra. Karla Flores', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '780b9d31-63ac-4e7b-8e76-3ffc3020b7f9', 'cc50d581-9fbf-424d-a93a-1933ef460891',
  'Kylian Alessandro Henriquez Navarro',
  '2020-01-07',
  'TEA',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: PROGRAMA ADAPTATIVO · Programa Excel: Programa adaptativo · Edad al importar: 5 años' WHERE id = '780b9d31-63ac-4e7b-8e76-3ffc3020b7f9';

-- Excel row 160 — Lila Franceska Argueta Retana (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '8780c454-7f4f-4025-9762-8d5f5c50403b',
  'Johanna Veralisse Retana Argueta', 'johanna.retana01@gmail.com', '7926-7806',
  'Francisco Israel Argueta Soto', '63055852',
  'Raun', NULL,
  'Hielo', NULL,
  'Dr. David Valencia', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '5868233f-9e5b-40d2-a9ab-9f61537f692c', '8780c454-7f4f-4025-9762-8d5f5c50403b',
  'Lila Franceska Argueta Retana',
  '2023-12-04',
  '-',
  'Kids Lourdes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 2 años' WHERE id = '5868233f-9e5b-40d2-a9ab-9f61537f692c';

-- Excel row 161 — José Alessandro Castro Mejía (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '122a8b62-b1bc-43d2-8d43-f8cb449cdae1',
  'Laura Maria Mejia', 'dore.castro@hotmail.com', '7030-7498',
  'Doré Francisco Castro Portillo', '7030-7498',
  'SISA', NULL,
  NULL, NULL,
  'Dr. Jorge Gonzales', '7899-5424',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'd2b3a631-54de-4e52-b83d-f27ec1fa680f', '122a8b62-b1bc-43d2-8d43-f8cb449cdae1',
  'José Alessandro Castro Mejía',
  '2012-07-01',
  'Problemas Conductuales',
  'Externado San José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 13 años' WHERE id = 'd2b3a631-54de-4e52-b83d-f27ec1fa680f';

-- Excel row 162 — Jorge Ramón Del Cid García (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'fb15975d-36bf-4ad1-8c7f-737fcc03fbf2',
  'Jenny Carolina García Del Cid', 'jennygarcía11@hotmail.com', '22641000',
  'Jorge Alberto Del Cid', NULL,
  'Academia Cristiana Internacional', '7318-6793',
  'APCE Lamatepec', '7318-6793',
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'c0b3a688-4ca9-44c4-830f-8f74eab235e1', 'fb15975d-36bf-4ad1-8c7f-737fcc03fbf2',
  'Jorge Ramón Del Cid García',
  '2023-04-26',
  'TEA',
  'Academia Cristiana Internacional',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 2 años' WHERE id = 'c0b3a688-4ca9-44c4-830f-8f74eab235e1';

-- Excel row 163 — Andrés Benjamín Guzmán Rodríguez (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'fa8759ea-76a6-44ac-8157-2a0ff962a238',
  'Yanira Marisol Rodríguez de Guzmán', 'maryjrr1993@gmail.com', '2281-2495',
  'José Mario Guzmán Cañas', '7638-7231',
  'Optómetra', '6983-2583',
  'Comerciante', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '4a61f242-2e07-4fec-91c4-95cb17699d7a', 'fa8759ea-76a6-44ac-8157-2a0ff962a238',
  'Andrés Benjamín Guzmán Rodríguez',
  '2019-04-07',
  'TEA',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 6 años' WHERE id = '4a61f242-2e07-4fec-91c4-95cb17699d7a';

-- Excel row 164 — Eva Mariel Kessels Bolaños (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c4f36fbe-3bcc-48ff-b855-99fb4032645d',
  'Luisa Maria Bolaños de Kessels', 'luimab2@gmail.com', '7399-2224',
  'Mario Edmundo Kessels Vargas', '7885-6301',
  'Stitch Santa Ana', NULL,
  'Axialent (Remoto)', NULL,
  'Dr. Wilfredo de Parada', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'ae8b05e4-eb9a-4387-b249-ebdb7077176c', 'c4f36fbe-3bcc-48ff-b855-99fb4032645d',
  'Eva Mariel Kessels Bolaños',
  '2015-09-21',
  '-',
  'Salesiano San  José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 10a' WHERE id = 'ae8b05e4-eb9a-4387-b249-ebdb7077176c';

-- Excel row 165 — Oliver Oswaldo Morán Granillo (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '0ad15162-55af-4651-b691-3315accffe99',
  'Ivette Granillo de Morán', 'ivigat512@hotmail.com', '7127-9031',
  'Ever Morán Ortiz', '7885-8248',
  'H. de Diágnostico', '25422097',
  'Quimicas Consolidadas', NULL,
  'Dr. Amando Amaya', '7127-9031',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '3a6395ba-430f-41d6-93a1-384f3710c03a', '0ad15162-55af-4651-b691-3315accffe99',
  'Oliver Oswaldo Morán Granillo',
  '2017-08-07',
  NULL,
  'Col.  Maria Auxiliadora',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 8 años' WHERE id = '3a6395ba-430f-41d6-93a1-384f3710c03a';

-- Excel row 166 — Ian Matteo Molina Peréz (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '1b631c94-e3b7-4ea3-8856-3cff8d1fc398',
  'Carmen María Peréz de León', 'marycarmen.doc@hotmail.com', '7601-2997',
  'Miguel Antonio Molina Flores', '7530-4328',
  'Universidad Alberto Masferrer', '2231-9623',
  'Negocio propio', NULL,
  'Dra. Karla Flores', '6144-7626',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'c3f20d34-10cc-4ebc-a1d1-c82ab0aed79c', '1b631c94-e3b7-4ea3-8856-3cff8d1fc398',
  'Ian Matteo Molina Peréz',
  '2020-11-04',
  'Dificultades Sensoriales',
  'Cu-cu-cu-cu',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 4 años' WHERE id = 'c3f20d34-10cc-4ebc-a1d1-c82ab0aed79c';

-- Excel row 167 — José Luis Padilla Santamaria (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '276e3e3b-187d-4b89-ba9d-a52f577d0991',
  'Sara Elena Santamaria', 'saraelensl2@gmail.com', NULL,
  'Luis Adán F. Padilla', NULL,
  'CEPA', '7815-2818',
  'Corte Suprema de Justicia', '7450-2857',
  'Dra. Karla Campos de Cañada', '7165-8944',
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '0f5ea8de-7fa6-4433-9a2b-2da3dedb72a9', '276e3e3b-187d-4b89-ba9d-a52f577d0991',
  'José Luis Padilla Santamaria',
  '2019-02-07',
  NULL,
  'Montessoriano',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 6 años' WHERE id = '0f5ea8de-7fa6-4433-9a2b-2da3dedb72a9';

-- Excel row 168 — Ariella Xaneri Ramirez Funes (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c02b5eb9-393c-4ddc-a305-c990f2adcf04',
  'Diana Beatriz  Funes Oyuela', 'diabea22@gmail.com', '7840-0166',
  'William Ernesto Ramírez Quintanilla', '7012-4146',
  'Tec. en Ing. Electronica', NULL,
  'Cognizant', NULL,
  NULL, NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  '0c6eccc3-5e08-4a68-be56-b035fc2c2291', 'c02b5eb9-393c-4ddc-a305-c990f2adcf04',
  'Ariella Xaneri Ramirez Funes',
  '2022-12-05',
  '.',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 3 años' WHERE id = '0c6eccc3-5e08-4a68-be56-b035fc2c2291';

-- Excel row 169 — Gustavo Alejandro Siguenza Pérez (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b3dfef72-751b-4de9-ab3b-8643997cfff3',
  'Julia Guadalupe Pérez de Siguenza', 'juliaperez89@hotmail.com', '2522-5097',
  'Josue Moises Siguenza Juarez', '7102-0148',
  'Dirección Nacional de medicamentos', '7163-1929',
  'Alcaldia Mun.  de Atiguo C.', 'Gilberto Abuelo: 7797-3069',
  'Dr. Glenda de Paul/ Dr. Manuel Sanchez Vides', NULL,
  'active'
);

INSERT INTO public.children (
  id, family_id, full_name, birth_date,
  diagnoses_display_text, school_name,
  enrolled_program, enrollment_started_at,
  current_phase_code, current_phase_changed_at,
  photo_consent
) VALUES (
  'b47edd43-5c04-4dc2-ad42-570d71a653cf', 'b3dfef72-751b-4de9-ab3b-8643997cfff3',
  'Gustavo Alejandro Siguenza Pérez',
  '2020-06-15',
  'TEA',
  'Centro Semillitas de Dios',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 5 años' WHERE id = 'b47edd43-5c04-4dc2-ad42-570d71a653cf';

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.families)        AS families,
  (SELECT COUNT(*) FROM public.children)        AS children,
  (SELECT COUNT(*) FROM public.children WHERE current_phase_code = '5_2_retirado') AS retirados,
  (SELECT COUNT(*) FROM public.children WHERE enrolled_program IS NOT NULL) AS matutinos,
  (SELECT COUNT(*) FROM public.treatment_plans) AS plans;
