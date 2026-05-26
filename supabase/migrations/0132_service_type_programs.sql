-- Migración 0132 — Service types para Learning Kids y Aula Educativa
--
-- Antes solo `blue_kids` estaba en el enum ServiceType. Esto impedía
-- que recepción seleccionara LearningKids o Aula Educativa como tipo
-- de terapia/programa en el plan de tratamiento de un niño matutino.
--
-- Cambios:
--   1) appointments.service_type CHECK ampliado con learning_kids + aula_educativa

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
    'learning_kids',
    'aula_educativa',
    'alim_deglu',
    'destreza_manual_pre_escritura',
    'ils_escucha',
    'refuerzo_academico',
    'concentracion_atencion',
    'comunicacion_regulacion',
    'estimulacion_juego',
    'otra'
  ));
