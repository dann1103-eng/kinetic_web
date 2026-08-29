# Previsualizar y ajustar el detalle de pago antes de cobrar

**Fecha:** 2026-08-28
**Estado:** aprobado
**Migraciones:** ninguna hasta la entrega 4, que agrega la **0185**

## Problema

El botón "Detalle de pago" de la ficha del niño (`MonthlyCyclesSection.tsx:285`) es
un enlace directo al PDF: `href={/api/ciclos/${c.id}/detalle}`. No hay paso
intermedio. El documento se descarga y se manda a la familia sin que nadie lo haya
visto en pantalla.

Eso hizo que un error de cobro llegara hasta la mamá. Caso reportado (agosto 2026):
el documento mostraba filas por $170 + $66 = **$236** bajo un total de **$258**. Los
$22 de diferencia eran una cuarta sesión de Lenguaje que nunca se agendó — agosto
tiene cuatro martes y solo se agendaron tres. El total salía de
`payment_amount_usd`, congelado al generar el ciclo; las filas salían del snapshot.
Nadie los volvió a emparejar y nadie miró el PDF antes de mandarlo.

Ese caso puntual ya está corregido (commit `1fff148`: las filas mandan y la
diferencia se declara). Lo que falta es lo que lo habría evitado: **ver el
documento antes de generarlo, y poder ajustarlo ahí mismo**.

La edición manual no es nueva — `EditMonthlyCycleModal` ya cambia sesiones por
terapia, quita terapias, aplica descuento y guarda un motivo. Lo que no existe es
verla contra el documento, ni editar precio unitario, ni agregar conceptos.

## Contexto verificado

- **Las filas del detalle y las de la factura salen de la misma fuente.**
  `buildCycleDetail` (`cycle-detail.ts:261`) y `buildCycleLineItems`
  (`kinetic-invoices.ts:51`) leen los dos `snapshot.therapies_json[].sessions_per_month`.
- **El detalle y la factura NO cubren lo mismo.** `createInvoiceForCycle` agrega
  líneas que el detalle no muestra: recargo por mora arrastrado
  (`surcharge_carried_in_usd`), recargos de mensualidades anteriores pagadas tarde,
  y ajustes arrastrados (`billing_adjustment_carried_in_usd`). Se calculan **dentro**
  del camino de escritura, así que hoy no se pueden previsualizar.
- **El catálogo le gana al precio guardado en el ciclo**, en tres caminos:
  `createInvoiceForCycle` (`kinetic-invoices.ts:156`), `upsertTreatmentPlan`
  (`treatment-plans.ts:403`) y el respaldo de `therapiesSyncedToAgenda` cuando
  `unit_cost_usd <= 0`. Es política deliberada: los snapshots sin precio generaban
  facturas en $0.
- **El sync automático le gana a la cantidad puesta a mano.**
  `therapiesSyncedToAgenda` pone `sessions_per_month` al conteo de la agenda cada
  vez que cambia una cita del mes (`syncCycleChargeToAgenda`, enganchado en crear,
  borrar, mover y reagendar citas).
- `editMonthlyCycle` ya recalcula `payment_amount_usd` con `expectedCycleAmount`
  (`monthly-cycles.ts:1107`), refresca el snapshot y puede regenerar la factura.
- `expectedCycleAmount` = subtotal − descuento (`cycle-edit.ts:38`).
- Próxima migración libre: **0185**.

## Decisiones

Tomadas con el usuario durante el brainstorming:

1. **Lo que se edita se guarda en el ciclo**, no solo en el documento. El PDF, la
   factura y lo que ve recepción tienen que decir siempre lo mismo. Un total
   editable solo para el PDF reabriría exactamente el bug que originó todo esto.
2. **La pantalla revisa todo lo que se le va a cobrar**, incluidos los arrastres.
   Un documento que no incluye lo que la factura sí cobra no sirve para corroborar.
3. **Un valor fijado a mano gana sobre el automático** hasta que alguien lo
   devuelva a automático, y la pantalla lo muestra marcado. Sin esto, corregir no
   sirve de nada: el próximo cambio de agenda revierte la corrección en silencio.
4. **Esta pantalla no toca la agenda.** Corregir citas sigue siendo *Editar ciclo*.
   Son dos operaciones distintas y mezclarlas confunde.
5. Se entrega **en cuatro partes**, cada una útil por sí sola.

## Diseño

### Dónde vive

El botón *Detalle de pago* deja de descargar y abre un modal
**"Detalle de pago — \<mes\>"** con tres zonas: el desglose del mes (editable a
partir de la entrega 2), los arrastres que la factura va a sumar (solo lectura), y
el **total a cobrar**. Acciones: *Guardar cambios* y *Descargar PDF*.

### Valor fijado a mano (entregas 2 y 3)

Concepto transversal. Cada entrada de `therapies_json` puede marcarse:

```ts
sessions_overridden?: boolean   // la cantidad la puso una persona
unit_cost_overridden?: boolean  // el precio lo puso una persona
```

Va en el jsonb del snapshot — **sin migración**. Reglas:

- `therapiesSyncedToAgenda` **no toca** una entrada con `sessions_overridden`, y la
  reporta aparte para que la revisión de cobros pueda mostrarla.
- `withCatalogPrices` / el respaldo de precio **no tocan** una entrada con
  `unit_cost_overridden`, ni siquiera si el precio quedó en 0 — si alguien lo puso
  en 0 a propósito, es su decisión.
- La pantalla muestra el valor marcado con su chip y un botón **"volver a
  automático"** que limpia la marca y recalcula.

Distinguir "puesto a mano" de "quedó viejo" es lo que permite que el catálogo siga
ganándole a los snapshots desactualizados sin pisar una decisión deliberada.

### Entrega 1 — Previsualizar el cobro real (solo lectura)

1. Extraer de `createInvoiceForCycle` una función de solo lectura
   `collectCycleCarryIns(admin, cycle, family) → { description, amount, sourceCycleId }[]`.
   `createInvoiceForCycle` pasa a consumirla: **sin cambio de comportamiento**, con
   sus tests actuales de respaldo.
2. Acción nueva `getCycleChargePreview(cycleId)` → `{ detail, carryIns, totalToCharge }`,
   donde `detail` es el `CycleDetail` que ya arma el PDF y
   `totalToCharge = detail.total + Σ carryIns`.
3. Modal de solo lectura con el desglose, los arrastres y el total, más *Descargar PDF*.

Esta entrega sola habría mostrado los $258 contra los $236 antes de mandar el
documento.

### Entrega 2 — Cantidades y descuento

Edición en la misma pantalla, guardando por el camino que ya existe
(`editMonthlyCycle`), **siempre con la regeneración de citas apagada**. Cada
cantidad cambiada a mano queda con `sessions_overridden`.

### Entrega 3 — Precio unitario

Editable por terapia y por mes, marcando `unit_cost_overridden`, y enseñándole la
marca a los tres caminos donde hoy manda el catálogo.

### Entrega 4 — Líneas libres de cobro

Migración **0185**: `monthly_session_cycles.extra_charges_json jsonb` —
`[{ description, quantity, unit_price, reason }]`. Lo consumen `buildCycleDetail`
(filas extra), el recálculo del monto y `createInvoiceForCycle` (líneas extra).

> Las RPC de SQL que calculan `payment_amount_usd` al generar el ciclo no conocen
> estas líneas. No importa: solo se agregan desde esta pantalla, que recalcula el
> monto en TS. Queda documentado para que nadie asuma lo contrario.

## Pruebas

- **Funciones puras primero**: recolección de arrastres, aritmética del total, y la
  precedencia del valor fijado a mano sobre el automático.
- **La acción de lectura completa** se prueba con el fake de Supabase
  (`src/lib/supabase/testing.ts`), que aplica los filtros de verdad y emula el tope
  de 1000 filas.
- **Invariante en los caminos de plata**: las filas del documento suman el total.
  Es la que faltaba y la que dejó pasar los $258.
- Cada entrega va con sus tests; los de `cycle-detail` y `agenda-charge-sync` que ya
  existen son la red contra regresiones.

## Fuera de alcance

- Editar los arrastres. Se muestran, no se tocan: corregir un mes anterior se hace
  en ese mes.
- Corregir la agenda desde esta pantalla.
- Incluir las sesiones de programa matutino en el PDF de exportar calendario
  (limitación conocida aparte: `/api/agenda/pdf` re-consulta `appointments` por id).

## Riesgos

- **Es código de plata.** Cada entrega cambia lo que se le pide a una familia. Por
  eso van separadas, con tests propios y con la invariante de que las filas cierren.
- **La marca de "fijado a mano" es permanente hasta que alguien la limpie.** Un
  override viejo que nadie recuerda puede sostener un cobro equivocado durante
  meses. La pantalla lo muestra siempre marcado, que es la única defensa razonable
  sin inventar vencimientos.
- La entrega 4 exige aplicar la migración a mano en Supabase, como todas.
