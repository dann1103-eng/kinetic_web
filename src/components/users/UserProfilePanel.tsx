'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AppUser, UserRole, TherapistWorkScheduleBlock } from '@/types/db'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { updateUserProfile, adminChangeUserPassword, deleteUser } from '@/app/actions/users'
import { updateUserRole } from '@/app/actions/updateUserRole'
import { startImpersonation } from '@/app/actions/impersonation'
import {
  getUserScheduleBlocks,
  getTherapistWeekOccupancy,
  upsertScheduleBlock,
  deleteScheduleBlock,
  setMaxHoursPerWeek,
} from '@/app/actions/therapist-schedules'
import type { WeeklyOccupancy } from '@/lib/domain/therapist-capacity'
import { occupancyToneClasses, formatHoursFraction } from '@/lib/domain/therapist-capacity'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Constants ──────────────────────────────────────────────────────────────

const STAFF_ROLES: { value: UserRole; label: string; chip: string }[] = [
  { value: 'admin',                 label: 'Admin',               chip: 'bg-fm-primary/10 text-fm-primary' },
  { value: 'directora',             label: 'Directora',           chip: 'bg-rose-100 text-rose-700' },
  { value: 'supervisor',            label: 'Supervisor',          chip: 'bg-purple-100 text-purple-700' },
  { value: 'coordinadora_familias', label: 'Coord. Familias',     chip: 'bg-amber-100 text-amber-800' },
  { value: 'coordinadora_terapias', label: 'Coord. Terapias',     chip: 'bg-amber-100 text-amber-800' },
  { value: 'terapista',             label: 'Terapista',           chip: 'bg-sky-100 text-sky-700' },
  { value: 'maestra',               label: 'Maestra',             chip: 'bg-emerald-100 text-emerald-700' },
  { value: 'recepcion',             label: 'Recepción',           chip: 'bg-zinc-100 text-zinc-700' },
  { value: 'contable',              label: 'Contable',            chip: 'bg-zinc-100 text-zinc-700' },
  { value: 'operator',              label: 'Operador (legacy)',   chip: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant' },
]

function roleMeta(role: UserRole) {
  return STAFF_ROLES.find((r) => r.value === role) ?? { label: role, chip: 'bg-fm-on-surface-variant/10 text-fm-on-surface-variant' }
}

const DAYS = [
  { dow: 1, label: 'Lunes' },
  { dow: 2, label: 'Martes' },
  { dow: 3, label: 'Miércoles' },
  { dow: 4, label: 'Jueves' },
  { dow: 5, label: 'Viernes' },
  { dow: 6, label: 'Sábado' },
  { dow: 0, label: 'Domingo' },
]

function trimSeconds(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

// ── Interfaces ─────────────────────────────────────────────────────────────

interface Props {
  user: AppUser
  currentUserId: string
  onClose: () => void
  onUpdated: (patch: Partial<AppUser>) => void
  onDeleted: (id: string) => void
}

type Tab = 'perfil' | 'horario' | 'capacidad'

// ── Tab: Perfil ─────────────────────────────────────────────────────────────

function PerfilTab({
  user,
  currentUserId,
  onUpdated,
  onDeleted,
  onClose,
}: {
  user: AppUser
  currentUserId: string
  onUpdated: (patch: Partial<AppUser>) => void
  onDeleted: (id: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const isCurrentUser = user.id === currentUserId

  // Edit fields
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [email, setEmail] = useState(user.email)
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '')
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()

  // Role
  const [isChangingRole, startRoleTransition] = useTransition()
  const [roleError, setRoleError] = useState<string | null>(null)

  // Password section
  const [showPw, setShowPw] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [isSavingPw, startPwTransition] = useTransition()

  // Delete
  const [isDeleting, startDeleteTransition] = useTransition()

  function handleSaveProfile() {
    if (!fullName.trim() || !email.trim()) {
      setEditError('Nombre y correo son requeridos.')
      return
    }
    setEditError(null)
    startSaveTransition(async () => {
      const payload: { userId: string; fullName?: string; email?: string; avatarUrl?: string | null } = { userId: user.id }
      const nextFullName = fullName.trim()
      const nextEmail = email.trim()
      const nextAvatar = avatarUrl.trim() ? avatarUrl.trim() : null
      if (nextFullName !== (user.full_name ?? '')) payload.fullName = nextFullName
      if (nextEmail !== user.email) payload.email = nextEmail
      if (nextAvatar !== (user.avatar_url ?? null)) payload.avatarUrl = nextAvatar
      const res = await updateUserProfile(payload)
      if (res.error) { setEditError(res.error); return }
      onUpdated({ full_name: nextFullName, email: nextEmail, avatar_url: nextAvatar })
      router.refresh()
    })
  }

  function handleRoleChange(newRole: string | null) {
    if (!newRole || isChangingRole) return
    setRoleError(null)
    startRoleTransition(async () => {
      const res = await updateUserRole(user.id, newRole as UserRole)
      if (res.error) { setRoleError(res.error); return }
      onUpdated({ role: newRole as UserRole })
      router.refresh()
    })
  }

  function handleChangePassword() {
    if (pw.length < 8) { setPwError('Mínimo 8 caracteres.'); return }
    if (pw !== pw2) { setPwError('Las contraseñas no coinciden.'); return }
    setPwError(null)
    startPwTransition(async () => {
      const res = await adminChangeUserPassword({ userId: user.id, newPassword: pw })
      if (res.error) { setPwError(res.error); return }
      setPwSuccess(true)
      setPw(''); setPw2('')
    })
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar la cuenta de ${user.full_name ?? user.email}? Esta acción no se puede deshacer.`)) return
    startDeleteTransition(async () => {
      const res = await deleteUser(user.id)
      if (res.error) { alert(res.error); return }
      onDeleted(user.id)
      onClose()
    })
  }

  const { chip } = roleMeta(user.role)

  return (
    <div className="space-y-5">
      {/* Avatar + info */}
      <div className="flex items-center gap-4 pb-4 border-b border-fm-outline-variant/15">
        <UserAvatar name={user.full_name || user.email} avatarUrl={user.avatar_url} size="lg" />
        <div className="min-w-0">
          <p className="font-bold text-fm-on-surface text-base truncate">{user.full_name ?? user.email}</p>
          <p className="text-xs text-fm-on-surface-variant truncate">{user.email}</p>
          <span className={`inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-xs font-semibold ${chip}`}>
            {roleMeta(user.role).label}
          </span>
        </div>
      </div>

      {/* Edit profile */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Datos personales</p>
        <div>
          <label className="text-xs font-semibold text-fm-on-surface-variant">Nombre</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full border border-fm-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-fm-on-surface-variant">Correo</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-fm-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-fm-on-surface-variant">Avatar URL</label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full border border-fm-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fm-primary/30"
          />
        </div>
        {editError && <p className="text-xs text-fm-error">{editError}</p>}
        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="w-full py-2 rounded-lg bg-fm-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60"
        >
          {isSaving ? 'Guardando…' : 'Guardar datos'}
        </button>
      </div>

      {/* Role + default assignee */}
      <div className="space-y-3 pt-3 border-t border-fm-outline-variant/15">
        <p className="text-xs font-bold uppercase tracking-wider text-fm-on-surface-variant">Configuración</p>
        <div>
          <label className="text-xs font-semibold text-fm-on-surface-variant">Rol</label>
          <div className="mt-1">
            <Select
              value={user.role}
              onValueChange={handleRoleChange}
              disabled={isCurrentUser || isChangingRole}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {roleError && <p className="mt-1 text-xs text-fm-error">{roleError}</p>}
        </div>
      </div>

      {/* Change password */}
      <div className="pt-3 border-t border-fm-outline-variant/15">
        <button
          onClick={() => { setShowPw((v) => !v); setPwSuccess(false); setPwError(null) }}
          className="flex items-center gap-2 text-sm font-semibold text-fm-on-surface-variant hover:text-fm-on-surface"
        >
          <span className="material-symbols-outlined text-base">key</span>
          Cambiar contraseña
          <span className={`material-symbols-outlined text-base transition-transform ${showPw ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>
        {showPw && (
          <div className="mt-3 space-y-2">
            {pwSuccess ? (
              <p className="text-sm text-emerald-700 font-semibold">Contraseña actualizada.</p>
            ) : (
              <>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Nueva contraseña (mín. 8)"
                  className="w-full border border-fm-outline-variant/30 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder="Confirmar contraseña"
                  className="w-full border border-fm-outline-variant/30 rounded-lg px-3 py-2 text-sm"
                />
                {pwError && <p className="text-xs text-fm-error">{pwError}</p>}
                <button
                  onClick={handleChangePassword}
                  disabled={isSavingPw}
                  className="w-full py-2 rounded-lg border border-fm-outline-variant/30 text-sm font-bold text-fm-on-surface hover:bg-fm-background disabled:opacity-60"
                >
                  {isSavingPw ? 'Guardando…' : 'Actualizar contraseña'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-3 border-t border-fm-outline-variant/15 flex flex-col gap-2">
        {user.role !== 'admin' && !isCurrentUser && (
          <form action={startImpersonation.bind(null, user.id)}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100"
            >
              <span className="material-symbols-outlined text-base">visibility</span>
              Ver como {user.full_name?.split(' ')[0]}
            </button>
          </form>
        )}
        {!isCurrentUser && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-base">delete</span>
            {isDeleting ? 'Eliminando…' : 'Eliminar cuenta'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tab: Horario ────────────────────────────────────────────────────────────

function HorarioTab({ user }: { user: AppUser }) {
  const router = useRouter()
  const [blocks, setBlocks] = useState<TherapistWorkScheduleBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [maxHours, setMaxHours] = useState<string>(
    user.max_hours_per_week != null ? String(user.max_hours_per_week) : '',
  )
  const [originalBlockIds, setOriginalBlockIds] = useState<string[]>([])
  const [draftBlocks, setDraftBlocks] = useState<{
    key: string; id?: string; day_of_week: number; start_time: string; end_time: string
  }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getUserScheduleBlocks(user.id).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setBlocks(res.blocks)
        setOriginalBlockIds(res.blocks.map((b) => b.id))
        setDraftBlocks(res.blocks.map((b) => ({
          key: b.id,
          id: b.id,
          day_of_week: b.day_of_week,
          start_time: trimSeconds(b.start_time),
          end_time: trimSeconds(b.end_time),
        })))
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [user.id])

  // Detect dirty state: changes vs original
  const isDirty = (() => {
    if (draftBlocks.length !== originalBlockIds.length) return true
    const origMap = new Map(blocks.map((b) => [b.id, b]))
    for (const d of draftBlocks) {
      if (!d.id) return true
      const orig = origMap.get(d.id)
      if (!orig) return true
      if (trimSeconds(orig.start_time) !== d.start_time) return true
      if (trimSeconds(orig.end_time) !== d.end_time) return true
      if (orig.day_of_week !== d.day_of_week) return true
    }
    const maxFromUser = user.max_hours_per_week != null ? String(user.max_hours_per_week) : ''
    if (maxHours !== maxFromUser) return true
    return false
  })()

  function addBlock(dow: number) {
    setDraftBlocks((prev) => [
      ...prev,
      { key: `new-${dow}-${Date.now()}`, day_of_week: dow, start_time: '08:00', end_time: '12:00' },
    ])
  }

  function updateBlock(key: string, patch: Partial<{ start_time: string; end_time: string }>) {
    setDraftBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)))
  }

  function removeBlock(key: string) {
    setDraftBlocks((prev) => prev.filter((b) => b.key !== key))
  }

  async function handleSave() {
    setError(null)
    setSaveSuccess(false)
    startSaveTransition(async () => {
      const hours = maxHours.trim() === '' ? null : Number(maxHours)
      if (hours != null && Number.isNaN(hours)) { setError('Horas semanales inválidas.'); return }
      const resMax = await setMaxHoursPerWeek(user.id, hours)
      if (!resMax.ok) { setError(resMax.error); return }

      for (const b of draftBlocks) {
        const res = await upsertScheduleBlock({
          id: b.id,
          therapistId: user.id,
          dayOfWeek: b.day_of_week,
          startTime: b.start_time,
          endTime: b.end_time,
        })
        if (!res.ok) { setError(`Bloque ${DAYS.find((d) => d.dow === b.day_of_week)?.label}: ${res.error}`); return }
      }

      const draftIds = new Set(draftBlocks.map((b) => b.id).filter(Boolean))
      const toDelete = originalBlockIds.filter((id) => !draftIds.has(id))
      for (const id of toDelete) {
        const res = await deleteScheduleBlock(id)
        if (!res.ok) { setError(`Error al borrar bloque: ${res.error}`); return }
      }

      // Re-fetch and reset draft to saved state
      const freshRes = await getUserScheduleBlocks(user.id)
      if (freshRes.ok) {
        setBlocks(freshRes.blocks)
        setOriginalBlockIds(freshRes.blocks.map((b) => b.id))
        setDraftBlocks(freshRes.blocks.map((b) => ({
          key: b.id,
          id: b.id,
          day_of_week: b.day_of_week,
          start_time: trimSeconds(b.start_time),
          end_time: trimSeconds(b.end_time),
        })))
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
      router.refresh()
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-fm-on-surface-variant text-sm">
        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
        Cargando horario…
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-2">
      {/* Max hours */}
      <div className="rounded-xl bg-fm-surface-container-low/50 p-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-fm-on-surface-variant mb-1.5">
          Máx. horas semanales (opcional)
        </label>
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={maxHours}
          onChange={(e) => setMaxHours(e.target.value)}
          placeholder="Ej: 40"
          className="w-28 rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1.5 text-sm tabular-nums"
        />
      </div>

      {/* Days */}
      <div className="space-y-2">
        {DAYS.map((day) => {
          const dayBlocks = draftBlocks
            .filter((b) => b.day_of_week === day.dow)
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
          return (
            <div key={day.dow} className="rounded-xl border border-fm-outline-variant/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-fm-on-surface">{day.label}</p>
                <button
                  type="button"
                  onClick={() => addBlock(day.dow)}
                  className="text-xs font-semibold text-fm-primary hover:underline"
                >
                  + Agregar
                </button>
              </div>
              {dayBlocks.length === 0 ? (
                <p className="text-xs italic text-fm-on-surface-variant">No trabaja</p>
              ) : (
                <div className="space-y-2">
                  {dayBlocks.map((b) => (
                    <div key={b.key} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={b.start_time}
                        onChange={(e) => updateBlock(b.key, { start_time: e.target.value })}
                        className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm tabular-nums"
                      />
                      <span className="text-fm-on-surface-variant">–</span>
                      <input
                        type="time"
                        value={b.end_time}
                        onChange={(e) => updateBlock(b.key, { end_time: e.target.value })}
                        className="rounded-md border border-fm-outline-variant/30 bg-white px-2 py-1 text-sm tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => removeBlock(b.key)}
                        className="ml-auto text-fm-error text-xs font-semibold hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Sticky save bar — siempre visible al final del panel */}
      <div className="sticky bottom-0 -mx-5 -mb-4 px-5 py-3 bg-fm-surface-container-lowest border-t border-fm-outline-variant/15 shadow-[0_-4px_8px_-4px_rgba(0,0,0,0.06)]">
        {saveSuccess && !isDirty ? (
          <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-800">
            <span className="material-symbols-outlined text-base">check_circle</span>
            Horario guardado
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-fm-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                Guardando…
              </>
            ) : isDirty ? (
              <>
                <span className="material-symbols-outlined text-base">save</span>
                Guardar cambios
              </>
            ) : (
              'Sin cambios para guardar'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tab: Capacidad ──────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function formatWeekRange(weekStartIso: string): string {
  const start = new Date(weekStartIso)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const startStr = start.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
  })
  const endStr = end.toLocaleDateString('es-SV', { day: 'numeric', month: 'short' })
  return `${startStr} – ${endStr}`
}

function isCurrentWeek(weekStartIso: string): boolean {
  const today = new Date()
  const startToday = new Date(today)
  startToday.setHours(0, 0, 0, 0)
  const dow = startToday.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  startToday.setDate(startToday.getDate() + diff)
  return new Date(weekStartIso).getTime() === startToday.getTime()
}

function CapacidadTab({ user }: { user: AppUser }) {
  const [occupancy, setOccupancy] = useState<WeeklyOccupancy | null>(null)
  const [weekStartIso, setWeekStartIso] = useState<string | null>(null)
  const [referenceDate, setReferenceDate] = useState<Date>(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getTherapistWeekOccupancy(user.id, referenceDate.toISOString()).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setOccupancy(res.data)
        setWeekStartIso(res.weekStartIso)
      } else {
        setError(res.error)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [user.id, referenceDate])

  function navigateWeek(direction: 'prev' | 'next' | 'today') {
    if (direction === 'today') {
      setReferenceDate(new Date())
      return
    }
    const newDate = new Date(referenceDate)
    newDate.setDate(newDate.getDate() + (direction === 'prev' ? -7 : 7))
    setReferenceDate(newDate)
  }

  return (
    <div className="space-y-4">
      {/* Week navigator */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigateWeek('prev')}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-fm-background text-fm-on-surface-variant"
            aria-label="Semana anterior"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => navigateWeek('next')}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-fm-background text-fm-on-surface-variant"
            aria-label="Semana siguiente"
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
          {weekStartIso && (
            <span className="text-xs font-semibold text-fm-on-surface ml-1">
              {formatWeekRange(weekStartIso)}
            </span>
          )}
        </div>
        {weekStartIso && !isCurrentWeek(weekStartIso) && (
          <button
            type="button"
            onClick={() => navigateWeek('today')}
            className="text-xs font-semibold text-fm-primary hover:underline"
          >
            Hoy
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-fm-on-surface-variant text-sm">
          <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
          Cargando ocupación…
        </div>
      ) : error ? (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : occupancy ? (
        <CapacidadContent occupancy={occupancy} />
      ) : null}
    </div>
  )
}

function CapacidadContent({ occupancy }: { occupancy: WeeklyOccupancy }) {
  const tone = occupancyToneClasses(occupancy.occupancyPct, occupancy.totalScheduledMinutes)
  const hasSchedule = occupancy.totalScheduledMinutes > 0

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className={`rounded-xl border-2 px-4 py-3 ${tone.bg} ${tone.text} border-current/20`}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">
              Ocupación semanal
            </p>
            <p className="text-2xl font-bold tabular-nums leading-tight">
              {hasSchedule ? `${occupancy.occupancyPct}%` : '—'}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums opacity-90">
            {formatHoursFraction(occupancy.totalWorkedMinutes, occupancy.totalScheduledMinutes)}
          </p>
        </div>
        {!hasSchedule && (
          <p className="text-xs mt-1 opacity-80">
            Sin horario configurado. Definí bloques laborales en la pestaña Horario.
          </p>
        )}
        {occupancy.overContract && (
          <p className="text-xs mt-1.5 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">priority_high</span>
            Excede {occupancy.maxHoursPerWeek}h/semana configuradas
          </p>
        )}
      </div>

      {/* Por día */}
      {hasSchedule && (
        <div className="rounded-xl border border-fm-outline-variant/20 overflow-hidden">
          <div className="bg-fm-background px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
            Por día (agendado / contractual)
          </div>
          <div className="divide-y divide-fm-outline-variant/10">
            {occupancy.byDay.map((day, idx) => {
              if (day.scheduledMinutes === 0 && day.workedMinutes === 0) return null
              const dayTone = occupancyToneClasses(
                day.scheduledMinutes > 0
                  ? Math.round((day.workedMinutes / day.scheduledMinutes) * 100)
                  : 0,
                day.scheduledMinutes,
              )
              const barPct = day.scheduledMinutes > 0
                ? Math.min(100, Math.round((day.workedMinutes / day.scheduledMinutes) * 100))
                : 0
              return (
                <div key={idx} className="px-3 py-2 flex items-center gap-3">
                  <span className="text-xs font-semibold text-fm-on-surface w-8 shrink-0">
                    {WEEKDAY_LABELS[idx]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="h-2 rounded-full bg-fm-surface-container overflow-hidden">
                      <div
                        className={`h-full ${dayTone.bg} transition-all`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-fm-on-surface-variant shrink-0 w-20 text-right">
                    {formatHoursFraction(day.workedMinutes, day.scheduledMinutes)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex items-center gap-3 text-[10px] text-fm-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          &lt;60% libre
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          60-85% óptimo
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          &gt;85% saturado
        </span>
      </div>
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────

export function UserProfilePanel({
  user,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('perfil')

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'perfil', label: 'Perfil', icon: 'person' },
    { id: 'horario', label: 'Horario', icon: 'schedule' },
    { id: 'capacidad', label: 'Capacidad', icon: 'bar_chart' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-fm-outline-variant/20 shrink-0">
        <h2 className="text-sm font-bold text-fm-on-surface">Perfil del usuario</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-fm-on-surface-variant hover:bg-fm-background transition-colors"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 py-3 border-b border-fm-outline-variant/15 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-fm-primary/10 text-fm-primary'
                : 'text-fm-on-surface-variant hover:bg-fm-background hover:text-fm-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {activeTab === 'perfil' && (
          <PerfilTab
            user={user}
            currentUserId={currentUserId}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
            onClose={onClose}
          />
        )}
        {activeTab === 'horario' && <HorarioTab user={user} />}
        {activeTab === 'capacidad' && <CapacidadTab user={user} />}
      </div>
    </div>
  )
}
