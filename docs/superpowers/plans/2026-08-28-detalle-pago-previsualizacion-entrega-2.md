# Previsualizar el detalle de pago — Entrega 2 (editar cantidades y descuento)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder corregir las cantidades por terapia y el descuento desde la pantalla de previsualización, y que la corrección **sobreviva** a los dos mecanismos automáticos que hoy la revertirían.

**Architecture:** La corrección se guarda en el ciclo (nunca solo en el documento) por el camino que ya existe, `editMonthlyCycle`. Lo nuevo es la **marca de valor fijado a mano**: una entrada de `therapies_json` marcada deja de ser candidata al ajuste automático. Sin la marca la función no sirve — el sync de agenda revierte la cantidad al primer cambio de cita, y editar el plan la pisa al refrescar el snapshot.

**Tech Stack:** TypeScript · Supabase · vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-detalle-pago-previsualizacion-design.md`
**Entrega previa:** `docs/superpowers/plans/2026-08-28-detalle-pago-previsualizacion-entrega-1.md`

---

## Contexto verificado antes de planear

- `editMonthlyCycle` actualiza con `.eq('payment_status', 'pending')` (`monthly-cycles.ts:1136`).
  **Solo edita ciclos pendientes.** En uno pagado el update no matchea y `.single()`
  falla. La pantalla tiene que ser de solo lectura ahí y decir por qué.
- La reconstrucción del snapshot en `editMonthlyCycle` hace `...(old ?? {})` por
  servicio (`monthly-cycles.ts:1077`), así que **preserva campos extra sola**. La
  marca hay que ponerla y quitarla explícitamente para que se pueda limpiar.
- `upsertTreatmentPlan` refresca el snapshot con `therapiesValidated` del plan
  (`treatment-plans.ts:403`), que **no** trae la marca. Ahí sí hay que preservarla,
  con el mismo patrón de `withPreservedPrices`.
- `therapiesSyncedToAgenda` pisa `sessions_per_month` con el conteo de la agenda
  (`agenda-charge-sync.ts:129-132`).

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/domain/billing/manual-overrides.ts` **(nuevo)** | Puro: leer, poner y limpiar la marca; preservarla al refrescar un snapshot. |
| `src/lib/domain/billing/manual-overrides.test.ts` **(nuevo)** | Tests. |
| `src/lib/domain/billing/agenda-charge-sync.ts` | No toca las entradas marcadas; las reporta. |
| `src/app/actions/treatment-plans.ts:403` | Preserva las marcas al refrescar el snapshot. |
| `src/app/actions/monthly-cycles.ts` | `PricedTherapyInput` acepta la marca; se persiste. |
| `src/components/families/CycleChargePreviewModal.tsx` | Edición + guardar + "volver a automático". |
| `src/app/(app)/operacion/sincronizar-cobros/SincronizarCobrosClient.tsx` | Muestra qué quedó fijado a mano. |

---

## Task 1: La marca, pura

**Files:**
- Create: `src/lib/domain/billing/manual-overrides.ts`
- Test: `src/lib/domain/billing/manual-overrides.test.ts`

La marca vive en el jsonb del snapshot, **sin migración**:

```ts
sessions_overridden?: boolean
```

- [ ] **Step 1: Escribir el test que falla**

Casos: `hasSessionsOverride` lee la marca; `withSessionsOverride` la pone junto con
la cantidad; `clearSessionsOverride` la quita; `withPreservedOverrides(nuevas,
previas)` traslada marca **y valor** por servicio, y no inventa marcas donde no las
había.

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run src/lib/domain/billing/manual-overrides.test.ts`

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Correr y ver que pasa**

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/billing/manual-overrides.ts src/lib/domain/billing/manual-overrides.test.ts
git commit -m "feat: marca de cantidad fijada a mano en el detalle del ciclo"
```

---

## Task 2: El sync de agenda respeta la marca

**Files:**
- Modify: `src/lib/domain/billing/agenda-charge-sync.ts:128-133`
- Test: `src/lib/domain/billing/agenda-charge-sync.test.ts`

- [ ] **Step 1: Test que falla**

Una entrada con `sessions_overridden` y una agenda con otro conteo: `changed`
sigue en `false`, la cantidad no cambia, y el servicio aparece en
`overriddenServices`.

> El respaldo de precio se sigue aplicando a una entrada marcada: la marca es de
> la CANTIDAD. El precio llega en la entrega 3.

- [ ] **Step 2: Correr y ver que falla**

- [ ] **Step 3: Implementar** — saltar el ajuste de cantidad y sumar a `overriddenServices` (campo nuevo de `AgendaSyncResult`)

- [ ] **Step 4: Correr y ver que pasa** (incluida la suite entera: `needsChargeSync` no debe marcar de más)

- [ ] **Step 5: Commit**

---

## Task 3: Editar el plan no borra la marca

**Files:**
- Modify: `src/app/actions/treatment-plans.ts:392-406`

- [ ] **Step 1: Envolver el refresco con `withPreservedOverrides`**

```ts
const pricedTherapies = withPreservedOverrides(
  withPreservedPrices(
    withCatalogPrices(therapiesValidated, catalogForPrices).therapies,
    priorTherapies,
  ),
  priorTherapies,
)
```

- [ ] **Step 2: Typecheck + lint + suite**

- [ ] **Step 3: Commit**

---

## Task 4: Persistir la marca al guardar el detalle

**Files:**
- Modify: `src/app/actions/monthly-cycles.ts` (`PricedTherapyInput`, construcción de `newTherapies`)

- [ ] **Step 1: `PricedTherapyInput` gana `sessionsOverridden?: boolean`**

- [ ] **Step 2: `newTherapies` la escribe SIEMPRE** (true la pone, false la quita) — si no, no habría forma de volver a automático

- [ ] **Step 3: Typecheck + lint + suite**

- [ ] **Step 4: Commit**

---

## Task 5: La pantalla edita

**Files:**
- Modify: `src/components/families/CycleChargePreviewModal.tsx`

- [ ] **Step 1: Cantidades editables**

Un input por fila (las mensualidades fijas no: se cobran 1 × precio). Al cambiar
una cantidad, esa fila queda marcada y aparece **"fijada a mano · volver a
automático"**. Los totales se recalculan en vivo con las mismas funciones puras
del servidor, para que lo que se ve sea lo que se va a guardar.

- [ ] **Step 2: Descuento editable** (tipo + valor, reusando el patrón de `DiscountFields`)

- [ ] **Step 3: Guardar**

Llama a `editMonthlyCycle` con `regenerateAppointments: false` **siempre** — acá se
corrige el cobro, no la agenda — y con un motivo obligatorio, que ya queda en las
notas del ciclo para auditoría.

- [ ] **Step 4: Solo lectura cuando no se puede editar**

Ciclo **pagado**: sin edición, con el aviso de que la corrección va por
`/operacion/sincronizar-cobros` (que la manda al mes siguiente como ajuste).
Ciclo **anulado**: sin edición.

- [ ] **Step 5: Typecheck + lint + build**

- [ ] **Step 6: Commit**

---

## Task 6: La revisión de cobros muestra lo fijado a mano

**Files:**
- Modify: `src/app/actions/cycle-charge-sync.ts` (pasar `overriddenServices` a la fila)
- Modify: `src/app/(app)/operacion/sincronizar-cobros/SincronizarCobrosClient.tsx`

- [ ] **Step 1: Mostrar "cantidad fijada a mano" en la fila**

Sin esto, una cantidad que el emparejado ya no toca se vuelve invisible: alguien
va a ver que la agenda dice 4 y el cobro 3 y no va a entender por qué la
herramienta no lo corrige.

- [ ] **Step 2: Typecheck + lint**

- [ ] **Step 3: Commit**

---

## Cierre de la entrega

- [ ] `npx vitest run` en verde
- [ ] `npm run lint` sin errores nuevos
- [ ] `npm run build` verde
- [ ] Anotar en `CLAUDE.md`
- [ ] **Verificación del usuario** (no la puedo hacer yo, sin acceso a la base):
      corregir una cantidad, mover una cita de ese mes, y confirmar que la
      corrección sigue en pie.
