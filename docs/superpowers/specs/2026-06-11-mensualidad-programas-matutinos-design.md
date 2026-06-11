# Mensualidad fija para programas matutinos (Blue Kids / Learning Kids / Aula Educativa)

**Fecha:** 2026-06-11 · **Estado:** aprobado por el usuario

## Problema

Los programas matutinos se facturan como suscripción: los padres pagan una
cantidad fija al mes por asistir todos los días establecidos, sin importar si
el mes tiene 28 o 31 días. Hoy el sistema los trata como una terapia más:

- El editor de plan exige "veces por mes" (`sessions_per_month`).
- El ciclo mensual factura `sesiones × precio` y **recorta** citas por cuota
  (`skipped_overquota`).
- Existen subcategorías reales (Blue Kids 2/3/4/5 días a la semana, etc.) que
  ya están en `service_catalog` (category=`mensualidad`, `morning_program`,
  `days_per_week`, precio mensual fijo) pero el plan no las puede expresar.

## Decisiones del usuario

1. **Citas diarias: sí.** Se genera una cita por cada día establecido del mes
   (asistencia, despacho, carga de terapistas). El precio no depende del
   número de citas.
2. **Faltas: sin reposición ni rollover.** Excepción rara (faltó miércoles y
   lo dejan venir jueves): recepción mueve la cita manualmente en la agenda —
   flujo existente, no requiere nada nuevo.
3. **Precio: del catálogo según variante, editable** al generar el ciclo
   (becas/convenios).

## Diseño (opción A aprobada)

### 1. Plan de tratamiento — `billing_mode` por entrada

`TreatmentPlanTherapyEntry` (jsonb `therapies_json`, sin migración de columna)
gana dos campos opcionales:

```ts
billing_mode?: 'per_session' | 'monthly_flat'  // ausente = 'per_session'
days_per_week?: number                          // solo monthly_flat: variante del catálogo
```

- Para `service` ∈ {`blue_kids`, `learning_kids`, `aula_educativa`} el editor
  ofrece modalidad mensualidad: selector de **variante** (días/semana, leído
  de `service_catalog` category=`mensualidad` + `morning_program`) en lugar
  del selector de veces por mes. `unit_cost_usd` = mensualidad fija
  (precargada del catálogo, editable). `sessions_per_month` queda en 0 y se
  ignora.
- El horario semanal (`schedule_pattern_json`) se define igual que hoy.
  Si la cantidad de días distintos marcados para ese servicio ≠
  `days_per_week`, aviso visual sin bloquear.

### 2. Generación del ciclo (migración 0147)

Redefinir `compute_monthly_appointment_candidates` y
`confirm_monthly_payment_and_generate` (mismas firmas ⇒ sin `DROP`):

- **compute**: entradas `monthly_flat` no tienen cuota — se generan todas las
  fechas del patrón del mes (feriados se saltan igual); nada va a
  `skipped_overquota`. El rollover (`p_rollover_sessions`) no les aplica.
- **confirm**: la línea de factura de una entrada `monthly_flat` es
  `cantidad 1 × unit_cost_usd` con descripción tipo
  "Mensualidad Blue Kids — 3 días a la semana" (nombre de la variante del
  catálogo si existe; fallback al label del service_type). Las entradas
  `per_session` siguen `sesiones × precio` sin cambios.

### 3. Faltas y rollover

- Al reportar inasistencia de una cita cuyo servicio es `monthly_flat` en el
  plan activo, NO se crea `appointment_absences` (no aparece en
  /aprobaciones). El status `no_show`/`late_cancel` de la cita queda para
  métricas de asistencia.
- `getCycleRolloverPreview` excluye servicios `monthly_flat`.

### 4. UI

- `TreatmentPlanEditor`: selector de variante + precio mensual para servicios
  matutinos; oculta veces/mes; aviso variante vs. días marcados.
- `NewMonthlyCycleModal`: la fila de un servicio `monthly_flat` muestra
  "mensualidad fija" (1 × precio, editable) y no multiplica por sesiones;
  precarga el precio de la variante exacta (`days_per_week` del plan), no de
  la de más días como hoy.
- `buildCycleLineItems` (kinetic-invoices.ts): mismo branch qty 1.

### Retrocompatibilidad

Planes existentes sin `billing_mode` ⇒ `per_session` implícito; cero cambios
de comportamiento. Snapshots de ciclos viejos no se reinterpretan.

### Riesgos / no-objetivos

- No se toca la planilla (pago a terapistas) ni `cost_usd`.
- No se crea tabla nueva ni columnas; todo va en el jsonb existente y RPCs.
- La validación variante↔días marcados es advertencia, no bloqueo.
