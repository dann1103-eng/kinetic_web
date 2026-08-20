# Crear y desactivar artículos del catálogo desde `/catalogos`

**Fecha:** 2026-08-20
**Estado:** aprobado
**Migraciones:** ninguna

## Problema

Recepción necesitaba dar de alta un tipo de evaluación nuevo y no encontró cómo.
No lo encontró porque no existe: `/catalogos` solo permite **editar el precio y el
costo de items que ya están cargados**, más un chip que activa/desactiva la fila.
No hay forma de crear un artículo ni de quitarlo.

La acción de servidor `createServiceCatalogItem` (`src/app/actions/service-catalog.ts`)
ya está escrita, validada y con manejo de código duplicado — **nunca se conectó a
ningún botón**. Es el mismo patrón que "Regenerar factura" y que el calendario
institucional: lógica completa del lado del servidor, cero superficie de UI.

## Contexto verificado

- `service_category` es un **enum de Postgres** con las 10 categorías actuales
  (`0107_service_catalog.sql` + `terapia_individual` de la `0130`). Crear
  categorías nuevas exigiría migración; **fuera de alcance** (decisión del usuario:
  las 10 alcanzan).
- La RLS de la `0135` es `FOR ALL ... WITH CHECK (role IN ('admin','contable','recepcion'))`,
  así que el INSERT ya está permitido para los tres roles que abren la página.
  **No hace falta migración.**
- Un item con categoría `evaluacion` / `evaluacion_dx_tea` / `evaluacion_psicologica`
  y `active = true` **aparece solo** en el selector de "Evaluación" al agendar
  (`src/app/(app)/agenda/page.tsx`, consulta `evalCatalog`). Crear el artículo es
  todo lo que hace falta para que la evaluación nueva sea agendable y tenga costo.
- La base impone dos CHECK y un índice único que la UI debe respetar:
  - `mensualidad_requires_program`: categoría `mensualidad` exige `morning_program`
    y `days_per_week`.
  - `proration_requires_months`: con `proration_group` hay que dar mes desde y hasta.
  - `service_catalog_mensualidad_unique`: **una sola mensualidad activa** por
    (programa, días/semana).

## Decisiones

| Punto | Decisión |
|---|---|
| Eliminar | **Nunca se borra la fila.** "Eliminar" = desactivar. Las citas, planes y facturas que ya usaron el artículo conservan su referencia. |
| Alcance del formulario | **Todas las categorías**, con campos que se adaptan a la elegida. |
| Categorías nuevas | Fuera de alcance. Requerirían migrar el enum. |

## Diseño

### 1. Lógica pura — `src/lib/domain/service-catalog.ts`

Se agrega al archivo que ya existe (hoy solo tiene lectores: `findMensualidad`,
`listByCategory`, etc.):

- `slugifyCatalogCode(name): string` — "Evaluación de lenguaje ABC" →
  `evaluacion_de_lenguaje_abc`. Quita acentos, baja a minúsculas, colapsa todo lo
  que no sea `[a-z0-9]` en `_`, recorta `_` de los extremos. Debe producir siempre
  algo que pase el `/^[a-z0-9_]+$/` que valida el servidor, o cadena vacía si el
  nombre no tiene ni una letra ni un número.
- `categoryFieldRules(category): { needsProgram, needsServiceType, allowsProration }`
  — única fuente de verdad de qué campo pide cada categoría, para que el
  formulario y la validación no se desincronicen.
- `nextSortOrder(items, category): number` — máximo `sort_order` de la categoría
  + 1, para que el artículo nuevo caiga **al final** de su grupo y no arriba de
  todo (hoy el default es 0).

Todas con tests en `service-catalog.test.ts`, al estilo de `catalog-price.test.ts`.

### 2. Modal — `src/components/catalogos/NewCatalogItemModal.tsx`

Sigue el patrón de `NewWaitlistEntryModal` (overlay fijo, tarjeta scrolleable,
`Field` local, `useTransition`). Sin `useDraft`: es un formulario corto y de una
sola sesión, no una captura larga como la lista de espera.

Campos siempre visibles: categoría, nombre, código (autogenerado desde el nombre
mientras el usuario no lo toque a mano), precio, precio BK, costo interno,
duración, descripción.

Condicionales, según `categoryFieldRules`:

- `terapia_individual` → tipo de terapia (`SERVICE_TYPE_LABELS`).
- `mensualidad` → programa + días/semana, **obligatorios**.
- `matricula`, `material_didactico` → grupo de prorrateo + mes desde/hasta.

Al enviar llama a `createServiceCatalogItem` con `sort_order: nextSortOrder(...)`.
Éxito → cierra, limpia y refresca.

### 3. Página — `src/components/catalogos/CatalogosClient.tsx`

- Botón `+ Nuevo artículo` en la cabecera, visible en ambas pestañas.
- **Los inactivos se ocultan por defecto**, con casilla "Mostrar inactivos" para
  verlos y reactivarlos. Hoy se muestran mezclados en gris, lo que hace que
  desactivar no se sienta como eliminar. La página ya carga
  `includeInactive: true`, así que el filtro es local.
- La fila gana una acción explícita de desactivar/reactivar además del chip.
- Un contador de cuántos inactivos hay escondidos, para que no se pierdan.

### 4. Acción de servidor — `src/app/actions/service-catalog.ts`

Un solo arreglo: `createServiceCatalogItem` traduce **cualquier** error `23505` a
"Ya existe un item con código X". Pero el índice `service_catalog_mensualidad_unique`
también lanza `23505`, así que crear una segunda mensualidad activa para el mismo
programa y días/semana daría un mensaje falso sobre el código. Se distingue por
`error.message`/`error.details` y se devuelve el mensaje correcto.

## Fuera de alcance

- Crear categorías nuevas (migración del enum).
- Borrado real de filas.
- Cambios en la pestaña de Costos: los artículos nuevos con costo aparecen ahí
  solos, porque esa pestaña ya filtra por categoría.

## Verificación

- `npm run test` — las funciones puras nuevas.
- `npm run lint` y `npm run build` — 0 errores nuevos.
- Manual: crear una evaluación, confirmar que aparece en el selector de
  "Evaluación" al agendar en `/agenda`; desactivarla y confirmar que desaparece
  de ahí y de la lista principal, pero sigue visible con "Mostrar inactivos".
