# Desacople agenda/ciclos ↔ facturación — Diseño

**Fecha:** 2026-07-12
**Estado:** Diseño aprobado por el usuario (5 secciones), pendiente de plan de implementación.

## Contexto y problema

Hoy `confirm_monthly_payment_and_generate` (versión vigente: `0163_cycle_generates_agenda.sql:47`, wrapper TS `confirmMonthlyPaymentAndGenerate` en `monthly-cycles.ts:428`) crea **factura + citas + fila de ciclo en una sola transacción**, y el TS la amplifica parchando el snapshot y reescribiendo la factura (`createInvoiceForCycle`). Consecuencias operativas:

- La coordinadora de terapias no puede agendar sin pasar por conceptos de cobro (monto, método, vencimiento).
- `regenerate_cycle_appointments` (0148) exige `status='generated' AND payment_status='pending'` → **un ciclo pagado es ineditable**: para corregirlo hay que anularlo y regenerarlo, con riesgo de perder el registro de completadas del mes.
- La edición del plan (`upsertTreatmentPlan`, `treatment-plans.ts:212`) propaga cambios de hora **solo a ciclos pendientes** (`:308-351`); a los pagados solo les sincroniza `therapist_id` (`:353-379`). Bug reportado: "al cambiar el plan de hora no se mueven las fechas en agenda".
- No existe el concepto "¿solo esta cita o las siguientes?" al editar (todas las ops de `appointments.ts` son por-fila).
- `cancel_monthly_cycle` (0146) anula factura Y agenda juntas.

**Visión aprobada**: "la agenda manda, la facturación lee". Coordinación de terapias y recepción trabajan independientes; convergen solo en el plan de tratamiento (que la coordinadora mantiene al día) y en el momento de facturar.

## Decisiones de negocio fijadas (con el usuario, 12-jul-2026)

1. **Factura al inicio del mes, ajustable** (prepago se mantiene). Pendiente → regenerable; pagada → la diferencia se arrastra al mes siguiente.
2. **Prompt de alcance estilo Google Calendar** al editar plan/citas. Las citas `completed`/`in_progress`/`no_show` **jamás** se tocan.
3. **El ciclo se queda** como contenedor mensual (KPIs, detalle de pago, historial) — pero generar/editar agenda no exige factura, y facturar no toca agenda.

## Sección 1 — Separar "generar agenda" de "facturar"

**Migración nueva (0177)** con dos cambios de RPC:

- **`generate_cycle_agenda(...)`** (nueva, misma lógica de citas que `confirm_monthly_payment_and_generate` 0163 pero **sin el bloque de factura** `0163:184-219`): crea la fila de ciclo (`status='generated'`, `payment_status='pending'`, `invoice_id=NULL`, snapshot del plan vivo) + citas (respetando `p_appointments_override` WYSIWYG, monthly_flat salta citas, upsert de membresía de grupo) . Args: los 14 actuales **menos** `p_payment_amount/p_payment_method/p_payment_reference/p_paid_at` (el monto esperado se calcula del snapshot al facturar). Autorización: `kn_can_manage_cycles()` (ya incluye a ambas coordinadoras).
- **`confirm_monthly_payment_and_generate` se conserva** tal cual (mismo nombre/firma, delegando internamente a la nueva + factura) como **atajo combinado** para recepción — nadie pierde su rutina. Cero cambios de firma ⇒ sin sobrecargas ambiguas (gotcha del repo).

**TS (`monthly-cycles.ts`)**:
- Nueva action `generateCycleAgenda(input)` → RPC nueva + `regenerateMorningAppointments` + parche de snapshot (sesiones/precios editados), **sin** `createInvoiceForCycle`.
- Nueva action `generateInvoiceForCycle(cycleId)` (wrapper con gate de rol sobre `createInvoiceForCycle` de `kinetic-invoices.ts`, que ya sabe crear o parchear): si el ciclo no tiene factura la crea (status `issued`, due_date día 5 del mes del período o el override guardado); si tiene una **pendiente**, la regenera desde el snapshot al día (sección 4). Roles: los de `kn_can_manage_cycles()`.
- UI `MonthlyCyclesSection` / `NewMonthlyCycleModal`: el modal de generación gana un modo "Solo agenda (sin factura)" — default para coordinadoras; recepción ve el combinado como hoy. En la tabla de ciclos, un ciclo sin factura muestra botón **"Generar factura"**.

## Sección 2 — Edición libre en cualquier momento

**Migración 0177 (mismo archivo)**: `regenerate_cycle_appointments` — se relaja el guard `0148:57-59`: se permite en ciclos `generated` con **cualquier** `payment_status` (sigue prohibido en `cancelled`). El resto no cambia (conserva `completed`/`in_progress`/`replacement` y las citas manuales; solo recrea `scheduled` auto-generadas).

**`upsertTreatmentPlan` (`treatment-plans.ts:308-351`)**: el loop de regeneración deja de filtrar `payment_status='pending'` → propaga hora/día/duración/frecuencia a **todos** los ciclos `generated` del mes actual en adelante (respetando el prompt de alcance de la sección 3). El sync de `therapist_id` (`:353-379`) queda igual (ya cubre pagados).

## Sección 3 — Prompts de alcance (Google Calendar)

**Al guardar el plan** con cambios de horario (`computeRelevantSignature` ya detecta hora/día/duración/servicio/frecuencia): el editor (`TreatmentPlanEditor`) muestra un paso de confirmación con 2 opciones:
- **"Solo de ahora en adelante"** (default): regenera las citas futuras `scheduled` de los ciclos vigentes (pasa `p_only_future=true` nuevo arg de `regenerate_cycle_appointments`, que limita el re-marcado a `starts_at >= now()`; las `scheduled` pasadas sin marcar quedan intactas).
- **"No tocar la agenda"**: guarda el plan sin regenerar nada (los meses siguientes ya nacerán con el plan nuevo).

Nota gotcha: `regenerate_cycle_appointments` cambia de firma (arg nuevo con default) ⇒ la migración incluye `DROP FUNCTION` de la firma vieja.

**Al editar/mover una cita individual** (`moveAppointment` drag-drop y el modal de edición): si la cita es auto-generada de ciclo (`notes LIKE 'Auto-generado del ciclo%'`) y hay más citas futuras `scheduled` del mismo niño+servicio, el confirm existente de drag-drop gana la opción:
- **"Solo esta cita"** (comportamiento actual).
- **"Esta y las siguientes"**: nueva action `moveAppointmentSeries(appointmentId, deltaMin)` — aplica el mismo delta de horario a las futuras `scheduled` auto-generadas del mismo `child_id+service_type` del mes, validando solapes por cita (las que chocan se reportan y NO se mueven).

## Sección 4 — Factura ajustable sin fricción

- **Factura pendiente + plan/ciclo cambió**: `generateInvoiceForCycle` regenera ítems desde el snapshot actualizado (ya existe la rama "parchar" en `createInvoiceForCycle:185-228`). Botón "Actualizar factura" visible cuando `invoice.status='issued'` y el snapshot cambió después de emitida (comparar `cycle.updated_at > invoice.issue_date` como heurística simple, o mostrar siempre el botón — decisión de implementación: mostrar siempre; la operación es idempotente).
- **Factura pagada + el ciclo cambió a mitad de mes**: NO se toca la factura pagada. La diferencia (`nuevo total esperado del snapshot − payment_amount_usd cobrado`) se registra en el ciclo (`billing_adjustment_usd numeric`, columna nueva en 0177, positiva=cargo/negativa=crédito) y `createInvoiceForCycle` del **mes siguiente** la inyecta como línea "Ajuste del mes anterior (plan modificado tras el pago)" — espejo exacto del patrón `surcharge_carried_in_usd`/`surcharge_carried_at` de 0175 (con su `billing_adjustment_carried_at` para no doble-cobrar).

## Sección 5 — Anulación separada

`MonthlyCyclesSection` divide "Anular" en:
- **Anular factura** (nueva action `voidCycleInvoice(cycleId, reason)`): `invoices.status='void'` + auditoría, sin tocar citas. El ciclo queda sin factura activa (se puede volver a generar).
- **Cancelar agenda del mes** (nueva RPC o rama de la existente): marca `rescheduled` las `scheduled` auto-generadas, sin tocar factura.
- **Anular todo** = comportamiento actual de `cancel_monthly_cycle` (se conserva, mismos roles de 0146).

## Fugas de snapshot a cerrar (para que "recepción lee del ciclo" sea verdad)

1. `api/ciclos/[cycleId]/detalle/route.ts:58-68` — fallback al plan vivo si el snapshot no trae horario → al regenerar/editar el ciclo, SIEMPRE refrescar `schedule_pattern_json` en el snapshot (ya se parcha en editMonthlyCycle; añadirlo a la regeneración por plan).
2. `getCycleRolloverPreview` (`monthly-cycles.ts:329-340`) — lee `billing_mode` del plan vivo → tomarlo del snapshot del ciclo anterior, con fallback al vivo solo si el snapshot es pre-0147.

## Qué NO cambia (invariantes)

- Dashboard del niño, `EditMonthlyCycleModal`, exportar detalle de pago (PDF), WYSIWYG de previsualización, recargo por mora diferido (0175), rollover, exención por familia.
- `mark_monthly_cycle_paid` (4 args) intacta.
- Las citas `completed`/`in_progress`/`no_show`/`replacement` y las creadas a mano jamás se regeneran ni cancelan por estas operaciones.
- Roles: `kn_can_manage_cycles()` sigue siendo el gate único de agenda+ciclos; facturar queda en los mismos roles.

## Plan de fases (orden de implementación)

1. **F1**: mig 0177 (RPC nueva + relajar guard + arg `p_only_future` + columnas `billing_adjustment_*`) + actions `generateCycleAgenda`/`generateInvoiceForCycle` + UI botón "Generar factura"/modo "Solo agenda". → Ya desacopla el día a día.
2. **F2**: propagación de plan a ciclos pagados + prompt de alcance en el editor de plan.
3. **F3**: serie en citas individuales ("esta y las siguientes").
4. **F4**: ajuste arrastrado al mes siguiente (factura pagada) + anulación separada + cierre de fugas de snapshot.

Cada fase es deployable sola; F1 es el MVP del desacople.

## Verificación

- Tests unitarios de la lógica pura nueva (cálculo de `billing_adjustment_usd`, delta de serie).
- SQL de prueba en Supabase (proyecto real, patrón de sesiones anteriores): generar agenda sin factura → facturar → editar plan → verificar completadas intactas + factura regenerada.
- Click-through en deploy: flujo coordinadora (agendar/editar sin ver cobro) y flujo recepción (facturar/actualizar/anular factura).
