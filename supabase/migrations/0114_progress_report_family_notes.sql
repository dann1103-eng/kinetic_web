-- Notas opcionales del terapeuta visibles para la familia en informes cuatrimestrales.
-- Se muestran junto al archivo cuando el informe llega a la familia.

alter table public.progress_reports
  add column if not exists family_notes text;
