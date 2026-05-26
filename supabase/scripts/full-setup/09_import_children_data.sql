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
  '417aeee2-b79e-4650-abf4-09d881b8b328',
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
  '4494cc37-956e-48ac-b027-231091d63f53', '417aeee2-b79e-4650-abf4-09d881b8b328',
  'Aaron Esmith Alvarenga Chávez',
  '2014-12-15',
  NULL,
  'No escolarizado',
  'blue_kids',
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS · Programa Excel: BLUE KIDS' WHERE id = '4494cc37-956e-48ac-b027-231091d63f53';

-- Excel row 26 — Ángel Daniel Ayala Navas (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '5849a508-12d1-4c2c-aa0d-cb86e4288836',
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
  '69d0f507-202d-4a1c-8e34-ef4d28040d00', '5849a508-12d1-4c2c-aa0d-cb86e4288836',
  'Ángel Daniel Ayala Navas',
  '2022-08-20',
  'Sospecha TEA',
  NULL,
  'blue_kids',
  '2025-01-13',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 3 años' WHERE id = '69d0f507-202d-4a1c-8e34-ef4d28040d00';

-- Excel row 27 — Lionel Xavier Ayala Clavel (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '69667231-9ab5-453a-bfe3-8937f16d389b',
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
  '30dd53c7-900e-4d80-b2d7-bf1715bc9121', '69667231-9ab5-453a-bfe3-8937f16d389b',
  'Lionel Xavier Ayala Clavel',
  '2020-04-18',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2024-01-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 6 años' WHERE id = '30dd53c7-900e-4d80-b2d7-bf1715bc9121';

-- Excel row 28 — Daniel André Campos Línares (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2d93fcf2-72f6-4752-8dc1-4b7849f66dae',
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
  '8e3d2859-990d-411a-b23c-7c0b273d58df', '2d93fcf2-72f6-4752-8dc1-4b7849f66dae',
  'Daniel André Campos Línares',
  '2023-03-17',
  'TEA',
  NULL,
  'blue_kids',
  '2026-01-07',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 3 años' WHERE id = '8e3d2859-990d-411a-b23c-7c0b273d58df';

-- Excel row 29 — Josué René Claros Saca (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '312b6c9e-c659-4d9b-953b-3a3f8f06eef7',
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
  '55875f13-408b-4a27-9f0e-cc87d3f7e05d', '312b6c9e-c659-4d9b-953b-3a3f8f06eef7',
  'Josué René Claros Saca',
  '2021-01-23',
  'TEA',
  'Mis PrimerosAmiguitos',
  'blue_kids',
  '2025-02-04',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 5 años' WHERE id = '55875f13-408b-4a27-9f0e-cc87d3f7e05d';

-- Excel row 30 — Gabriel Adriano Guerrero Antognelle (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e00c882a-fb45-4d4b-af06-bd8a394be7c0',
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
  'eff8de6e-7aba-4832-8140-6cec46bc8ee2', 'e00c882a-fb45-4d4b-af06-bd8a394be7c0',
  'Gabriel Adriano Guerrero Antognelle',
  '2021-10-25',
  NULL,
  'Aprendo kids merliot',
  'blue_kids',
  '2024-06-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 4 años' WHERE id = 'eff8de6e-7aba-4832-8140-6cec46bc8ee2';

-- Excel row 31 — Emilio Misael Leonel Martinez (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2de3be38-4167-44c4-a698-017d7f2f0d1f',
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
  'fbef4398-3c44-4934-943b-f9e23bc6d04c', '2de3be38-4167-44c4-a698-017d7f2f0d1f',
  'Emilio Misael Leonel Martinez',
  '2020-06-23',
  'TEA',
  NULL,
  'blue_kids',
  '2023-02-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 5 años' WHERE id = 'fbef4398-3c44-4934-943b-f9e23bc6d04c';

-- Excel row 32 — Monica Lucía Zelaya Ruiz (BLUE KIDS 1)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '5c7a5d39-acc5-4a94-8f76-51253a70f737',
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
  '16622c24-5548-4209-924a-64dd3566ceff', '5c7a5d39-acc5-4a94-8f76-51253a70f737',
  'Monica Lucía Zelaya Ruiz',
  '2020-05-13',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 1 · Programa Excel: BLUE KIDS 1 · Edad al importar: 6 años' WHERE id = '16622c24-5548-4209-924a-64dd3566ceff';

-- Excel row 36 — Manuel Alessandro Aguilar Alferez (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '4c39aeef-b224-4615-a5e8-3eaa89f5408f',
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
  '4258eaef-7c51-4bac-9cf5-071fcdc91899', '4c39aeef-b224-4615-a5e8-3eaa89f5408f',
  'Manuel Alessandro Aguilar Alferez',
  '2016-11-26',
  'TEA',
  NULL,
  'blue_kids',
  '2023-03-06',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 8 años' WHERE id = '4258eaef-7c51-4bac-9cf5-071fcdc91899';

-- Excel row 37 — Juan Pablo Caceres Hernández (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e834afaf-7a3c-4f6d-b395-990b32a4e1de',
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
  '40ee3f9b-585e-4a0f-8fdc-ed4121793913', 'e834afaf-7a3c-4f6d-b395-990b32a4e1de',
  'Juan Pablo Caceres Hernández',
  '2013-01-11',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2019-04-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 12 años' WHERE id = '40ee3f9b-585e-4a0f-8fdc-ed4121793913';

-- Excel row 38 — José Andrés Funes Alvarenga (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '63f8d545-93e3-427c-bef4-0e2f834a4de5',
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
  'bbcca6cd-7eb2-4c23-9a09-1c3219c083eb', '63f8d545-93e3-427c-bef4-0e2f834a4de5',
  'José Andrés Funes Alvarenga',
  '2014-08-13',
  'TEA',
  'Kinder Amiguitos',
  'blue_kids',
  '2018-10-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 11 años' WHERE id = 'bbcca6cd-7eb2-4c23-9a09-1c3219c083eb';

-- Excel row 39 — Kylian Alessandro Henriquez Navarro (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '509a50c8-00ea-4490-aac2-692231b1726e',
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
  '7cb5da59-4307-4bde-ab80-1cbad2eda083', '509a50c8-00ea-4490-aac2-692231b1726e',
  'Kylian Alessandro Henriquez Navarro',
  '2020-01-07',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-05',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 5 años' WHERE id = '7cb5da59-4307-4bde-ab80-1cbad2eda083';

-- Excel row 40 — Enrique Merari Montoya (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3565af92-1032-4177-b55c-10e1a54cc220',
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
  'e78a3549-5766-466f-99f6-4dc1ff9237d4', '3565af92-1032-4177-b55c-10e1a54cc220',
  'Enrique Merari Montoya',
  '2017-03-28',
  'TEA',
  NULL,
  'blue_kids',
  '2024-01-25',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 8 años' WHERE id = 'e78a3549-5766-466f-99f6-4dc1ff9237d4';

-- Excel row 41 — Fernando Alejandro Tejada Llanes (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'fc6eb36c-9388-4032-8bd9-3b4b37af1a16',
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
  '2f52a02f-1068-4ee0-b1a7-558ef18d71df', 'fc6eb36c-9388-4032-8bd9-3b4b37af1a16',
  'Fernando Alejandro Tejada Llanes',
  '2014-05-09',
  'TEA',
  NULL,
  'blue_kids',
  '2024-01-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2' WHERE id = '2f52a02f-1068-4ee0-b1a7-558ef18d71df';

-- Excel row 42 — Andrés Isaías Molina Molina (BLUE KIDS 2)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '22b2c1c2-3944-41e2-8e4d-55b4aa247498',
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
  '04c4c8a6-9b3b-48f6-b026-7bc3e67b480b', '22b2c1c2-3944-41e2-8e4d-55b4aa247498',
  'Andrés Isaías Molina Molina',
  '2018-01-18',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-05',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 2 · Programa Excel: BLUE KIDS 2 · Edad al importar: 7 años' WHERE id = '04c4c8a6-9b3b-48f6-b026-7bc3e67b480b';

-- Excel row 45 — Mathias Carranza Pineda (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '57c5b576-61e4-43b3-a773-2d1760384b43',
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
  '908e08de-9ae2-4fd4-9492-502fc6e40d36', '57c5b576-61e4-43b3-a773-2d1760384b43',
  'Mathias Carranza Pineda',
  '2018-11-02',
  'TEA',
  NULL,
  'blue_kids',
  '2024-03-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 7 años' WHERE id = '908e08de-9ae2-4fd4-9492-502fc6e40d36';

-- Excel row 46 — Marco Andrés Iraheta Palma (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '4140a75e-ef5d-40ab-9052-adf93575c6f7',
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
  '00d28bf2-d7be-46a7-8317-77d8e389b2ce', '4140a75e-ef5d-40ab-9052-adf93575c6f7',
  'Marco Andrés Iraheta Palma',
  '2016-09-01',
  'TEA',
  NULL,
  'blue_kids',
  '2023-11-21',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 9 años' WHERE id = '00d28bf2-d7be-46a7-8317-77d8e389b2ce';

-- Excel row 47 — Jhonatan Isaias Galvez Ulloa (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2ef94e56-6149-4d61-ac5b-67006e8feb69',
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
  '297ef86c-88ac-467c-94e4-4ccdaa3f397c', '2ef94e56-6149-4d61-ac5b-67006e8feb69',
  'Jhonatan Isaias Galvez Ulloa',
  '2015-02-13',
  'TEA',
  NULL,
  'blue_kids',
  '2023-01-30',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 10 años' WHERE id = '297ef86c-88ac-467c-94e4-4ccdaa3f397c';

-- Excel row 48 — Esteban Francisco Romero Velásquez (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '9902aeb3-fca4-48dd-97e5-ac6f4eaeef7c',
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
  '281dc7b6-e307-4c42-902b-f7a361f64ac0', '9902aeb3-fca4-48dd-97e5-ac6f4eaeef7c',
  'Esteban Francisco Romero Velásquez',
  '2015-12-01',
  'TEA',
  NULL,
  'blue_kids',
  '2023-11-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 9 años' WHERE id = '281dc7b6-e307-4c42-902b-f7a361f64ac0';

-- Excel row 49 — Carlos René Quintanilla Díaz (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '7c908bd3-360c-4f8e-874f-801b2852bf39',
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
  'a62e168c-ab8b-48d1-8b7a-3294b999265c', '7c908bd3-360c-4f8e-874f-801b2852bf39',
  'Carlos René Quintanilla Díaz',
  '2014-10-25',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2023-03-14',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 10 años' WHERE id = 'a62e168c-ab8b-48d1-8b7a-3294b999265c';

-- Excel row 50 — Franco Alejandro Rivera Roverso (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '52d17b1d-8dab-464d-bdf6-4c7c266de76b',
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
  'a4991661-6147-457e-8d7d-e7f81d12cf3a', '52d17b1d-8dab-464d-bdf6-4c7c266de76b',
  'Franco Alejandro Rivera Roverso',
  '2018-11-09',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2021-10-13',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 6 años' WHERE id = 'a4991661-6147-457e-8d7d-e7f81d12cf3a';

-- Excel row 51 — Sofía Giselle Fuentes Mulato (BLUE KIDS 3)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '22e9d0b7-efee-4bb7-b2e4-339f20385e1d',
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
  'bcbd4377-f43a-4ee1-b518-e7b94650bf7f', '22e9d0b7-efee-4bb7-b2e4-339f20385e1d',
  'Sofía Giselle Fuentes Mulato',
  '2018-01-18',
  NULL,
  NULL,
  'blue_kids',
  '2025-02-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 3 · Programa Excel: BLUE KIDS 3 · Edad al importar: 7 años' WHERE id = 'bcbd4377-f43a-4ee1-b518-e7b94650bf7f';

-- Excel row 54 — Danny Elias Alvarenga Herrera (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3b9bf9a9-f3cd-43e3-9fea-893900ba3e73',
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
  'd5cccd3f-e277-42f8-9fee-cc81fed944fe', '3b9bf9a9-f3cd-43e3-9fea-893900ba3e73',
  'Danny Elias Alvarenga Herrera',
  '2019-04-12',
  'TEA',
  NULL,
  'blue_kids',
  '2025-07-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 6 años' WHERE id = 'd5cccd3f-e277-42f8-9fee-cc81fed944fe';

-- Excel row 55 — Eduardo Mateo Galdamez Figueroa (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b4c92e74-a8b4-4dc3-9eee-8c754874fffd',
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
  '223aad39-2425-4570-a13b-73a60671bfa6', 'b4c92e74-a8b4-4dc3-9eee-8c754874fffd',
  'Eduardo Mateo Galdamez Figueroa',
  '2017-10-13',
  'TEA',
  'No escolarizado',
  'blue_kids',
  '2021-08-09',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 7 años' WHERE id = '223aad39-2425-4570-a13b-73a60671bfa6';

-- Excel row 56 — André Javier García Madrid (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '6e62a7da-c7af-4bc1-9b5f-016dcb892ada',
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
  '4c4bd4d3-d56b-4b9a-a48a-63e227650cd1', '6e62a7da-c7af-4bc1-9b5f-016dcb892ada',
  'André Javier García Madrid',
  '2020-09-10',
  'TEA',
  NULL,
  'blue_kids',
  '2024-01-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 5 años' WHERE id = '4c4bd4d3-d56b-4b9a-a48a-63e227650cd1';

-- Excel row 57 — Daniel Andrés Pérez Rubio (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ea655df4-b9d5-4e77-97fa-15ac277a005d',
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
  'c703ace7-4a9c-4759-88bd-1a98f935d588', 'ea655df4-b9d5-4e77-97fa-15ac277a005d',
  'Daniel Andrés Pérez Rubio',
  '2020-05-18',
  'TEA',
  'San José Olocuilta',
  'blue_kids',
  '2024-02-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: BLUE KIDS 4 · Edad al importar: 5 años' WHERE id = 'c703ace7-4a9c-4759-88bd-1a98f935d588';

-- Excel row 58 — Mattheo Recinos Mendez (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '842431e4-943a-4a74-b328-7ba81f5df097',
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
  '64e8a30b-ad84-4ad2-bc56-95dfaf06a2de', '842431e4-943a-4a74-b328-7ba81f5df097',
  'Mattheo Recinos Mendez',
  '2020-09-26',
  'TEA',
  NULL,
  'blue_kids',
  '2024-02-09',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '64e8a30b-ad84-4ad2-bc56-95dfaf06a2de';

-- Excel row 59 — Víctor André Melgar Rousseau (BLUE KIDS 4)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'f11c8160-08ec-4616-8233-383ae5a354c0',
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
  'a4088c4b-7363-43af-bc18-1c90f3d34f6b', 'f11c8160-08ec-4616-8233-383ae5a354c0',
  'Víctor André Melgar Rousseau',
  '2020-07-23',
  'Sospecha TEA',
  'Agustin Fernandez Santos',
  'blue_kids',
  '2025-09-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: BLUE KIDS 4 · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'a4088c4b-7363-43af-bc18-1c90f3d34f6b';

-- Excel row 65 — Elián Carlos Hidalgo López (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2b588afb-5a8f-46d0-8497-c310f1c704de',
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
  '0fcf3a70-5441-4842-875b-eed0de5e9c15', '2b588afb-5a8f-46d0-8497-c310f1c704de',
  'Elián Carlos Hidalgo López',
  '2020-10-24',
  'TDAH. + R.G Neuro.',
  NULL,
  'learning_kids',
  '2026-02-02',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: LEARNING KIDS · Edad al importar: 5 años' WHERE id = '0fcf3a70-5441-4842-875b-eed0de5e9c15';

-- Excel row 66 — Fiorella Carolina Fuentes Hernández (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ca9f5f6f-381d-48df-945c-8588629ef8a6',
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
  '23a464ba-d40e-4185-9720-0c95b53c0589', 'ca9f5f6f-381d-48df-945c-8588629ef8a6',
  'Fiorella Carolina Fuentes Hernández',
  '2019-10-07',
  'TEA',
  NULL,
  'learning_kids',
  '2025-06-01',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: LEARNING KIDS · Edad al importar: 6 años' WHERE id = '23a464ba-d40e-4185-9720-0c95b53c0589';

-- Excel row 67 — Minerva Jazmin Roman Vivas (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '237205b9-0d40-46f0-98b0-e7c6250357bf',
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
  'c7cefee8-4882-45a2-b9e0-f061ca90fb28', '237205b9-0d40-46f0-98b0-e7c6250357bf',
  'Minerva Jazmin Roman Vivas',
  '2018-02-09',
  'TEA',
  'No escolarizado',
  'learning_kids',
  '2021-09-21',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: LEARNING KIDS · Edad al importar: 8 años' WHERE id = 'c7cefee8-4882-45a2-b9e0-f061ca90fb28';

-- Excel row 68 — Adrian Valentin Vásquez Hernández (LEARNING KIDS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'eff3ee89-d891-446a-be60-d1f8154e3009',
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
  '6edf9445-4005-4337-8586-56c7b540c1dd', 'eff3ee89-d891-446a-be60-d1f8154e3009',
  'Adrian Valentin Vásquez Hernández',
  '2017-08-15',
  'Síndrome Down',
  'Kinder Amiguitos',
  'learning_kids',
  '2024-01-31',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: LEARNING KIDS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = '6edf9445-4005-4337-8586-56c7b540c1dd';

-- Excel row 74 — Lourdes Adriana Carranza García (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '4a2453bd-6265-4cea-bc84-e9ce315235d9',
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
  '8edc65ab-8b86-49fa-8503-349069bb5ddb', '4a2453bd-6265-4cea-bc84-e9ce315235d9',
  'Lourdes Adriana Carranza García',
  '2013-07-29',
  NULL,
  'Amiguitos',
  'aula_educativa',
  '2024-01-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 12 años' WHERE id = '8edc65ab-8b86-49fa-8503-349069bb5ddb';

-- Excel row 75 — Daniella Belén Cornejo Crúz (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2f02921c-1ce3-4214-b79c-e4ba80d9c3af',
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
  'f1539bc3-a89d-485d-bfb6-3a63e9661ba8', '2f02921c-1ce3-4214-b79c-e4ba80d9c3af',
  'Daniella Belén Cornejo Crúz',
  '2014-02-01',
  NULL,
  NULL,
  'aula_educativa',
  '2022-10-10',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 11 años' WHERE id = 'f1539bc3-a89d-485d-bfb6-3a63e9661ba8';

-- Excel row 76 — Sophia Rebeca Girón Sansivirini (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a50a6a92-f69e-4612-868f-59a8f9cb62d9',
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
  '4e3b2a21-2dc5-453e-874a-474865a9bfd7', 'a50a6a92-f69e-4612-868f-59a8f9cb62d9',
  'Sophia Rebeca Girón Sansivirini',
  '2016-06-20',
  NULL,
  NULL,
  'aula_educativa',
  '2023-05-08',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 9 años' WHERE id = '4e3b2a21-2dc5-453e-874a-474865a9bfd7';

-- Excel row 77 — Federico Mendoza Lemus (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'bfa45db9-1903-4814-8e93-164a60d393c1',
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
  '3b300f2a-2695-4e4e-bc3c-e62b25fd2c63', 'bfa45db9-1903-4814-8e93-164a60d393c1',
  'Federico Mendoza Lemus',
  '2006-09-08',
  NULL,
  'KINETIC',
  'aula_educativa',
  '2022-10-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 19 años' WHERE id = '3b300f2a-2695-4e4e-bc3c-e62b25fd2c63';

-- Excel row 78 — Teresa Natalia Villeda López (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '09613802-512f-4da9-854f-b1b45d9e62cf',
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
  '5751ce59-c721-4009-ae8b-f8d480a3696d', '09613802-512f-4da9-854f-b1b45d9e62cf',
  'Teresa Natalia Villeda López',
  '2006-07-22',
  NULL,
  NULL,
  'aula_educativa',
  '2022-10-03',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 19 años' WHERE id = '5751ce59-c721-4009-ae8b-f8d480a3696d';

-- Excel row 79 — Daniela Guadalupe Engelhard Parada (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '34385b36-7a38-4c18-a434-f25d7ca0f7c5',
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
  '855b1213-9d1f-4ef6-b453-e2dde732a7cb', '34385b36-7a38-4c18-a434-f25d7ca0f7c5',
  'Daniela Guadalupe Engelhard Parada',
  '2003-04-04',
  NULL,
  NULL,
  'aula_educativa',
  '2022-11-15',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 22 años' WHERE id = '855b1213-9d1f-4ef6-b453-e2dde732a7cb';

-- Excel row 80 — Sabrina María Risi Morán (AULA EDUCATIVA)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '4354bee7-3bf7-40b2-853d-be8928a98bbb',
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
  '94e8b67f-2623-480a-bdda-8a454ea007cd', '4354bee7-3bf7-40b2-853d-be8928a98bbb',
  'Sabrina María Risi Morán',
  '2009-06-25',
  NULL,
  NULL,
  'aula_educativa',
  '2023-03-02',
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: AULA EDUCATIVA · Programa Excel: AULA EDUCATIVA · Edad al importar: 16 años' WHERE id = '94e8b67f-2623-480a-bdda-8a454ea007cd';

-- Excel row 87 — David Emmanuel Orellana Paz (TERAPIAS MATUTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3f568148-4034-452f-935e-c81c0013fa52',
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
  'eaf699d4-d609-4660-9069-13ce3f142573', '3f568148-4034-452f-935e-c81c0013fa52',
  'David Emmanuel Orellana Paz',
  '2024-07-25',
  NULL,
  '-',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS MATUTINAS · Programa Excel: EST. H Y L · Edad al importar: 1 año' WHERE id = 'eaf699d4-d609-4660-9069-13ce3f142573';

-- Excel row 88 — Josías Isaí Orellana Paz (TERAPIAS MATUTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b7c78648-0a36-452a-95cb-14e71979b00d',
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
  'aaa693f4-5feb-4622-8a01-6afa12cd88f7', 'b7c78648-0a36-452a-95cb-14e71979b00d',
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
  'aaa693f4-5feb-4622-8a01-6afa12cd88f7', NULL,
  NULL,
  '2026-02-04',
  '[{"service":"lenguaje", "active":true, "sessions_per_month":8, "unit_cost_usd":45, "therapist_id":null}, {"service":"sensorial", "active":true, "sessions_per_month":8, "unit_cost_usd":45, "therapist_id":null}]'::jsonb,
  '[]'::jsonb,
  720,
  true
);
UPDATE public.children SET notes = 'Sección Excel: TERAPIAS MATUTINAS · Programa Excel: THL + Sensorial · Edad al importar: 5 años' WHERE id = 'aaa693f4-5feb-4622-8a01-6afa12cd88f7';

-- Excel row 89 — Marcos Joel García Molina (TERAPIAS MATUTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '167f3efa-7941-4c99-8d49-5832449c4c4c',
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
  '8b3b2f22-cafb-41a8-908b-061480fc42ac', '167f3efa-7941-4c99-8d49-5832449c4c4c',
  'Marcos Joel García Molina',
  '2020-07-04',
  NULL,
  'Margarita Ovidia de Venutolo',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS MATUTINAS · Programa Excel: EST. DE H Y L · Edad al importar: 5 años' WHERE id = '8b3b2f22-cafb-41a8-908b-061480fc42ac';

-- Excel row 97 — Emma Veronica Aguilar Guzmán (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '257d9efa-8576-46a0-93bb-48d28c937f4f',
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
  '8595cdde-2d0c-41bd-9eb4-05e9f18fea31', '257d9efa-8576-46a0-93bb-48d28c937f4f',
  'Emma Veronica Aguilar Guzmán',
  '2018-01-29',
  'TEA',
  'Cristobal Colón',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '8595cdde-2d0c-41bd-9eb4-05e9f18fea31';

-- Excel row 98 — Francella Celeste Argueta Vanegas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '47679477-b85b-4fb9-8b47-46c5322a0607',
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
  'a1f5d662-229c-429b-911d-53bb3e0cc5f3', '47679477-b85b-4fb9-8b47-46c5322a0607',
  'Francella Celeste Argueta Vanegas',
  '2018-02-28',
  'PCI',
  'Árbol de Dios',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = 'a1f5d662-229c-429b-911d-53bb3e0cc5f3';

-- Excel row 99 — Lila Franceska Argueta Retana (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'bccb9794-4377-4cfb-bcd2-44954a55f7cf',
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
  '1934a4fc-19e6-4b39-be24-3f78ac81a922', 'bccb9794-4377-4cfb-bcd2-44954a55f7cf',
  'Lila Franceska Argueta Retana',
  '2023-12-04',
  '-',
  'Kids Lourdes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 2 años' WHERE id = '1934a4fc-19e6-4b39-be24-3f78ac81a922';

-- Excel row 100 — Mateo Alessandro Alvarenga Cortez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3a61aec1-2bf4-41da-ae18-7cfe34ed2bf5',
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
  'f4641af4-d80a-4f5c-b8af-093d7fa96aeb', '3a61aec1-2bf4-41da-ae18-7cfe34ed2bf5',
  'Mateo Alessandro Alvarenga Cortez',
  '2022-04-05',
  'Sospecha TEA',
  'Kinder Little Giant',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = 'f4641af4-d80a-4f5c-b8af-093d7fa96aeb';

-- Excel row 101 — Thiago André Alvarenga Cortez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '73f30609-feb0-4d40-bd6f-84b8f5fa2690',
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
  '292bcf34-9a2c-4154-9b9d-91f81d802a7b', '73f30609-feb0-4d40-bd6f-84b8f5fa2690',
  'Thiago André Alvarenga Cortez',
  '2022-04-05',
  'Sospecha TEA',
  'Kinder Little Giant',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = '292bcf34-9a2c-4154-9b9d-91f81d802a7b';

-- Excel row 102 — Daniela Alejandra Bermudez Montes (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c4fe4054-21c6-44ab-88ad-5ca858f2aef5',
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
  '905ef6e4-cb49-40e9-8ebe-54bc77140226', 'c4fe4054-21c6-44ab-88ad-5ca858f2aef5',
  'Daniela Alejandra Bermudez Montes',
  '2019-01-29',
  NULL,
  'Colegio Maya',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7a' WHERE id = '905ef6e4-cb49-40e9-8ebe-54bc77140226';

-- Excel row 103 — Rodrigo José Call Gonzáles (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '610ac9dd-14c2-4137-b831-40bd77e523ab',
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
  '947a85e9-b720-4199-86b8-b1373bc80913', '610ac9dd-14c2-4137-b831-40bd77e523ab',
  'Rodrigo José Call Gonzáles',
  '2021-04-10',
  'Problemas THL',
  'ABC',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '947a85e9-b720-4199-86b8-b1373bc80913';

-- Excel row 104 — Lukas Carranza Pineda (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '9ecb98bc-8e78-4bcd-85e7-db84d55d5a29',
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
  '7979b3aa-6402-4990-94cc-f071f3544bc8', '9ecb98bc-8e78-4bcd-85e7-db84d55d5a29',
  'Lukas Carranza Pineda',
  '2016-10-25',
  'Problemas Psicológicos',
  'Lamatepeque',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '7979b3aa-6402-4990-94cc-f071f3544bc8';

-- Excel row 105 — Mateo Daniel Cerón Aguilar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'd9f89dd4-46f7-41ec-8a1d-15b932b059b7',
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
  '0972d53a-15c3-4c3d-a268-d89f8269dd5b', 'd9f89dd4-46f7-41ec-8a1d-15b932b059b7',
  'Mateo Daniel Cerón Aguilar',
  '2020-05-17',
  'TEA',
  'Happy Angels',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '0972d53a-15c3-4c3d-a268-d89f8269dd5b';

-- Excel row 106 — Nicolás André Comandarí Escobar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '38dbf996-c2a8-4f3d-a6a1-3222a6bbb1ec',
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
  '69986dbe-421f-4df6-9e88-2a842e6ace41', '38dbf996-c2a8-4f3d-a6a1-3222a6bbb1ec',
  'Nicolás André Comandarí Escobar',
  '2020-04-20',
  'TEA',
  'Power Kids.',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '69986dbe-421f-4df6-9e88-2a842e6ace41';

-- Excel row 107 — José Alberto Chacón Vasquez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'f0857af0-4cea-442d-91d9-6cee7a27f239',
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
  '51821f1e-fbf9-41e5-a9d6-3dc9cb20d5aa', 'f0857af0-4cea-442d-91d9-6cee7a27f239',
  'José Alberto Chacón Vasquez',
  '2018-03-19',
  'TDEA',
  'Laura Lehtinen',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '51821f1e-fbf9-41e5-a9d6-3dc9cb20d5aa';

-- Excel row 108 — Lucas Nicolás Chavarría Abullarade (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'aea07760-ae4c-4a21-8236-6d60b2417084',
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
  'b095c55d-b71d-4171-bf3a-4066e7eba9ac', 'aea07760-ae4c-4a21-8236-6d60b2417084',
  'Lucas Nicolás Chavarría Abullarade',
  '2022-02-15',
  'Retraso del Lenguaje',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = 'b095c55d-b71d-4171-bf3a-4066e7eba9ac';

-- Excel row 109 — Sebastián Enmanuel Chinchilla Alvarenga (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '271a37ea-3ac2-4232-81e4-251c7c515f25',
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
  'bed2b5bf-6f25-4d36-aaa5-4a2c76378dd6', '271a37ea-3ac2-4232-81e4-251c7c515f25',
  'Sebastián Enmanuel Chinchilla Alvarenga',
  '2022-05-23',
  'TEA',
  'Kinder Nacional de Chalatenango',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = 'bed2b5bf-6f25-4d36-aaa5-4a2c76378dd6';

-- Excel row 110 — Manuel de Jesús Escobar Mejía (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a6eacaab-f8d7-4544-b4ef-05843dca4ac4',
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
  '20cdfc85-6582-4b4c-a183-8cdfac97186b', 'a6eacaab-f8d7-4544-b4ef-05843dca4ac4',
  'Manuel de Jesús Escobar Mejía',
  '2020-09-30',
  NULL,
  'Kínder Campo Verde',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '20cdfc85-6582-4b4c-a183-8cdfac97186b';

-- Excel row 111 — Matías Elián Flores Zaldívar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '289f4f74-9c7d-4c0a-97c3-116ac648c49e',
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
  '8ba234d5-1e6b-432a-92f8-4f7a9c0ecc9b', '289f4f74-9c7d-4c0a-97c3-116ac648c49e',
  'Matías Elián Flores Zaldívar',
  '2020-11-24',
  'Altas Capacidades',
  'Maquilishuat',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '8ba234d5-1e6b-432a-92f8-4f7a9c0ecc9b';

-- Excel row 112 — Sofía Flores Morataya (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '30c2c130-b0df-48b9-81c6-3e296973f883',
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
  '8c6791be-d3af-4a37-ae7b-b74ec29bb83f', '30c2c130-b0df-48b9-81c6-3e296973f883',
  'Sofía Flores Morataya',
  '2016-07-20',
  NULL,
  'Colegio Salesiano San José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '8c6791be-d3af-4a37-ae7b-b74ec29bb83f';

-- Excel row 113 — Roberto Andrés Flores Morataya (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b4ba1318-aa9e-4f65-b265-a2a89f80cd9f',
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
  'c1c378b7-70e3-4ea7-aaa5-9dfc12f2807e', 'b4ba1318-aa9e-4f65-b265-a2a89f80cd9f',
  'Roberto Andrés Flores Morataya',
  '2018-01-04',
  'TDAH',
  'Colegio Salesiano San José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = 'c1c378b7-70e3-4ea7-aaa5-9dfc12f2807e';

-- Excel row 114 — Natalia Alexandra Franco Maza (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'e8229048-04d2-438d-b254-b90169b80dbc',
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
  'f096212f-18c7-4b5b-baae-1dc5cdbc6844', 'e8229048-04d2-438d-b254-b90169b80dbc',
  'Natalia Alexandra Franco Maza',
  '2019-04-29',
  NULL,
  'Floresta',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'f096212f-18c7-4b5b-baae-1dc5cdbc6844';

-- Excel row 115 — Andrés Benjamín Guzmán Rodríguez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '810d1686-3157-43e7-8b95-a5878ab4d357',
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
  '02430296-f1e9-4b86-b912-10b286493451', '810d1686-3157-43e7-8b95-a5878ab4d357',
  'Andrés Benjamín Guzmán Rodríguez',
  '2019-04-07',
  'TEA',
  'Colegio Maya',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = '02430296-f1e9-4b86-b912-10b286493451';

-- Excel row 116 — Xochitl Valentina Henriquez Navarro (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '47ccd4c1-87be-4041-9c65-f91952516f4d',
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
  '6f0222c2-36da-4fe2-8c63-7dac1c84ebb1', '47ccd4c1-87be-4041-9c65-f91952516f4d',
  'Xochitl Valentina Henriquez Navarro',
  '2018-08-31',
  NULL,
  'Colegio el camino',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '6f0222c2-36da-4fe2-8c63-7dac1c84ebb1';

-- Excel row 117 — Angel Andrés Hernández Pineda (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '35ee005f-794c-4a13-bdd5-d9f48dff85a3',
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
  'd482d9c7-c75c-4b06-9105-f1372fd3f47b', '35ee005f-794c-4a13-bdd5-d9f48dff85a3',
  'Angel Andrés Hernández Pineda',
  '2018-09-06',
  NULL,
  'Liceo Salvadoreño',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'd482d9c7-c75c-4b06-9105-f1372fd3f47b';

-- Excel row 118 — Leonardo José Infantozzi Villeda (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '01f60efb-d9cc-4379-a3cc-4ea5c1d03be9',
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
  'e74d0bd1-b330-4f19-9b93-4c22e082d2ba', '01f60efb-d9cc-4379-a3cc-4ea5c1d03be9',
  'Leonardo José Infantozzi Villeda',
  '2020-06-11',
  NULL,
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'e74d0bd1-b330-4f19-9b93-4c22e082d2ba';

-- Excel row 119 — Diego Antonio Lozano Rivera (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'dc07d679-3188-4c02-b852-bbdc87243771',
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
  '1bdebbaf-c6e3-4740-bdf2-3299ca9ea294', 'dc07d679-3188-4c02-b852-bbdc87243771',
  'Diego Antonio Lozano Rivera',
  '2019-12-12',
  'TEA',
  'Augusto Walte',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = '1bdebbaf-c6e3-4740-bdf2-3299ca9ea294';

-- Excel row 120 — Bella Lozano Rivera (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b56b88fc-4824-4aa7-b460-330bc011dae0',
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
  '88162947-5197-43f9-bd40-0ec02dfb51cc', 'b56b88fc-4824-4aa7-b460-330bc011dae0',
  'Bella Lozano Rivera',
  '2018-02-24',
  'Problemas Conductuales',
  'Augusto Walte',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '88162947-5197-43f9-bd40-0ec02dfb51cc';

-- Excel row 121 — David Ernesto Matamoros Ramírez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '9107d590-d712-4671-b950-fe377079ccd7',
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
  '4d757062-aef5-4894-8eb7-255cec73a77a', '9107d590-d712-4671-b950-fe377079ccd7',
  'David Ernesto Matamoros Ramírez',
  '2022-11-07',
  NULL,
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 3 años' WHERE id = '4d757062-aef5-4894-8eb7-255cec73a77a';

-- Excel row 122 — Javier Enrique Morales Montoya (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '670ef016-02d3-484d-8cca-da2d6df4a371',
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
  'deaeee78-0574-4139-8d20-c612e783c437', '670ef016-02d3-484d-8cca-da2d6df4a371',
  'Javier Enrique Morales Montoya',
  '2016-09-27',
  NULL,
  'Lamatepec',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = 'deaeee78-0574-4139-8d20-c612e783c437';

-- Excel row 123 — Derek Miguel Ortiz Bonilla (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '05223e9b-a959-4448-bd2c-e8c3ec054f4a',
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
  '9ae9da81-59ef-47b1-a464-88cd31c5386a', '05223e9b-a959-4448-bd2c-e8c3ec054f4a',
  'Derek Miguel Ortiz Bonilla',
  '2020-11-30',
  NULL,
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '9ae9da81-59ef-47b1-a464-88cd31c5386a';

-- Excel row 124 — Sailhy Antonella Parada Arevalo (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '2a697c4e-1e5b-46ea-a23e-37887796ca62',
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
  'f03be25c-3e16-4478-ad29-8350d2f5abad', '2a697c4e-1e5b-46ea-a23e-37887796ca62',
  'Sailhy Antonella Parada Arevalo',
  '2019-05-23',
  'TEA (Convulsivo)',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'f03be25c-3e16-4478-ad29-8350d2f5abad';

-- Excel row 125 — Eugenia Beatriz Peralta Alvarenga (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '7afadb64-def8-4dd2-a55c-44b7db1e92de',
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
  'e253115a-4d27-4f91-91b8-42fe5cb966ba', '7afadb64-def8-4dd2-a55c-44b7db1e92de',
  'Eugenia Beatriz Peralta Alvarenga',
  '2020-06-15',
  'Difiucltades Sensoriales',
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'e253115a-4d27-4f91-91b8-42fe5cb966ba';

-- Excel row 126 — Andrés Pecorini Villafranco (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '32ae9b8d-d837-479c-9c4c-b9738941a52b',
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
  'c04a8b55-c090-40ef-884c-032ae5edd90c', '32ae9b8d-d837-479c-9c4c-b9738941a52b',
  'Andrés Pecorini Villafranco',
  '2017-05-22',
  'TEA',
  'Kinder Arbol de Dios',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = 'c04a8b55-c090-40ef-884c-032ae5edd90c';

-- Excel row 127 — José Luis Padilla Santamaria (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '6803834d-9e45-44a3-ae41-2657144c3218',
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
  'd61c86e3-51d3-4b01-bd5a-d80f7b1c4cb2', '6803834d-9e45-44a3-ae41-2657144c3218',
  'José Luis Padilla Santamaria',
  '2019-02-07',
  '-',
  'Montessoriano',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'd61c86e3-51d3-4b01-bd5a-d80f7b1c4cb2';

-- Excel row 128 — Felipe Andrés Pérez García (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c7c839c0-746b-43e6-a944-35db6614d416',
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
  '9fa986b5-eb87-4da5-8c5d-8f1f44dd10ca', 'c7c839c0-746b-43e6-a944-35db6614d416',
  'Felipe Andrés Pérez García',
  '2022-01-17',
  '-',
  'Colegio Agusto Walte',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4a' WHERE id = '9fa986b5-eb87-4da5-8c5d-8f1f44dd10ca';

-- Excel row 129 — Kelly Víctoria Pocasangre Meza (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b531fd36-1dd3-4da5-8baa-3bdbccacd8bd',
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
  'dd8df7fb-e3e1-4d72-912f-14648f8d34d6', 'b531fd36-1dd3-4da5-8baa-3bdbccacd8bd',
  'Kelly Víctoria Pocasangre Meza',
  '2021-10-06',
  '-',
  'Escuela Bilingue Maquilishuat',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = 'dd8df7fb-e3e1-4d72-912f-14648f8d34d6';

-- Excel row 130 — Mathias Leandro Pérez Ledezma (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ba50067a-abdb-416c-b6e7-0236a321eb6f',
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
  '20a3ab7f-d1ec-4ab3-b192-f92e15c779b1', 'ba50067a-abdb-416c-b6e7-0236a321eb6f',
  'Mathias Leandro Pérez Ledezma',
  '2019-04-29',
  'TEA',
  'Los Robles',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 7 años' WHERE id = '20a3ab7f-d1ec-4ab3-b192-f92e15c779b1';

-- Excel row 131 — Madeline Susabeth Ramírez Melara (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'b3d4afab-7474-42ba-a43a-ae5c8dd62291',
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
  'a93d9f88-b035-42b0-9483-2ba6d3f1d85b', 'b3d4afab-7474-42ba-a43a-ae5c8dd62291',
  'Madeline Susabeth Ramírez Melara',
  '2025-04-10',
  'TEA',
  'Don Bosco',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = 'a93d9f88-b035-42b0-9483-2ba6d3f1d85b';

-- Excel row 132 — Josías Saúl Rodriguez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c2444336-44af-4dc9-b0e6-a1a6becccf67',
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
  '7a14fd33-850b-4d2c-8d5c-3263665f757b', 'c2444336-44af-4dc9-b0e6-a1a6becccf67',
  'Josías Saúl Rodriguez',
  '2014-10-13',
  NULL,
  'Colegio JESHUA esta en 3er grado',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 10 años' WHERE id = '7a14fd33-850b-4d2c-8d5c-3263665f757b';

-- Excel row 133 — Elián André Reales Menjivar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'd84c4bbb-5d8c-4c6c-92c3-93257dbcefd2',
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
  'bc12350a-f3da-4e2d-a2ec-929d0c9c40bd', 'd84c4bbb-5d8c-4c6c-92c3-93257dbcefd2',
  'Elián André Reales Menjivar',
  '2016-08-31',
  'TEA',
  'Colegio Santa Cecilia',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = 'bc12350a-f3da-4e2d-a2ec-929d0c9c40bd';

-- Excel row 134 — Diego Alejandro Ruiz Arteaga (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '62773a65-fe82-40ca-ae6b-c4bd6d4767c6',
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
  '4c0481d1-d8bc-4d1a-a028-f18efcf91f8b', '62773a65-fe82-40ca-ae6b-c4bd6d4767c6',
  'Diego Alejandro Ruiz Arteaga',
  '2022-06-03',
  'Sospecha TEA',
  'Kínder Horizontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE' WHERE id = '4c0481d1-d8bc-4d1a-a028-f18efcf91f8b';

-- Excel row 135 — Rodrigo Nicolas Santos Acevedo (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '1eb6fe3b-8e8b-4c86-8504-8208083320e6',
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
  '40c77931-1a28-40e0-84bd-4761609a6cf4', '1eb6fe3b-8e8b-4c86-8504-8208083320e6',
  'Rodrigo Nicolas Santos Acevedo',
  '2017-08-11',
  '-',
  'Escuela Panamericana',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = '40c77931-1a28-40e0-84bd-4761609a6cf4';

-- Excel row 136 — Ariel Giuliana Santos Chicas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '172029d4-cc10-4f07-933e-857305565a4d',
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
  '2a5c8bc5-68e0-4cca-b31e-1b73a07108b0', '172029d4-cc10-4f07-933e-857305565a4d',
  'Ariel Giuliana Santos Chicas',
  '2014-09-08',
  'TEA',
  'Es. Especial de Santa Tecla',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 11 años' WHERE id = '2a5c8bc5-68e0-4cca-b31e-1b73a07108b0';

-- Excel row 137 — Andre Luciano Santos Chicas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '9a35e27b-e15b-4337-8864-182fe59f1076',
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
  '0a237a98-49db-4559-a1ca-b7fc47795639', '9a35e27b-e15b-4337-8864-182fe59f1076',
  'Andre Luciano Santos Chicas',
  '2014-08-01',
  'TEA',
  'Es. Especial de Santa Tecla',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 14 años' WHERE id = '0a237a98-49db-4559-a1ca-b7fc47795639';

-- Excel row 138 — Brigham Alessadnro Santos Chicas (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'f9e76b64-f210-4a03-b774-4547be527eb0',
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
  '646a9af9-33e7-41c5-b8d4-7a435d383354', 'f9e76b64-f210-4a03-b774-4547be527eb0',
  'Brigham Alessadnro Santos Chicas',
  '2010-02-21',
  'TEA',
  'Es. Especial de Santa Tecla',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 15 años' WHERE id = '646a9af9-33e7-41c5-b8d4-7a435d383354';

-- Excel row 139 — Jesús Alejandro Sánchez Elías (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '863ea285-3bb6-4c42-bdf5-878a3354fe13',
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
  'af4d61ab-96e6-45fb-bd63-1b7f2f6010a4', '863ea285-3bb6-4c42-bdf5-878a3354fe13',
  'Jesús Alejandro Sánchez Elías',
  '2017-11-24',
  'TEA',
  'Sagrado Corazón',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 6 años' WHERE id = 'af4d61ab-96e6-45fb-bd63-1b7f2f6010a4';

-- Excel row 140 — Fiorella Camila Sánchez Salazar (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '4943b31d-3ec3-4596-94ce-f0b15710d332',
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
  '4d67eb54-160a-4925-88fe-e3e9b7c329a4', '4943b31d-3ec3-4596-94ce-f0b15710d332',
  'Fiorella Camila Sánchez Salazar',
  '2016-04-12',
  'TEA',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = '4d67eb54-160a-4925-88fe-e3e9b7c329a4';

-- Excel row 141 — Ana Sofía Sorto Estévez (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '31034385-7666-4d88-b98b-24135386ae5d',
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
  'fe671507-7f58-4cb2-ae4d-6b4387d8c836', '31034385-7666-4d88-b98b-24135386ae5d',
  'Ana Sofía Sorto Estévez',
  '2017-02-08',
  'TEA',
  'Col. Americano de El Salvador',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 9 años' WHERE id = 'fe671507-7f58-4cb2-ae4d-6b4387d8c836';

-- Excel row 142 — Carlos Emiliano Sanchez Calderón (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'ecb62eeb-4e9b-453c-a5b2-7a79b301a6e4',
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
  '13c39922-c820-4a4e-8e2a-6a2b92718e93', 'ecb62eeb-4e9b-453c-a5b2-7a79b301a6e4',
  'Carlos Emiliano Sanchez Calderón',
  '2020-02-11',
  NULL,
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 5 años' WHERE id = '13c39922-c820-4a4e-8e2a-6a2b92718e93';

-- Excel row 143 — Emily Montserrat Urrutia Urrutia (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '7390303f-7274-47cb-9533-45bb1ce33915',
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
  '3f15c2e5-76e7-4b8f-9388-65a56fb4e9b4', '7390303f-7274-47cb-9533-45bb1ce33915',
  'Emily Montserrat Urrutia Urrutia',
  '2021-08-31',
  NULL,
  'Colegio Maya',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '3f15c2e5-76e7-4b8f-9388-65a56fb4e9b4';

-- Excel row 144 — Lucas Alfredo Urías Iraheta (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '67062a2e-c73a-44dd-a9a6-22117745e35d',
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
  '69ece010-5dcf-4c76-a6b8-4ab8cd8f5d3c', '67062a2e-c73a-44dd-a9a6-22117745e35d',
  'Lucas Alfredo Urías Iraheta',
  '2020-04-09',
  'Baja Visión',
  'Eugenia de Dueñas',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = '69ece010-5dcf-4c76-a6b8-4ab8cd8f5d3c';

-- Excel row 145 — Adrian Vargas Paz (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'd815cbf1-fb45-4227-84b3-817216f0ceac',
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
  'd5cd462a-86f3-4d37-8870-bbad76da392f', 'd815cbf1-fb45-4227-84b3-817216f0ceac',
  'Adrian Vargas Paz',
  '2021-03-08',
  'Sospecha TEA',
  'No escolarizado',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 4 años' WHERE id = 'd5cd462a-86f3-4d37-8870-bbad76da392f';

-- Excel row 146 — Adrian Valentin Vásquez Hernández (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '83408545-48a0-4dbf-b1d4-1dc3599c86fa',
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
  '61073645-0418-49b6-ad64-37b1e4b6983f', '83408545-48a0-4dbf-b1d4-1dc3599c86fa',
  'Adrian Valentin Vásquez Hernández',
  '2017-08-15',
  'Síndrome Down',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 8 años' WHERE id = '61073645-0418-49b6-ad64-37b1e4b6983f';

-- Excel row 147 — Anika Zablah Massis (TERAPIAS VESPERTINAS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '96838945-ee3e-4019-8b88-298f7923764a',
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
  '2967da96-2447-4577-8f62-3cc333ba6a7d', '96838945-ee3e-4019-8b88-298f7923764a',
  'Anika Zablah Massis',
  '2023-06-29',
  'Dificultades Sensoriales',
  'Kínder Horízontes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS VESPERTINAS · Programa Excel: TERAPIA TARDE · Edad al importar: 2 años' WHERE id = '2967da96-2447-4577-8f62-3cc333ba6a7d';

-- Excel row 152 — Levi Manuel Alfaro Paniagua (PROGRAMA ADAPTATIVO)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '58ce2640-b327-48d4-80d5-54eaa6bc29b9',
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
  '85307446-4fe4-4eea-9e03-6f12fa31ba8e', '58ce2640-b327-48d4-80d5-54eaa6bc29b9',
  'Levi Manuel Alfaro Paniagua',
  '2018-11-15',
  'TEA',
  'Semillitas',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: PROGRAMA ADAPTATIVO · Programa Excel: Programa adaptativo · Edad al importar: 6 años' WHERE id = '85307446-4fe4-4eea-9e03-6f12fa31ba8e';

-- Excel row 153 — Kylian Alessandro Henriquez Navarro (PROGRAMA ADAPTATIVO)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'c52c5d89-e33b-4915-be97-4d37c464436c',
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
  'c2d5b597-37d6-4019-b56c-841b78ba20c5', 'c52c5d89-e33b-4915-be97-4d37c464436c',
  'Kylian Alessandro Henriquez Navarro',
  '2020-01-07',
  'TEA',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: PROGRAMA ADAPTATIVO · Programa Excel: Programa adaptativo · Edad al importar: 5 años' WHERE id = 'c2d5b597-37d6-4019-b56c-841b78ba20c5';

-- Excel row 160 — Lila Franceska Argueta Retana (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '77fbfd6d-2ac7-4cc6-b29c-befd3f8d3541',
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
  'e787243d-fe21-4622-993c-cddcf36aa620', '77fbfd6d-2ac7-4cc6-b29c-befd3f8d3541',
  'Lila Franceska Argueta Retana',
  '2023-12-04',
  '-',
  'Kids Lourdes',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 2 años' WHERE id = 'e787243d-fe21-4622-993c-cddcf36aa620';

-- Excel row 161 — José Alessandro Castro Mejía (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '26561003-0e47-432a-8cbb-9fde7584a48d',
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
  'ee92c815-b474-41e1-adc3-473c65ab4d3c', '26561003-0e47-432a-8cbb-9fde7584a48d',
  'José Alessandro Castro Mejía',
  '2012-07-01',
  'Problemas Conductuales',
  'Externado San José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 13 años' WHERE id = 'ee92c815-b474-41e1-adc3-473c65ab4d3c';

-- Excel row 162 — Jorge Ramón Del Cid García (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '0eec0b12-04ac-4093-a94f-5785bb42897f',
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
  '9d519ca2-3014-42ee-8a0f-cce2a5b34189', '0eec0b12-04ac-4093-a94f-5785bb42897f',
  'Jorge Ramón Del Cid García',
  '2023-04-26',
  'TEA',
  'Academia Cristiana Internacional',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  false
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 2 años' WHERE id = '9d519ca2-3014-42ee-8a0f-cce2a5b34189';

-- Excel row 163 — Andrés Benjamín Guzmán Rodríguez (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '025beea8-6b00-4d95-88b0-69e6be402303',
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
  '07811c1c-806a-44c6-a465-104b7b3e525b', '025beea8-6b00-4d95-88b0-69e6be402303',
  'Andrés Benjamín Guzmán Rodríguez',
  '2019-04-07',
  'TEA',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 6 años' WHERE id = '07811c1c-806a-44c6-a465-104b7b3e525b';

-- Excel row 164 — Eva Mariel Kessels Bolaños (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '133e8ac9-328b-4a8d-97cd-cd72407b9088',
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
  '740e3b9d-7f5a-4ec4-856a-1918cebc81ff', '133e8ac9-328b-4a8d-97cd-cd72407b9088',
  'Eva Mariel Kessels Bolaños',
  '2015-09-21',
  '-',
  'Salesiano San  José',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 10a' WHERE id = '740e3b9d-7f5a-4ec4-856a-1918cebc81ff';

-- Excel row 165 — Oliver Oswaldo Morán Granillo (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '3cade043-145b-4337-9175-4bb6285bb679',
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
  'ed24e5c7-33a8-426e-8c01-03d26607e0bc', '3cade043-145b-4337-9175-4bb6285bb679',
  'Oliver Oswaldo Morán Granillo',
  '2017-08-07',
  NULL,
  'Col.  Maria Auxiliadora',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 8 años' WHERE id = 'ed24e5c7-33a8-426e-8c01-03d26607e0bc';

-- Excel row 166 — Ian Matteo Molina Peréz (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  'a8e7e4d9-60d6-4526-8555-6c9ad68c642c',
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
  '2fe1b332-0207-4cf1-ae54-09a63ec5739a', 'a8e7e4d9-60d6-4526-8555-6c9ad68c642c',
  'Ian Matteo Molina Peréz',
  '2020-11-04',
  'Dificultades Sensoriales',
  'Cu-cu-cu-cu',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 4 años' WHERE id = '2fe1b332-0207-4cf1-ae54-09a63ec5739a';

-- Excel row 167 — José Luis Padilla Santamaria (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '074639bc-f0c4-4f12-9c33-8feb7303dd86',
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
  '5e29e5a5-378b-4ea6-af08-4a9eba686c16', '074639bc-f0c4-4f12-9c33-8feb7303dd86',
  'José Luis Padilla Santamaria',
  '2019-02-07',
  NULL,
  'Montessoriano',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 6 años' WHERE id = '5e29e5a5-378b-4ea6-af08-4a9eba686c16';

-- Excel row 168 — Ariella Xaneri Ramirez Funes (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '52cf3d27-211e-46fd-bc85-1c2aef7b6f17',
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
  'a1fa385e-803b-4afc-82cd-6227db28c2dd', '52cf3d27-211e-46fd-bc85-1c2aef7b6f17',
  'Ariella Xaneri Ramirez Funes',
  '2022-12-05',
  '.',
  NULL,
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 3 años' WHERE id = 'a1fa385e-803b-4afc-82cd-6227db28c2dd';

-- Excel row 169 — Gustavo Alejandro Siguenza Pérez (TERAPIAS SABADOS)
INSERT INTO public.families (
  id, primary_contact_name, primary_contact_email, primary_contact_phone,
  secondary_contact_name, secondary_contact_phone,
  mom_workplace, mom_work_phone, dad_workplace, dad_work_phone,
  pediatrician_name, pediatrician_phone, status
) VALUES (
  '575cafa1-fb97-4f3e-b07a-0e2f5f70f900',
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
  '6808d2da-b25b-49ae-81ac-8dcd2c0cbb06', '575cafa1-fb97-4f3e-b07a-0e2f5f70f900',
  'Gustavo Alejandro Siguenza Pérez',
  '2020-06-15',
  'TEA',
  'Centro Semillitas de Dios',
  NULL,
  NULL,
  '3_3_activo_en_terapias', now(),
  true
);

UPDATE public.children SET notes = 'Sección Excel: TERAPIAS SABADOS · Programa Excel: TERAPIA SABADO · Edad al importar: 5 años' WHERE id = '6808d2da-b25b-49ae-81ac-8dcd2c0cbb06';

COMMIT;

-- ── Verificación ────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.families)        AS families,
  (SELECT COUNT(*) FROM public.children)        AS children,
  (SELECT COUNT(*) FROM public.children WHERE current_phase_code = '5_2_retirado') AS retirados,
  (SELECT COUNT(*) FROM public.children WHERE enrolled_program IS NOT NULL) AS matutinos,
  (SELECT COUNT(*) FROM public.treatment_plans) AS plans;
