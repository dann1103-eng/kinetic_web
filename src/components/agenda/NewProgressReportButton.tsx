'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { createProgressReport } from '@/app/actions/progress-reports'
import { listReportTemplates } from '@/app/actions/report-templates'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import type { ReportTemplate, ServiceType } from '@/types/db'

interface NewProgressReportButtonProps {
  familyId: string
  childId: string
}

const SERVICE_OPTIONS: ServiceType[] = [
  'lenguaje',
  'motricidad_gruesa',
  'motricidad_fina',
  'sensorial',
  'psicologica',
  'ocupacional',
  'fisica',
  'lectoescritura',
  'funciones_ejecutivas',
  'conductual',
  'otra',
]

/** Default = últimos 4 meses (un cuatrimestre). */
function defaultPeriod(): { starts: string; ends: string } {
  const today = new Date()
  const ends = today.toISOString().slice(0, 10)
  const start = new Date(today)
  start.setMonth(start.getMonth() - 4)
  const starts = start.toISOString().slice(0, 10)
  return { starts, ends }
}

export function NewProgressReportButton({ familyId, childId }: NewProgressReportButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [serviceType, setServiceType] = useState<ServiceType>('lenguaje')
  const initialPeriod = defaultPeriod()
  const [periodStarts, setPeriodStarts] = useState(initialPeriod.starts)
  const [periodEnds, setPeriodEnds] = useState(initialPeriod.ends)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Cargar plantillas filtradas por servicio elegido + universales (NULL).
  useEffect(() => {
    if (!open) return
    setLoadingTemplates(true)
    listReportTemplates({
      kind: 'progress',
      serviceType,
      includeUniversal: true,
      activeOnly: true,
    })
      .then((list) => {
        setTemplates(list)
        // Auto-select: preferir plantilla específica del servicio; si no, la primera.
        const preferred = list.find((t) => t.service_type === serviceType) ?? list[0]
        setTemplateId(preferred?.id ?? '')
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Error cargando plantillas.'
        setError(msg)
      })
      .finally(() => setLoadingTemplates(false))
  }, [open, serviceType])

  const handleCreate = () => {
    setError(null)
    if (periodStarts > periodEnds) {
      setError('La fecha de inicio debe ser anterior a la de fin.')
      return
    }
    if (!templateId) {
      setError('Seleccioná una plantilla.')
      return
    }
    startTransition(async () => {
      const res = await createProgressReport({
        childId,
        serviceType,
        periodStarts,
        periodEnds,
        templateId,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      router.push(`/familias/${familyId}/children/${childId}/informe-avances/${res.report.id}`)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 transition-colors"
      >
        + Nuevo informe de avances
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo informe de avances</DialogTitle>
            <DialogDescription>
              Generá un informe cuatrimestral para una terapia específica del niño/a. Si ya existe uno para
              ese servicio en ese período, se abrirá el existente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1">
                Tipo de terapia
              </label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as ServiceType)}
                className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface"
              >
                {SERVICE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_TYPE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1">
                Plantilla
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={loadingTemplates || templates.length === 0}
                className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface disabled:opacity-50"
              >
                {loadingTemplates && <option>Cargando…</option>}
                {!loadingTemplates && templates.length === 0 && (
                  <option>Sin plantillas disponibles</option>
                )}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.service_type ? '' : ' (universal)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1">
                  Inicio
                </label>
                <input
                  type="date"
                  value={periodStarts}
                  onChange={(e) => setPeriodStarts(e.target.value)}
                  className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1">
                  Fin
                </label>
                <input
                  type="date"
                  value={periodEnds}
                  onChange={(e) => setPeriodEnds(e.target.value)}
                  className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm text-fm-on-surface"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-fm-error/10 px-3 py-2 text-sm text-fm-error">{error}</div>
          )}

          <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/30 p-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-medium text-fm-on-surface-variant hover:bg-fm-surface-container transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Creando…' : 'Crear y editar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
