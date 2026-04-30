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

          {clientMode && diag && diag.totalAssets > diag.visibleAssets && (() => {
            const phaseOk = diag.phase === 'revision_cliente'
            const linkOk = diag.clientUsersRows > 0
            return (
              <div className="mt-4 text-left rounded-xl border border-fm-error/30 bg-fm-error/5 p-3 text-xs space-y-2">
                <p className="font-semibold text-fm-error">Diagnóstico de acceso</p>

                {/* Causa 1: fase incorrecta */}
                <div className={`rounded-lg px-2.5 py-2 border ${phaseOk ? 'border-green-500/30 bg-green-500/5' : 'border-fm-error/40 bg-fm-error/10'}`}>
                  <p className={`font-semibold mb-0.5 ${phaseOk ? 'text-green-700 dark:text-green-400' : 'text-fm-error'}`}>
                    {phaseOk ? '✓' : '✗'} Fase del requerimiento
                  </p>
                  <p className="text-fm-on-surface-variant">
                    Fase actual: <strong>{diag.phase ?? '—'}</strong>
                    {!phaseOk && ' — debe estar en "revision_cliente" para que puedas ver los archivos.'}
                  </p>
                </div>

                {/* Causa 2: vinculación */}
                <div className={`rounded-lg px-2.5 py-2 border ${linkOk ? 'border-green-500/30 bg-green-500/5' : 'border-fm-error/40 bg-fm-error/10'}`}>
                  <p className={`font-semibold mb-0.5 ${linkOk ? 'text-green-700 dark:text-green-400' : 'text-fm-error'}`}>
                    {linkOk ? '✓' : '✗'} Vinculación a esta marca
                  </p>
                  <p className="text-fm-on-surface-variant">
                    Filas en client_users: <strong>{diag.clientUsersRows}</strong>
                    {!linkOk && ' — tu usuario no está vinculado al cliente de este requerimiento.'}
                  </p>
                  {diag.isClientOf !== null && (
                    <p className="text-fm-on-surface-variant mt-0.5">
                      is_client_of(): <strong>{String(diag.isClientOf)}</strong>
                    </p>
                  )}
                </div>

                {/* Conteos */}
                <div className="text-fm-on-surface-variant space-y-0.5 pt-1 border-t border-fm-error/20">
                  <p>Archivos en BD: <strong>{diag.totalAssets}</strong> · Visibles para ti: <strong>{diag.visibleAssets}</strong></p>
                  {diag.authUid && (
                    <p className="text-[10px] break-all">Tu user ID: <code>{diag.authUid}</code></p>
                  )}
                  {diag.clientId && (
                    <p className="text-[10px] break-all">Client ID del req: <code>{diag.clientId}</code></p>
                  )}
                </div>

                {(diag.selfError || diag.adminError) && (
                  <div className="pt-1 border-t border-fm-error/20 space-y-0.5">
                    {diag.selfError && <p className="text-fm-error font-medium">Error sesión: {diag.selfError}</p>}
                    {diag.adminError && <p className="text-fm-error font-medium">Error admin: {diag.adminError}</p>}
                  </div>
                )}

                <p className="text-[10px] text-fm-on-surface-variant pt-1 border-t border-fm-error/20">
                  {!phaseOk
                    ? 'El administrador debe mover el requerimiento a la fase "Revisión cliente" para que puedas acceder.'
                    : !linkOk
                    ? 'El administrador debe vincular tu usuario a esta marca en /users/portal.'
                    : 'Ambas condiciones parecen correctas — contacta al administrador para revisar las políticas de acceso.'}
                </p>
              </div>
            )
          })()}
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
