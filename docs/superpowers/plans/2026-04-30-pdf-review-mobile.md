# PDF Review Support + Mobile Layout Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF upload + per-page pin annotations to the content review system, and fix the mobile layout so images display correctly on phones.

**Architecture:** PDF.js loads lazily client-side when a PDF is opened. A new `PdfViewer` component mirrors `ImageViewer` but renders PDF pages to canvas. The mobile fix rewires `ContentReviewPanel` to a vertical layout at `< md` breakpoints with a slide-up drawer for comments.

**Tech Stack:** Next.js 14 App Router, React 19, TypeScript 5, Tailwind CSS 4, Supabase, pdfjs-dist (new dependency)

**Spec:** `docs/superpowers/specs/2026-04-30-pdf-review-mobile-design.md`

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/0065_pdf_review_support.sql` | New — expand `review_assets.kind` CHECK + add `review_pins.page_number` |
| `src/types/db.ts` | Edit — `ReviewAssetKind` adds `'pdf'`; `ReviewPin` adds `page_number` |
| `src/lib/supabase/upload-review-file.ts` | Edit — PDF type + kind |
| `src/app/actions/content-review.ts` | Edit — `pageNumber` param in `createReviewPin` + INSERT |
| `src/components/clients/review/ImageViewer.tsx` | Edit — responsive height (1 line) |
| `src/components/clients/review/AssetThumbnail.tsx` | Edit — PDF icon for `kind === 'pdf'` |
| `src/components/clients/review/PdfViewer.tsx` | New — PDF.js viewer with page nav + pin overlay |
| `src/components/clients/review/ReviewCenterViewer.tsx` | Edit — PDF branch, `currentPdfPage` state, suppress `FileThumbnailStrip` for PDF |
| `src/components/clients/review/AssetVersionStrip.tsx` | New — horizontal mobile version selector |
| `src/components/clients/review/MobileReviewDrawer.tsx` | New — bottom drawer for comments on mobile |
| `src/components/clients/review/AddFilesDialog.tsx` | Edit — mensaje de error actualizado (+PDF) |
| `src/components/clients/review/ContentReviewPanel.tsx` | Edit — responsive layout, wire new components |

---

## Task 1: Install pdfjs-dist

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
cd "C:/Users/Daniel/Desktop/FM CRM/fm-crm"
npm install pdfjs-dist
```

Expected: `pdfjs-dist` added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify build still compiles**

```bash
npm run build
```

Expected: Build passes. (If type errors appear about missing `@types/pdfjs-dist`, they are fine — `pdfjs-dist` ships its own types since v3.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: instalar pdfjs-dist para visor de PDF en revisiones"
```

---

## Task 2: DB Migration

**Files:**
- Create: `supabase/migrations/0065_pdf_review_support.sql`

> ⚠️ **Aplicar manualmente en Supabase Dashboard** (SQL Editor) antes de hacer pruebas. El archivo queda en el repo como referencia.

- [ ] **Step 1: Create the migration file**

```sql
-- 0065_pdf_review_support.sql
-- Amplía el tipo de asset para soportar PDFs y agrega la columna de página en pines.

-- 1. Ampliar CHECK constraint en review_assets.kind
--    El constraint se auto-nombró review_assets_kind_check al crearse en 0044.
alter table public.review_assets
  drop constraint review_assets_kind_check,
  add constraint review_assets_kind_check
    check (kind in ('image', 'video', 'pdf'));

-- 2. Agregar page_number a review_pins (nullable — pines de imagen/video quedan NULL)
alter table public.review_pins
  add column if not exists page_number integer null;

comment on column public.review_pins.page_number is
  'Página del PDF (0-based). NULL para pines en imágenes o video.';
```

Save to `supabase/migrations/0065_pdf_review_support.sql`.

- [ ] **Step 2: Apply in Supabase Dashboard**

Open Supabase Dashboard → SQL Editor → paste the migration → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0065_pdf_review_support.sql
git commit -m "feat: migración 0065 — review_assets soporta PDF + review_pins.page_number"
```

---

## Task 3: TypeScript Types

**Files:**
- Modify: `src/types/db.ts` (lines ~1814 and ~1840)

- [ ] **Step 1: Add `'pdf'` to `ReviewAssetKind`**

Find line ~1814:
```ts
export type ReviewAssetKind = 'image' | 'video'
```
Replace with:
```ts
export type ReviewAssetKind = 'image' | 'video' | 'pdf'
```

- [ ] **Step 2: Add `page_number` to `ReviewPin`**

Find the `ReviewPin` interface (~line 1840). Add the field after `timestamp_ms`:
```ts
export interface ReviewPin {
  id: string
  version_id: string
  file_id: string | null
  pin_number: number
  pos_x_pct: number
  pos_y_pct: number
  timestamp_ms: number | null
  page_number: number | null   // ← nuevo: página del PDF (0-based), null para imagen/video
  status: ReviewPinStatus
  created_by: string | null
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
}
```

- [ ] **Step 3: Run lint to check no type errors**

```bash
npm run lint
```

Expected: 0 errors nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/types/db.ts
git commit -m "feat: tipos TS — ReviewAssetKind añade 'pdf', ReviewPin añade page_number"
```

---

## Task 4: Enable PDF Upload

**Files:**
- Modify: `src/lib/supabase/upload-review-file.ts`

- [ ] **Step 1: Add PDF to allowed types and kind**

Replace the top of the file (the type constants and `kindForMime`):

```ts
import { createClient } from './client'

export const REVIEW_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const REVIEW_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const

export const REVIEW_PDF_TYPES = [
  'application/pdf',
] as const

export const REVIEW_ALLOWED_TYPES = [
  ...REVIEW_IMAGE_TYPES,
  ...REVIEW_VIDEO_TYPES,
  ...REVIEW_PDF_TYPES,
] as const

export const REVIEW_MAX_BYTES = 200 * 1024 * 1024 // 200 MB

export type ReviewUploadKind = 'image' | 'video' | 'pdf'

export function kindForMime(mime: string): ReviewUploadKind | null {
  if ((REVIEW_IMAGE_TYPES as readonly string[]).includes(mime)) return 'image'
  if ((REVIEW_VIDEO_TYPES as readonly string[]).includes(mime)) return 'video'
  if ((REVIEW_PDF_TYPES as readonly string[]).includes(mime)) return 'pdf'
  return null
}
```

- [ ] **Step 2: Update the error message in `uploadReviewFile`**

Find:
```ts
throw new Error(
  'Formato no permitido. Usa JPG, PNG, WebP, GIF, MP4, WebM o MOV.'
)
```
Replace with:
```ts
throw new Error(
  'Formato no permitido. Usa JPG, PNG, WebP, GIF, MP4, WebM, MOV o PDF.'
)
```

Also update the same message in `AddFilesDialog.tsx` line ~69:
```ts
setError('Formato no permitido. Usa JPG, PNG, WebP, GIF, MP4, WebM o MOV.')
```
→
```ts
setError('Formato no permitido. Usa JPG, PNG, WebP, GIF, MP4, WebM, MOV o PDF.')
```

- [ ] **Step 3: Lint check**

```bash
npm run lint
```

Expected: 0 errors nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/upload-review-file.ts src/components/clients/review/AddFilesDialog.tsx
git commit -m "feat: habilitar subida de PDF en revisiones de contenido"
```

---

## Task 5: Server Action — pageNumber in createReviewPin

**Files:**
- Modify: `src/app/actions/content-review.ts` (lines ~279–327)

- [ ] **Step 1: Add `pageNumber` to the args signature**

Find the `createReviewPin` function signature (~line 279). Add `pageNumber`:

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
}): Promise<ActionResult<{ pin: ReviewPin; comment: ReviewComment }>> {
```

- [ ] **Step 2: Add `page_number` to the INSERT object**

Find the `.insert({...})` block (~line 316). Add the field:

```ts
const { data: pinInsert, error: pinErr } = await supabase
  .from('review_pins')
  .insert({
    version_id: args.versionId,
    file_id: args.fileId ?? null,
    pin_number: pinNumber,
    pos_x_pct: args.posXPct,
    pos_y_pct: args.posYPct,
    timestamp_ms: args.timestampMs,
    page_number: args.pageNumber ?? null,   // ← nuevo
    status: 'active',
    created_by: user.id,
  })
  .select('id')
  .single()
```

- [ ] **Step 3: Lint + build check**

```bash
npm run lint && npm run build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/content-review.ts
git commit -m "feat: createReviewPin acepta pageNumber para pines de PDF"
```

---

## Task 6: Quick Fixes — ImageViewer Height + AssetThumbnail PDF Icon

**Files:**
- Modify: `src/components/clients/review/ImageViewer.tsx` (line 145)
- Modify: `src/components/clients/review/AssetThumbnail.tsx` (lines ~52–57)

- [ ] **Step 1: Fix ImageViewer height**

In `ImageViewer.tsx`, find line 145:
```tsx
className="max-w-full max-h-[calc(92vh-260px)] block select-none"
```
Replace with:
```tsx
className="max-w-full max-h-[50vh] md:max-h-[calc(92vh-260px)] block select-none"
```

- [ ] **Step 2: Add PDF icon to AssetThumbnail**

In `AssetThumbnail.tsx`, find the import line at the top:
```ts
import { ImageIcon, VideoIcon } from 'lucide-react'
```
Replace with:
```ts
import { ImageIcon, VideoIcon, FileTextIcon } from 'lucide-react'
```

Then find the fallback render (~line 52):
```tsx
return (
  <div className="w-full aspect-video bg-[#e8ebed] flex items-center justify-center text-[#8a8f93]">
    {asset.kind === 'video' ? (
      <VideoIcon className="w-6 h-6" />
    ) : (
      <ImageIcon className="w-6 h-6" />
    )}
  </div>
)
```
Replace with:
```tsx
return (
  <div className="w-full aspect-video bg-[#e8ebed] flex items-center justify-center text-[#8a8f93]">
    {asset.kind === 'video' ? (
      <VideoIcon className="w-6 h-6" />
    ) : asset.kind === 'pdf' ? (
      <FileTextIcon className="w-6 h-6" />
    ) : (
      <ImageIcon className="w-6 h-6" />
    )}
  </div>
)
```

- [ ] **Step 3: Lint check**

```bash
npm run lint
```

Expected: 0 errors nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/components/clients/review/ImageViewer.tsx src/components/clients/review/AssetThumbnail.tsx
git commit -m "fix: altura imagen responsiva en móvil + ícono PDF en AssetThumbnail"
```

---

## Task 7: PdfViewer Component

**Files:**
- Create: `src/components/clients/review/PdfViewer.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileTextIcon } from 'lucide-react'
import type {
  ReviewAsset,
  ReviewPin,
  ReviewVersion,
  ReviewVersionFile,
  ReviewComment,
  UserRole,
} from '@/types/db'
import { getSignedViewUrl, createReviewPin } from '@/app/actions/content-review'
import { PinOverlay } from './PinOverlay'
import { PinCommentBubble } from './PinCommentBubble'
import { PinHoverBubble } from './PinHoverBubble'

interface UserMini {
  id: string
  full_name: string
  avatar_url: string | null
  role: UserRole
}

interface PdfViewerProps {
  asset: ReviewAsset
  version: ReviewVersion
  file: ReviewVersionFile
  pins: ReviewPin[]              // ya filtrados por page_number === currentPage
  selectedPinId: string | null
  onSelectPin: (id: string | null) => void
  clientId: string
  users: UserMini[]
  commentsByPin: Record<string, ReviewComment[]>
  onPinCreated: (pin: ReviewPin, comment: ReviewComment) => void
  currentPage: number            // 0-based, controlado por el padre
  onPageChange: (page: number) => void
}

export function PdfViewer({
  asset,
  version,
  file,
  pins,
  selectedPinId,
  onSelectPin,
  clientId,
  users,
  commentsByPin,
  onPinCreated,
  currentPage,
  onPageChange,
}: PdfViewerProps) {
  const [url, setUrl] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ xPct: number; yPct: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerInitializedRef = useRef(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null)

  // 1. Signed URL
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(null)
    setPdfDoc(null)
    getSignedViewUrl({ storagePath: file.storage_path }).then((res) => {
      if (cancelled) return
      if ('ok' in res) setUrl(res.data.url)
      else setError(res.error)
    })
    return () => { cancelled = true }
  }, [file.storage_path])

  // 2. Load PDF document
  useEffect(() => {
    if (!url) return
    let cancelled = false
    void (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        if (!workerInitializedRef.current) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
          ).toString()
          workerInitializedRef.current = true
        }
        const doc = await pdfjsLib.getDocument(url).promise
        if (cancelled) return
        setPdfDoc(doc)
        setTotalPages(doc.numPages)
      } catch {
        if (!cancelled) setError('Error al cargar el PDF.')
      }
    })()
    return () => { cancelled = true }
  }, [url])

  // 3. Render current page to canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    renderTaskRef.current?.cancel()
    void (async () => {
      setRendering(true)
      try {
        const page = await pdfDoc.getPage(currentPage + 1) // PDF.js es 1-based
        if (cancelled) { page.cleanup(); return }
        const canvas = canvasRef.current!
        const viewport = page.getViewport({ scale: 1.5 })
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        const task = page.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = task
        await task.promise
        if (!cancelled) setRendering(false)
      } catch (e: unknown) {
        if (
          !cancelled &&
          (e as { name?: string }).name !== 'RenderingCancelledException'
        ) {
          setError('Error al renderizar la página.')
        }
        if (!cancelled) setRendering(false)
      }
    })()
    return () => { cancelled = true }
  }, [pdfDoc, currentPage])

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (selectedPinId) { onSelectPin(null); return }
    if (pending) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return
    setPending({ xPct: x, yPct: y })
  }

  const handleSubmitPin = useCallback(
    async (body: string, mentionedUserIds: string[]) => {
      if (!pending) return
      setSubmitting(true)
      setError(null)
      const res = await createReviewPin({
        versionId: version.id,
        fileId: file.id,
        clientId,
        posXPct: pending.xPct,
        posYPct: pending.yPct,
        timestampMs: null,
        pageNumber: currentPage,
        body,
        mentionedUserIds,
      })
      setSubmitting(false)
      if ('ok' in res) {
        onPinCreated(res.data.pin, res.data.comment)
        setPending(null)
      } else {
        setError(res.error)
      }
    },
    [pending, version.id, file.id, clientId, currentPage, onPinCreated],
  )

  return (
    <div className="relative flex-1 flex flex-col items-center min-h-0 overflow-hidden">
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-fm-error text-white text-xs px-3 py-1.5 rounded-md shadow">
          {error}
        </div>
      )}

      {/* Navegación de páginas */}
      {totalPages > 0 && (
        <div className="flex items-center gap-3 py-1.5 flex-shrink-0 text-xs text-fm-on-surface-variant">
          <button
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="px-2 py-0.5 rounded bg-fm-surface-container hover:bg-fm-surface-container-high disabled:opacity-40 transition-colors"
          >
            ◀
          </button>
          <span className="font-medium">Página {currentPage + 1} / {totalPages}</span>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage === totalPages - 1}
            className="px-2 py-0.5 rounded bg-fm-surface-container hover:bg-fm-surface-container-high disabled:opacity-40 transition-colors"
          >
            ▶
          </button>
        </div>
      )}

      {/* Canvas + pins overlay */}
      <div className="flex-1 flex items-center justify-center min-h-0 w-full overflow-hidden">
        {pdfDoc ? (
          <div
            className="relative inline-block max-w-full cursor-crosshair"
            onClick={handleClick}
          >
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[50vh] md:max-h-[calc(92vh-260px)] block select-none"
            />
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-fm-surface-container/50">
                <span className="text-xs text-fm-on-surface-variant">Renderizando…</span>
              </div>
            )}
            {pins.map((pin) => (
              <PinOverlay
                key={pin.id}
                pin={pin}
                selected={pin.id === selectedPinId}
                onClick={() => onSelectPin(pin.id)}
                onHoverStart={() => setHoveredPinId(pin.id)}
                onHoverEnd={() =>
                  setHoveredPinId((cur) => (cur === pin.id ? null : cur))
                }
              />
            ))}
            {(() => {
              if (!hoveredPinId || hoveredPinId === selectedPinId || pending) return null
              const hoveredPin = pins.find((p) => p.id === hoveredPinId)
              if (!hoveredPin) return null
              const firstComment = (commentsByPin[hoveredPin.id] ?? [])[0]
              if (!firstComment) return null
              const author = users.find((u) => u.id === firstComment.user_id) ?? null
              return (
                <PinHoverBubble
                  xPct={hoveredPin.pos_x_pct}
                  yPct={hoveredPin.pos_y_pct}
                  comment={firstComment}
                  author={author}
                />
              )
            })()}
            {pending && (
              <>
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-fm-primary text-white flex items-center justify-center text-[11px] font-bold shadow-md ring-2 ring-white"
                  style={{ left: `${pending.xPct}%`, top: `${pending.yPct}%` }}
                >
                  {pins.length + 1}
                </div>
                <PinCommentBubble
                  xPct={pending.xPct}
                  yPct={pending.yPct}
                  users={users}
                  onSubmit={handleSubmitPin}
                  onCancel={() => setPending(null)}
                  submitting={submitting}
                />
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-fm-on-surface-variant text-sm">
            <FileTextIcon className="w-8 h-8 opacity-40" />
            <span>Cargando PDF…</span>
          </div>
        )}
      </div>

      {/* Strip de páginas (solo si > 1 página) */}
      {totalPages > 1 && (
        <div className="flex gap-1 py-1.5 px-2 overflow-x-auto flex-shrink-0 border-t border-fm-surface-container-high/60">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => onPageChange(i)}
              title={`Página ${i + 1}`}
              className={`flex-shrink-0 w-7 h-9 rounded border-2 text-[10px] font-medium transition-colors ${
                i === currentPage
                  ? 'border-fm-primary bg-fm-primary/10 text-fm-primary'
                  : 'border-fm-surface-container-high text-fm-on-surface-variant hover:border-fm-primary/50'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errors nuevos. (Si aparece `@typescript-eslint/no-explicit-any`, los `eslint-disable-next-line` comments ya están incluidos en el archivo.)

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Compila correctamente.

- [ ] **Step 4: Commit**

```bash
git add src/components/clients/review/PdfViewer.tsx
git commit -m "feat: componente PdfViewer con PDF.js, navegación de páginas y pines por página"
```

---

## Task 8: ReviewCenterViewer — PDF Branch

**Files:**
- Modify: `src/components/clients/review/ReviewCenterViewer.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, add the import for `PdfViewer`. Find the existing imports block:
```ts
import { ImageViewer } from './ImageViewer'
import { VideoViewer } from './VideoViewer'
import { FileThumbnailStrip } from './FileThumbnailStrip'
```
Add after `VideoViewer`:
```ts
import { PdfViewer } from './PdfViewer'
```

- [ ] **Step 2: Add `currentPdfPage` state + update `ReviewCenterViewerProps`**

Find the props interface and add `currentPdfPage` + `onPdfPageChange`:
```ts
interface ReviewCenterViewerProps {
  // ... props existentes ...
  currentPdfPage: number
  onPdfPageChange: (page: number) => void
}
```

At the top of the function body, destructure the new props:
```ts
export function ReviewCenterViewer({
  // ... props existentes ...
  currentPdfPage,
  onPdfPageChange,
}: ReviewCenterViewerProps) {
```

- [ ] **Step 3: Add `isPdf` detection + update pin filter + swap viewer**

Find the block that calculates `filePins` and renders the viewer (around line 200–235). Replace it:

```ts
const isPdf = file.mime_type === 'application/pdf'

// Para PDFs: filtrar pines por página activa (usa ?? 0 para no perder pines con page_number null)
// Para imagen/video: filtro original
const filePins = isPdf
  ? pins.filter(
      (p) => p.file_id === file.id && (p.page_number ?? 0) === currentPdfPage,
    )
  : pins.filter((p) => p.file_id === file.id || p.file_id == null)
```

Then in the render (the part that shows `VideoViewer` or `ImageViewer`), add the PDF branch:

```tsx
return (
  <div className="flex-1 flex flex-col min-h-0">
    <div className="flex-1 flex min-h-0">
      {isPdf ? (
        <PdfViewer
          key={file.id}
          asset={asset}
          version={version}
          file={file}
          pins={filePins}
          selectedPinId={selectedPinId}
          onSelectPin={onSelectPin}
          clientId={clientId}
          users={users}
          commentsByPin={commentsByPin}
          onPinCreated={onPinCreated}
          currentPage={currentPdfPage}
          onPageChange={onPdfPageChange}
        />
      ) : isVideo ? (
        <VideoViewer
          asset={asset}
          version={version}
          file={file}
          pins={filePins}
          selectedPinId={selectedPinId}
          onSelectPin={onSelectPin}
          clientId={clientId}
          users={users}
          commentsByPin={commentsByPin}
          onPinCreated={onPinCreated}
        />
      ) : (
        <ImageViewer
          asset={asset}
          version={version}
          file={file}
          pins={filePins}
          selectedPinId={selectedPinId}
          onSelectPin={onSelectPin}
          clientId={clientId}
          users={users}
          commentsByPin={commentsByPin}
          onPinCreated={onPinCreated}
        />
      )}
    </div>
    {/* FileThumbnailStrip no aplica para PDFs (renderizaría el PDF como imagen rota) */}
    {!isPdf && (
      <FileThumbnailStrip
        files={files}
        selectedFileId={file.id}
        onSelect={onSelectFile}
        pins={pins}
      />
    )}
  </div>
)
```

- [ ] **Step 4: Update ContentReviewPanel to pass new props**

In `ContentReviewPanel.tsx`, find where `ReviewCenterViewer` is rendered (~line 254). Add state and pass props:

```ts
// Junto al resto de useState en ContentReviewPanel:
const [currentPdfPage, setCurrentPdfPage] = useState(0)
```

Then in the JSX:
```tsx
<ReviewCenterViewer
  // ... props existentes ...
  currentPdfPage={currentPdfPage}
  onPdfPageChange={setCurrentPdfPage}
/>
```

- [ ] **Step 5: Lint + build check**

```bash
npm run lint && npm run build
```

Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/review/ReviewCenterViewer.tsx src/components/clients/review/ContentReviewPanel.tsx
git commit -m "feat: ReviewCenterViewer soporta rama PDF con pines por página"
```

---

## Task 9: AssetVersionStrip (Mobile)

**Files:**
- Create: `src/components/clients/review/AssetVersionStrip.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { FileTextIcon, ImageIcon, VideoIcon } from 'lucide-react'
import type { ReviewAsset, ReviewVersion, ReviewPin } from '@/types/db'

interface AssetVersionStripProps {
  assets: ReviewAsset[]
  versionsByAsset: Record<string, ReviewVersion[]>
  pinsByVersion: Record<string, ReviewPin[]>
  selectedVersionId: string | null
  onSelectVersion: (assetId: string, versionId: string) => void
  clientMode?: boolean
}

export function AssetVersionStrip({
  assets,
  versionsByAsset,
  pinsByVersion,
  selectedVersionId,
  onSelectVersion,
}: AssetVersionStripProps) {
  if (assets.length === 0) return null

  return (
    <div className="flex gap-2 px-3 py-2 overflow-x-auto">
      {assets.flatMap((asset) => {
        const versions = versionsByAsset[asset.id] ?? []
        return versions.map((version, idx) => {
          const isSelected = version.id === selectedVersionId
          const pinCount = (pinsByVersion[version.id] ?? []).length
          const label =
            versions.length > 1
              ? `${asset.name.slice(0, 8)} v${idx + 1}`
              : asset.name.slice(0, 12)

          return (
            <button
              key={version.id}
              onClick={() => onSelectVersion(asset.id, version.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border-2 transition-colors ${
                isSelected
                  ? 'border-fm-primary bg-fm-primary/10'
                  : 'border-fm-surface-container-high hover:border-fm-primary/40'
              }`}
            >
              <div className="w-9 h-9 rounded bg-fm-surface-container flex items-center justify-center text-fm-on-surface-variant">
                {asset.kind === 'pdf' ? (
                  <FileTextIcon className="w-4 h-4" />
                ) : asset.kind === 'video' ? (
                  <VideoIcon className="w-4 h-4" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
              </div>
              <span className="text-[10px] text-fm-on-surface-variant max-w-[56px] truncate">
                {label}
              </span>
              {pinCount > 0 && (
                <span className="text-[9px] bg-fm-primary/20 text-fm-primary rounded-full px-1.5 leading-4">
                  {pinCount}
                </span>
              )}
            </button>
          )
        })
      })}
    </div>
  )
}
```

- [ ] **Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/review/AssetVersionStrip.tsx
git commit -m "feat: AssetVersionStrip — selector horizontal de versiones para móvil"
```

---

## Task 10: MobileReviewDrawer

**Files:**
- Create: `src/components/clients/review/MobileReviewDrawer.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import type { ReviewPin, ReviewComment, UserRole } from '@/types/db'
import { ReviewRightColumn } from './ReviewRightColumn'

interface UserMini {
  id: string
  full_name: string
  avatar_url: string | null
  role: UserRole
}

interface MobileReviewDrawerProps {
  open: boolean
  onToggle: () => void
  pins: ReviewPin[]
  commentsByPin: Record<string, ReviewComment[]>
  selectedPinId: string | null
  onSelectPin: (id: string | null) => void
  clientId: string
  currentUserId: string
  users: UserMini[]
  onPinUpdated: (pin: ReviewPin) => void
  onPinRemoved: (pinId: string) => void
  onCommentUpserted: (comment: ReviewComment) => void
  onCommentRemoved: (commentId: string, pinId: string) => void
  clientMode?: boolean
}

export function MobileReviewDrawer({
  open,
  onToggle,
  pins,
  commentsByPin,
  selectedPinId,
  onSelectPin,
  clientId,
  currentUserId,
  users,
  onPinUpdated,
  onPinRemoved,
  onCommentUpserted,
  onCommentRemoved,
  clientMode = false,
}: MobileReviewDrawerProps) {
  const activePinCount = pins.filter((p) => p.status === 'active').length

  return (
    <div
      className={`md:hidden absolute bottom-0 left-0 right-0 z-20 flex flex-col bg-fm-surface-container-lowest border-t border-fm-surface-container-high transition-transform duration-300 ease-in-out ${
        open ? 'translate-y-0' : 'translate-y-[calc(100%-44px)]'
      }`}
      style={{ maxHeight: '60vh' }}
    >
      {/* Handle / toggle bar */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-4 min-h-[44px] flex-shrink-0 hover:bg-fm-surface-container/50 transition-colors"
      >
        <span className="text-xs text-fm-on-surface-variant">
          {activePinCount > 0
            ? `${activePinCount} pin${activePinCount !== 1 ? 'es' : ''}`
            : 'Sin pines'}
        </span>
        <span className="text-xs text-fm-primary font-medium">
          {open ? '▼ Ocultar' : '▲ Ver pines'}
        </span>
      </button>

      {/* Content */}
      {open && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <ReviewRightColumn
            pins={pins}
            commentsByPin={commentsByPin}
            selectedPinId={selectedPinId}
            onSelectPin={onSelectPin}
            clientId={clientId}
            currentUserId={currentUserId}
            users={users}
            onPinUpdated={onPinUpdated}
            onPinRemoved={onPinRemoved}
            onCommentUpserted={onCommentUpserted}
            onCommentRemoved={onCommentRemoved}
            clientMode={clientMode}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/review/MobileReviewDrawer.tsx
git commit -m "feat: MobileReviewDrawer — drawer de pines/comentarios para móvil"
```

---

## Task 11: ContentReviewPanel — Responsive Layout

**Files:**
- Modify: `src/components/clients/review/ContentReviewPanel.tsx`

- [ ] **Step 1: Add imports**

At the top of `ContentReviewPanel.tsx`, add the two new components to the import block:
```ts
import { AssetVersionStrip } from './AssetVersionStrip'
import { MobileReviewDrawer } from './MobileReviewDrawer'
```

- [ ] **Step 2: Add `drawerOpen` state**

Just below the existing `useState` declarations near the top of the component function body, add:
```ts
const [drawerOpen, setDrawerOpen] = useState(false)
```

- [ ] **Step 3: Replace the outer `<div>` and layout**

Find the `return (` statement and replace the entire returned JSX with the responsive version below. Key changes:
- Outer div gets `relative` + `flex-col md:flex-row`
- Left column: `hidden md:flex`
- New mobile strip: `flex md:hidden`
- Right column: `hidden md:flex`
- New mobile drawer added at bottom

```tsx
return (
  <div className="relative flex flex-col md:flex-row flex-1 min-h-0 bg-fm-surface-container-lowest">

    {/* ── Desktop: columna izquierda (assets / versiones) ── */}
    <div className="hidden md:flex w-[160px] border-r border-fm-surface-container-high flex-shrink-0 flex-col">
      <ReviewLeftColumn
        assets={data.assets}
        versionsByAsset={data.versionsByAsset}
        pinsByVersion={data.pinsByVersion}
        selectedAssetId={selectedAssetId}
        selectedVersionId={selectedVersionId}
        clientId={clientId}
        onSelectAsset={(id) => {
          setSelectedAssetId(id)
          const versions = data.versionsByAsset[id] ?? []
          setSelectedVersionId(versions[versions.length - 1]?.id ?? null)
          setSelectedPinId(null)
        }}
        onSelectVersion={(id) => {
          setSelectedVersionId(id)
          setSelectedPinId(null)
        }}
        onAddAsset={openAddFilesForNewAsset}
        onAddVersion={(assetId) => openAddFilesForNewVersion(assetId)}
        onVersionDeleted={(versionId, assetId) => {
          data.removeVersion(versionId, assetId)
          if (selectedVersionId === versionId) {
            const remaining = (data.versionsByAsset[assetId] ?? []).filter(
              (v) => v.id !== versionId,
            )
            setSelectedVersionId(remaining[remaining.length - 1]?.id ?? null)
            if (remaining.length === 0) setSelectedAssetId(null)
          }
        }}
        clientMode={clientMode}
      />
    </div>

    {/* ── Mobile: strip horizontal de versiones ── */}
    <div className="flex md:hidden border-b border-fm-surface-container-high flex-shrink-0">
      <AssetVersionStrip
        assets={data.assets}
        versionsByAsset={data.versionsByAsset}
        pinsByVersion={data.pinsByVersion}
        selectedVersionId={selectedVersionId}
        onSelectVersion={(assetId, versionId) => {
          setSelectedAssetId(assetId)
          setSelectedVersionId(versionId)
          setSelectedPinId(null)
        }}
        clientMode={clientMode}
      />
    </div>

    {/* ── Centro: visor siempre visible ── */}
    <div className="flex-1 min-w-0 flex flex-col bg-fm-background">
      <ReviewCenterViewer
        loading={data.loading}
        error={data.error}
        asset={selectedAsset}
        version={selectedVersion}
        files={filesOnVersion}
        selectedFileId={selectedFileId}
        onSelectFile={(id) => {
          setSelectedFileId(id)
          setSelectedPinId(null)
        }}
        pins={pinsOnVersion}
        selectedPinId={selectedPinId}
        onSelectPin={setSelectedPinId}
        clientId={clientId}
        users={users}
        commentsByPin={data.commentsByPin}
        onPinCreated={(pin, comment) => {
          data.upsertPin(pin)
          data.upsertComment(comment)
          setSelectedPinId(pin.id)
        }}
        onEmptyAddFiles={openAddFilesForNewAsset}
        clientMode={clientMode}
        requirementId={requirementId}
        currentPdfPage={currentPdfPage}
        onPdfPageChange={setCurrentPdfPage}
      />
    </div>

    {/* ── Desktop: columna derecha (pines / comentarios) ── */}
    <div className="hidden md:flex w-[340px] border-l border-fm-surface-container-high flex-shrink-0 flex-col">
      <ReviewRightColumn
        pins={pinsOnVersion}
        commentsByPin={data.commentsByPin}
        selectedPinId={selectedPinId}
        onSelectPin={setSelectedPinId}
        clientId={clientId}
        currentUserId={currentUserId}
        users={users}
        onPinUpdated={data.upsertPin}
        onPinRemoved={(pinId) =>
          selectedVersionId && data.removePin(pinId, selectedVersionId)
        }
        onCommentUpserted={data.upsertComment}
        onCommentRemoved={data.removeComment}
        clientMode={clientMode}
      />
    </div>

    {/* ── Mobile: drawer de pines desde abajo ── */}
    <MobileReviewDrawer
      open={drawerOpen}
      onToggle={() => setDrawerOpen((o) => !o)}
      pins={pinsOnVersion}
      commentsByPin={data.commentsByPin}
      selectedPinId={selectedPinId}
      onSelectPin={setSelectedPinId}
      clientId={clientId}
      currentUserId={currentUserId}
      users={users}
      onPinUpdated={data.upsertPin}
      onPinRemoved={(pinId) =>
        selectedVersionId && data.removePin(pinId, selectedVersionId)
      }
      onCommentUpserted={data.upsertComment}
      onCommentRemoved={data.removeComment}
      clientMode={clientMode}
    />

    {!clientMode && (
      <AddFilesDialog
        open={addFilesOpen}
        onClose={() => setAddFilesOpen(false)}
        mode={addFilesMode}
        requirementId={requirementId}
        clientId={clientId}
        onUploaded={({ asset, version, files }) => {
          if (asset) {
            data.upsertAsset(asset)
            setSelectedAssetId(asset.id)
          }
          data.upsertVersion(version)
          data.setFilesForVersion(version.id, files)
          setSelectedVersionId(version.id)
          setSelectedFileId(files[0]?.id ?? null)
          setSelectedPinId(null)
        }}
      />
    )}
  </div>
)
```

- [ ] **Step 4: Lint + full build**

```bash
npm run lint && npm run build
```

Expected: 0 errores. Build limpio.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/review/ContentReviewPanel.tsx
git commit -m "feat: layout responsivo en ContentReviewPanel — drawer móvil + strip de versiones"
```

---

## Task 12: Verificación final

- [ ] **Step 1: Confirmar migración aplicada**

En Supabase Dashboard → Table Editor → `review_assets` → verificar que la columna `kind` acepta `'pdf'`.
En `review_pins` → verificar que existe columna `page_number` nullable.

- [ ] **Step 2: Smoke test PDF**

En la app (localhost:3000):
1. Abrir un requerimiento en fase de revisión → ContentReviewDialog → "Agregar archivos"
2. Subir un PDF de 2 o más páginas
3. El asset aparece en la columna izquierda con ícono de documento
4. El visor muestra el PDF renderizado con PDF.js y la barra "Página 1 / N"
5. Navegar a página 2 → strip resalta el botón 2
6. Click en el canvas → aparece el formulario de pin → ingresar comentario → guardar
7. Volver a página 1 → el pin de página 2 no está visible
8. Ir a página 2 → pin visible con el número correcto

- [ ] **Step 3: Smoke test mobile**

En DevTools (Chrome) → toggle device toolbar → iPhone SE (375px):
1. Abrir revisión → imagen visible (no altura cero)
2. Strip horizontal de versiones visible arriba
3. Franja "N pines · ▲ Ver pines" visible en la parte inferior
4. Tap en franja → drawer sube mostrando lista de pines con transición suave
5. En escritorio (1280px) → layout de 3 columnas sin cambios, sin drawer visible

- [ ] **Step 4: Verificar imagen/video existentes no rompieron**

1. Subir una imagen JPG → aparece en visor normal, pines funcionan
2. Subir un video MP4 → aparece en VideoViewer normal, pines temporales funcionan
3. Lint + build final limpio:

```bash
npm run lint && npm run build
```
