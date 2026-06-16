# Editar ciclo mensual (pendiente) — diseño

**Fecha:** 2026-06-16
**Estado:** Aprobado por el usuario, listo para implementar.

## Problema

Hoy un ciclo mensual generado solo admite **Marcar pagado**, **Prorrogar gracia** y
**Anular**. No hay forma de **editar** un ciclo ya generado: si el plan cambia a
mitad de mes (se agrega/quita una terapia, cambian sesiones o precios), la única
salida es anular + regenerar, lo cual cancela las citas `scheduled` del mes y anula
la factura. El usuario necesita ajustar el detalle de cobro del ciclo (y opcionalmente
las citas) **antes de marcarlo como pagado**.

## Alcance (decidido con el usuario)

- **Solo ciclos `generated` + `payment_status='pending'`.** Los pagados quedan
  inmutables (para esos sigue siendo anular + regenerar).
- Editar **siempre** el detalle de cobro: terapias, sesiones/mes, precios unitarios,
  descuento, fecha de vencimiento, notas → recalcula monto y **refresca la factura
  existente** (mismo número).
- **Checkbox opcional "Regenerar también las citas del mes"** (apagado por defecto):
  cuando se enciende, reemplaza las citas `scheduled` auto-generadas del mes según el
  detalle nuevo.

## Roles

Los mismos 6 que ya generan/cobran ciclos (`isMgmt` en `monthly-cycles.ts`):
admin, directora, coordinadora_terapias, coordinadora_familias, recepcion, contable.

## Diseño

### UI

- En `MonthlyCyclesSection`, agregar acción **"Editar"** en la fila de cada ciclo
  `generated` + `pending`, junto a "Marcar pagado" / "Prorrogar gracia".
- Nuevo `EditMonthlyCycleModal` que **reutiliza** componentes existentes:
  `DiscountFields`, `DraggableCycleCalendar`, la acción `dryRunMonthlyGeneration`,
  `therapyLineAmount`, y una tabla de precios extraída a un componente compartido
  `PricedTherapiesTable` (usado también por `NewMonthlyCycleModal`).
- Precarga desde el **snapshot del ciclo** (`treatment_plan_snapshot.therapies_json`),
  no del plan vivo.
- Campos: tabla de terapias (sesiones/precio/subtotal, +/- y agregar/quitar),
  descuento, fecha de vencimiento, notas, **justificación obligatoria** del cambio.
- Checkbox "Regenerar también las citas del mes":
  - Apagado → no toca citas.
  - Encendido → muestra preview (citas a crear, conflictos, asuetos) reutilizando
    `dryRun` + `DraggableCycleCalendar`; al guardar reemplaza las citas.

### Backend

**1. `editMonthlyCycle` (server action, TS) — siempre.**
- Valida `isMgmt` + ciclo `generated` + `payment_status='pending'` (si alguien lo
  pagó mientras tanto, error claro).
- Actualiza `monthly_session_cycles`: `treatment_plan_snapshot.therapies_json`
  (sesiones + precios editados), `discount_*`, `due_date`, `payment_amount_usd`
  (recalculado con `therapyLineAmount` + descuento), `notes` (con la justificación).
- Refresca la factura con `createInvoiceForCycle(cycleId)` (idempotente: parcha la
  existente).
- Reutiliza el bloque de recálculo que ya vive en `confirmMonthlyPaymentAndGenerate`
  (extraer a helper compartido para no duplicar).

**2. `regenerate_cycle_appointments` (RPC nueva, SQL) — solo si checkbox encendido.**
- Mirror del bloque de citas del confirm más reciente (0147): terapista por
  `service_type` (fallback `primary_therapist_id`, mig 0134), skip de asuetos,
  chequeo de conflictos, cuota.
- Regla de seguridad: **preserva** citas `completed`/`in_progress`/`replacement`;
  **cancela** (→`rescheduled`) solo las `scheduled` auto-generadas del mes (mismo
  criterio que `cancel_monthly_cycle`: nota `"Auto-generado del ciclo"`); **recrea**
  desde el override/compute.
- Si hay conflictos, `raise exception 'has_conflicts'` (la action lo traduce y la UI
  pide resolver en /agenda, igual que al generar).
- Actualiza `appointments_generated_count` y `appointments_generated_at` del ciclo.
- Función **nueva** (sin colisión de overloads). Acepta
  `p_cycle_id uuid, p_appointments_override jsonb`.

### Aislamiento / limpieza

- Extraer `PricedTherapiesTable` (tabla terapias + steppers + precios) desde
  `NewMonthlyCycleModal` a un componente compartido. Reduce el tamaño de ese archivo
  (ya grande) y evita duplicar en el modal de edición.
- Extraer el cálculo de monto esperado (subtotal priced − descuento) a un helper puro
  reutilizado por confirm y edit.

## Qué NO cambia

- El flujo de "Generar ciclo" (`confirmMonthlyPaymentAndGenerate`) queda intacto.
- Ciclos pagados/anulados: sin cambios de comportamiento.
- La factura mantiene su número al editar (patch in-place).

## Testing

- Unit (vitest, funciones puras): helper de monto esperado (subtotal priced −
  descuento, con `monthly_flat`), y validación de estado editable.
- La regeneración de citas (RPC) se valida manualmente en Supabase + revisión del
  preview de conflictos en la UI (no hay harness SQL en el repo).

## Migración

- Nueva migración `supabase/migrations/0148_regenerate_cycle_appointments.sql` con la
  RPC. Aplicar manualmente en Supabase Dashboard. Extender
  `verify_pending_migrations.sql` con el check `mig_0148_*`.
