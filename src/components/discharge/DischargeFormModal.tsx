'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createDischargeDraft,
  updateDischargeDraft,
  signDischargeAsTherapist,
  signDischargeAsDirectora,
  sendDischargeToFamily,
  listDischargeRecordsForChild,
} from '@/app/actions/discharge-records'
import { advanceChildPhase } from '@/app/actions/intake-pipeline'
import { useUser } from '@/contexts/UserContext'
import {
  DISCHARGE_TYPE_LABELS,
  type ChildDischargeRecord,
  type DischargeType,
  type IntakePhaseCatalogEntry,
} from '@/types/db'

interface Props {
  childId: string
  childName: string
  dischargeType: DischargeType
  phaseCatalog: IntakePhaseCatalogEntry[]
  onClose: () => void
}

/**
 * Modal de alta o retiro. Flujo:
 *   1. Al abrir, busca el draft activo del niño para ese tipo, o crea uno nuevo.
 *   2. Mientras está `draft`: editable (objetivos, recomendaciones, plan, motivo).
 *   3. Botón "Firmar como terapista" → solo la terapista principal o admin.
 *   4. Botón "Firmar como directora" → solo directora/admin. Al firmar status='signed'.
 *   5. Botón "Enviar a familia" → status='sent_to_family' + avanzar fase del niño al código terminal.
 */
export function DischargeFormModal({
  childId,
  childName,
  dischargeType,
  phaseCatalog,
  onClose,
}: Props) {
  const router = useRouter()
  const user = useUser()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [record, setRecord] = useState<ChildDischargeRecord | null>(null)

  const [objectives, setObjectives] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [reason, setReason] = useState('')

  const isAlta = dischargeType === 'alta'
  const canDirectora = ['admin', 'directora'].includes(user.role)
  const isEditable = !record || record.status === 'draft'

  // Cargar o crear draft al abrir
  useEffect(() => {
    let cancelled = false
    async function load() {
      const existing = await listDischargeRecordsForChild(childId)
      const active = existing.find(
        (r) => r.discharge_type === dischargeType && r.status !== 'sent_to_family',
      )
      if (active) {
        if (cancelled) return
        setRecord(active)
        setObjectives(active.objectives_achieved ?? '')
        setRecommendations(active.recommendations ?? '')
        setFollowUp(active.follow_up_plan ?? '')
        setReason(active.discharge_reason ?? '')
        return
      }
      // No existe — crear nuevo draft
      const res = await createDischargeDraft({ childId, discharge_type: dischargeType })
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRecord(res.data)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [childId, dischargeType])

  function handleSaveDraft() {
    if (!record) return
    setError(null)
    startTransition(async () => {
      const res = await updateDischargeDraft(record.id, {
        objectives_achieved: objectives.trim() || null,
        recommendations: recommendations.trim() || null,
        follow_up_plan: followUp.trim() || null,
        discharge_reason: reason.trim() || null,
      })
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function handleSignTherapist() {
    if (!record) return
    setError(null)
    startTransition(async () => {
      // Persist current edits first
      const upd = await updateDischargeDraft(record.id, {
        objectives_achieved: objectives.trim() || null,
        recommendations: recommendations.trim() || null,
        follow_up_plan: followUp.trim() || null,
        discharge_reason: reason.trim() || null,
      })
      if (!upd.ok) {
        setError(upd.error)
        return
      }
      const res = await signDischargeAsTherapist(record.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRecord({
        ...record,
        signed_by_therapist_id: user.id,
        signed_by_therapist_name: user.full_name,
        signed_by_therapist_at: new Date().toISOString(),
      })
    })
  }

  function handleSignDirectora() {
    if (!record) return
    setError(null)
    startTransition(async () => {
      const res = await signDischargeAsDirectora(record.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRecord({
        ...record,
        signed_by_directora_id: user.id,
        signed_by_directora_name: user.full_name,
        signed_by_directora_at: new Date().toISOString(),
        status: 'signed',
      })
    })
  }

  function handleSendToFamily() {
    if (!record) return
    setError(null)
    startTransition(async () => {
      const res = await sendDischargeToFamily(record.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Avanzar al niño a la fase terminal correspondiente
      const targetCode = isAlta ? '5_1_alta_terapeutica' : '5_2_retirado'
      const phase = phaseCatalog.find((p) => p.code === targetCode)
      if (phase) {
        await advanceChildPhase(childId, targetCode, `Cierre confirmado al enviar a familia.`, {
          confirmCancelAppointments: true,
        })
      }
      router.refresh()
      onClose()
    })
  }

  if (error && !record) {
    return (
      <Modal title={`${DISCHARGE_TYPE_LABELS[dischargeType]} · ${childName}`} onClose={onClose}>
        <p className="text-sm text-fm-error">{error}</p>
      </Modal>
    )
  }

  if (!record) {
    return (
      <Modal title={`${DISCHARGE_TYPE_LABELS[dischargeType]} · ${childName}`} onClose={onClose}>
        <p className="text-sm italic text-fm-on-surface-variant">Cargando…</p>
      </Modal>
    )
  }

  const therapistSigned = !!record.signed_by_therapist_id
  const directoraSigned = !!record.signed_by_directora_id

  return (
    <Modal title={`${DISCHARGE_TYPE_LABELS[dischargeType]} · ${childName}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Snapshot */}
        <div className="rounded-xl border border-fm-outline-variant/20 bg-fm-surface-container-low p-3 text-xs">
          <p>
            <strong>Sesiones asistidas:</strong> {record.total_sessions_attended ?? 0}
          </p>
          <p>
            <strong>% Asistencia:</strong> {record.attendance_rate_pct?.toFixed(0) ?? 0}%
          </p>
          <p>
            <strong>Reposiciones:</strong> {record.total_replacements ?? 0}
          </p>
          <p className="italic text-fm-on-surface-variant mt-1">
            Calculado al crear el draft. No se actualiza después.
          </p>
        </div>

        {/* Editable fields */}
        <Field
          label="Objetivos alcanzados"
          value={objectives}
          onChange={setObjectives}
          disabled={!isEditable || isPending}
          rows={4}
        />
        <Field
          label="Recomendaciones"
          value={recommendations}
          onChange={setRecommendations}
          disabled={!isEditable || isPending}
          rows={3}
        />
        <Field
          label="Plan de seguimiento"
          value={followUp}
          onChange={setFollowUp}
          disabled={!isEditable || isPending}
          rows={3}
        />
        {!isAlta && (
          <Field
            label="Motivo del retiro"
            value={reason}
            onChange={setReason}
            disabled={!isEditable || isPending}
            rows={2}
            placeholder="Ej: cambio de centro, mudanza, decisión familiar…"
          />
        )}

        {/* Firmas */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-fm-outline-variant/20">
          <SignatureBlock
            label="Terapista"
            signedName={record.signed_by_therapist_name}
            signedAt={record.signed_by_therapist_at}
          />
          <SignatureBlock
            label="Directora"
            signedName={record.signed_by_directora_name}
            signedAt={record.signed_by_directora_at}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-fm-error/10 px-3 py-2 text-sm text-fm-error">
            {error}
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2 justify-end pt-2 border-t border-fm-outline-variant/20">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cerrar
          </button>
          {isEditable && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSaveDraft}
              className="px-3 py-1.5 text-sm rounded-lg border border-fm-outline-variant/40 text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-50"
            >
              Guardar borrador
            </button>
          )}
          {isEditable && !therapistSigned && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSignTherapist}
              className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:bg-fm-primary/90 disabled:opacity-50"
            >
              Firmar como terapista
            </button>
          )}
          {therapistSigned && !directoraSigned && canDirectora && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSignDirectora}
              className="px-3 py-1.5 text-sm rounded-lg bg-fm-primary text-white font-semibold hover:bg-fm-primary/90 disabled:opacity-50"
            >
              Firmar como directora
            </button>
          )}
          {record.status === 'signed' && (
            <>
              <a
                href={`/api/discharge/${record.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm rounded-lg border border-fm-primary text-fm-primary font-semibold hover:bg-fm-primary/5"
              >
                Descargar PDF
              </a>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSendToFamily}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                Enviar a familia
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-fm-on-surface">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-fm-on-surface-variant hover:text-fm-on-surface"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  rows?: number
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-fm-on-surface-variant block mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm text-fm-on-surface placeholder:text-fm-on-surface-variant/50 disabled:bg-fm-surface-container disabled:text-fm-on-surface-variant"
      />
    </div>
  )
}

function SignatureBlock({
  label,
  signedName,
  signedAt,
}: {
  label: string
  signedName: string | null
  signedAt: string | null
}) {
  return (
    <div className="text-xs">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
        {label}
      </p>
      {signedName ? (
        <>
          <p className="font-semibold text-fm-on-surface mt-0.5">{signedName}</p>
          {signedAt && (
            <p className="text-[10px] text-emerald-700 italic">
              ✓ Firmado · {new Date(signedAt).toLocaleDateString('es-SV')}
            </p>
          )}
        </>
      ) : (
        <p className="italic text-fm-on-surface-variant">Sin firma</p>
      )}
    </div>
  )
}
