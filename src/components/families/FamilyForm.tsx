'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createFamily, updateFamily } from '@/app/actions/families'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { useUser } from '@/contexts/UserContext'
import { useDraft } from '@/hooks/useDraft'
import { DraftRestoreBanner, SaveStatusIndicator, OfflineSaveError } from '@/components/ui/DraftAutosave'
import type { Family } from '@/types/db'

interface FamilyFormProps {
  /** Si se pasa, el form actúa como editor; si null/undefined, es creación. */
  initialFamily?: Family | null
  /** Texto del botón disparador del modal (solo en modo creación). */
  triggerLabel?: string
}

export function FamilyForm({ initialFamily, triggerLabel = '+ Nueva familia' }: FamilyFormProps) {
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

  const isEdit = !!initialFamily

  const [form, setForm] = useState({
    primary_contact_name: initialFamily?.primary_contact_name ?? '',
    primary_contact_email: initialFamily?.primary_contact_email ?? '',
    primary_contact_phone: initialFamily?.primary_contact_phone ?? '',
    secondary_contact_name: initialFamily?.secondary_contact_name ?? '',
    secondary_contact_phone: initialFamily?.secondary_contact_phone ?? '',
    emergency_contact_name: initialFamily?.emergency_contact_name ?? '',
    emergency_contact_phone: initialFamily?.emergency_contact_phone ?? '',
    emergency_contact_relation: initialFamily?.emergency_contact_relation ?? '',
    fiscal_legal_name: initialFamily?.fiscal_legal_name ?? '',
    fiscal_nit: initialFamily?.fiscal_nit ?? '',
    fiscal_dui: initialFamily?.fiscal_dui ?? '',
    fiscal_address: initialFamily?.fiscal_address ?? '',
    notes: initialFamily?.notes ?? '',
  })

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // ── Autoguardado local del borrador ──
  const user = useUser()
  const { draft, savedAt, online, clear } = useDraft(`family:${initialFamily?.id ?? 'new'}`, form, {
    userId: user.id,
    serverUpdatedAt: initialFamily?.updated_at ?? null,
    enabled: open,
  })
  const [draftDismissed, setDraftDismissed] = useState(false)
  const [failedOffline, setFailedOffline] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFailedOffline(false)
    setSubmitting(true)

    const payload = {
      ...form,
      primary_contact_email: form.primary_contact_email || null,
      primary_contact_phone: form.primary_contact_phone || null,
      secondary_contact_name: form.secondary_contact_name || null,
      secondary_contact_phone: form.secondary_contact_phone || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      emergency_contact_relation: form.emergency_contact_relation || null,
      fiscal_legal_name: form.fiscal_legal_name || null,
      fiscal_nit: form.fiscal_nit || null,
      fiscal_dui: form.fiscal_dui || null,
      fiscal_address: form.fiscal_address || null,
      notes: form.notes || null,
    }

    try {
      const res = isEdit
        ? await updateFamily(initialFamily!.id, payload)
        : await createFamily(payload)

      setSubmitting(false)

      if (!res.ok) {
        setError(res.error)
        return
      }

      clear() // guardado en servidor → descartar borrador local
      setOpen(false)
      if (!isEdit && 'familyId' in res) {
        router.push(`/familias/${res.familyId}`)
      } else {
        router.refresh()
      }
    } catch {
      setSubmitting(false)
      setFailedOffline(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center min-h-[44px] gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-fm-primary text-fm-on-primary hover:bg-fm-primary-dim transition-colors"
      >
        {isEdit ? 'Editar familia' : triggerLabel}
      </button>

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
                <h2 id={titleId} className="text-base font-semibold">{isEdit ? 'Editar familia' : 'Nueva familia'}</h2>
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
                    onRestore={() => { setForm(draft); setDraftDismissed(true) }}
                    onDiscard={() => { clear(); setDraftDismissed(true) }}
                  />
                )}
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Contacto principal</legend>
                  <Field label="Nombre completo (papá / mamá / tutor)*" value={form.primary_contact_name} onChange={(v) => setField('primary_contact_name', v)} required />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Email" type="email" value={form.primary_contact_email} onChange={(v) => setField('primary_contact_email', v)} />
                    <Field label="Teléfono" value={form.primary_contact_phone} onChange={(v) => setField('primary_contact_phone', v)} />
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Contacto secundario (opcional)</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nombre" value={form.secondary_contact_name} onChange={(v) => setField('secondary_contact_name', v)} />
                    <Field label="Teléfono" value={form.secondary_contact_phone} onChange={(v) => setField('secondary_contact_phone', v)} />
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Contacto de emergencia</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Nombre" value={form.emergency_contact_name} onChange={(v) => setField('emergency_contact_name', v)} />
                    <Field label="Teléfono" value={form.emergency_contact_phone} onChange={(v) => setField('emergency_contact_phone', v)} />
                    <Field label="Parentesco" value={form.emergency_contact_relation} onChange={(v) => setField('emergency_contact_relation', v)} placeholder="Abuelo, tía…" />
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant">Datos fiscales (para facturación)</legend>
                  <Field label="Razón social" value={form.fiscal_legal_name} onChange={(v) => setField('fiscal_legal_name', v)} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="NIT" value={form.fiscal_nit} onChange={(v) => setField('fiscal_nit', v)} />
                    <Field label="DUI" value={form.fiscal_dui} onChange={(v) => setField('fiscal_dui', v)} />
                  </div>
                  <Field label="Dirección fiscal" value={form.fiscal_address} onChange={(v) => setField('fiscal_address', v)} />
                </fieldset>

                <fieldset>
                  <label className="text-xs font-semibold uppercase tracking-wide text-fm-on-surface-variant block mb-1">Notas internas</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    rows={3}
                    className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
                  />
                </fieldset>

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
                  {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear familia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; placeholder?: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-fm-on-surface-variant block mb-1">{props.label}</label>
      <input
        id={id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        placeholder={props.placeholder}
        className="w-full text-sm px-3 py-2 bg-fm-background border border-fm-surface-container-high rounded-xl focus:outline-none focus:border-fm-primary"
      />
    </div>
  )
}
