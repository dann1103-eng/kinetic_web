# Migrations — Kinetic

Esta carpeta contiene migraciones específicas para **Kinetic** (proyecto Supabase distinto al de FM CRM).

## Orden de ejecución en proyecto Supabase Kinetic (fresco)

| # | Archivo | Origen | Notas |
|---|---|---|---|
| 1 | `../migrations/0001_init.sql` | FM CRM | Schema base. **Ya corrida.** |
| 2 | `0002_to_0079_merged.sql` | **Merged FM 0002→0079** | Pegar y ejecutar de una sola vez en SQL Editor |
| 3 | `0080_kinetic_init.sql` | Kinetic | Re-seed `company_settings` + crea `professional_signatures` + `test_catalog` |

## Sobre `0002_to_0079_merged.sql`

Combinación de las 78 migraciones del FM CRM (0002 al 0079) en un solo SQL.

- **Orden interno:** numérico ascendente.
- **Conflicto del 0060:** existen DOS archivos numerados 0060 en FM (`0060_n1co_integration.sql` y `0060_cambio_logs_approval_status.sql`). En el merged se respeta el orden cronológico de commit:
  1. `0060_n1co_integration` (commit 2026-04-27)
  2. `0060_cambio_logs_approval_status` (commit 2026-04-28)
- **Total:** 79 secciones de migración separadas por headers `╔══ <archivo>.sql`.
- **Tamaño:** ~185 KB / ~4100 líneas.

## Migraciones futuras de Kinetic

Las próximas migraciones específicas de Kinetic (Fase 1+) deben numerarse a partir de `0081`:
- `0081_kinetic_families_and_children.sql` — núcleo familiar (Fase 1)
- `0082_kinetic_appointments_meet.sql` — agenda + Google Meet (Fase 2)
- `0083_kinetic_progress_reports.sql` — reportería con aprobación (Fase 3)
- ... etc.

## Notas

- El folder `migrations/` (FM) **no se toca**. Está congelado como referencia.
- Si el cliente decide eventualmente arrancar Kinetic desde un schema 100% nuevo (sin la base de FM), se puede colapsar `0002_to_0079_merged.sql` + `0080_kinetic_init.sql` en un solo `0001_kinetic_clean_init.sql`. Pero eso es trabajo adicional sin valor inmediato.
