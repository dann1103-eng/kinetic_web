-- =============================================================================
-- 0179 — 3 tipos de terapia nuevos: Psicométrica, Neurodesarrollo, Diagnóstica TEA
-- =============================================================================
-- Pedido: agregar 3 opciones al selector "Tipo de terapia" de Lista de espera
-- (requested_service_type). Se agregan al ServiceType global (db.ts), así que
-- también quedan disponibles en planes de tratamiento y citas.
--
-- De paso se corrige un gap real encontrado: el CHECK de
-- waitlist_entries.requested_service_type (0116) nunca se actualizó desde que
-- se agregaron 7 tipos de terapia posteriores (learning_kids, aula_educativa,
-- ils_escucha, refuerzo_academico, concentracion_atencion,
-- comunicacion_regulacion, estimulacion_juego) — seleccionarlos en el
-- formulario de lista de espera hoy truena con violación de CHECK. Esta
-- migración deja ambos CHECK (appointments y waitlist_entries) sincronizados
-- con la lista completa vigente de ServiceType.
-- =============================================================================

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
    'psicometrica',
    'neurodesarrollo',
    'diagnostica_tea',
    'otra'
  ));

ALTER TABLE public.waitlist_entries
  DROP CONSTRAINT IF EXISTS waitlist_entries_requested_service_type_check;

ALTER TABLE public.waitlist_entries
  ADD CONSTRAINT waitlist_entries_requested_service_type_check CHECK (requested_service_type IN (
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
    'psicometrica',
    'neurodesarrollo',
    'diagnostica_tea',
    'otra'
  ));

notify pgrst, 'reload schema';
