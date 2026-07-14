# Conflictos de horario no bloqueantes + fix duplicación niño/familia — Diseño

**Fecha:** 2026-07-14
**Estado:** Diseño aprobado por el usuario, pendiente de plan de implementación.

## Contexto y problema

Dos bugs independientes reportados en la misma sesión, agrupados en un solo lote (mismo patrón que sesiones anteriores).

### Bug 1 — conflictos de horario bloquean generación/edición de ciclo

`confirm_monthly_payment_and_generate`, `generate_cycle_agenda` y `regenerate_cycle_appointments` (definiciones vigentes en `supabase/migrations/0180_fix_morning_only_plan_blocks_cycle.sql`, líneas 240-479, 482-670 y 673-821 respectivamente) comparten el mismo guard:

```sql
IF (v_summary->>'conflict_count')::int > 0 THEN RAISE EXCEPTION 'has_conflicts: %', ...
```

(guards en líneas 364-366/340-348, 597-599/573-581, y 773-790/764-781 respectivamente). El chequeo de conflicto en sí (`compute_monthly_appointment_candidates`, líneas 44-237, subquery de solape en 199-217) filtra únicamente por `therapist_id` y solape de horario — **sin excluir al propio niño** — contra cualquier `appointments` existente del terapeuta. Consecuencias:

- Un niño con dos terapias propias asignadas al mismo terapeuta en el mismo bloque (caso real: Ana Luna Tenorio) se marca a sí mismo como "en conflicto" y el guard aborta la generación completa de su ciclo.
- Como `regenerate_cycle_appointments` comparte el mismo guard, una edición de plan que produce un nuevo patrón de horario puede fallar en silencio al intentar sincronizarse con la agenda si el nuevo patrón se solapa con algo — el plan se guarda pero la agenda no se actualiza.
- Client-side, `NewMonthlyCycleModal.tsx` (conflictos/`liveConflicts` líneas 231-249, `canConfirm` 473-477, botón `disabled` línea 876) y `EditMonthlyCycleModal.tsx` (líneas 172-189, 325) además deshabilitan el botón de submit mientras haya cualquier conflicto — bloqueo duplicado (SQL + UI).
- El objeto de conflicto ya incluye `conflict_child_id` (`MonthlyConflict`, `src/types/db.ts:4007-4012`) pero **no se usa en ningún lado** — se podría distinguir "choca consigo misma" de "choca con otro paciente" sin trabajo adicional de cómputo.

**Nota — edición de plan ↔ pasado**: se verificó que `upsertTreatmentPlan` (`treatment-plans.ts`) YA respeta correctamente "solo hoy en adelante": la query de ciclos en scope filtra `.gte('period_month', currentMonthStart)` (línea 351) y siempre llama a `regenerate_cycle_appointments` con `p_only_future: true` (línea 375), que dentro del RPC filtra tanto el paso de cancelación (`starts_at >= now()`, línea ~750) como el de inserción (`starts_at < now()` se salta, línea ~794). El sync de `therapist_id` (líneas 436-462) también es future-only (`.gte('starts_at', nowIso)`, línea 455). **Esto no requiere cambios** — el único problema real es que el guard de conflictos puede abortar esta sincronización antes de que corra.

### Bug 2 — duplicación de niño/familia al avanzar de fase

Catálogo (`supabase/migrations/0121_intake_pipeline.sql:71-74`): la fase `3_2_inscripcion_activa` tiene `creates_child = true`; `3_3_activo_en_terapias` tiene `creates_child = false`. Lo que el usuario percibe como "pasar de 3.2 a 3.3" es en realidad: seleccionar `3_2_inscripcion_activa` dispara `advanceWaitlistPhase()` (`src/app/actions/intake-pipeline.ts:49-166`), que en la línea 92 (`if (targetPhase.creates_child)`) llama a `internalTransformWaitlistEntryToFamily()` (línea 93) y luego, en el mismo call, auto-avanza el niño recién creado a `3_3_activo_en_terapias` (líneas 97-112, con su registro en `child_phase_history`).

`internalTransformWaitlistEntryToFamily` (`intake-pipeline.ts:376-428`) inserta en `families` (389-403) y `children` (406-422) **sin ninguna verificación previa** de si `entry.scheduled_child_id` ya está asignado. Su función hermana `transformWaitlistEntryToFamily` (`src/app/actions/waitlist.ts:319-415`), usada por el botón manual "Convertir a familia", sí tiene ese guard (líneas 338-340: `if (entry.scheduled_child_id) return { ok: false, error: 'Esta entrada ya fue convertida en familia.' }`) — nunca se portó a la ruta automática del pipeline.

Esto se dispara en la práctica cuando alguien (admin/directora, según `validateTransition`, `src/lib/domain/intake-pipeline.ts:100-111`) **revierte** una entrada a una fase anterior para corregir un error y luego la **re-avanza** a `3_2_inscripcion_activa`: la UI (`WaitlistPipelineBoard.tsx:694` y `WaitlistTable.tsx:480,485`, ambos con `disabled={isCurrent || isPending}`) reactiva esa opción de fase porque solo verifica la fase actual, no si la entrada ya tiene un niño vinculado. Al hacer clic de nuevo, `advanceWaitlistPhase` vuelve a entrar sin chequear `scheduled_child_id`, y crea una segunda fila de `families` + `children` idéntica. El campo `scheduled_child_id` de la entrada queda apuntando al niño nuevo, dejando huérfano el par niño/familia original — que coincide exactamente con el reporte (datos idénticos, niño duplicado que se borra a mano, familia que queda).

**Confirmado como no-causa**: `deleteChild()` (`src/app/actions/children.ts:236-263`) borra solo la fila de `children` (línea 255) y nunca verifica si la familia se quedó sin hijos; `deleteFamily()` (`src/app/actions/families.ts:100-113`) existe y funciona (admin-only) pero es una acción completamente independiente, nunca invocada desde el borrado de niño. No hay ningún constraint de unicidad en `families` a nivel de esquema.

### Recargo por mora (pregunta, sin cambio de código)

`src/lib/domain/billing/late-fee.ts` (`SURCHARGE_PCT_PER_BLOCK = 5`, `SURCHARGE_BLOCK_DAYS = 5`, líneas 17-18) y la función SQL `mark_monthly_cycle_paid` (`supabase/migrations/0175_surcharge_next_month_and_exemption.sql`, cálculo líneas 78-80) implementan **5% simple por cada bloque de 5 días de atraso**, con ambos números hardcodeados por duplicado (TS y SQL) — no hay tabla de configuración; lo único configurable en BD es la exención booleana por familia (`families.late_fee_exempt`). Confirmado con el usuario — no se pide hacerlo configurable en este lote.

## Decisiones fijadas con el usuario (14-jul-2026)

1. Los conflictos de horario **nunca** bloquean la generación ni edición de un ciclo — se muestran como aviso no bloqueante, distinguiendo en el mensaje "choca con otra terapia de la misma niña" vs "choca con la cita de otro paciente".
2. Fix de duplicación: solo el guard simple de idempotencia (replica el patrón ya usado en `transformWaitlistEntryToFamily`). No se endurece el caso de doble-clic/concurrencia simultánea — de alcance menor y fuera de este lote.
3. Familias huérfanas ya existentes en producción: primero diagnóstico (conteo/lista, solo lectura) — no se borra nada todavía; el usuario decide qué hacer después de ver los datos.
4. Recargo por mora: confirmado como está (5%/5 días, hardcoded). Sin cambios de código pedidos en este lote.

## Sección 1 — Conflictos de horario dejan de bloquear

**Migración nueva** (siguiente número libre tras 0180, ver archivo `CLAUDE.md` del repo para el número exacto vigente al momento de implementar): `CREATE OR REPLACE` sobre las mismas firmas (sin cambiar argumentos, sin necesidad de `DROP FUNCTION`) de:

- `confirm_monthly_payment_and_generate`
- `generate_cycle_agenda`
- `regenerate_cycle_appointments`

En las tres, se elimina el bloque `RAISE EXCEPTION 'has_conflicts...'` (tanto el de conteo global como el per-candidate). El resto de cada función queda igual — se sigue calculando y devolviendo `conflicts[]` / `summary.conflict_count`, solo que ya no aborta la transacción. `compute_monthly_appointment_candidates` no cambia (es de solo lectura/preview, nunca tuvo el guard).

**UI** (`NewMonthlyCycleModal.tsx`, `EditMonthlyCycleModal.tsx`):
- Quitar `liveConflicts.length === 0` de `canConfirm` — el botón de submit deja de deshabilitarse por conflictos.
- Cambiar el mensaje de error bloqueante actual por un banner de advertencia no bloqueante (ámbar), que permite continuar.
- Usar `conflict_child_id` (ya presente en cada conflicto, hoy sin consumir) para redactar el mensaje: si `conflict_child_id === childId` del ciclo → "Esta terapia choca con otra terapia de [nombre de la niña]"; si no → "Choca con la cita de [otro paciente] con este terapeuta".
- El resaltado en rojo de las celdas del calendario de previsualización se mantiene igual (señal visual, ya no bloqueante).
- `dryRunCycleRegeneration` (`monthly-cycles.ts:210-262`, usado por `EditMonthlyCycleModal`) sigue filtrando los conflictos contra las propias citas auto-generadas del ciclo que se está regenerando (comportamiento actual, correcto) — solo cambia qué pasa cuando, tras ese filtro, siguen quedando conflictos reales.

## Sección 2 — Duplicación niño/familia en avance de fase

En `src/app/actions/intake-pipeline.ts`, `advanceWaitlistPhase()`: antes de invocar `internalTransformWaitlistEntryToFamily` (línea 93), agregar el mismo guard que ya existe en `transformWaitlistEntryToFamily` (`waitlist.ts:338-340`) — si `entry.scheduled_child_id` ya está asignado, **no crear una familia/niño nuevo**; en su lugar, continuar el avance de fase usando el niño **existente**: escribir `child_phase_history` contra ese `child_id`, actualizar `waitlist_entries.current_phase_code`/`children.current_phase_code` al target, y dejar `scheduled_child_id` sin tocar (ya apunta al registro correcto). Esto hace segura la secuencia revertir-y-reavanzar, que es el caso real confirmado por el usuario (datos idénticos al duplicar).

Fuera de alcance (decisión del usuario): la ventana de carrera de doble-clic/concurrencia entre la lectura de `entry.scheduled_child_id` (líneas 64-71) y la escritura (líneas 132-137) — el guard de idempotencia no la cierra del todo, pero el escenario confirmado (revertir-y-reavanzar manual) sí queda resuelto.

Sin migración de esquema — cambio puro de código de aplicación.

## Sección 3 — Diagnóstico de familias huérfanas (no destructivo)

Script de solo lectura `supabase/scripts/find_orphaned_families.sql`:

```sql
SELECT f.*
FROM families f
WHERE NOT EXISTS (SELECT 1 FROM children c WHERE c.family_id = f.id);
```

Se ejecuta contra producción (vía Management API, mismo patrón ya usado en sesiones previas) durante la fase de verificación, y se reporta el conteo/lista al usuario. **No se borra nada automáticamente** — cualquier borrado posterior lo decide el usuario caso por caso vía `deleteFamily` (ya existente, admin-only).

## Qué NO cambia (invariantes)

- El cómputo de candidatos de citas (`compute_monthly_appointment_candidates`), el WYSIWYG de previsualización (mes completo), y todo lo relacionado a facturación (mensualidad plana, rollover, recargo por mora, ajuste diferido) — el fix de conflictos es una relajación pura del guard, no toca montos ni lógica de generación.
- El comportamiento future-only de `upsertTreatmentPlan`/`regenerate_cycle_appointments` respecto al pasado — ya es correcto, confirmado en esta sesión, sin cambios.
- `transformWaitlistEntryToFamily` (ruta manual, `waitlist.ts`) — ya tiene su guard, no se toca.
- Roles y permisos de todas las acciones involucradas.

## Plan de fases (orden de implementación)

1. **F1**: migración SQL relajando el guard de conflictos en las 3 RPCs (Sección 1, backend).
2. **F2**: UI de los 2 modales de ciclo — banner no bloqueante + mensaje distinguiendo self/otro-paciente (Sección 1, frontend).
3. **F3**: guard de idempotencia en `advanceWaitlistPhase` (Sección 2).
4. **F4**: script de diagnóstico de familias huérfanas + reporte al usuario (Sección 3) — no bloquea nada de lo anterior, puede correr en paralelo.

Cada fase es deployable sola.

## Verificación

- Sección 1: generar/previsualizar el ciclo real de Ana Luna Tenorio (debe completarse sin bloqueo); caso sintético de dos niños distintos con el mismo terapeuta solapado (el aviso debe seguir mostrándose, correctamente etiquetado, y el submit debe permitirse).
- Sección 2: reproducir la secuencia revertir-fase-y-reavanzar sobre una entrada de prueba en lista de espera; confirmar que no aparece una segunda fila de `children`/`families`.
- Ambas son cambios de comportamiento backend sin cambios visuales/de layout — cobertura vía `npm run lint` + `npm run build` + recorrido manual guiado en el navegador (no existe suite de tests automatizados para estos flujos).
- Sección 3: correr el script contra producción, reportar conteo/lista al usuario.
