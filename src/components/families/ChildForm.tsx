'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createChild, updateChild } from '@/app/actions/children'
import { computeChildCodeBase } from '@/lib/domain/child-code'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { useUser } from '@/contexts/UserContext'
import { useDraft } from '@/hooks/useDraft'
import { DraftRestoreBanner, SaveStatusIndicator, OfflineSaveError } from '@/components/ui/DraftAutosave'
import type { Child, DiagnosisCode, MorningProgram } from '@/types/db'

const DIAGNOSIS_OPTIONS: { code: DiagnosisCode; label: string }[] = [
  { code: 'autismo', label: 'Autismo (TEA)' },
  { code: 'tdah', label: 'TDAH' },
  { code: 'altas_capacidades', label: 'Altas capacidades' },
  { code: 'doble_excepcionalidad', label: 'Doble excepcionalidad' },
  { code: 'dificultades_aprendizaje', label: 'Dificultades de aprendizaje' },
  { code: 'trastorno_lenguaje', label: 'Trastorno del lenguaje' },
  { code: 'trastorno_motriz', label: 'Trastorno motriz' },
  { code: 'trastorno_sensorial', label: 'Trastorno sensorial' },
  { code: 'trastorno_neurodesarrollo', label: 'Trastorno del neurodesarrollo' },
  { code: 'otro', label: 'Otro' },
]

const PROGRAM_OPTIONS: { code: MorningProgram; label: string }[] = [
  { code: 'blue_kids', label: 'BlueKids' },
  { code: 'learning_kids', label: 'LearningKids' },
  { code: 'aula_educativa', label: 'Aula Educativa' },
]

interface CreateProps {
  familyId: string
  initialChild?: never
}

interface EditProps {
  initialChild: Child
  familyId?: never
}

type ChildFormProps = CreateProps | EditProps

export function ChildForm({ familyId, initialChild }: ChildFormProps) {
  const isEdit = !!initialChild
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useDialogA11y({
    open,
    onClose: () => !submitting && setOpen(false),
    ref: dialogRef,
  })

  const [form, setForm] = useState({
    full_name: initialChild?.full_name ?? '',
    preferred_name: initialChild?.preferred_name ?? '',
    birth_date: initialChild?.birth_date ?? '',
    gender: (initialChild?.gender ?? '') as '' | 'M' | 'F' | 'other',
    blood_type: initialChild?.blood_type ?? '',
    allergies_text: initialChild?.allergies_text ?? '',
    medications_text: initialChild?.medications_text ?? '',
    preferred_hospital: initialChild?.preferred_hospital ?? '',
    school_name: initialChild?.school_name ?? '',
    school_grade: initialChild?.school_grade ?? '',
    diagnoses_display_text: initialChild?.diagnoses_display_text ?? '',
    enrolled_program: (initialChild?.enrolled_program ?? '') as '' | MorningProgram,
    notes: initialChild?.notes ?? '',
  })
  const [diagnoses, setDiagnoses] = useState<DiagnosisCode[]>(
    initialChild?.diagnoses_json ?? []
  )

  const previewCode = form.full_name.trim() ? computeChildCodeBase(form.full_name) : ''

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value as never }))
  }

  function toggleDiagnosis(code: DiagnosisCode) {
    setDiagnoses((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]))
  }

  // ── Autoguardado local del borrador ──
  const user = useUser()
  const draftValue = useMemo(() => ({ form, diagnoses }), [form, diagnoses])
  const { draft, savedAt, online, clear } = useDraft(
    `child:${initialChild?.id ?? `new:${familyId}`}`,
    draftValue,
    { userId: user.id, serverUpdatedAt: initialChild?.updated_at ?? null, enabled: open },
  )
  const [draftDismissed, setDraftDismissed] = useState(false)
  const [failedOffline, setFailedOffline] = useState(false)
  function applyDraft(d: typeof draftValue) {
    setForm(d.form)
    setDiagnoses(d.diagnoses)
    setDraftDismissed(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFailedOffline(false)
    setSubmitting(true)

    try {
      if (isEdit) {
        const res = await updateChild(initialChild.id, {
          full_name: form.full_name,
          preferred_name: form.preferred_name || null,
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          blood_type: form.blood_type || null,
          allergies_text: form.allergies_text || null,
          medications_text: form.medications_text || null,
          preferred_hospital: form.preferred_hospital || null,
          school_name: form.school_name || null,
          school_grade: form.school_grade || null,
          diagnoses_json: diagnoses,
          diagnoses_display_text: form.diagnoses_display_text || null,
          enrolled_program: form.enrolled_program || null,
          notes: form.notes || null,
        })
        setSubmitting(false)
        if (!res.ok) { setError(res.error); return }
        clear()
        setOpen(false)
        router.refresh()
      } else {
        const res = await createChild({
          family_id: familyId!,
          full_name: form.full_name,
          preferred_name: form.preferred_name || null,
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          blood_type: form.blood_type || null,
          allergies_text: form.allergies_text || null,
          medications_text: form.medications_text || null,
          preferred_hospital: form.preferred_hospital || null,
          school_name: form.school_name || null,
          school_grade: form.school_grade || null,
          diagnoses_json: diagnoses,
          diagnoses_display_text: form.diagnoses_display_text || null,
          enrolled_program: form.enrolled_program || null,
          notes: form.notes || null,
        })
        setSubmitting(false)
        if (!res.ok) { setError(res.error); return }
        clear()
        setOpen(false)
        router.refresh()
      }
    } catch {
      setSubmitting(false)
      setFailedOffline(true)
    }
  }

  return (
    <>
      {isEdit ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
          title="Editar datos del niño/a"
          className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-xl text-fm-on-surface-variant hover:text-fm-primary hover:bg-fm-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center min-h-[44px] gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-fm-tertiary text-fm-on-tertiary hover:bg-fm-tertiary-dim transition-colors"
        >
          + Registrar niño/a
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !submitting && setOpen(false)}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            className="bg-fm-surface-container-lowest text-fm-on-surface w-full max-w-2xl rounded-2xl shadow-xl border border-fm-outline-variant/30 max-h-[90vh] overflow-y-auto"
          >
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 border-b border-fm-outline-variant/20 flex items-center justify-between sticky top-0 bg-fm-surface-container-lowest z-10">
                <h2 id={titleId} className="text-base font-semibold">
                  {isEdit ? 'Editar niño/a' : 'Registrar niño/a'}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  aria-label="Cerrar"
                  className="text-fm-on-surface-variant hover:text-fm-on-surface min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>

              <div className="p-6 space-y-5">
                {draft && !draftDismissed && (
                  <DraftRestoreBanner
                    savedAt={savedAt}
                    onRestore={() => applyDraft(draft)}
                    onDiscard={() => { clear(); setDraftDismissed(true) }}
                  />
                )}
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Identidad</legend>
                  <div>
                    <label className="text-xs font-medium text-fm-on-surface-variant block mb-1">Nombre completo*</label>
                    <input
                      value={form.full_name}
                      onChange={(e) => setField('full_name', e.target.value)}
                      required
                      placeholder="Roberto Andrés Flores Morataya"
                      className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
                    />
                    {!isEdit && previewCode && (
                      <p className="text-[10px] text-fm-on-surface-variant mt-1">Código generado: <span className="font-mono font-semibold">{previewCode}</span> (se asignará un sufijo si está tomado)</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Apodo / nombre como le dicen" value={form.preferred_name} onChange={(v) => setField('preferred_name', v)} placeholder="Andrés" />
                    <Field label="Fecha de nacimiento" type="date" value={form.birth_date} onChange={(v) => setField('birth_date', v)} />
                    <div>
                      <label className="text-xs font-medium text-fm-on-surface-variant block mb-1">Sexo</label>
                      <select value={form.gender} onChange={(e) => setField('gender', e.target.value)} className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary">
                        <option value="">—</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Datos clínicos</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Tipo de sangre" value={form.blood_type} onChange={(v) => setField('blood_type', v)} placeholder="O+" />
                    <Field label="Hospital preferido" value={form.preferred_hospital} onChange={(v) => setField('preferred_hospital', v)} placeholder="Hospital de Diagnóstico" />
                  </div>
                  <Textarea label="Alergias / reacciones a medicamentos" value={form.allergies_text} onChange={(v) => setField('allergies_text', v)} />
                  <Textarea label="Medicamentos actuales" value={form.medications_text} onChange={(v) => setField('medications_text', v)} />
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Escolaridad</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Colegio actual" value={form.school_name} onChange={(v) => setField('school_name', v)} placeholder="Liceo San Luis" />
                    <Field label="Grado" value={form.school_grade} onChange={(v) => setField('school_grade', v)} placeholder="Preparatoria" />
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Diagnósticos</legend>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Diagnósticos del niño">
                    {DIAGNOSIS_OPTIONS.map((opt) => {
                      const active = diagnoses.includes(opt.code)
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleDiagnosis(opt.code)}
                          className={`text-xs min-h-[36px] px-3 py-1 rounded-full border transition-colors ${active ? 'bg-fm-primary/10 border-fm-primary text-fm-primary' : 'bg-fm-surface-container-low border-fm-surface-container-high text-fm-on-surface-variant hover:border-fm-primary/40'}`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  <Field label="Texto custom para mostrar en el header de informes (opcional)" value={form.diagnoses_display_text} onChange={(v) => setField('diagnoses_display_text', v)} placeholder="Doble excepcionalidad: TDAH y Altas Capacidades" />
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Inscripción en programa matutino</legend>
                  <select value={form.enrolled_program} onChange={(e) => setField('enrolled_program', e.target.value)} className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary">
                    <option value="">No inscrito (solo terapias individuales)</option>
                    {PROGRAM_OPTIONS.map((p) => (
                      <option key={p.code} value={p.code}>{p.label}</option>
                    ))}
                  </select>
                </fieldset>

                <Textarea label="Notas internas" value={form.notes} onChange={(v) => setField('notes', v)} />

                {failedOffline && (
                  <OfflineSaveError
                    onRetry={() => handleSubmit({ preventDefault() {} } as React.FormEvent)}
                    retrying={submitting}
                  />
                )}

                {error && <p role="alert" className="text-xs text-fm-error">{error}</p>}
              </div>

              <div className="px-6 py-4 border-t border-fm-outline-variant/20 flex items-center justify-end gap-2 sticky bottom-0 bg-fm-surface-container-lowest z-10">
                <SaveStatusIndicator savedAt={savedAt} online={online} className="mr-auto" />
                <button type="button" onClick={() => setOpen(false)} disabled={submitting} className="min-h-[44px] px-4 py-2 text-sm rounded-xl text-fm-on-surface-variant hover:bg-fm-surface-container">Cancelar</button>
                <button type="submit" disabled={submitting} className="min-h-[44px] px-4 py-2 text-sm rounded-xl bg-fm-primary text-fm-on-primary hover:bg-fm-primary-dim disabled:opacity-50">
                  {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar niño/a'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-fm-on-surface-variant block mb-1">{props.label}</label>
      <input
        id={id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
      />
    </div>
  )
}

function Textarea(props: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-fm-on-surface-variant block mb-1">{props.label}</label>
      <textarea id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)} rows={2} className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary" />
    </div>
  )
}
