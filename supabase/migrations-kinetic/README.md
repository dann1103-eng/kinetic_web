# Migrations — Kinetic

Esta carpeta contiene migraciones específicas para **Kinetic** (proyecto Supabase distinto al de FM CRM).

## Orden de ejecución en proyecto Supabase Kinetic (fresco)

| # | Archivo | Origen | Estado |
|---|---|---|---|
| 1 | `../migrations/0001_init.sql` | FM CRM | Schema base. **Ya corrida.** |
| 2 | `0002_to_0079_merged.sql` | **Merged FM 0002→0079** (78 archivos) | **Ya corrida.** |
| 3 | `0080_to_0081_fm_delta.sql` | **Delta FM 0080–0081** (catch-up de master) | ⚠️ **Pendiente**: correr ahora |
| 4 | `0090_kinetic_init.sql` | Kinetic (Fase 0) | **Ya corrida.** Si se reaplica, las upserts son idempotentes |

Si ya corriste 0090 y luego mergearon más migraciones FM, solo aplicá el nuevo delta (paso 3) — no necesitás re-correr 0090, pero podés (es idempotente con `on conflict do nothing` y `where not exists`).

## Sobre el numeración 0080-0089 vs 0090+

- **0080–0089** se reservan para futuras migraciones FM-style (catch-ups del CRM original).
- **0090+** son migraciones específicas de Kinetic (rebrand, dominio clínico, etc.).
- **Migración Kinetic Fase 1+** empieza desde `0091_kinetic_families_and_children.sql`.

## Sobre `0002_to_0079_merged.sql`

Combinación de las 78 migraciones del FM CRM (0002 al 0079) en un solo SQL.

- **Orden interno:** numérico ascendente.
- **Conflicto del 0060:** existen DOS archivos numerados 0060 en FM (`0060_n1co_integration.sql` y `0060_cambio_logs_approval_status.sql`). En el merged se respeta el orden cronológico de commit:
  1. `0060_n1co_integration` (commit 2026-04-27)
  2. `0060_cambio_logs_approval_status` (commit 2026-04-28)
- **Total:** 79 secciones de migración separadas por headers `╔══ <archivo>.sql`.
- **Tamaño:** ~185 KB / ~4100 líneas.

## Migraciones futuras de Kinetic

| Migración | Fase | Contenido |
|---|---|---|
| `0091_kinetic_families_and_children.sql` | **Fase 1** | `families`, `children`, `family_users`, `referral_sources`, generación de código del niño, roles nuevos |
| `0092_kinetic_appointments_meet.sql` | Fase 2 | `appointments`, `virtual_meetings`, `google_workspace_config`, `institutional_calendar` |
| `0093_kinetic_progress_reports.sql` | Fase 3 | `therapy_sessions`, `session_reports`, `progress_reports`, `report_templates`, `child_journal_entries` |
| `0094_kinetic_replacements_quarantines.sql` | Fase 4 | `late_charges`, `illness_records`, motor de reposiciones |
| `0095_kinetic_morning_programs.sql` | Fase 5 | `programs`, `program_attendance`, `daily_journal_entries`, `morning_program_indicators` |
| `0096_kinetic_evaluations.sql` | Fase 6 | `evaluations`, `evaluation_reports`, `test_score_entries`, `external_forms` |
| `0097_kinetic_payments_agreements.sql` | Fase 7 | `monthly_billing_cycles`, `family_agreements`, `payment_proofs`, `payment_suspensions`, `family_credits` |
| `0098_kinetic_accounting.sql` | Fase 8 | `expenses`, `budgets` |

## Notas

- El folder `migrations/` (FM) **no se toca**. Está congelado como referencia.
- Si en el futuro se quiere arrancar Kinetic desde un schema 100% nuevo (sin la base de FM), se puede colapsar todo en un solo init. Pero eso es trabajo adicional sin valor inmediato.
