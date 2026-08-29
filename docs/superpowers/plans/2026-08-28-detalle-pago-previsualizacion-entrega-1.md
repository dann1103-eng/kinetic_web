# Previsualizar el detalle de pago — Entrega 1 (solo lectura)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el botón "Detalle de pago" muestre en pantalla, antes de descargar, todo lo que se le va a cobrar a la familia ese mes — incluidos los arrastres que hoy solo aparecen en la factura.

**Architecture:** El cálculo de arrastres vive hoy adentro de `createInvoiceForCycle`, que es un camino de **escritura**: además de calcular, marca los meses anteriores como ya cobrados. Se parte en dos: una función **pura** que decide qué se arrastra, y la persistencia que queda en la acción de factura. La previsualización usa la parte pura y no escribe nada. Lo mismo con el armado del detalle, que hoy vive dentro de la ruta del PDF: se extrae a un cargador compartido para que el documento y la pantalla no puedan divergir.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (admin client) · vitest con el fake de `src/lib/supabase/testing.ts`.

**Spec:** `docs/superpowers/specs/2026-08-28-detalle-pago-previsualizacion-design.md`

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/domain/billing/carry-ins.ts` **(nuevo)** | Puro: dado el ciclo, la familia y los ciclos anteriores sin cobrar, decide qué líneas se arrastran y de qué ciclos vienen. Sin DB. |
| `src/lib/domain/billing/carry-ins.test.ts` **(nuevo)** | Tests de lo anterior. |
| `src/app/actions/kinetic-invoices.ts` | Pasa a consumir la función pura. **Sin cambio de comportamiento.** |
| `src/lib/domain/billing/cycle-detail-input.ts` **(nuevo)** | Carga de la BD lo que `buildCycleDetail` necesita (niño, snapshot, horario, citas). Lo usan la ruta del PDF y la previsualización. |
| `src/app/api/ciclos/[cycleId]/detalle/route.ts` | Pasa a usar el cargador. **Sin cambio de comportamiento.** |
| `src/app/actions/cycle-charge-preview.ts` **(nuevo)** | `getCycleChargePreview(cycleId)`: detalle + arrastres + total a cobrar. Solo lectura. |
| `src/app/actions/cycle-charge-preview.test.ts` **(nuevo)** | Test de la acción con el fake de Supabase. |
| `src/components/families/CycleChargePreviewModal.tsx` **(nuevo)** | El modal. |
| `src/components/families/MonthlyCyclesSection.tsx:285` | El botón abre el modal en vez de descargar. |

---

## Task 1: Función pura de arrastres

**Files:**
- Create: `src/lib/domain/billing/carry-ins.ts`
- Test: `src/lib/domain/billing/carry-ins.test.ts`

Reproduce **exactamente** las reglas que hoy están en `kinetic-invoices.ts:193-285`:

- Si el ciclo ya tiene `surcharge_carried_in_usd > 0`, ese es el arrastre (factura regenerada) y **no** se buscan ciclos anteriores.
- Si no, y la familia **no** es `late_fee_exempt`, se arrastra el recargo de cada ciclo anterior pagado con `surcharge_amount_usd > 0` y `surcharge_carried_at` nulo.
- Igual para el ajuste, con `billing_adjustment_carried_in_usd != 0` y sin la exención (el ajuste se arrastra siempre).

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { computeCarryIns } from './carry-ins'

const base = {
  cycle: {
    period_month: '2026-09-01',
    surcharge_carried_in_usd: 0,
    billing_adjustment_carried_in_usd: 0,
  },
  familyLateFeeExempt: false,
  pendingSurchargeCycles: [],
  pendingAdjustmentCycles: [],
}

describe('computeCarryIns', () => {
  it('sin nada pendiente no arrastra ninguna línea', () => {
    const res = computeCarryIns(base)
    expect(res.lines).toEqual([])
    expect(res.surchargeTotal).toBe(0)
    expect(res.adjustmentTotal).toBe(0)
  })

  it('arrastra el recargo de un mes anterior pagado tarde', () => {
    const res = computeCarryIns({
      ...base,
      pendingSurchargeCycles: [
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
    })
    expect(res.surchargeTotal).toBe(12.5)
    expect(res.surchargeFromCycleIds).toEqual(['c-ago'])
    expect(res.lines[0].amount).toBe(12.5)
    expect(res.lines[0].description).toContain('agosto')
  })

  it('una familia exonerada no arrastra recargos', () => {
    const res = computeCarryIns({
      ...base,
      familyLateFeeExempt: true,
      pendingSurchargeCycles: [
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
    })
    expect(res.surchargeTotal).toBe(0)
    expect(res.lines).toEqual([])
  })

  it('un arrastre ya registrado gana y no vuelve a buscar meses anteriores', () => {
    // Factura regenerada: el arrastre quedó grabado en el ciclo. Volver a
    // sumarlo desde los ciclos viejos lo cobraría dos veces.
    const res = computeCarryIns({
      ...base,
      cycle: { ...base.cycle, surcharge_carried_in_usd: 20 },
      pendingSurchargeCycles: [
        { id: 'c-ago', period_month: '2026-08-01', surcharge_amount_usd: 12.5 },
      ],
    })
    expect(res.surchargeTotal).toBe(20)
    expect(res.surchargeFromCycleIds).toEqual([])
  })

  it('el crédito de un mes ya pagado viaja como monto negativo', () => {
    const res = computeCarryIns({
      ...base,
      pendingAdjustmentCycles: [
        { id: 'c-ago', period_month: '2026-08-01', billing_adjustment_usd: -22 },
      ],
    })
    expect(res.adjustmentTotal).toBe(-22)
    expect(res.lines[0].amount).toBe(-22)
    expect(res.lines[0].description).toContain('Crédito')
  })
})
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run src/lib/domain/billing/carry-ins.test.ts`
Expected: FAIL — `Failed to resolve import "./carry-ins"`.

- [ ] **Step 3: Implementar el módulo puro**

`periodLabel` se **mueve** acá desde `kinetic-invoices.ts` (donde es una función local) para que las descripciones no se dupliquen. Es una columna de solo fecha, así que **no** lleva `timeZone` — ver el aviso de `@/lib/format/datetime-sv`.

```ts
export interface CarryInLine {
  description: string
  /** Positivo = cargo; negativo = crédito. */
  amount: number
}

export interface CarryInInput {
  cycle: {
    period_month: string
    surcharge_carried_in_usd?: number | null
    billing_adjustment_carried_in_usd?: number | null
  }
  familyLateFeeExempt: boolean
  pendingSurchargeCycles: { id: string; period_month: string; surcharge_amount_usd: number }[]
  pendingAdjustmentCycles: { id: string; period_month: string; billing_adjustment_usd: number }[]
}

export interface CarryInResult {
  lines: CarryInLine[]
  surchargeTotal: number
  surchargeFromCycleIds: string[]
  adjustmentTotal: number
  adjustmentFromCycleIds: string[]
}

export function periodLabel(periodMonth: string): string {
  return new Date(`${periodMonth.slice(0, 10)}T00:00:00`).toLocaleDateString('es-SV', {
    month: 'long',
    year: 'numeric',
  })
}

export function computeCarryIns(input: CarryInInput): CarryInResult {
  const lines: CarryInLine[] = []
  let surchargeTotal = 0
  const surchargeFromCycleIds: string[] = []
  let adjustmentTotal = 0
  const adjustmentFromCycleIds: string[] = []

  const registeredSurcharge = Number(input.cycle.surcharge_carried_in_usd ?? 0)
  if (registeredSurcharge > 0) {
    surchargeTotal = registeredSurcharge
    lines.push({ description: 'Recargo por mora de mensualidad anterior', amount: registeredSurcharge })
  } else if (!input.familyLateFeeExempt) {
    for (const prev of input.pendingSurchargeCycles) {
      const amount = Number(prev.surcharge_amount_usd)
      surchargeTotal += amount
      surchargeFromCycleIds.push(prev.id)
      lines.push({
        description: `Recargo por mora — mensualidad de ${periodLabel(prev.period_month)} pagada tarde`,
        amount,
      })
    }
  }

  const registeredAdjustment = Number(input.cycle.billing_adjustment_carried_in_usd ?? 0)
  if (registeredAdjustment !== 0) {
    adjustmentTotal = registeredAdjustment
    lines.push({
      description:
        registeredAdjustment >= 0
          ? 'Ajuste de mensualidad anterior (cambio de plan)'
          : 'Crédito de mensualidad anterior (cambio de plan)',
      amount: registeredAdjustment,
    })
  } else {
    for (const prev of input.pendingAdjustmentCycles) {
      const amount = Number(prev.billing_adjustment_usd)
      adjustmentTotal += amount
      adjustmentFromCycleIds.push(prev.id)
      lines.push({
        description:
          amount >= 0
            ? `Ajuste — mensualidad de ${periodLabel(prev.period_month)} (cambio de plan tras el pago)`
            : `Crédito — mensualidad de ${periodLabel(prev.period_month)} (cambio de plan tras el pago)`,
        amount,
      })
    }
  }

  return { lines, surchargeTotal, surchargeFromCycleIds, adjustmentTotal, adjustmentFromCycleIds }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/lib/domain/billing/carry-ins.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/billing/carry-ins.ts src/lib/domain/billing/carry-ins.test.ts
git commit -m "refactor: la regla de arrastres sale a una funcion pura y testeable"
```

---

## Task 2: La factura consume la función pura

**Files:**
- Modify: `src/app/actions/kinetic-invoices.ts:193-285`

> **No hay tests de `createInvoiceForCycle`** — es una acción con cliente admin. La red es: la función pura ya tiene tests, el typecheck, y que este paso **no cambie ni una línea de comportamiento**. Comparar el diff con cuidado.

- [ ] **Step 1: Reemplazar el bloque inline**

Las dos consultas se quedan en la acción (leen la BD); lo que sale es la decisión.

```ts
const [{ data: pendingSurchargeRaw }, { data: pendingAdjRaw }] = await Promise.all([
  admin
    .from('monthly_session_cycles')
    .select('id, period_month, surcharge_amount_usd')
    .eq('child_id', cycle.child_id)
    .neq('status', 'cancelled')
    .eq('payment_status', 'paid')
    .gt('surcharge_amount_usd', 0)
    .is('surcharge_carried_at', null)
    .lt('period_month', cycle.period_month)
    .order('period_month'),
  admin
    .from('monthly_session_cycles')
    .select('id, period_month, billing_adjustment_usd')
    .eq('child_id', cycle.child_id)
    .neq('status', 'cancelled')
    .eq('payment_status', 'paid')
    .neq('billing_adjustment_usd', 0)
    .is('billing_adjustment_carried_at', null)
    .lt('period_month', cycle.period_month)
    .order('period_month'),
])

const carry = computeCarryIns({
  cycle,
  familyLateFeeExempt: !!(family as { late_fee_exempt?: boolean }).late_fee_exempt,
  pendingSurchargeCycles: (pendingSurchargeRaw ?? []) as never,
  pendingAdjustmentCycles: (pendingAdjRaw ?? []) as never,
})
for (const l of carry.lines) {
  items.push({ description: l.description, quantity: 1, unit_price: l.amount })
}
```

`persistCarriedSurcharge` y `persistCarriedAdjustment` se conservan tal cual, leyendo de `carry.surchargeFromCycleIds` / `carry.adjustmentFromCycleIds` / los totales.

> **Ojo:** la consulta del recargo se hacía **solo** en la rama `else`. Ahora se hace siempre. Es una lectura de más sin efecto (la función pura la ignora si hay arrastre registrado), pero si se prefiere evitarla, condicionarla igual que antes.

- [ ] **Step 2: Typecheck y lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/app/actions/kinetic-invoices.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/kinetic-invoices.ts
git commit -m "refactor: createInvoiceForCycle usa la regla de arrastres compartida"
```

---

## Task 3: Cargador compartido del detalle

**Files:**
- Create: `src/lib/domain/billing/cycle-detail-input.ts`
- Modify: `src/app/api/ciclos/[cycleId]/detalle/route.ts:40-100`

Mueve tal cual lo que la ruta ya hace: ciclo, nombre del niño, snapshot, `schedule_pattern_json` (del snapshot o del plan activo) y las citas del mes.

- [ ] **Step 1: Extraer `loadCycleDetailInput(supabase, cycleId)`**

Devuelve `null` si el ciclo no existe. La ruta pasa a llamarlo y a armar el PDF con el resultado; **nada más cambia**.

- [ ] **Step 2: Verificar que el PDF sigue igual**

Run: `npx tsc --noEmit -p tsconfig.json`
Y descargar el detalle de un ciclo real, comparando contra el anterior.

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/billing/cycle-detail-input.ts "src/app/api/ciclos/[cycleId]/detalle/route.ts"
git commit -m "refactor: el armado del detalle sale de la ruta del PDF a un cargador compartido"
```

---

## Task 4: Acción de previsualización

**Files:**
- Create: `src/app/actions/cycle-charge-preview.ts`
- Test: `src/app/actions/cycle-charge-preview.test.ts`

El total a cobrar tiene **tres** componentes además del detalle. El tercero es fácil de olvidar: el rollover en modo descuento (`rollover_discount_usd` cuando `rollover_mode === 'discount'`), que entra a la factura y **no** está en `payment_amount_usd`.

**Cuidado con la fórmula.** Restar el rollover al total del detalle está mal: en la factura el tope se aplica a la suma de los dos descuentos, no a cada uno por separado (`kinetic-invoices.ts`: `discountAmount = min(subtotalRaw, discountAmount + rolloverDiscount)`). Hay que replicarlo así:

```
descuentoTotal = min(detail.subtotal, detail.discountAmount + rolloverDiscount)
totalToCharge  = detail.subtotal − descuentoTotal + surchargeTotal + adjustmentTotal
```

Con un descuento fijo grande más rollover, la versión ingenua daría un total negativo. Hay que testear ese caso.

> Un ciclo **anulado** (`status = 'cancelled'`) igual puede previsualizarse — la ruta del PDF no lo bloquea — pero el modal debe decirlo, porque ese cobro no se le va a pedir a nadie.

- [ ] **Step 1: Escribir el test que falla**

Con el fake de `@/lib/supabase/testing`: un ciclo de $236 con un crédito de $22 de agosto debe dar `totalToCharge = 214`, y `carryIns` debe traer una línea negativa.

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run src/app/actions/cycle-charge-preview.test.ts`

- [ ] **Step 3: Implementar la acción**

Solo lectura y sin `admin` para escribir: valida rol con el mismo set de gestión que los ciclos y **no persiste ningún arrastre**.

- [ ] **Step 4: Correr y ver que pasa**

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/cycle-charge-preview.ts src/app/actions/cycle-charge-preview.test.ts
git commit -m "feat: accion de solo lectura con el cobro completo del mes"
```

---

## Task 5: El modal

**Files:**
- Create: `src/components/families/CycleChargePreviewModal.tsx`
- Modify: `src/components/families/MonthlyCyclesSection.tsx:285`

- [ ] **Step 1: Modal de solo lectura**

Tres bloques: el desglose (mismas filas que el PDF), "Se suma a este cobro" con los arrastres, y **Total a cobrar**. Abajo, *Descargar PDF* (el `href` de hoy) y *Cerrar*.

Si `carryIns` está vacío, ese bloque no se muestra.

- [ ] **Step 2: El botón abre el modal**

El enlace directo pasa a ser un botón. El PDF se sigue descargando desde adentro.

- [ ] **Step 3: Verificar en el navegador**

Abrir la ficha de un niño con arrastres pendientes y confirmar que el total del modal coincide con el de su factura.

- [ ] **Step 4: Commit**

```bash
git add src/components/families/CycleChargePreviewModal.tsx src/components/families/MonthlyCyclesSection.tsx
git commit -m "feat: el detalle de pago se previsualiza antes de descargarlo"
```

---

## Cierre de la entrega

- [ ] `npx vitest run` — toda la suite en verde
- [ ] `npm run lint` — sin errores nuevos
- [ ] `npm run build` — verde
- [ ] Anotar la entrega en `CLAUDE.md`
- [ ] Pedirle al usuario que confirme contra un ciclo real antes de pushear
