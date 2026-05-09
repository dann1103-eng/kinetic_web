'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type {
  ReportTemplate,
  ReportTemplateBlock,
  ReportTemplateBlockKind,
  ReportTemplateKind,
} from '@/types/db'
import { SERVICE_TYPE_LABELS } from '@/types/db'
import {
  createReportTemplate,
  updateReportTemplate,
} from '@/app/actions/report-templates'

const SUPPORTED_KINDS: { value: ReportTemplateBlockKind; label: string; help: string }[] = [
  { value: 'rich_text', label: 'Texto libre', help: 'Una caja de texto multilínea.' },
  { value: 'numbered_list', label: 'Lista numerada', help: 'Lista de items con add/remove.' },
]

const SERVICE_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: 'Universal (cualquier terapia)' },
  ...Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v })),
]

interface Props {
  mode: 'create' | 'edit'
  template?: ReportTemplate
}

function emptyBlock(): ReportTemplateBlock {
  return {
    key: '',
    label: '',
    description: '',
    required: false,
    kind: 'rich_text',
    placeholder: '',
  }
}

export function TemplateEditor({ mode, template }: Props) {
  const router = useRouter()
  const [name, setName] = useState(template?.name ?? '')
  const [kind] = useState<ReportTemplateKind>(template?.kind ?? 'progress')
  const [serviceType, setServiceType] = useState<string | null>(template?.service_type ?? null)
  const [blocks, setBlocks] = useState<ReportTemplateBlock[]>(
    template?.blocks_json ?? [emptyBlock()],
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function updateBlock(idx: number, patch: Partial<ReportTemplateBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }
  function addBlock() {
    setBlocks((prev) => [...prev, emptyBlock()])
  }
  function removeBlock(idx: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== idx))
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function onSubmit() {
    setError(null)
    startTransition(async () => {
      // Strip empty optional fields
      const cleanedBlocks: ReportTemplateBlock[] = blocks.map((b) => ({
        key: b.key.trim(),
        label: b.label.trim(),
        description: b.description?.trim() || undefined,
        required: b.required,
        kind: b.kind,
        placeholder: b.placeholder?.trim() || undefined,
      }))

      const result = mode === 'create'
        ? await createReportTemplate({
            name,
            kind,
            serviceType,
            blocks: cleanedBlocks,
          })
        : await updateReportTemplate(template!.id, {
            name,
            serviceType,
            blocks: cleanedBlocks,
          })

      if (!result.ok) {
        setError(result.error)
        return
      }

      router.push('/admin/plantillas')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* ── Header form ────────────────────────────────────── */}
      <div className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-fm-on-surface-variant mb-1">
            Nombre de la plantilla
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Ej: "Informe — Lenguaje"'
            className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fm-on-surface-variant mb-1">
            Aplica a
          </label>
          <select
            value={serviceType ?? ''}
            onChange={(e) => setServiceType(e.target.value || null)}
            className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
          >
            {SERVICE_OPTIONS.map((opt) => (
              <option key={opt.value ?? '__null__'} value={opt.value ?? ''}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Blocks repeater ────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fm-on-surface">Bloques</h2>
          <button
            type="button"
            onClick={addBlock}
            className="text-xs text-fm-primary hover:underline"
          >
            + Agregar bloque
          </button>
        </div>
        {blocks.map((b, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fm-on-surface-variant">
                Bloque #{idx + 1}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveBlock(idx, -1)}
                  disabled={idx === 0}
                  className="text-xs px-2 py-1 rounded text-fm-on-surface-variant hover:bg-fm-surface-container disabled:opacity-30"
                  title="Subir"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(idx, 1)}
                  disabled={idx === blocks.length - 1}
                  className="text-xs px-2 py-1 rounded text-fm-on-surface-variant hover:bg-fm-surface-container disabled:opacity-30"
                  title="Bajar"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(idx)}
                  disabled={blocks.length === 1}
                  className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-30"
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-fm-on-surface-variant mb-1">
                  Key (interna, sin espacios)
                </label>
                <input
                  type="text"
                  value={b.key}
                  onChange={(e) => updateBlock(idx, { key: e.target.value })}
                  placeholder="ej: seguimiento"
                  className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-fm-on-surface-variant mb-1">
                  Etiqueta (visible)
                </label>
                <input
                  type="text"
                  value={b.label}
                  onChange={(e) => updateBlock(idx, { label: e.target.value })}
                  placeholder="ej: Seguimiento"
                  className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-fm-on-surface-variant mb-1">
                  Tipo
                </label>
                <select
                  value={b.kind}
                  onChange={(e) =>
                    updateBlock(idx, { kind: e.target.value as ReportTemplateBlockKind })
                  }
                  className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
                >
                  {SUPPORTED_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-sm text-fm-on-surface">
                  <input
                    type="checkbox"
                    checked={b.required}
                    onChange={(e) => updateBlock(idx, { required: e.target.checked })}
                    className="rounded border-fm-outline-variant/40"
                  />
                  Obligatorio para enviar
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-fm-on-surface-variant mb-1">
                Descripción (ayuda al terapista)
              </label>
              <input
                type="text"
                value={b.description ?? ''}
                onChange={(e) => updateBlock(idx, { description: e.target.value })}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-fm-on-surface-variant mb-1">
                Placeholder (ejemplo de qué escribir)
              </label>
              <textarea
                value={b.placeholder ?? ''}
                onChange={(e) => updateBlock(idx, { placeholder: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      {/* ── Sticky save bar ────────────────────────────────── */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-fm-surface/95 backdrop-blur border-t border-fm-outline-variant/20 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/admin/plantillas')}
          className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          disabled={isPending}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending}
          className="rounded-lg bg-fm-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? 'Guardando…' : mode === 'create' ? 'Crear plantilla' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
