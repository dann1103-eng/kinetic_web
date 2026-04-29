'use client'

import { useEffect, useState } from 'react'
import { UploadCloudIcon } from 'lucide-react'
import type {
  ReviewAsset,
  ReviewPin,
  ReviewVersion,
  ReviewVersionFile,
  ReviewComment,
  UserRole,
} from '@/types/db'
import { ImageViewer } from './ImageViewer'
import { VideoViewer } from './VideoViewer'
import { FileThumbnailStrip } from './FileThumbnailStrip'
import { diagnoseClientReview, type ClientReviewDiagnostic } from '@/app/actions/diagnoseReview'

interface UserMini {
  id: string
  full_name: string
  avatar_url: string | null
  role: UserRole
}

interface ReviewCenterViewerProps {
  loading: boolean
  error: string | null
  asset: ReviewAsset | null
  version: ReviewVersion | null
  files: ReviewVersionFile[]
  selectedFileId: string | null
  onSelectFile: (fileId: string) => void
  pins: ReviewPin[]
  selectedPinId: string | null
  onSelectPin: (id: string | null) => void
  clientId: string
  users: UserMini[]
  commentsByPin: Record<string, ReviewComment[]>
  onPinCreated: (pin: ReviewPin, comment: ReviewComment) => void
  onEmptyAddFiles: () => void
  clientMode?: boolean
  /** Para diagnosticar el bug de RLS cuando clientMode y no hay assets visibles. */
  requirementId?: string
}

export function ReviewCenterViewer({
  loading,
  error,
  asset,
  version,
  files,
  selectedFileId,
  onSelectFile,
  pins,
  selectedPinId,
  onSelectPin,
  clientId,
  users,
  commentsByPin,
  onPinCreated,
  onEmptyAddFiles,
  clientMode = false,
  requirementId,
}: ReviewCenterViewerProps) {
  const [diag, setDiag] = useState<ClientReviewDiagnostic | null>(null)

  useEffect(() => {
    // Solo en modo cliente: si terminó de cargar y no hay asset/version, diagnosticar.
    if (!clientMode || loading || asset || version || !requirementId) return
    let cancelled = false
    diagnoseClientReview(requirementId).then((d) => {
      if (!cancelled) setDiag(d)
    })
    return () => {
      cancelled = true
    }
  }, [clientMode, loading, asset, version, requirementId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-fm-on-surface-variant text-sm">
        Cargando…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-sm text-center text-sm text-fm-error">{error}</div>
      </div>
    )
  }

  if (!asset || !version) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-fm-primary/10 flex items-center justify-center mx-auto mb-3">
            <UploadCloudIcon className="w-7 h-7 text-fm-primary" />
          </div>
          <h3 className="text-sm font-semibold text-fm-on-surface mb-1">
            Sin archivos para revisar
          </h3>
          <p className="text-xs text-fm-on-surface-variant mb-4">
            {clientMode
              ? 'Aún no se ha cargado contenido para esta revisión.'
              : 'Sube imágenes o videos para empezar a recibir feedback con pines.'}
          </p>
          {!clientMode && (
            <button
              onClick={onEmptyAddFiles}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-fm-primary text-white text-xs font-semibold hover:bg-fm-primary-dim transition-colors"
            >
              Agregar archivos
            </button>
          )}

          {clientMode && diag && diag.totalAssets > diag.visibleAssets && (
            <div className="mt-4 text-left rounded-xl border border-fm-error/30 bg-fm-error/5 p-3 text-xs">
              <p className="font-semibold text-fm-error mb-1.5">Diagnóstico</p>
              <ul className="space-y-0.5 text-fm-error/90">
                <li>Archivos en el sistema: <strong>{diag.totalAssets}</strong></li>
                <li>Archivos visibles para ti: <strong>{diag.visibleAssets}</strong></li>
                <li>Fase del requerimiento: <strong>{diag.phase ?? '—'}</strong></li>
                <li>Acceso al cliente (is_client_of): <strong>{String(diag.isClientOf)}</strong></li>
              </ul>
              <p className="mt-2 text-[10px] text-fm-error/70">
                Si la fase no es <code>revision_cliente</code> o &quot;is_client_of&quot; es <code>false</code>,
                el RLS bloquea la lectura. Reporta esto al equipo de FM.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const file =
    files.find((f) => f.id === selectedFileId) ?? files[0] ?? null

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-fm-on-surface-variant text-sm">
        Esta versión no tiene archivos.
      </div>
    )
  }

  const filePins = pins.filter((p) => p.file_id === file.id || p.file_id == null)
  const isVideo = file.mime_type.startsWith('video/')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {isVideo ? (
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
      <FileThumbnailStrip
        files={files}
        selectedFileId={file.id}
        onSelect={onSelectFile}
        pins={pins}
      />
    </div>
  )
}
