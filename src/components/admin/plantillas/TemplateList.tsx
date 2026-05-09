'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { ReportTemplate } from '@/types/db'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import { toggleReportTemplateActive } from '@/app/actions/report-templates'

interface Props {
  templates: ReportTemplate[]
}

export function TemplateList({ templates: initial }: Props) {
  const [templates, setTemplates] = useState(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function onToggle(id: string, active: boolean) {
    setPendingId(id)
    startTransition(async () => {
      const result = await toggleReportTemplateActive(id, active)
      if (result.ok) {
        setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, active } : t)))
      } else {
        alert(result.error)
      }
      setPendingId(null)
    })
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-fm-outline-variant/40 p-8 text-center">
        <p className="text-sm text-fm-on-surface-variant">
          Todavía no hay plantillas. Creá la primera con el botón de arriba.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-fm-outline-variant/20 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-fm-surface-container-low">
          <tr className="text-left text-fm-on-surface-variant">
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Servicio</th>
            <th className="px-4 py-3 font-medium text-center">Bloques</th>
            <th className="px-4 py-3 font-medium text-center">Activa</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="border-t border-fm-outline-variant/20">
              <td className="px-4 py-3 font-medium text-fm-on-surface">{t.name}</td>
              <td className="px-4 py-3 text-fm-on-surface-variant">
                {t.service_type
                  ? SERVICE_TYPE_LABELS[t.service_type as keyof typeof SERVICE_TYPE_LABELS] ?? t.service_type
                  : 'Universal'}
              </td>
              <td className="px-4 py-3 text-center text-fm-on-surface-variant">
                {Array.isArray(t.blocks_json) ? t.blocks_json.length : 0}
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => onToggle(t.id, !t.active)}
                  disabled={pendingId === t.id}
                  className={`text-xs px-2 py-1 rounded-md ${
                    t.active
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                  } disabled:opacity-50`}
                >
                  {t.active ? 'Activa' : 'Inactiva'}
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/plantillas/${t.id}`}
                  className="text-xs text-fm-primary hover:underline"
                >
                  Editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
