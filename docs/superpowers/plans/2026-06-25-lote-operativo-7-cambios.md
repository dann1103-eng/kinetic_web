# Lote operativo — 7 cambios · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 7 cambios operativos independientes de Kinetic (jornadas del equipo, tiempos editables, agenda responsive, costos de catálogo, bug de chat, bonos SP, honorario SP visible, documento bancario).

**Architecture:** Cada item es un bloque **independiente y entregable por sí solo** (su propio/s commit/s y verificación). Lógica pura testeada con vitest; UI/migraciones verificadas con `npm run lint` + `npm run build` + preview. Escrituras privilegiadas vía admin client (service role) gateadas por rol en código (patrón del CRUD de usuarios). Migraciones manuales en Supabase desde **0161**.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TS 5 · Tailwind 4 · Supabase · vitest 2 · @react-pdf/renderer · exceljs (nueva).

**Spec:** `docs/superpowers/specs/2026-06-25-lote-operativo-7-cambios-design.md`

**Orden:** 4 → 6 → 5 → 3 → 1B → 7 → 1A → 2 (independientes; reordenables).

**Regla de commits:** español, `feat|fix|docs|chore`. Cerrar cada commit con:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
Verificación por item antes de commit: `npm run lint` (0 errores nuevos). Verificación final del lote: `npm run build`.

---

## File Structure (mapa de archivos del lote)

**Crear**
- `supabase/migrations/0161_users_bank_fields.sql` — campos bancarios (item 7)
- `supabase/migrations/0162_chat_attachments_bucket.sql` — bucket/políticas chat (item 4, tras diagnóstico)
- `supabase/migrations/0163_seed_service_catalog_entrevista_asesoria.sql` — seed condicional (item 3)
- `src/app/actions/work-sessions-admin.ts` — acciones admin de jornadas (item 1A)
- `src/components/tiempo/EquipoJornadasPanel.tsx` — vista equipo (item 1A)
- `src/components/tiempo/EditWorkSessionModal.tsx` — alta/edición de jornada (item 1A)
- `src/lib/domain/reports/bank-transfer.ts` — builder puro del documento (item 7)
- `src/lib/domain/reports/bank-transfer.test.ts` — tests del builder (item 7)
- `src/app/(app)/reportes/contabilidad/transferencias/page.tsx` — generador (item 7)
- `src/components/reportes/contabilidad/TransferenciasClient.tsx` — UI generador (item 7)
- `src/components/reportes/contabilidad/pdf/BankTransferPDF.tsx` — PDF (item 7)
- `src/app/api/reportes/contabilidad/transferencias/xlsx/route.ts` — export Excel (item 7)
- `src/app/api/reportes/contabilidad/transferencias/pdf/route.ts` — export PDF (item 7)
- `src/lib/domain/agenda/column-widths.ts` — helpers de ancho (item 2)

**Modificar**
- `src/lib/domain/payroll/calculation.ts` — `calculateProfessionalServicesPayroll` acepta bonos (item 5)
- `src/lib/domain/payroll/professional-services.test.ts` o nuevo test — bonos SP (item 5)
- `src/app/actions/payroll.ts` — rama SP de create/update pasa bonos (item 5); lectura bancaria (item 7)
- `src/components/reportes/contabilidad/PayrollItemEditor.tsx` — bono en SP (item 5)
- `src/components/reportes/contabilidad/pdf/PayrollItemPDF.tsx` y `PayrollRunPDF.tsx` — línea bonos SP (item 5)
- `src/app/(app)/reportes/contabilidad/configuracion/page.tsx` — columna honorario SP (item 6)
- `src/components/reportes/contabilidad/UserSalaryRow.tsx` — columna SP + campos bancarios (items 6, 7)
- `src/components/catalogos/CatalogosClient.tsx` — costos de no-terapias (item 3)
- `src/lib/supabase/upload-chat-attachment.ts` — mejor mensaje de error (item 4)
- `src/lib/domain/reports/completed-therapies.ts` — exponer duración (item 1B)
- `src/components/operacion/CompletedTherapiesView.tsx` — columna editable (item 1B)
- `src/app/actions/appointments.ts` — `adminUpdateAppointmentTimes` (item 1B)
- `src/app/(app)/tiempo/page.tsx` — montar pestaña Equipo (item 1A)
- `src/app/actions/payroll.ts` o `users.ts` — `updateUserSalary`/bancario (item 7)
- `src/types/db.ts` — `AppUser` + `Database` users (campos bancarios) (item 7)
- `src/app/(app)/agenda/AgendaPageClient.tsx` — filtros colapsables + control ancho (item 2)
- `src/components/calendar/KineticCalendar.tsx` + CSS global del calendario — anchos (item 2)
- `package.json` — `exceljs` (item 7)

---

## Item 4 · Bug: enviar solo-archivo en el chat

**Goal:** Adjuntar y enviar un archivo sin texto funciona; si falla, el chip muestra el motivo real.

**Files:**
- Diagnóstico: Supabase Storage (bucket `chat-attachments`)
- Create: `supabase/migrations/0162_chat_attachments_bucket.sql`
- Modify: `src/lib/supabase/upload-chat-attachment.ts`

- [ ] **Step 1: Diagnóstico — reproducir y capturar el error real**

Levantar la app (preview), abrir un chat, adjuntar un archivo sin texto y leer el `error.message` de la subida. En paralelo, inspeccionar en Supabase si existe el bucket `chat-attachments` y sus políticas. Confirmar la causa (bucket faltante vs RLS).

Referencia del síntoma: `MessageComposer.tsx:159` (chip rojo = `p.error`), `upload-chat-attachment.ts:26-33` (la subida lanza), `inbox.ts:171` (el server action SÍ permite enviar sin texto si hay adjuntos).

- [ ] **Step 2: Migración del bucket + políticas (si faltan)**

Escribir `0162_chat_attachments_bucket.sql` espejo del patrón de `0143` (`user-avatars`): crear el bucket `chat-attachments` (privado) si no existe e idempotente, y políticas de Storage para `authenticated` (INSERT/SELECT/UPDATE/DELETE) sobre objetos cuyo primer segmento de `name` sea un `conversation_id` del que el usuario es miembro. Mínimo viable si la verificación de membresía es costosa: permitir a `authenticated` operar en el bucket (lectura/escritura) — el acceso a la firma de URL ya pasa por el server.

```sql
-- 0162_chat_attachments_bucket.sql
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Política de subida/lectura para usuarios autenticados.
-- (Ajustar a membresía de conversación si se confirma necesario.)
drop policy if exists "chat_attachments_rw_authenticated" on storage.objects;
create policy "chat_attachments_rw_authenticated"
on storage.objects for all to authenticated
using (bucket_id = 'chat-attachments')
with check (bucket_id = 'chat-attachments');
```

- [ ] **Step 3: Aplicar la migración en Supabase Studio** (manual). Recargar PostgREST/Storage.

- [ ] **Step 4: Mejorar el mensaje de error del chip**

En `upload-chat-attachment.ts`, conservar el `error.message` real (ya lo hace) y en `MessageComposer` mostrar `p.error` en el tooltip/área de error (hoy solo se ve borde rojo). Asegurar que el `<div className="…px-1">` de errores muestre el primer `p.error`.

- [ ] **Step 5: Verificar** — adjuntar archivo sin texto → se envía y aparece en el hilo (preview, `preview_snapshot`/`preview_screenshot`). Si se fuerza un fallo, el chip muestra el motivo. `npm run lint`.

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/0162_chat_attachments_bucket.sql src/lib/supabase/upload-chat-attachment.ts src/components/inbox/MessageComposer.tsx
git commit -m "fix: permitir enviar solo-archivo en el chat (bucket/policies chat-attachments + error visible)"
```

---

## Item 6 · Honorario base SP visible en la tabla de salarios

**Goal:** La tabla de `/reportes/contabilidad/configuracion` muestra el honorario base SP por persona sin entrar a editar.

**Files:**
- Modify: `src/app/(app)/reportes/contabilidad/configuracion/page.tsx` (thead, ~líneas 108-114)
- Modify: `src/components/reportes/contabilidad/UserSalaryRow.tsx` (fila principal, ~líneas 102-107)

- [ ] **Step 1: Agregar `<th>` "Honorario SP"** en el `thead` del page, después de "Salario mensual":
```tsx
<th className="text-right py-3 px-4 font-extrabold text-fm-on-surface-variant uppercase text-xs tracking-wider">Honorario SP</th>
```

- [ ] **Step 2: Agregar `<td>` en `UserSalaryRow`** (fila principal) mostrando `professional_services_base_usd`:
```tsx
<td className="py-3 px-4 text-right text-fm-on-surface-variant">
  {user.professional_services_base_usd != null ? fmtUsd(user.professional_services_base_usd) : '—'}
</td>
```
Colocarlo entre la celda de "Salario mensual" y "Tarifa/hora". Verificar `colSpan` de la fila expandida (subir de 6 a 7).

- [ ] **Step 3: Verificar** — la columna aparece con los valores correctos; la fila expandida sigue alineada. `npm run lint`.

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/reportes/contabilidad/configuracion/page.tsx" src/components/reportes/contabilidad/UserSalaryRow.tsx
git commit -m "feat: mostrar honorario base SP como columna en la tabla de salarios"
```

---

## Item 5 · Bonos/otros ingresos en planilla de Servicios Profesionales

**Goal:** En SP, bruto = base + bonos; retención (10%) sobre el bruto; campo editable + en PDF.

**Files:**
- Modify: `src/lib/domain/payroll/calculation.ts` (`calculateProfessionalServicesPayroll`, ~138)
- Test: `src/lib/domain/payroll/calculation.test.ts` (crear si no existe)
- Modify: `src/app/actions/payroll.ts` (rama SP de `createPayrollRun` ~290 y `updatePayrollItem` ~380+)
- Modify: `src/components/reportes/contabilidad/PayrollItemEditor.tsx` (~121, condición `!isSp`)
- Modify: `src/components/reportes/contabilidad/pdf/PayrollItemPDF.tsx`, `PayrollRunPDF.tsx`

- [ ] **Step 1: Test que falla — SP con bonos**

Crear/editar `src/lib/domain/payroll/calculation.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { calculateProfessionalServicesPayroll } from './calculation'

describe('calculateProfessionalServicesPayroll con bonos', () => {
  it('bruto = base + bonos y retención sobre el bruto', () => {
    const r = calculateProfessionalServicesPayroll({ baseUsd: 500, bonusUsd: 100 }, 0.1)
    expect(r.bonusUsd).toBe(100)
    expect(r.grossTotalUsd).toBe(600)
    expect(r.isrUsd).toBe(60)        // 10% de 600
    expect(r.netPayUsd).toBe(540)
  })
  it('sin bonos se comporta como antes', () => {
    const r = calculateProfessionalServicesPayroll({ baseUsd: 500 }, 0.1)
    expect(r.grossTotalUsd).toBe(500)
    expect(r.isrUsd).toBe(50)
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npm run test -- calculation` → FAIL (bonusUsd 0 / gross 500).

- [ ] **Step 3: Implementar** en `calculation.ts`:
```ts
export function calculateProfessionalServicesPayroll(
  inputs: { baseUsd: number; bonusUsd?: number; otherDeductionsUsd?: number },
  isrRate: number,
): PayrollCalculation {
  const base = round2(Math.max(0, inputs.baseUsd))
  const bonus = round2(Math.max(0, inputs.bonusUsd ?? 0))
  const gross = round2(base + bonus)
  const otherDeductions = round2(Math.max(0, inputs.otherDeductionsUsd ?? 0))
  const isr = round2(gross * Math.max(0, isrRate))
  const totalDeductions = round2(isr + otherDeductions)
  const netPay = round2(gross - totalDeductions)
  return {
    baseSalaryUsd: base,
    extraHoursAmountUsd: 0,
    bonusUsd: bonus,
    grossTotalUsd: gross,
    isssEmployeeUsd: 0, afpEmployeeUsd: 0,
    isrUsd: isr,
    otherDeductionsUsd: otherDeductions,
    totalDeductionsUsd: totalDeductions,
    netPayUsd: netPay,
    isssEmployerUsd: 0, afpEmployerUsd: 0,
    employerCostUsd: gross,
  }
}
```

- [ ] **Step 4: Correr y ver pasar** — `npm run test -- calculation` → PASS.

- [ ] **Step 5: Conectar createPayrollRun (SP)** — en `payroll.ts` ~290, pasar bonos (al crear, default 0; `base_salary_usd` = base, `bonus_usd` = 0 inicialmente). Mantener `base` (fixedBase + therapyBase) como `baseUsd`. El bono se carga después al editar el ítem.

- [ ] **Step 6: Conectar updatePayrollItem (SP)** — leer la rama SP de `updatePayrollItem` (después de ~379) y recomputar con `calculateProfessionalServicesPayroll({ baseUsd: input.baseSalaryUsd, bonusUsd: input.bonusUsd, otherDeductionsUsd: input.otherDeductionsUsd }, rate)`. Persistir `bonus_usd` y recomputar `gross/isr/net`.

- [ ] **Step 7: UI — mostrar bono en SP** — en `PayrollItemEditor.tsx`, sacar el campo "Bono / pago extra" de la condición `!isSp` para que aplique a ambos (renombrar etiqueta a **"Bonos / otros ingresos"**). En el bloque de cálculo, para SP mostrar: Base → Bonos → Bruto → Retención → Neto.

- [ ] **Step 8: PDFs** — en `PayrollItemPDF.tsx` (y `PayrollRunPDF.tsx` si lista SP), agregar línea "Bonos/otros" cuando `isSp` y `bonus_usd > 0`.

- [ ] **Step 9: Verificar** — `npm run test`, `npm run lint`. Preview: planilla SP en borrador → editar ítem → ingresar bono → bruto y retención correctos; PDF muestra bonos.

- [ ] **Step 10: Commit**
```bash
git add src/lib/domain/payroll/calculation.ts src/lib/domain/payroll/calculation.test.ts src/app/actions/payroll.ts src/components/reportes/contabilidad/PayrollItemEditor.tsx src/components/reportes/contabilidad/pdf/PayrollItemPDF.tsx src/components/reportes/contabilidad/pdf/PayrollRunPDF.tsx
git commit -m "feat: bonos/otros ingresos en planilla de servicios profesionales (bruto = base + bonos)"
```

---

## Item 3 · Costos de entrevistas/asesorías/evaluaciones en `/catalogos`

**Goal:** Configurar precio + costo interno de entrevistas/asesorías/evaluaciones.

**Files:**
- Modify: `src/components/catalogos/CatalogosClient.tsx` (~33 `therapyItems`)
- Create (condicional): `supabase/migrations/0163_seed_service_catalog_entrevista_asesoria.sql`

- [ ] **Step 1: Verificar filas existentes** — `SELECT category, code, name FROM service_catalog WHERE category IN ('entrevista','asesoria','evaluacion','evaluacion_dx_tea','evaluacion_psicologica') ORDER BY category;`. Anotar cuáles faltan.

- [ ] **Step 2: Ampliar la pestaña Costos** — en `CatalogosClient.tsx`, definir las categorías con costo:
```ts
const COST_CATEGORIES: ServiceCategory[] = [
  'terapia_individual', 'entrevista', 'asesoria',
  'evaluacion', 'evaluacion_dx_tea', 'evaluacion_psicologica',
]
const costItems = useMemo(
  () => items.filter((i) => COST_CATEGORIES.includes(i.category)),
  [items],
)
```
Reemplazar el uso de `therapyItems` en la pestaña Costos por `costItems`, **agrupados por categoría** (reusar el patrón `grouped`), con un `<CostRow>` por fila (precio visible + `cost_usd` editable). Mantener `CostRow`/`updateServiceCatalogItem` existentes.

- [ ] **Step 3: Seed condicional** — si faltan filas (Step 1), crear `0163_seed_service_catalog_entrevista_asesoria.sql` con `insert … on conflict (code) do nothing` y filas base (precio/costo 0, `active=true`). Nombres genéricos (sin datos reales). Aplicar manual en Supabase.

- [ ] **Step 4: Verificar** — preview `/catalogos`: pestaña Costos lista entrevistas/asesorías/evaluaciones con costo editable; pestaña Precios muestra su precio. Guardar persiste. `npm run lint`.

- [ ] **Step 5: Commit**
```bash
git add src/components/catalogos/CatalogosClient.tsx supabase/migrations/0163_seed_service_catalog_entrevista_asesoria.sql
git commit -m "feat: configurar precio y costo de entrevistas, asesorias y evaluaciones en catalogos"
```

---

## Item 1B · Columna de tiempo editable en `/capacidad-terapistas/completadas`

**Goal:** Mostrar minutos por terapia y permitir corregir inicio/fin reales (afecta horas, no el pago SP).

**Files:**
- Modify: `src/components/operacion/CompletedTherapiesView.tsx` (tabla)
- Modify: `src/app/actions/appointments.ts` (nueva acción admin)
- Reusa: `completed-therapies.ts` ya entrega `durationMin`.

- [ ] **Step 1: Server action `adminUpdateAppointmentTimes`** en `appointments.ts`:
```ts
const TIME_EDIT_ROLES = new Set(['admin','directora','coordinadora_terapias','coordinadora_familias','recepcion'])

export async function adminUpdateAppointmentTimes(
  appointmentId: string, startsAtISO: string, endsAtISO: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // getActor + rol; validar end > start; solo status 'completed';
  // admin client update starts_at/ends_at; revalidatePath('/operacion/capacidad-terapistas/completadas')
}
```
Validaciones: `new Date(endsAtISO) > new Date(startsAtISO)`; rol en `TIME_EDIT_ROLES`; cita existe y `status='completed'`.

- [ ] **Step 2: Columna "Duración"** en `CompletedTherapiesView.tsx` — `<th>Duración</th>` y `<td>` con `r.durationMin` redondeado (`{Math.round(r.durationMin)} min`).

- [ ] **Step 3: Edición inline** — en la celda, un botón ✏️ que abre dos `<input type="time">` (derivados de `startsAt` y `startsAt + durationMin`) o un mini-popover; al guardar, construir ISO en TZ SV y llamar `adminUpdateAppointmentTimes`, luego `router.refresh()`. Solo visible para roles de gestión (pasar un prop `canEdit` desde el page server, que ya conoce el rol). Mostrar nota: "Editar el tiempo afecta el conteo de horas, no el pago (SP es por terapia)".

- [ ] **Step 4: Verificar** — preview: la columna muestra minutos; editar inicio/fin recalcula minutos y `totalHours` del terapista; el monto a SP NO cambia. `npm run lint`.

- [ ] **Step 5: Commit**
```bash
git add src/components/operacion/CompletedTherapiesView.tsx src/app/actions/appointments.ts
git commit -m "feat: columna de duracion editable en terapias completadas (corrige horas, no el pago)"
```

---

## Item 7 · Documento de transferencias (Excel + PDF)

**Goal:** Por mes, documento consolidado por persona (SALARIO neto normal + HONORARIOS neto SP + OTROS manual = TOTAL) con datos bancarios, exportable a Excel y PDF.

**Files:**
- `package.json` — agregar `exceljs`
- Create migration `0161_users_bank_fields.sql`
- Modify `src/types/db.ts` (`AppUser` + `Database` users Insert/Update)
- Modify `src/app/actions/payroll.ts` (`updateUserSalary` acepta campos bancarios) y `UserSalaryRow.tsx` (inputs)
- Create `src/lib/domain/reports/bank-transfer.ts` + `.test.ts`
- Create page `…/transferencias/page.tsx` + `TransferenciasClient.tsx`
- Create `pdf/BankTransferPDF.tsx` + API routes `xlsx` y `pdf`

- [ ] **Step 1: Migración 0161 — campos bancarios**
```sql
-- 0161_users_bank_fields.sql
alter table public.users
  add column if not exists bank_name text,
  add column if not exists account_type text,
  add column if not exists account_number text,
  add column if not exists nit text;
```
Aplicar manual en Supabase.

- [ ] **Step 2: Tipos** — en `db.ts` agregar `bank_name/account_type/account_number/nit` a la interfaz `AppUser` **y** al tipo `Database` (Row/Insert/Update de `users`). (GOTCHA documentado.)

- [ ] **Step 3: Edición de datos bancarios** — extender `updateUserSalary` (payroll.ts) con los 4 campos y agregar inputs en `UserSalaryRow` (sección expandida): Banco, Tipo de cuenta, Nº de cuenta, NIT.

- [ ] **Step 4: Test del builder puro (falla)** — `src/lib/domain/reports/bank-transfer.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildBankTransferRows } from './bank-transfer'

const users = [
  { id: 'u1', full_name: 'Ana Zelaya', dui: '0000-1', nit: null, bank_name: 'Banco X', account_type: 'Ahorro', account_number: '123' },
  { id: 'u2', full_name: 'Luis Escobar', dui: null, nit: '0614-1', bank_name: 'Banco Y', account_type: 'Ahorro', account_number: '456' },
]
describe('buildBankTransferRows', () => {
  it('consolida neto normal + SP + otros y totaliza', () => {
    const { rows, totals } = buildBankTransferRows({
      users,
      normalNetByUser: new Map([['u1', 500]]),
      spNetByUser: new Map([['u1', 200], ['u2', 300]]),
      otrosByUser: new Map([['u1', 50]]),
    })
    const r1 = rows.find(r => r.userId === 'u1')!
    expect(r1.salario).toBe(500)
    expect(r1.honorarios).toBe(200)
    expect(r1.otros).toBe(50)
    expect(r1.total).toBe(750)
    expect(totals.total).toBe(1050) // 750 + 300
    expect(rows.find(r => r.userId === 'u2')!.total).toBe(300)
  })
  it('marca a quien le faltan datos bancarios y tiene monto', () => {
    const { rows } = buildBankTransferRows({
      users: [{ id: 'u3', full_name: 'Mara Molina', dui: null, nit: null, bank_name: null, account_type: null, account_number: null }],
      normalNetByUser: new Map([['u3', 100]]), spNetByUser: new Map(), otrosByUser: new Map(),
    })
    expect(rows[0].missingBank).toBe(true)
  })
})
```

- [ ] **Step 5: Correr y ver fallar** — `npm run test -- bank-transfer` → FAIL.

- [ ] **Step 6: Implementar `bank-transfer.ts`** — función pura que recibe `users`, mapas de neto normal/SP y otros; emite `rows` (una por persona con monto > 0 en cualquier bucket) `{ userId, nombre, duiNit, banco, tipoCuenta, numeroCuenta, salario, honorarios, otros, total, missingBank }` y `totals`. `round2` local. Excluir filas con total 0 y sin otros.

- [ ] **Step 7: Correr y ver pasar** — `npm run test -- bank-transfer` → PASS.

- [ ] **Step 8: Lectura de datos (server)** — helper que, dado `year/month`, trae las `payroll_runs` **selladas/pagadas** de tipo normal y SP de ese mes con sus `payroll_items.net_pay_usd` por `user_id`, y los `users` con datos bancarios. (En `payroll.ts` o un nuevo `src/lib/domain/reports/bank-transfer-data.ts`.)

- [ ] **Step 9: Página + UI** — `…/transferencias/page.tsx` (roles admin/directora/contable/recepcion) con selector de mes; `TransferenciasClient.tsx` muestra la tabla, permite editar OTROS por fila, resalta `missingBank`, y botones "Descargar Excel" / "Descargar PDF" (pasan mes + otros por querystring/POST).

- [ ] **Step 10: Export Excel** — `npm i exceljs`. API route `…/transferencias/xlsx/route.ts`: construye el workbook calcando columnas (`#`, NOMBRE, DUI/NIT, BANCO, TIPO DE CUENTA, NUMERO DE CUENTA, SALARIO, HONORARIOS, OTROS, TOTAL A DEPOSITAR) + fila "TOTAL A TRANSFERIR"; responde con headers de descarga `.xlsx`.

- [ ] **Step 11: Export PDF** — `BankTransferPDF.tsx` (reusar shell de PDFs de contabilidad) + API route `…/transferencias/pdf/route.ts` con `renderToBuffer`.

- [ ] **Step 12: Verificar** — `npm run test`, `npm run lint`. Preview: cargar datos bancarios, elegir un mes con planillas selladas, ver consolidado, editar OTROS, descargar Excel (formato correcto) y PDF. **Privacidad:** sin datos reales en código/seeds.

- [ ] **Step 13: Commits** (dos: datos+tipos, luego generador)
```bash
git add supabase/migrations/0161_users_bank_fields.sql src/types/db.ts src/app/actions/payroll.ts src/components/reportes/contabilidad/UserSalaryRow.tsx
git commit -m "feat: campos bancarios por empleado (banco, tipo y numero de cuenta, NIT)"
git add package.json package-lock.json src/lib/domain/reports/bank-transfer.ts src/lib/domain/reports/bank-transfer.test.ts "src/app/(app)/reportes/contabilidad/transferencias" src/components/reportes/contabilidad/TransferenciasClient.tsx src/components/reportes/contabilidad/pdf/BankTransferPDF.tsx src/app/api/reportes/contabilidad/transferencias
git commit -m "feat: documento de transferencias por mes (consolidado normal + SP) en Excel y PDF"
```

---

## Item 1A · Administrar jornadas del equipo desde `/tiempo`

**Goal:** admin/directora/recepción ven y corrigen `work_sessions` de cualquier persona por día/mes.

**Files:**
- Create `src/app/actions/work-sessions-admin.ts`
- Create `src/components/tiempo/EquipoJornadasPanel.tsx`, `EditWorkSessionModal.tsx`
- Modify `src/app/(app)/tiempo/page.tsx` (montar pestaña Equipo según rol)

- [ ] **Step 1: Acciones admin** — `work-sessions-admin.ts` con `getActor` + gate de rol (`admin/directora/recepcion`), admin client:
  - `listUserWorkSessions(userId, { granularity:'dia'|'mes', anchorDate })` → ventana TZ SV (reusar lógica tipo `resolveWindow`).
  - `adminUpsertWorkSession({ id?, userId, startedAtISO, endedAtISO, breaks?, notes? })` → valida end>start; recalcula `total_seconds`/`status='ended'`.
  - `adminDeleteWorkSession(id)`.

- [ ] **Step 2: Panel Equipo** — `EquipoJornadasPanel.tsx`: selector de persona (staff, sin family/client), navegación Día/Mes, lista de jornadas (inicio–fin, pausas, total, estado) con editar/borrar y "+ Agregar entrada"; totales del período.

- [ ] **Step 3: Modal alta/edición** — `EditWorkSessionModal.tsx`: inputs hora inicio/fin, notas, (opcional) pausas; llama a `adminUpsertWorkSession`.

- [ ] **Step 4: Montar en `/tiempo`** — en `page.tsx`, si el rol es admin/directora/recepción, renderizar un switch "Mi jornada / Equipo" y mostrar `EquipoJornadasPanel` en la pestaña Equipo. (No revivir el `AdminTimePanel` legacy de FM ni KPIs de productividad.)

- [ ] **Step 5: Verificar** — preview con un usuario admin: seleccionar persona, ver/editar/crear/borrar jornadas; un terapista no ve la pestaña Equipo. `npm run lint`.

- [ ] **Step 6: Commit**
```bash
git add src/app/actions/work-sessions-admin.ts src/components/tiempo/EquipoJornadasPanel.tsx src/components/tiempo/EditWorkSessionModal.tsx "src/app/(app)/tiempo/page.tsx"
git commit -m "feat: administrar jornadas del equipo desde /tiempo (vista Equipo, editar/crear/borrar turnos)"
```

---

## Item 2 · Agenda responsive + columnas redimensionables

**Goal:** Filtros colapsables en pantallas angostas + zoom global de ancho + arrastre por día (best-effort).

**Files:**
- Modify `src/app/(app)/agenda/AgendaPageClient.tsx`
- Modify `src/components/calendar/KineticCalendar.tsx` + CSS global del calendario
- Create `src/lib/domain/agenda/column-widths.ts`

- [ ] **Step 1: Filtros colapsables** — envolver el `<aside>` (línea ~377) en un patrón responsive: en `<lg` mostrar un botón "Filtros" (con conteo de activos) que togglea un drawer/acordeón; en `lg+` queda fijo. Estado `filtersOpen` (default cerrado en móvil). Verificar con `preview_resize` (móvil/tablet/ventana lateral).

- [ ] **Step 2: Zoom global de ancho** — control `−/+` en la barra del calendario que setea una variable CSS (`--kn-day-min-width`) en el contenedor; CSS del calendario aplica `min-width` por día y permite scroll horizontal (`overflow-x:auto`). Persistir el valor en `localStorage` (helper en `column-widths.ts`, namespaced por usuario).

- [ ] **Step 3: Arrastre por día (best-effort)** — manija en la cabecera de cada día; al arrastrar, setear `width` inline por columna (override de `.rbc-day-slot`/header sincronizados) y persistir override por `day-of-week`. **Timeboxear**: si el layout de react-big-calendar lo hace inestable, dejar documentado y entregar solo el zoom global (Step 2) como piso garantizado (decisión registrada en el spec).

- [ ] **Step 4: Verificar** — `preview_resize` a 380/768/ventana lateral: filtros en drawer, citas visibles; zoom global ensancha+scrollea y persiste; arrastre por-día ensancha un día (si quedó estable). `npm run lint`, `npm run build`.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(app)/agenda/AgendaPageClient.tsx" src/components/calendar/KineticCalendar.tsx src/lib/domain/agenda/column-widths.ts
git commit -m "feat: agenda responsive (filtros colapsables) y ancho de columnas ajustable (zoom global + arrastre por dia)"
```

---

## Cierre del lote

- [ ] **Verificación final:** `npm run test` (verde), `npm run lint` (0 errores nuevos), `npm run build` (OK).
- [ ] **Migraciones:** confirmar 0161/0162/0163 aplicadas en Supabase y, si se agregó al verify script, actualizar `supabase/scripts/verify_pending_migrations.sql`.
- [ ] **CLAUDE.md:** actualizar (rutas nuevas `/reportes/contabilidad/transferencias`, vista Equipo en `/tiempo`, campos bancarios en users, bonos SP) — vía skill `claude-md-management:revise-claude-md` si se desea.
- [ ] **Push a master:** solo cuando el usuario lo pida (`git push origin HEAD:master`).

## Notas / supuestos heredados del spec
- 1A sin KPIs de productividad de FM.
- 7 con montos = neto.
- 2: arrastre por-día best-effort; zoom global garantizado.
- Privacidad: prohibido usar datos reales de personal/familias/niños en código, seeds, ejemplos o commits.
