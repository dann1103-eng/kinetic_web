'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  createFamilyUserMulti,
  setFamilyUserAssignments,
  revokeFamilyUserCompletely,
  type FamilyPortalUserGlobal,
} from '@/app/actions/familyUsers'

interface FamilyOption {
  id: string
  primary_contact_name: string
  primary_contact_email: string | null
  status: string
}

interface UsuariosPortalClientProps {
  initialUsers: FamilyPortalUserGlobal[]
  families: FamilyOption[]
}

type Mode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; user: FamilyPortalUserGlobal }

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

export function UsuariosPortalClient({
  initialUsers,
  families,
}: UsuariosPortalClientProps) {
  const [users, setUsers] = useState(initialUsers)
  const [mode, setMode] = useState<Mode>({ kind: 'closed' })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [createdNotice, setCreatedNotice] = useState<{ email: string; password: string } | null>(
    null,
  )

  // Form state
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([])
  const [canBilling, setCanBilling] = useState(true)
  const [canWork, setCanWork] = useState(true)
  const [familySearch, setFamilySearch] = useState('')

  function openCreate() {
    setMode({ kind: 'create' })
    setEmail('')
    setFullName('')
    setPassword(generatePassword())
    setSelectedFamilyIds([])
    setCanBilling(true)
    setCanWork(true)
    setFamilySearch('')
    setError(null)
    setCreatedNotice(null)
  }

  function openEdit(user: FamilyPortalUserGlobal) {
    setMode({ kind: 'edit', user })
    setEmail(user.email)
    setFullName(user.full_name)
    setPassword('')
    setSelectedFamilyIds(user.families.map((f) => f.id))
    const first = user.families[0]
    setCanBilling(first?.can_billing ?? true)
    setCanWork(first?.can_work ?? true)
    setFamilySearch('')
    setError(null)
    setCreatedNotice(null)
  }

  function close() {
    setMode({ kind: 'closed' })
    setError(null)
  }

  function toggleFamily(id: string) {
    setSelectedFamilyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        u.families.some((f) => f.primary_contact_name.toLowerCase().includes(q)),
    )
  }, [users, search])

  const filteredFamilies = useMemo(() => {
    const q = familySearch.trim().toLowerCase()
    if (!q) return families
    return families.filter(
      (f) =>
        f.primary_contact_name.toLowerCase().includes(q) ||
        f.primary_contact_email?.toLowerCase().includes(q),
    )
  }, [families, familySearch])

  function handleSubmit() {
    setError(null)

    if (mode.kind === 'create') {
      if (!email.trim() || !password || selectedFamilyIds.length === 0) {
        setError('Email, contraseña y al menos una familia son obligatorios.')
        return
      }
      startTransition(async () => {
        const res = await createFamilyUserMulti({
          email,
          password,
          fullName: fullName.trim() || undefined,
          familyIds: selectedFamilyIds,
          canBilling,
          canWork,
        })
        if (!res.ok) {
          setError(res.error)
          return
        }
        setCreatedNotice({ email: email.trim().toLowerCase(), password })
        // Refrescar lista localmente
        setUsers((prev) => [
          ...prev,
          {
            user_id: res.userId ?? '',
            email: email.trim().toLowerCase(),
            full_name: fullName.trim(),
            families: selectedFamilyIds.map((fid) => {
              const fam = families.find((f) => f.id === fid)
              return {
                id: fid,
                primary_contact_name: fam?.primary_contact_name ?? fid,
                role: 'owner' as const,
                can_billing: canBilling,
                can_work: canWork,
              }
            }),
          },
        ])
        setMode({ kind: 'closed' })
      })
      return
    }

    if (mode.kind === 'edit') {
      const userId = mode.user.user_id
      startTransition(async () => {
        const res = await setFamilyUserAssignments({
          userId,
          familyIds: selectedFamilyIds,
          canBilling,
          canWork,
        })
        if (!res.ok) {
          setError(res.error)
          return
        }
        setUsers((prev) =>
          prev.map((u) =>
            u.user_id === userId
              ? {
                  ...u,
                  families: selectedFamilyIds.map((fid) => {
                    const existing = u.families.find((f) => f.id === fid)
                    const fam = families.find((f) => f.id === fid)
                    return {
                      id: fid,
                      primary_contact_name:
                        existing?.primary_contact_name ?? fam?.primary_contact_name ?? fid,
                      role: existing?.role ?? 'owner',
                      can_billing: canBilling,
                      can_work: canWork,
                    }
                  }),
                }
              : u,
          ),
        )
        setMode({ kind: 'closed' })
      })
    }
  }

  function handleRevoke(user: FamilyPortalUserGlobal) {
    if (!confirm(`¿Eliminar completamente el acceso de ${user.email}?`)) return
    setError(null)
    startTransition(async () => {
      const res = await revokeFamilyUserCompletely(user.user_id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id))
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-fm-on-surface-variant">
          {users.length} usuario{users.length === 1 ? '' : 's'} con acceso al portal familia.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="px-3 py-2 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 transition-colors"
        >
          + Crear acceso
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por email, nombre o familia…"
        className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-lowest px-4 py-2 text-sm"
      />

      {error && mode.kind === 'closed' && (
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

      {filteredUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-fm-outline-variant/40 bg-fm-surface-container-low/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-fm-on-surface">
            {users.length === 0
              ? 'Aún no hay usuarios del portal familia.'
              : 'Ningún usuario coincide con la búsqueda.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredUsers.map((user) => (
            <li
              key={user.user_id}
              className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fm-on-surface">
                    {user.full_name || user.email}
                  </p>
                  {user.full_name && (
                    <p className="text-xs text-fm-on-surface-variant">{user.email}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {user.families.length === 0 ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-fm-error/10 text-fm-error">
                        Sin familias asignadas
                      </span>
                    ) : (
                      user.families.map((f) => (
                        <span
                          key={f.id}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-fm-primary/10 text-fm-primary"
                          title={`${f.can_work ? 'Agenda ✓' : 'Agenda ✗'} · ${
                            f.can_billing ? 'Facturación ✓' : 'Facturación ✗'
                          }`}
                        >
                          {f.primary_contact_name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(user)}
                    className="text-xs font-medium text-fm-primary hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevoke(user)}
                    className="text-xs font-medium text-fm-error hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Modal sencillo (overlay) */}
      {mode.kind !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-fm-surface-container-lowest border border-fm-outline-variant/30 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-fm-on-surface">
                {mode.kind === 'create' ? 'Crear acceso al portal' : `Editar acceso de ${mode.user.email}`}
              </h3>
              <button
                type="button"
                onClick={close}
                className="text-xs text-fm-on-surface-variant hover:underline"
                disabled={isPending}
              >
                Cerrar
              </button>
            </div>

            {mode.kind === 'create' && (
              <>
                <FormField label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isPending}
                    placeholder="madre@example.com"
                    className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm"
                  />
                </FormField>
                <FormField label="Nombre completo (opcional)">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isPending}
                    placeholder="Verónica Henríquez"
                    className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm"
                  />
                </FormField>
                <FormField label="Contraseña inicial">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isPending}
                      className="flex-1 rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setPassword(generatePassword())}
                      disabled={isPending}
                      className="px-3 py-2 rounded-xl text-xs font-medium border border-fm-outline-variant/40 hover:bg-fm-surface-container disabled:opacity-50"
                      title="Generar otra"
                    >
                      ↻
                    </button>
                  </div>
                </FormField>
              </>
            )}

            <FormField label={`Familias asignadas (${selectedFamilyIds.length})`}>
              <input
                type="search"
                value={familySearch}
                onChange={(e) => setFamilySearch(e.target.value)}
                placeholder="Filtrar familias…"
                className="w-full rounded-xl border border-fm-outline-variant/30 bg-fm-surface-container-low px-3 py-2 text-sm mb-2"
              />
              <div className="max-h-48 overflow-y-auto rounded-xl border border-fm-outline-variant/30 divide-y divide-fm-outline-variant/15">
                {filteredFamilies.length === 0 ? (
                  <p className="text-xs text-fm-on-surface-variant px-3 py-3">
                    No hay familias que coincidan.
                  </p>
                ) : (
                  filteredFamilies.map((fam) => (
                    <label
                      key={fam.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-fm-surface-container-low"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFamilyIds.includes(fam.id)}
                        onChange={() => toggleFamily(fam.id)}
                        disabled={isPending}
                        className="rounded"
                      />
                      <span className="flex-1 truncate">{fam.primary_contact_name}</span>
                      {fam.primary_contact_email && (
                        <span className="text-[10px] text-fm-on-surface-variant truncate">
                          {fam.primary_contact_email}
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </FormField>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fm-on-surface-variant">
                Permisos (aplican a todas las familias seleccionadas)
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

            {error && (
              <div className="rounded-lg bg-fm-error/10 px-3 py-2 text-sm text-fm-error">{error}</div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-fm-outline-variant/15">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-sm font-medium text-fm-on-surface-variant hover:bg-fm-surface-container transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-fm-primary text-white hover:bg-fm-primary/90 disabled:opacity-50 transition-colors"
              >
                {isPending
                  ? 'Guardando…'
                  : mode.kind === 'create'
                    ? 'Crear acceso'
                    : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
