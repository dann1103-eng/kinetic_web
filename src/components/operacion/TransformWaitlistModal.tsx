'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { transformWaitlistEntryToFamily } from '@/app/actions/waitlist'
import { SERVICE_TYPE_LABELS, type WaitlistEntry } from '@/types/db'

interface Props {
  entry: WaitlistEntry
  onClose: () => void
}

export function TransformWaitlistModal({ entry, onClose }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showExtra, setShowExtra] = useState(false)

  // Pre-load from entry
  const [primaryName, setPrimaryName] = useState(entry.parent_full_name)
  const [primaryPhone, setPrimaryPhone] = useState(entry.parent_phone ?? '')
  const [primaryEmail, setPrimaryEmail] = useState(entry.parent_email ?? '')
  const [childName, setChildName] = useState(entry.child_full_name)
  const [preferredName, setPreferredName] = useState('')
  const [birthDate, setBirthDate] = useState(entry.child_birthdate ?? '')
  const [gender, setGender] = useState<'M' | 'F' | 'other' | ''>('')
  const [diagnosis, setDiagnosis] = useState(entry.child_diagnosis ?? '')
  // Extra
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyRelation, setEmergencyRelation] = useState('')
  const [familyNotes, setFamilyNotes] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!primaryName.trim()) {
      setError('El nombre del contacto principal es obligatorio.')
      return
    }
    if (!childName.trim()) {
      setError('El nombre del niño es obligatorio.')
      return
    }

    startTransition(async () => {
      const res = await transformWaitlistEntryToFamily({
        entryId: entry.id,
        primaryContactName: primaryName,
        primaryContactPhone: primaryPhone || null,
        primaryContactEmail: primaryEmail || null,
        childFullName: childName,
        preferredName: preferredName || null,
        birthDate: birthDate || null,
        gender: gender || null,
        diagnosesDisplayText: diagnosis || null,
        emergencyContactName: emergencyName || null,
        emergencyContactPhone: emergencyPhone || null,
        emergencyContactRelation: emergencyRelation || null,
        familyNotes: familyNotes || null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/familias/${res.familyId}/children/${res.childId}`)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-2xl bg-fm-background shadow-xl my-8"
      >
        <div className="border-b border-fm-outline-variant/30 px-6 py-4">
          <h2 className="text-lg font-extrabold text-fm-on-surface">
            Convertir en familia y niño
          </h2>
          <p className="text-xs text-fm-on-surface-variant mt-1">
            Datos pre-cargados desde la lista de espera. Editá lo que necesites y guardá. Después podrás
            completar más detalles desde la ficha de la familia.
          </p>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Resumen no editable de la entrada */}
          <div className="rounded-xl bg-fm-surface-container-low border border-fm-outline-variant/30 px-4 py-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold uppercase tracking-wider text-fm-on-surface-variant">
                Entrada de lista de espera
              </span>
              <span className="text-fm-on-surface">
                <strong>Terapia solicitada:</strong>{' '}
                {SERVICE_TYPE_LABELS[entry.requested_service_type] ?? entry.requested_service_type}
              </span>
              {entry.preferred_days && (
                <span className="text-fm-on-surface">
                  <strong>Días preferidos:</strong> {entry.preferred_days}
                </span>
              )}
            </div>
          </div>

          {/* Datos del padre/madre */}
          <section>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-3">
              Contacto principal (padre / madre / tutor)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Nombre completo *"
                value={primaryName}
                onChange={setPrimaryName}
                required
              />
              <Field
                label="Teléfono"
                value={primaryPhone}
                onChange={setPrimaryPhone}
                type="tel"
              />
              <Field
                label="Email"
                value={primaryEmail}
                onChange={setPrimaryEmail}
                type="email"
                wide
              />
            </div>
          </section>

          {/* Datos del niño */}
          <section>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-fm-on-surface-variant mb-3">
              Niño / paciente
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Nombre completo *"
                value={childName}
                onChange={setChildName}
                required
              />
              <Field
                label="Apodo / preferido"
                value={preferredName}
                onChange={setPreferredName}
              />
              <Field
                label="Fecha de nacimiento"
                value={birthDate}
                onChange={setBirthDate}
                type="date"
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                  Sexo
                </span>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as typeof gender)}
                  className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
                >
                  <option value="">No especificado</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                  Diagnóstico / motivo de consulta
                </span>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={2}
                  className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>

          {/* Datos opcionales colapsables */}
          <section>
            <button
              type="button"
              onClick={() => setShowExtra((v) => !v)}
              className="text-xs font-bold text-fm-primary hover:underline"
            >
              {showExtra ? '− Ocultar campos opcionales' : '+ Más campos (contacto de emergencia, notas)'}
            </button>

            {showExtra && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Contacto de emergencia"
                  value={emergencyName}
                  onChange={setEmergencyName}
                />
                <Field
                  label="Teléfono de emergencia"
                  value={emergencyPhone}
                  onChange={setEmergencyPhone}
                  type="tel"
                />
                <Field
                  label="Relación con el niño"
                  value={emergencyRelation}
                  onChange={setEmergencyRelation}
                  placeholder="Ej: abuela, tía"
                />
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
                    Notas internas (familia)
                  </span>
                  <textarea
                    value={familyNotes}
                    onChange={(e) => setFamilyNotes(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}
          </section>

          {error && <p className="text-sm text-fm-error">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-fm-outline-variant/30 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-bold text-fm-on-surface-variant hover:bg-fm-surface-container disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-fm-primary px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>family_restroom</span>
            {pending ? 'Creando…' : 'Crear familia y niño'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
  wide,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  wide?: boolean
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="rounded-lg border border-fm-outline-variant/40 bg-fm-background px-3 py-2 text-sm font-medium"
      />
    </label>
  )
}
