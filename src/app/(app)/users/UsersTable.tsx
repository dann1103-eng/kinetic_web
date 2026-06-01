'use client'

import { useState, useTransition } from 'react'
import type { AppUser, UserRole } from '@/types/db'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { createUser } from '@/app/actions/users'
import { UserProfilePanel } from '@/components/users/UserProfilePanel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Constants ──────────────────────────────────────────────────────────────

// Catálogo completo (incluye legacy para resolver chips de users existentes).
const STAFF_ROLES: { value: UserRole; label: string; chip: string }[] = [
  { value: 'admin',                 label: 'Admin',               chip: 'bg-fm-primary/10 text-fm-primary' },
  { value: 'directora',             label: 'Directora',           chip: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300' },
  { value: 'supervisor',            label: 'Supervisor',          chip: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300' },
  { value: 'coordinadora_familias', label: 'Coord. Familias',     chip: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200' },
  { value: 'coordinadora_terapias', label: 'Coord. Terapias',     chip: 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200' },
  { value: 'terapista',             label: 'Terapista',           chip: 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300' },
  { value: 'maestra',               label: 'Maestra',             chip: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
  { value: 'recepcion',             label: 'Recepción',           chip: 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300' },
  { value: 'contable',              label: 'Contable',            chip: 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300' },
  { value: 'operator',              label: 'Operador (legacy)',   chip: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant' },
]

// Roles asignables al CREAR un usuario nuevo. Excluye legacy/deprecated.
const DEPRECATED_ROLES: UserRole[] = ['supervisor', 'operator', 'maestra']
const SELECTABLE_ROLES = STAFF_ROLES.filter((r) => !DEPRECATED_ROLES.includes(r.value))

function roleMeta(role: UserRole) {
  return STAFF_ROLES.find((r) => r.value === role) ?? { label: role, chip: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant' }
}

// ── Create user modal ──────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (user: AppUser) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('terapista')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      setError('Todos los campos son requeridos.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await createUser({ email: email.trim(), password, fullName: fullName.trim(), role })
      if (res.error) { setError(res.error); return }
      onCreated({
        id: crypto.randomUUID(),
        email: email.trim(),
        full_name: fullName.trim(),
        role,
        created_at: new Date().toISOString(),
        avatar_url: null,
        default_assignee: false,
        current_session_id: null,
        can_quote: false,
        max_hours_per_week: null,
        monthly_salary_usd: null,
        hourly_rate_usd: null,
        contract_type: 'sin_contrato',
        in_normal_payroll: false,
        in_professional_services_payroll: false,
        dui: null,
        isss_number: null,
        afp_number: null,
        afp_provider: null,
        hire_date: null,
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-fm-surface-container-lowest rounded-[2rem] p-8 w-full max-w-md space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-fm-on-surface">Nuevo usuario</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-fm-background text-fm-on-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-fm-on-surface-variant uppercase tracking-wide">Nombre completo</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Ana García"
              className="mt-1.5 w-full border border-fm-surface-container-high rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-fm-on-surface-variant uppercase tracking-wide">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ana@kinetic.sv"
              className="mt-1.5 w-full border border-fm-surface-container-high rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-fm-on-surface-variant uppercase tracking-wide">Contraseña inicial</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="mt-1.5 w-full border border-fm-surface-container-high rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-fm-on-surface-variant uppercase tracking-wide">Rol</label>
            <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
              <SelectTrigger className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] text-fm-on-surface-variant">
              Para cuentas de familias usá <b>Usuarios portal</b>, no este formulario.
            </p>
          </div>
        </div>

        {error && <p className="text-xs text-fm-error font-semibold">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-fm-surface-container-high rounded-full text-sm font-bold text-fm-on-surface-variant hover:bg-fm-background"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 py-2.5 bg-fm-primary text-white rounded-full text-sm font-bold hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── User card ──────────────────────────────────────────────────────────────

function UserCard({
  user,
  isCurrentUser,
  isSelected,
  onClick,
}: {
  user: AppUser
  isCurrentUser: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const { chip } = roleMeta(user.role)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 transition-all duration-150 ${
        isSelected
          ? 'border-fm-primary/40 bg-fm-primary/5 shadow-sm'
          : 'border-fm-outline-variant/20 bg-fm-surface-container-lowest hover:border-fm-outline-variant/40 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <UserAvatar name={user.full_name || user.email} avatarUrl={user.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-fm-on-surface truncate">
              {user.full_name ?? user.email}
            </p>
            {isCurrentUser && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-fm-primary bg-fm-primary/10 px-1.5 py-0.5 rounded-full">
                Tú
              </span>
            )}
          </div>
          <p className="text-xs text-fm-on-surface-variant truncate mt-0.5">{user.email}</p>
          <span className={`inline-flex mt-1.5 items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip}`}>
            {roleMeta(user.role).label}
          </span>
        </div>
        <span className="material-symbols-outlined text-base text-fm-outline mt-1 shrink-0">
          chevron_right
        </span>
      </div>
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface UsersTableProps {
  users: AppUser[]
  currentUserId: string
}

export function UsersTable({ users: initialUsers, currentUserId }: UsersTableProps) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const selectedUser = users.find((u) => u.id === selectedId) ?? null

  // Group by role category for display
  const managementRoles: UserRole[] = ['admin', 'directora', 'supervisor']
  const coordRoles: UserRole[] = ['coordinadora_familias', 'coordinadora_terapias', 'recepcion', 'contable']
  const therapistRoles: UserRole[] = ['terapista', 'maestra']

  const groups = [
    { label: 'Dirección y administración', users: users.filter((u) => managementRoles.includes(u.role)) },
    { label: 'Coordinación y recepción',   users: users.filter((u) => coordRoles.includes(u.role)) },
    { label: 'Terapistas y maestras',      users: users.filter((u) => therapistRoles.includes(u.role)) },
    { label: 'Otros',                      users: users.filter((u) => !managementRoles.includes(u.role) && !coordRoles.includes(u.role) && !therapistRoles.includes(u.role)) },
  ].filter((g) => g.users.length > 0)

  return (
    <>
      <div className="flex gap-6 items-start">
        {/* ── Left: Team list ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">
              {users.length} {users.length === 1 ? 'persona' : 'personas'} en el equipo
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-fm-primary text-white font-bold rounded-full hover:opacity-90 transition-all text-sm"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              Crear usuario
            </button>
          </div>

          {/* Groups */}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant mb-2">
                {group.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.users.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    isCurrentUser={user.id === currentUserId}
                    isSelected={user.id === selectedId}
                    onClick={() => setSelectedId((prev) => (prev === user.id ? null : user.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Right: Profile panel ─────────────────────────────────── */}
        {selectedUser && (
          <div className="w-[380px] shrink-0 sticky top-20 h-[calc(100vh-6rem)] rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest shadow-lg overflow-hidden flex flex-col">
            <UserProfilePanel
              user={selectedUser}
              currentUserId={currentUserId}
              onClose={() => setSelectedId(null)}
              onUpdated={(patch) =>
                setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, ...patch } : u)))
              }
              onDeleted={(id) => {
                setUsers((prev) => prev.filter((u) => u.id !== id))
                setSelectedId(null)
              }}
            />
          </div>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(user) => setUsers((prev) => [...prev, user])}
        />
      )}
    </>
  )
}
