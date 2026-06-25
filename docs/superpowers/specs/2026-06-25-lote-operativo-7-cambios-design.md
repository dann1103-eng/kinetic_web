# Lote operativo — 7 cambios (jornadas, planillas, agenda, catálogos, chat)

- **Fecha:** 2026-06-25
- **Estado:** Diseño aprobado por el usuario ("adelante"). Pendiente: plan de implementación.
- **Rama de trabajo:** `master` (regla del proyecto; el harness puede designar otra pero el push va a master).
- **Migración base actual:** 0160. **Nuevas migraciones desde 0161.**

## Contexto y objetivo

Lote de 7 cambios operativos independientes solicitados por la dirección de Kinetic.
Cada uno es un bloque separable; se documentan juntos para un único plan de acción.
No comparten estado entre sí salvo el módulo de planillas (items 5, 6, 7 tocan
`payroll_*` / `users` salariales).

### Decisiones tomadas (brainstorming)

| Tema | Decisión |
|------|----------|
| 1A Jornadas | Vista "Equipo" en `/tiempo` para administrar `work_sessions` (turnos marcados). **Sin** KPIs de productividad de FM. |
| 1B Tiempos | Columna de duración editable en `/capacidad-terapistas/completadas`; afecta horas/capacidad, no el pago SP. |
| 2 Agenda | Filtros colapsables en pantallas angostas + **ambos**: zoom global de ancho **y** arrastre por día. |
| 3 Catálogos | Entrevistas/asesorías/evaluaciones con **precio + costo**. |
| 4 Chat | Arreglar envío de solo-archivo (diagnóstico: subida al bucket `chat-attachments`). |
| 5 Planilla SP | Campo bonos/otros visible en SP → bruto = base + bonos → retención sobre bruto. |
| 6 SP mensual | Columna visible del honorario base SP en la tabla de salarios. |
| 7 Doc bancario | **Excel + PDF**, columna OTROS **manual**, consolidado **por mes** (junta normal + SP), montos = **neto**. |

### Privacidad (regla dura del proyecto)

El Excel de referencia del item 7 contiene **nombres y cuentas bancarias reales** del
personal. **Prohibido** copiar esos datos a seeds, fixtures, ejemplos, comentarios,
memoria o commits. Usar siempre apellidos ficticios (Zelaya, Escobar, Molina…) y datos
inventados en cualquier ejemplo.

---

## 1A · Administrar jornadas del equipo desde `/tiempo`

**Objetivo.** Que `admin`, `directora` y `recepcion` puedan ver y **corregir** los turnos
marcados (`work_sessions`) de cualquier persona — cuando alguien olvidó marcar entrada/salida.

**Modelo existente.** `work_sessions` (`src/types/db.ts:90`): `id, user_id, started_at,
ended_at, status, notes, breaks_json (WorkSessionBreak[]), total_seconds,
productive_seconds`. Acciones actuales en `src/app/actions/work-sessions.ts` son solo
personales (`getMyActiveShift`, `startShift`, `endShift`, `startBreak`, `endBreak`).

**UI.** Pestaña **"Equipo"** en `/tiempo` (solo admin/directora/recepción):
- Selector de persona (staff, excluye family/client) + navegación **Día / Mes** con flechas.
- Lista de jornadas del período: `started_at`–`ended_at`, pausas, total, estado; con
  **✏️ editar**, **🗑️ borrar** y **"+ Agregar entrada"** (alta manual).
- Modal de edición/alta: hora inicio, hora fin, (opcional) pausas, notas.
- Totales del período: jornada total / pausas / efectivo (calculados de `work_sessions`).
- **Sin** TIEMPO PRODUCTIVO / % PRODUCTIVIDAD / STANDBY (Kinetic no rastrea tiempo interno
  por categoría; esos campos de FM se omiten).

**Server actions nuevas** (en `work-sessions.ts` o nuevo `work-sessions-admin.ts`):
- `listUserWorkSessions(userId, { granularity: 'dia'|'mes', anchorDate })`
- `adminUpsertWorkSession({ id?, userId, startedAt, endedAt, breaks?, notes? })`
- `adminDeleteWorkSession(id)`
- Todas vía **admin client** (`createAdminClient`), gateadas por rol en código (patrón
  del CRUD de usuarios). Recalcular `total_seconds`/`status` al guardar.

**Migración.** Ninguna (escrituras privilegiadas por service role).

**Riesgos / cuidado.** Zona horaria SV (UTC-6) al construir rangos día/mes desde el server.
Reusar el patrón de `resolveWindow` de `completed-therapies.ts`.

**Criterios de aceptación.**
- Admin/recepción selecciona persona X, ve sus jornadas de hoy/este mes.
- Puede editar el inicio/fin de una jornada y el total se actualiza.
- Puede crear una jornada manual y borrarla.
- Un terapista/maestra normal **no** ve la pestaña Equipo.

---

## 1B · Columna de tiempo editable en `/capacidad-terapistas/completadas`

**Objetivo.** Ver y corregir cuántos minutos tomó cada terapia completada.

**Estado actual.** `getCompletedTherapiesDetail` (`src/lib/domain/reports/completed-therapies.ts`)
ya calcula `durationMin = (ends_at - starts_at)/60000` por fila, pero la tabla de
`CompletedTherapiesView.tsx` no lo muestra.

**Cambios.**
- Nueva columna **"Duración"** (min) en la tabla por terapista.
- Edición inline (solo roles de gestión: admin/directora/coord/recepción): dos inputs de
  hora (inicio y fin reales) → server action actualiza `appointments.starts_at`/`ends_at`,
  recalcula minutos. Validación: `ends_at > starts_at`.
- Nueva server action `adminUpdateAppointmentTimes(appointmentId, startsAtISO, endsAtISO)`
  en `src/app/actions/appointments.ts` (admin client, gateada por rol; solo citas
  `completed`). Revalida la página de completadas.

**Aclaración de impacto.** El pago de servicios profesionales es **por terapia, no por
hora** (`professional-services.ts`), así que editar el tiempo cambia el conteo de
horas/capacidad, **no** el monto a pagar. Documentarlo en la UI con una nota.

**Migración.** Ninguna.

**Criterios de aceptación.**
- La tabla muestra los minutos de cada terapia.
- Editar inicio/fin recalcula los minutos y persiste; el total de horas del terapista cambia.
- El total a SP (monto) **no** cambia al editar la duración.

---

## 2 · Agenda responsive + columnas redimensionables

**Archivo.** `src/app/(app)/agenda/AgendaPageClient.tsx` (+ `KineticCalendar.tsx` y CSS del
calendario). El panel de filtros es un `<aside className="lg:w-64 …">` (línea ~377).

### 2a · Filtros colapsables
- En viewport angosto (incluye ventana lateral en desktop): el `aside` se colapsa tras un
  botón **"Filtros"** que abre un drawer/acordeón; en `lg+` queda fijo como hoy.
- Estado local `filtersOpen`; el breakpoint se maneja con clases Tailwind + un toggle.
  Chip con conteo de filtros activos para feedback.

### 2b · Ancho de columnas (ambos enfoques)
- **Zoom global:** control `−/+` (o slider) que setea una variable CSS de **ancho mínimo
  por día**; el contenedor del calendario hace **scroll horizontal**. Robusto.
- **Arrastre por día:** manija en la cabecera de cada día para ensanchar uno puntual
  (tipo Excel). Aplica `width` inline por columna sincronizando cabecera + grid de tiempo.
- Persistir anchos (global + overrides por día de semana) en `localStorage`, namespaced por
  usuario.

**⚠️ Riesgo principal del lote.** react-big-calendar reparte los días con flex equitativo y
una sola cabecera; el ancho por-día va contra ese layout (override de `.rbc-time-content`,
`.rbc-day-slot`, `.rbc-time-header-content`). **Plan:** entregar primero el zoom global
(confiable); luego intentar el arrastre por-día; si resulta demasiado frágil, el zoom global
queda como base aceptable. Timeboxear el arrastre por-día.

**Migración.** Ninguna (solo frontend).

**Criterios de aceptación.**
- En móvil/tablet/ventana lateral los filtros no tapan las citas (van en drawer).
- El zoom global ensancha todos los días con scroll horizontal y persiste al recargar.
- Se puede ensanchar un día individual arrastrando su borde (best-effort).

---

## 3 · Costos de entrevistas/asesorías/evaluaciones en `/catalogos`

**Archivo.** `src/components/catalogos/CatalogosClient.tsx`.

**Estado actual.** La pestaña **Costos** filtra solo `category === 'terapia_individual'`
(línea ~33). La pestaña **Precios** ya agrupa por todas las categorías existentes.
Categorías relevantes (en `db.ts`): `entrevista`, `asesoria`, `evaluacion`,
`evaluacion_dx_tea`, `evaluacion_psicologica`.

**Cambios.**
- Pestaña **Costos**: incluir esas categorías además de `terapia_individual`, agrupadas por
  categoría, con `cost_usd` (costo interno / pago) editable y `unit_price_usd` visible.
- Verificar que existan filas en `service_catalog` para entrevista/asesoría; si faltan,
  **seed** de filas base (precio y costo en 0, editable luego) — migración corta condicional.
- Mantener la lógica de guardado por fila existente (`updateServiceCatalogItem`).

**Migración.** **0163 (condicional)** — seed de filas faltantes. Solo si el `SELECT` de
verificación muestra que no existen.

**Criterios de aceptación.**
- En Costos aparecen entrevistas/asesorías/evaluaciones con su costo interno editable.
- En Precios aparece su precio de cobro editable.
- Editar y guardar persiste el valor.

---

## 4 · Enviar solo-archivo en el chat (contorno rojo)

**Síntoma.** Al adjuntar un archivo sin texto, el chip sale en **rojo** y no se envía.

**Diagnóstico.** El borde rojo del chip es `p.error` en `MessageComposer.tsx:159` → la
**subida** (`uploadChatAttachment`, `src/lib/supabase/upload-chat-attachment.ts`) lanzó error.
El server action `sendMessage` **sí** permite enviar sin texto si hay adjuntos
(`inbox.ts:171`). Por lo tanto la causa está en Storage: bucket `chat-attachments`
inexistente en el proyecto vivo (`dkjprdvutmufybfkxzwd`) **o** políticas RLS de Storage que
bloquean el INSERT. (El bucket aparece en `0040_inbox_chat.sql`, pero el proyecto vivo pudo
no tenerlo aplicado — análogo al caso `user-avatars` de la 0143.)

**Plan.**
1. **Confirmar** en Supabase: ¿existe el bucket? ¿qué políticas tiene? (capturar el `error.message` real subiendo un archivo).
2. **Fix:** migración que cree el bucket `chat-attachments` (si falta) + políticas de Storage
   (SELECT/INSERT/DELETE para miembros de la conversación o, mínimo, usuarios autenticados
   sobre carpeta `{conversationId}/…`), espejo del patrón de la 0143.
3. Mejorar el mensaje de error del chip para que muestre la causa (hoy es genérico).

**Migración.** **0162 (probable)** — bucket + políticas `chat-attachments`.

**Criterios de aceptación.**
- Adjuntar un archivo sin texto y enviarlo funciona; el archivo aparece en el hilo.
- Si la subida falla, el chip muestra el motivo real.

---

## 5 · Bonos/otros ingresos en planilla de Servicios Profesionales

**Objetivo.** En SP: poder describir un bono/extra sobre la base; **bruto = base + bonos**;
retención (10% configurable) sobre el bruto.

**Estado actual.**
- `calculateProfessionalServicesPayroll` (`calculation.ts:138`) fuerza `bonusUsd: 0` y
  `gross = baseUsd`.
- `PayrollItemEditor.tsx`: el campo "Bono" solo se muestra cuando `!isSp` (línea ~121).

**Cambios.**
- `calculateProfessionalServicesPayroll(inputs: { baseUsd, bonusUsd?, otherDeductionsUsd? }, isrRate)`:
  `gross = base + bonus`; `isr = gross * rate`; `bonusUsd` reflejado en el retorno.
- `PayrollItemEditor`: mostrar el campo **"Bonos / otros ingresos"** también en SP, con
  desglose base + bonos = bruto → −retención → neto.
- `updatePayrollItem` (rama SP) y `createPayrollRun` (rama SP, `payroll.ts:282`): pasar el
  bono al cálculo (default 0).
- PDFs SP (`PayrollItemPDF.tsx`, `PayrollRunPDF.tsx`): agregar línea de bonos.
- Actualizar/añadir tests puros en `professional-services.test.ts` / cálculo SP.

**Migración.** Ninguna (`payroll_items.bonus_usd` ya existe).

**Criterios de aceptación.**
- En una planilla SP en borrador, editar un ítem permite ingresar bonos.
- El bruto = base + bonos y la retención del 10% se calcula sobre el bruto.
- El PDF de SP muestra la línea de bonos.

---

## 6 · Honorario base SP visible en la tabla de salarios

**Archivo.** `src/app/(app)/reportes/contabilidad/configuracion/page.tsx` +
`src/components/reportes/contabilidad/UserSalaryRow.tsx`.

**Estado actual.** La tabla muestra columnas "Salario mensual" y "Tarifa/hora";
`professional_services_base_usd` solo es visible/editable en la fila expandida.

**Cambios.**
- Agregar columna **"Honorario SP (mensual)"** en la fila principal, mostrando
  `professional_services_base_usd` (o "—"). El `<th>` correspondiente en el page.
- (Opcional) chip o resaltado si la persona está en SP pero su base es 0.

**Migración.** Ninguna (el dato ya se consulta en el `SELECT` del page).

**Criterios de aceptación.**
- La tabla de salarios muestra el honorario base SP por persona sin entrar a editar.

---

## 7 · Documento de transferencias tras sellar planilla (Excel + PDF)

**Objetivo.** Tras sellar planillas, generar un documento por **mes** con, por persona:
NOMBRE · DUI/NIT · BANCO · TIPO DE CUENTA · Nº CUENTA · SALARIO · HONORARIOS · OTROS ·
TOTAL A DEPOSITAR, con fila final de totales. (Formato espejo del Excel que ya usan.)

**Modelo del documento (del Excel de referencia).**
- Una fila por persona; columnas de montos: **SALARIO** (neto planilla normal del mes),
  **HONORARIOS** (neto planilla SP del mes), **OTROS** (manual), **TOTAL = suma**.
- Fila final "TOTAL A TRANSFERIR" con sumas por columna.
- Una persona puede aparecer con SALARIO, HONORARIOS, ambos, o solo OTROS.

**Datos bancarios — nuevos campos en `users`** (migración 0161):
- `bank_name text`, `account_type text`, `account_number text`, `nit text`.
  (`dui` ya existe.) Render DUI/NIT combinados en una celda.
- Edición en el panel de salarios (`UserSalaryRow` expandido) y/o perfil de usuario;
  escritura por admin/recepción vía admin client (patrón existente).

**Generador.**
- Nueva sección/tarjeta en `/reportes/contabilidad` (ej. `/reportes/contabilidad/transferencias`).
- Flujo: elegís **mes** (y quincena si aplica) → arma la tabla consolidando las planillas
  **selladas** normal + SP de ese mes por `user_id` (SALARIO = `net_pay_usd` normal,
  HONORARIOS = `net_pay_usd` SP). OTROS editable por fila antes de exportar.
- Avisar si a alguien con monto le faltan datos bancarios.
- **Export Excel** con `exceljs` (nueva dependencia) calcando el formato; **Export PDF** con
  `@react-pdf/renderer` (patrón de los PDFs de contabilidad existentes). API routes bajo
  `/api/reportes/contabilidad/transferencias/{xlsx,pdf}`.

**Funciones puras.** `buildTransferDocument(month, normalItems, spItems, otrosByUser, users)`
→ filas + totales, testeable sin Supabase.

**Migración.** **0161** — campos bancarios en `users` (+ tocar interfaz `AppUser` y el tipo
`Database` Insert/Update en `db.ts`).

**Dependencia nueva.** `exceljs` (escritura de `.xlsx` con estilos).

**Criterios de aceptación.**
- Se pueden capturar banco / tipo / nº de cuenta / NIT por persona.
- Elegir un mes genera la tabla consolidada (normal + SP) con OTROS editable y totales.
- Descarga en Excel (idéntico al formato) y en PDF.
- Ningún dato real va a seeds/ejemplos/commits.

---

## Resumen de migraciones (aplicar manual en Supabase, en orden)

| # | Item | Contenido | ¿Seguro? |
|---|------|-----------|----------|
| 0161 | 7 | `users`: `bank_name`, `account_type`, `account_number`, `nit` | Sí |
| 0162 | 4 | Bucket `chat-attachments` + políticas Storage (si faltan) | Tras diagnóstico |
| 0163 | 3 | Seed filas `service_catalog` entrevista/asesoría (si faltan) | Condicional |

Items 1A, 1B, 2, 5, 6 **no requieren migración** (escrituras por service role gateadas en
código, o solo frontend).

> GOTCHA del proyecto: al agregar columnas a `users` hay que tocar **la interfaz `AppUser`
> y** el tipo `Database` (Insert/Update) en `db.ts`. Y `create or replace function` con
> distinto # de args crea sobrecarga ambigua (no aplica aquí, pero presente).

## Orden de implementación (independientes; reordenable)

1. **Rápidos:** 4 (chat) → 6 (columna SP) → 5 (bonos SP) → 3 (catálogos)
2. **Medios:** 1B (duración) → 7 (doc bancario)
3. **Grandes:** 1A (jornadas equipo) → 2 (agenda responsive + columnas)

## Fuera de alcance / supuestos

- 1A: **no** se replican los KPIs de productividad/standby de FM.
- 7: montos = **neto** (lo que se deposita), no bruto.
- 2: el arrastre por-día es best-effort; el zoom global es el piso garantizado.
- No se tocan módulos legacy FM salvo lo necesario para el bucket de chat (item 4).
- Verificación final por item: `npm run lint` (0 errores nuevos) + `npm run build`.
