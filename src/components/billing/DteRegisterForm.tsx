'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { registerDteData } from '@/app/actions/invoices'
import { DTE_TIPO_LABELS, type DteTipo, type Invoice } from '@/types/db'

interface Props {
  invoice: Pick<Invoice,
    | 'id'
    | 'dte_codigo_generacion'
    | 'dte_numero_control'
    | 'dte_sello_recepcion'
    | 'dte_tipo'
    | 'dte_pdf_url'
    | 'dte_received_at'
  >
}

export function DteRegisterForm({ invoice }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(!invoice.dte_codigo_generacion)

  const [codigoGeneracion, setCodigoGeneracion] = useState(invoice.dte_codigo_generacion ?? '')
  const [numeroControl, setNumeroControl] = useState(invoice.dte_numero_control ?? '')
  const [selloRecepcion, setSelloRecepcion] = useState(invoice.dte_sello_recepcion ?? '')
  const [tipo, setTipo] = useState<DteTipo | ''>(invoice.dte_tipo ?? '')
  const [pdfUrl, setPdfUrl] = useState(invoice.dte_pdf_url ?? '')

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await registerDteData({
        invoiceId: invoice.id,
        codigoGeneracion: codigoGeneracion.trim() || null,
        numeroControl: numeroControl.trim() || null,
        selloRecepcion: selloRecepcion.trim() || null,
        tipo: (tipo || null) as DteTipo | null,
        pdfUrl: pdfUrl.trim() || null,
      })
      if ('error' in r) {
        setError(r.error)
      } else {
        setEditing(false)
        router.refresh()
      }
    })
  }

  if (!editing && invoice.dte_codigo_generacion) {
    return (
      <div className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-fm-outline-variant">DTE registrado</p>
          <Button type="button" size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setEditing(true)}>
            Editar
          </Button>
        </div>
        <div className="text-xs text-fm-on-surface-variant space-y-0.5">
          {invoice.dte_tipo && <p><strong className="text-fm-on-surface">Tipo:</strong> {DTE_TIPO_LABELS[invoice.dte_tipo]}</p>}
          <p className="break-all"><strong className="text-fm-on-surface">Código generación:</strong> {invoice.dte_codigo_generacion}</p>
          <p className="break-all"><strong className="text-fm-on-surface">Número de control:</strong> {invoice.dte_numero_control ?? '—'}</p>
          <p className="break-all"><strong className="text-fm-on-surface">Sello recepción:</strong> {invoice.dte_sello_recepcion ?? '—'}</p>
          {invoice.dte_pdf_url && (
            <a href={invoice.dte_pdf_url} target="_blank" rel="noopener noreferrer" className="block text-fm-primary hover:underline mt-1">
              Ver DTE oficial (PDF) →
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="bg-fm-surface-container-lowest rounded-2xl border border-fm-outline-variant/20 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-fm-outline-variant">Registrar DTE</p>
      <p className="text-xs text-fm-on-surface-variant">
        Después de emitir el DTE en n1co, copia los datos aquí para tener trazabilidad.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Tipo de DTE</Label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as DteTipo | '')}
          className="w-full py-1.5 px-2 text-xs bg-fm-background border border-fm-surface-container-high rounded-lg text-fm-on-surface focus:outline-none focus:border-fm-primary"
        >
          <option value="">— Seleccionar —</option>
          {(Object.keys(DTE_TIPO_LABELS) as DteTipo[]).map(k => (
            <option key={k} value={k}>{k} — {DTE_TIPO_LABELS[k]}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Código de generación (UUID)</Label>
        <Input
          value={codigoGeneracion}
          onChange={(e) => setCodigoGeneracion(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="rounded-lg bg-fm-background border-fm-surface-container-high text-xs font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Número de control</Label>
        <Input
          value={numeroControl}
          onChange={(e) => setNumeroControl(e.target.value)}
          placeholder="DTE-01-XXXXXXXX-XXXXXXXXXXXXXXX"
          className="rounded-lg bg-fm-background border-fm-surface-container-high text-xs font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Sello de recepción</Label>
        <Input
          value={selloRecepcion}
          onChange={(e) => setSelloRecepcion(e.target.value)}
          placeholder="Sello recibido del MH"
          className="rounded-lg bg-fm-background border-fm-surface-container-high text-xs font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">URL del PDF (opcional)</Label>
        <Input
          value={pdfUrl}
          onChange={(e) => setPdfUrl(e.target.value)}
          placeholder="https://…"
          className="rounded-lg bg-fm-background border-fm-surface-container-high text-xs"
        />
      </div>

      {error && (
        <p className="text-xs text-fm-error bg-fm-error/5 rounded-lg px-2 py-1.5 border border-fm-error/20">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="flex-1 rounded-xl text-xs text-white" style={{ background: '#00675c' }}>
          {pending ? 'Guardando…' : 'Guardar DTE'}
        </Button>
        {invoice.dte_codigo_generacion && (
          <Button type="button" size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
