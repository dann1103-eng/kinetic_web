import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { CHILD_ATTACHMENT_KIND_LABELS } from '@/types/db'
import type { ChildAttachment, ChildAttachmentKind } from '@/types/db'
import { ChildAttachmentDownloadButton } from '@/components/portal/ChildAttachmentDownloadButton'

export const dynamic = 'force-dynamic'

const KIND_ICONS: Record<ChildAttachmentKind, string> = {
  tarea: 'assignment',
  evaluacion: 'fact_check',
  imagen: 'image',
  informe_adicional: 'description',
  otro: 'attach_file',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function PortalDescargasPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const supabase = await createClient()

  // RLS filtra por family — solo veremos hijos de la familia logueada.
  const { data: childrenRaw } = await supabase
    .from('children')
    .select('id, full_name, preferred_name')
    .order('full_name')

  const children = (childrenRaw ?? []) as {
    id: string
    full_name: string
    preferred_name: string | null
  }[]
  const childNamesById: Record<string, string> = Object.fromEntries(
    children.map((c) => [c.id, c.preferred_name ?? c.full_name]),
  )

  // RLS también filtra: la family solo ve visible_to_family=true para sus
  // niños. Pero filtramos server-side para ser explícitos.
  const { data: attachmentsRaw } = await supabase
    .from('child_attachments')
    .select('*')
    .eq('visible_to_family', true)
    .order('created_at', { ascending: false })

  const attachments = (attachmentsRaw ?? []) as ChildAttachment[]

  // Agrupar por tipo
  const byKind = new Map<ChildAttachmentKind, ChildAttachment[]>()
  for (const att of attachments) {
    const list = byKind.get(att.kind) ?? []
    list.push(att)
    byKind.set(att.kind, list)
  }

  const orderedKinds: ChildAttachmentKind[] = [
    'tarea',
    'imagen',
    'evaluacion',
    'informe_adicional',
    'otro',
  ]

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-extrabold text-fm-on-surface">
          Descargas
        </h1>
        <p className="text-sm text-fm-on-surface-variant">
          Tareas, imágenes, evaluaciones y otros documentos que las terapistas
          comparten contigo. Hacé clic en cualquiera para descargarlo.
        </p>
      </header>

      {attachments.length === 0 && (
        <div className="rounded-2xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest p-8 text-center">
          <span
            className="material-symbols-outlined text-fm-on-surface-variant/60"
            style={{ fontSize: '48px' }}
          >
            inbox
          </span>
          <p className="text-sm text-fm-on-surface-variant mt-2">
            Todavía no hay documentos compartidos.
          </p>
        </div>
      )}

      {orderedKinds.map((kind) => {
        const list = byKind.get(kind)
        if (!list || list.length === 0) return null
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-kp-primary"
                style={{ fontSize: '20px' }}
              >
                {KIND_ICONS[kind]}
              </span>
              <h2 className="text-sm font-semibold text-fm-on-surface uppercase tracking-wider">
                {CHILD_ATTACHMENT_KIND_LABELS[kind]} ({list.length})
              </h2>
            </div>

            <ul className="space-y-2">
              {list.map((att) => {
                const childName = childNamesById[att.child_id] ?? 'Mi niño/a'
                const title = att.title?.trim() || att.file_name
                return (
                  <li
                    key={att.id}
                    className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 flex items-start gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-kp-primary-container/20 flex items-center justify-center flex-shrink-0">
                      <span
                        className="material-symbols-outlined text-kp-primary"
                        style={{ fontSize: '20px' }}
                      >
                        {KIND_ICONS[kind]}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-fm-on-surface truncate">
                        {title}
                      </p>
                      <p className="text-xs text-fm-on-surface-variant mt-0.5">
                        {childName} · {formatDate(att.created_at)}
                        {att.file_size_bytes ? ` · ${formatSize(att.file_size_bytes)}` : ''}
                      </p>
                      {att.description && (
                        <p className="text-xs text-fm-on-surface-variant mt-1.5 line-clamp-2">
                          {att.description}
                        </p>
                      )}
                    </div>

                    <ChildAttachmentDownloadButton attachmentId={att.id} compact />
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
