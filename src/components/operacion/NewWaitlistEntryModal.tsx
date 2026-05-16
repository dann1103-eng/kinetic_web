'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SERVICE_TYPE_LABELS, type ServiceType } from '@/types/db'
import { createWaitlistEntry } from '@/app/actions/waitlist'

interface Props {
  open: boolean
  onClose: () => void
  therapists: { id: string; full_name: string }[]
}

export function NewWaitlistEntryModal({ open, onClose, therapists }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [childFullName, setChildFullName] = useState('')
  const [childBirthdate, setChildBirthdate] = useState('')
  const [childDiagnosis, setChildDiagnosis] = useState('')
  const [parentFullName, setParentFullName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [requestedServiceType, setRequestedServiceType] = useState<ServiceType>('lenguaje')
  const [preferredTherapistId, setPreferredTherapistId] = useState('')
  const [preferredDays, setPreferredDays] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<0 | 1 | 2>(0)

  function reset() {
    setChildFullName('')
    setChildBirthdate('')
    setChildDiagnosis('')
    setParentFullName('')
    setParentPhone('')
    setParentEmail('')
    setRequestedServiceType('lenguaje')
    setPreferredTherapistId('')
    setPreferredDays('')
    setNotes('')
    setPriority(0)
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createWaitlistEntry({
        childFullName,
        childBirthdate: childBirthdate || null,
        childDiagnosis: childDiagnosis || null,
        parentFullName,
        parentPhone,
        parentEmail: parentEmail || null,
        requestedServiceType,
        preferredTherapistId: preferredTherapistId || null,
        preferredDays: preferredDays || null,
        notes: notes || null,
        priority,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      reset()
      router.refresh()
      onClose()
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <header className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-fm-on-surface">Nueva entrada</h3>
            <p className="text-xs text-fm-on-surface-variant mt-1">
              Registrar una familia en espera de cita.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fm-on-surface-variant hover:text-fm-on-surface"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nombre del niño *">
            <input
              type="text"
              value={childFullName}
              onChange={(e) => setChildFullName(e.target.value)}
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Fecha de nacimiento">
            <input
              type="date"
              value={childBirthdate}
              onChange={(e) => setChildBirthdate(e.target.value)}
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Diagnóstico (opcional)" className="md:col-span-2">
            <input
              type="text"
              value={childDiagnosis}
              onChange={(e) => setChildDiagnosis(e.target.value)}
              placeholder="Ej: TEA grado 1"
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="Nombre del padre/madre *">
            <input
              type="text"
              value={parentFullName}
              onChange={(e) => setParentFullName(e.target.value)}
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Teléfono *">
            <input
              type="tel"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="7777-7777"
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Email (opcional)" className="md:col-span-2">
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="Tipo de terapia *">
            <select
              value={requestedServiceType}
              onChange={(e) => setRequestedServiceType(e.target.value as ServiceType)}
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            >
              {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as 0 | 1 | 2)}
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            >
              <option value={0}>Normal</option>
              <option value={1}>Alta</option>
              <option value={2}>Urgente</option>
            </select>
          </Field>

          <Field label="Terapista preferida (opcional)">
            <select
              value={preferredTherapistId}
              onChange={(e) => setPreferredTherapistId(e.target.value)}
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">— Sin preferencia —</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Días/horarios preferidos">
            <input
              type="text"
              value={preferredDays}
              onChange={(e) => setPreferredDays(e.target.value)}
              placeholder="Ej: lunes/miércoles tarde"
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="Notas adicionales" className="md:col-span-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ej: viene referida por la pediatra X…"
              className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm"
            />
          </Field>
        </div>

        {error && (
          <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-fm-outline-variant/20">
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? 'Guardando…' : 'Crear entrada'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
