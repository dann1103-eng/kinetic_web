'use client'

import { useState, useTransition } from 'react'
import {
  createFamilyUser,
  revokeFamilyUser,
  updateFamilyUserPermissions,
  type FamilyPortalUser,
} from '@/app/actions/familyUsers'

interface FamilyPortalAccessProps {
  familyId: string
  primaryContactName: string
  primaryContactEmail: string | null
  initialUsers: FamilyPortalUser[]
}

/** Genera password aleatorio razonablemente seguro (12 chars). */
function generatePassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(12)
    crypto.getRandomValues(buf)
    for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length]
  } else {
    for (let i = 0; i < 12; i++) {
      out += chars[Math.floor(new Date().getTime() * Math.random()) % chars.length]
    }
  }
  return out
}

export function FamilyPortalAccess({
  familyId,
  primaryContactName,
  primaryContactEmail,
  initialUsers,
}: FamilyPortalAccessProps) {
  const [users, setUsers] = useState(initialUsers)
  const [showForm, setShowForm] = useState(initialUsers.length === 0)
  const [email, setEmail] = useState(primaryContactEmail ?? '')
  const [fullName, setFullName] = useState(primaryContactName ?? '')
  const [password, setPassword] = useState(() => generatePassword())
  const [canBilling, setCanBilling] = useState(true)
  const [canWork, setCanWork] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [createdNotice, setCreatedNotice] = useState<{ email: string; password: string } | null>(null)

  const handleCreate = () => {
    setError(null)
    setCreatedNotice(null)
    startTransition(async () => {
      const res = await createFamilyUser({
        familyId,
        email,
        password,
        fullName: fullName.trim() || undefined,
        canBilling,
        canWork,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setCreatedNotice({ email: email.trim().toLowerCase(), password })
      // Refrescamos lista localmente
      setUsers((prev) => [
        ...prev,
        {
          user_id: res.userId ?? '',
          family_user_id: '',
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          role: 'owner',
          can_billing: canBilling,
          can_work: canWork,
          created_at: new Date().toISOString(),
        },
      ])
      setEmail('')
      setFullName('')
      setPassword(generatePassword())
      setShowForm(false)
    })
  }

  const handleRevoke = (userId: string, userEmail: string) => {
    if (!confirm(`¿Revocar acceso al portal de ${userEmail}?`)) return
    setError(null)
    startTransition(async () => {
      const res = await revokeFamilyUser({ familyId, userId })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setUsers((prev) => prev.filter((u) => u.user_id !== userId))
    })
  }

  const handleTogglePermission = (
    user: FamilyPortalUser,
    field: 'can_billing' | 'can_work',
  ) => {
    const newValue = !user[field]
    const otherField = field === 'can_billing' ? 'can_work' : 'can_billing'
    if (!newValue && !user[otherField]) {
      setError('Cada acceso necesita al menos un permiso activo.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await updateFamilyUserPermissions({
        familyId,
        userId: user.user_id,
        role: user.role,
        canBilling: field === 'can_billing' ? newValue : user.can_billing,
        canWork: field === 'can_work' ? newValue : user.can_work,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setUsers((prev) =>
        prev.map((u) => (u.user_id === user.user_id ? { ...u, [field]: newValue } : u)),
      )
    })
  }

  return (
    <section className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-fm-on-surface">Accesos al portal familia</h2>
          <p className="text-xs text-fm-on-surface-variant mt-0.5">
            Cuentas que pueden ingresar al portal y ver agenda, reportes y facturación de esta familia.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true)
              setError(null)
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 transition-colors"
          >
            + Crear acceso
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-fm-error/10 px-3 py-2 text-sm text-fm-error">{error}</div>
      )}

      {createdNotice && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-4 space-y-2 text-sm">
          <p className="font-semibold text-green-700">Acceso creado correctamente.</p>
          <p className="text-fm-on-surface">
            Pasale estas credenciales a la familia (la contraseña no se vuelve a mostrar):
          </p>
          <div className="font-mono text-xs bg-fm-surface-container px-3 py-2 rounded-lg space-y-1">
            <div>
              <span className="text-fm-on-surface-variant">Email: </span>
              {createdNotice.email}
            </div>
            <div>
              <span className="text-fm-on-surface-variant">Contraseña: </span>
              {createdNotice.password}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreatedNotice(null)}
            className="text-xs text-fm-on-surface-variant hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                placeholder="madre@example.com"
                className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm text-fm-on-surface placeholder:text-fm-on-surface-variant/50 disabled:opacity-60"
              />
            </FormField>
            <FormField label="Nombre completo (opcional)">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isPending}
                placeholder="Verónica Henríquez"
                className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm text-fm-on-surface placeholder:text-fm-on-surface-variant/50 disabled:opacity-60"
              />
            </FormField>
          </div>

          <FormField label="Contraseña inicial">
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                className="flex-1 rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-3 py-2 text-sm font-mono text-fm-on-surface disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                disabled={isPending}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-fm-outline-variant/40 text-fm-on-surface hover:bg-fm-surface-container disabled:opacity-50"
                title="Generar otra"
              >
                ↻
              </button>
            </div>
            <p className="text-[10px] text-fm-on-surface-variant mt-1">
              La familia puede cambiarla cuando ingrese.
            </p>
          </FormField>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
              Permisos
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={canWork}
                onChange={(e) => setCanWork(e.target.checked)}
                disabled={isPending}
                className="rounded"
              />
              <span>Agenda y reportes (clínico)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={canBilling}
                onChange={(e) => setCanBilling(e.target.checked)}
                disabled={isPending}
                className="rounded"
              />
              <span>Facturación y pagos</span>
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-fm-outline-variant/15">
            <button
              type="button"
              onClick={() => setShowForm(false)}
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
              {isPending ? 'Creando…' : 'Crear acceso'}
            </button>
          </div>
        </div>
      )}

      {users.length === 0 && !showForm && (
        <p className="text-sm text-fm-on-surface-variant py-2">
          Esta familia aún no tiene accesos al portal.
        </p>
      )}

      {users.length > 0 && (
        <ul className="divide-y divide-fm-outline-variant/15">
          {users.map((user) => (
            <li key={user.user_id} className="py-3 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fm-on-surface">
                  {user.full_name || user.email}
                </p>
                {user.full_name && (
                  <p className="text-xs text-fm-on-surface-variant">{user.email}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={user.can_work}
                      onChange={() => handleTogglePermission(user, 'can_work')}
                      disabled={isPending}
                      className="rounded"
                    />
                    Agenda
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={user.can_billing}
                      onChange={() => handleTogglePermission(user, 'can_billing')}
                      disabled={isPending}
                      className="rounded"
                    />
                    Facturación
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(user.user_id, user.email)}
                disabled={isPending}
                className="text-xs text-fm-error hover:underline disabled:opacity-50"
              >
                Revocar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
