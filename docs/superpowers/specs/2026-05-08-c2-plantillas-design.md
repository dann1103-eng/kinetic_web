# Fase 3-C2 — Plantillas multi-template DB-driven · Spec

> Fecha: 2026-05-08 · Brainstorm cerrado con el usuario.
> Mueve la plantilla hardcoded de informes de avances (`progress-report-template.ts`) a una tabla DB que la directora puede editar desde un CRUD.

## Decisiones cerradas

| Decisión | Valor | Notas |
|---|---|---|
| **Seeds iniciales** | Solo "Genérica" (los 7 bloques v0.7) | La directora crea las específicas (Lenguaje, Sensorial, Psicológica, Ocupacional, etc.) desde el CRUD cuando defina contenido con su equipo clínico. No inventamos contenido placeholder. |
| **Quién autora informes** | Terapistas + directora | Ya cubierto por `progress_reports.authored_by_user_id` y RLS existente. **El CRUD de plantillas en cambio es admin/directora.** Los terapistas solo SELECT plantillas (vía `is_agency_user`). |
| **Block kinds** | `rich_text`, `numbered_list` | `recommendations_by_area` y `categorized_text` se difieren — el schema los soporta pero el editor no los renderiza todavía. Cuando el equipo clínico pida "Recomendaciones por área", se agrega. |
| **Versionado** | In-place (sin bump de version) | La columna `version` queda en el schema (default 1) por si se quiere usar después, pero las ediciones NO crean nuevas filas — sobreescriben. Riesgo aceptado: editar plantilla afecta a TODOS los reportes (incluso aprobados) en su próximo render. Beneficio: 1 plantilla = 1 fila, simple. |
| **Restricción por servicio** | Opcional (NULL = universal) | El selector en `NewProgressReportButton` filtra por `service_type` elegido + `service_type IS NULL` (genéricas). Coincide con el plan v0.7. |

## Forma de `progress_reports.data_json`

Sigue siendo `Record<string, BlockValue>` donde:
- bloque `rich_text` → `string`
- bloque `numbered_list` → `string[]`

Las keys del map son los `block.key` definidos en el template.

## RLS

```sql
-- SELECT: cualquier staff
create policy "rt select all staff" on report_templates for select
  using (public.is_agency_user());

-- INSERT/UPDATE: solo admin/directora
create policy "rt insert directora admin" on report_templates for insert
  with check (public.is_directora_or_admin());
create policy "rt update directora admin" on report_templates for update
  using (public.is_directora_or_admin())
  with check (public.is_directora_or_admin());

-- DELETE: solo admin (raro — preferimos toggle active)
create policy "rt delete admin" on report_templates for delete
  using (public.is_admin());
```

## Validación de submit

Reemplazar la validación hardcoded actual (`seguimiento` y `logros_obtenidos` requeridos) por validación basada en `template.blocks_json`: cada bloque con `required=true` debe estar lleno.

Implementación: helper PL/pgSQL `validate_progress_report_against_template(p_report_id)` que se invoca desde `submit_progress_report` antes del UPDATE.

## Out of scope

- Plantillas de `kind` distinto a `progress` (session/evaluation/morning_program_quarterly).
- Block kinds `recommendations_by_area` y `categorized_text` (schema preparado, UI no).
- Versionado real con historia.
