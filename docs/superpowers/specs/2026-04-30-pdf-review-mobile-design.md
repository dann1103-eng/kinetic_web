# Spec: Soporte PDF en revisión de contenido + fix layout móvil

**Fecha:** 2026-04-30  
**Estado:** Aprobado por el usuario

---

## Contexto

El sistema de revisión de contenido (`ContentReviewPanel`) actualmente soporta imágenes y videos. Se requiere:

1. **Soporte para subir PDFs** (folletos, infografías) con pines por página.
2. **Fix de layout móvil**: la imagen no se muestra en pantallas pequeñas porque `ImageViewer.tsx` usa `max-h-[calc(92vh-260px)]` asumiendo un sidebar de escritorio de 260px.

---

## Decisiones de diseño

| Pregunta | Decisión |
|---|---|
| Renderizado de PDF | PDF.js client-side (Mozilla, ~850 KB lazy) — sin dependencias en servidor |
| Navegación de páginas | Una página a la vez con strip de miniaturas |
| Pines | Por página — `page_number` guardado en `review_pins` |
| Layout móvil | Pantalla completa + drawer deslizable desde abajo para comentarios |

---

## Feature 1 — Soporte PDF

### 1.1 Migración de DB — `0065_pdf_review_support.sql`

```sql
alter table public.review_pins
  add column page_number integer null;

comment on column public.review_pins.page_number is
  'Página del PDF (0-based). NULL para pines en imágenes o video.';
```

Sin breaking changes. Pines existentes (imágenes, video) quedan con `NULL`.

### 1.2 Tipos TS — `src/types/db.ts`

Agregar campo a `ReviewPin`:

```ts
export interface ReviewPin {
  // ... campos existentes ...
  page_number: number | null  // ← nuevo
}
```

### 1.3 Upload — `src/lib/supabase/upload-review-file.ts`

- Agregar `'application/pdf'` a `REVIEW_ALLOWED_TYPES`.
- Ampliar `ReviewUploadKind` con `'pdf'`.
- `kindForMime('application/pdf')` → `'pdf'`.
- Mensaje de error actualizado: "…JPG, PNG, WebP, GIF, MP4, WebM, MOV o PDF."

### 1.4 Server action — `src/app/actions/content-review.ts`

`createReviewPin` acepta un nuevo parámetro opcional:

```ts
export async function createReviewPin(args: {
  versionId: string
  fileId?: string | null
  clientId: string
  posXPct: number
  posYPct: number
  timestampMs: number | null
  pageNumber?: number | null   // ← nuevo
  body: string
  mentionedUserIds?: string[]
})
```

El valor se pasa directamente en el `insert` a `review_pins.page_number`. Por defecto `null`.

### 1.5 Nuevo componente — `src/components/clients/review/PdfViewer.tsx`

**Props** (mismas que `ImageViewer` más las de página):

```ts
interface PdfViewerProps {
  asset: ReviewAsset
  version: ReviewVersion
  file: ReviewVersionFile          // mime_type === 'application/pdf'
  pins: ReviewPin[]                // ya filtrados por page_number === currentPage
  selectedPinId: string | null
  onSelectPin: (id: string | null) => void
  clientId: string
  users: UserMini[]
  commentsByPin: Record<string, ReviewComment[]>
  onPinCreated: (pin: ReviewPin, comment: ReviewComment) => void
  currentPage: number              // 0-based, controlado por el padre
  onPageChange: (page: number) => void
}
```

**Comportamiento:**

- Carga PDF.js con `import('pdfjs-dist')` (lazy — sólo cuando se renderiza el componente por primera vez).
- Obtiene la URL firmada del archivo igual que `ImageViewer` (reutiliza `getSignedViewUrl`).
- Renderiza la página `currentPage` en un `<canvas>` con `PDFPageProxy.render()`.
- Muestra barra de navegación: `◀  Página N / total  ▶`.
- Strip de miniaturas al fondo: renderiza cada página en canvas pequeño (32×40 px). Página activa destacada con borde teal.
- El canvas activo funciona como área de click para crear pines (igual que `<img>` en `ImageViewer`): calcula `pos_x_pct` / `pos_y_pct` relativo al bounding rect del canvas.
- Los pines se superponen con `<PinOverlay>` igual que en imágenes.

### 1.6 `ReviewCenterViewer.tsx` — rama PDF

```ts
// Estado nuevo en ReviewCenterViewer
const [currentPdfPage, setCurrentPdfPage] = useState(0)

// Reset al cambiar de archivo
useEffect(() => { setCurrentPdfPage(0) }, [file.id])

// Filtro de pines por página para PDFs
const isPdf = file.mime_type === 'application/pdf'
const filePins = isPdf
  ? pins.filter(p => p.file_id === file.id && p.page_number === currentPdfPage)
  : pins.filter(p => p.file_id === file.id || p.file_id == null)

// Render
{isPdf ? (
  <PdfViewer
    ...
    pins={filePins}
    currentPage={currentPdfPage}
    onPageChange={setCurrentPdfPage}
  />
) : isVideo ? (
  <VideoViewer ... />
) : (
  <ImageViewer ... />
)}
```

---

## Feature 2 — Fix layout móvil

### 2.1 `ImageViewer.tsx:141` — fix de altura inmediato

```tsx
// Antes:
className="max-w-full max-h-[calc(92vh-260px)] block select-none"

// Después:
className="max-w-full max-h-[50vh] md:max-h-[calc(92vh-260px)] block select-none"
```

Aplica también al `<canvas>` de `PdfViewer` desde el inicio.

### 2.2 `ContentReviewPanel.tsx` — layout responsivo

**Estado nuevo:**

```ts
const [drawerOpen, setDrawerOpen] = useState(false)
```

**Layout en mobile (`< md`):**

```
┌─────────────────────────────────────┐
│  AssetVersionStrip (scroll horiz.)  │  ← nuevo, visible sólo en mobile
├─────────────────────────────────────┤
│                                     │
│   ReviewCenterViewer (full width)   │
│                                     │
├─────────────────────────────────────┤
│  N pines              ▲ Ver pines   │  ← MobileReviewDrawer handle
└─────────────────────────────────────┘
```

**Clases Tailwind:**

```tsx
// Wrapper: flex-col en mobile, flex-row en desktop
<div className="flex flex-col md:flex-row flex-1 min-h-0">

  {/* Columna izquierda: sólo en desktop */}
  <div className="hidden md:flex w-[160px] border-r ...">
    <ReviewLeftColumn ... />
  </div>

  {/* Strip horizontal: sólo en mobile */}
  <div className="flex md:hidden overflow-x-auto border-b ...">
    <AssetVersionStrip ... />
  </div>

  {/* Centro: siempre visible */}
  <div className="flex-1 min-w-0 flex flex-col">
    <ReviewCenterViewer ... />
  </div>

  {/* Columna derecha: sólo en desktop */}
  <div className="hidden md:flex w-[340px] border-l ...">
    <ReviewRightColumn ... />
  </div>

  {/* Drawer: sólo en mobile */}
  <MobileReviewDrawer
    open={drawerOpen}
    onToggle={() => setDrawerOpen(o => !o)}
    pins={pinsOnVersion}
    commentsByPin={data.commentsByPin}
    selectedPinId={selectedPinId}
    onSelectPin={setSelectedPinId}
    clientId={clientId}
    currentUserId={currentUserId}
    users={users}
    onPinUpdated={data.upsertPin}
    onPinRemoved={...}
    clientMode={clientMode}
  />
</div>
```

### 2.3 Nuevo componente — `AssetVersionStrip.tsx`

Strip horizontal para mobile. Muestra un chip por versión de cada asset. Tap selecciona asset + versión. Reutiliza la misma lógica de selección que `ReviewLeftColumn` pero en disposición horizontal con `overflow-x-auto`.

Props: `assets`, `versionsByAsset`, `pinsByVersion`, `selectedVersionId`, `onSelectVersion`, `clientMode`.

### 2.4 Nuevo componente — `MobileReviewDrawer.tsx`

Drawer que sube desde abajo con transición CSS (`translate-y`).

- **Colapsado:** franja fija en el fondo mostrando "N pines · ▲ Ver pines".
- **Expandido:** ocupa ~60vh, muestra `ReviewRightColumn` (o su contenido embebido directamente) con scroll interno. Botón "▼ Ocultar" en el header.
- Transición: `transition-transform duration-300 ease-in-out`.

Props: `open`, `onToggle`, y todos los props que necesita `ReviewRightColumn`.

---

## Archivos afectados (resumen)

| # | Archivo | Tipo |
|---|---------|------|
| 1 | `supabase/migrations/0065_pdf_review_support.sql` | Nuevo (SQL manual en Dashboard) |
| 2 | `src/types/db.ts` | Edit (+1 campo `page_number`) |
| 3 | `src/lib/supabase/upload-review-file.ts` | Edit (+PDF type/kind) |
| 4 | `src/app/actions/content-review.ts` | Edit (+`pageNumber` en `createReviewPin`) |
| 5 | `src/components/clients/review/PdfViewer.tsx` | Nuevo |
| 6 | `src/components/clients/review/ReviewCenterViewer.tsx` | Edit (+PDF branch, +`currentPdfPage`) |
| 7 | `src/components/clients/review/ImageViewer.tsx` | Edit (1 línea de altura) |
| 8 | `src/components/clients/review/ContentReviewPanel.tsx` | Edit (responsive layout) |
| 9 | `src/components/clients/review/AssetVersionStrip.tsx` | Nuevo |
| 10 | `src/components/clients/review/MobileReviewDrawer.tsx` | Nuevo |

---

## Orden de implementación

1. Migración 0065 (ejecutar en Supabase Dashboard antes de testear).
2. `types/db.ts` — campo `page_number`.
3. `upload-review-file.ts` — habilitar PDF.
4. `content-review.ts` — `pageNumber` en `createReviewPin`.
5. `ImageViewer.tsx` — fix de altura (1 línea).
6. `PdfViewer.tsx` — componente nuevo con PDF.js.
7. `ReviewCenterViewer.tsx` — rama PDF + `currentPdfPage`.
8. `AssetVersionStrip.tsx` — strip horizontal mobile.
9. `MobileReviewDrawer.tsx` — drawer mobile.
10. `ContentReviewPanel.tsx` — responsive layout + conectar todos los componentes.
11. Lint + build + verificación en preview desktop y móvil.

---

## Verificación

### PDF
1. Subir un PDF de 3 páginas como nuevo asset → aparece en columna izquierda.
2. Se renderiza la página 1 con PDF.js. Strip muestra 3 miniaturas.
3. Navegar a página 2 → los pines de página 1 desaparecen, la página 2 se muestra.
4. Click en la página → pin creado con `page_number = 1` (0-based).
5. Volver a página 1 → pin de página 1 visible, pin de página 2 no.
6. En modo cliente (portal) → misma experiencia.

### Mobile
1. Abrir revisión en viewport 375px → imagen visible a ~50vh.
2. Franja "N pines · ▲ Ver pines" visible al fondo.
3. Tap en franja → drawer sube con lista de pines.
4. Strip de versiones horizontal en la parte superior, scrolleable.
5. En desktop (≥ 768px) → layout de 3 columnas sin cambios.
