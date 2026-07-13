'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  upsertGroup,
  listGroupMembersWithAttendance,
  getGroupAttendanceHistory,
  setGroupMemberDays,
  removeGroupMember,
  type ProgramGroupWithStaff,
  type GroupMemberWithAttendance,
  type GroupAttendanceHistory,
} from '@/app/actions/program-groups'
import { UserAvatar } from '@/components/ui/UserAvatar'
import type { MorningProgram, ProgramAttendanceStatus } from '@/types/db'

const WEEKDAYS: { code: string; label: string }[] = [
  { code: 'mon', label: 'Lun' },
  { code: 'tue', label: 'Mar' },
  { code: 'wed', label: 'Mié' },
  { code: 'thu', label: 'Jue' },
  { code: 'fri', label: 'Vie' },
  { code: 'sat', label: 'Sáb' },
  { code: 'sun', label: 'Dom' },
]

const PROGRAM_OPTIONS: { value: MorningProgram; label: string }[] = [
  { value: 'blue_kids', label: 'BlueKids' },
  { value: 'learning_kids', label: 'LearningKids' },
  { value: 'aula_educativa', label: 'Aula Educativa' },
]

const PROGRAM_LABEL: Record<MorningProgram, string> = {
  blue_kids: 'BlueKids',
  learning_kids: 'LearningKids',
  aula_educativa: 'Aula Educativa',
}

const PROGRAM_CHIP: Record<MorningProgram, string> = {
  blue_kids: 'bg-blue-100 text-blue-800',
  learning_kids: 'bg-indigo-100 text-indigo-800',
  aula_educativa: 'bg-emerald-100 text-emerald-800',
}

interface StaffUser {
  id: string
  full_name: string
  role: string
}

interface Props {
  initialGroups: ProgramGroupWithStaff[]
  staffUsers: StaffUser[]
}

export function GruposClient({ initialGroups, staffUsers }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<ProgramGroupWithStaff | 'new' | null>(null)

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fm-on-surface-variant">
          Grupos permanentes de programas matutinos. Los niños entran/salen al
          generar su ciclo mensual; las sesiones del mes se crean solas.
        </p>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="text-sm px-3 py-1.5 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 shrink-0"
        >
          + Nuevo grupo
        </button>
      </div>

      {initialGroups.length === 0 ? (
        <p className="text-sm text-fm-on-surface-variant italic py-8 text-center">
          Aún no hay grupos. Creá el primero.
        </p>
      ) : (
        <div className="space-y-3">
          {initialGroups.map((g) => (
            <GroupCard key={g.id} group={g} onEdit={() => setEditing(g)} />
          ))}
        </div>
      )}

      {editing && (
        <GroupEditor
          group={editing === 'new' ? null : editing}
          staffUsers={staffUsers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/** Avatares apilados de las misses/staff del grupo (patrón overlap). */
function StaffAvatars({ staff }: { staff: ProgramGroupWithStaff['staff'] }) {
  if (staff.length === 0) {
    return <span className="text-xs italic text-fm-on-surface-variant">sin asignar</span>
  }
  return (
    <div className="flex items-center">
      {staff.slice(0, 4).map((s, i) => (
        <span
          key={s.user_id}
          title={s.full_name + (s.is_lead ? ' (líder)' : '')}
          className="block ring-2 ring-fm-surface-container-lowest rounded-full"
          style={{ marginLeft: i === 0 ? 0 : '-8px', zIndex: staff.length - i }}
        >
          <UserAvatar name={s.full_name} avatarUrl={s.avatar_url} size="sm" />
        </span>
      ))}
      {staff.length > 4 && (
        <span className="ml-1 text-[11px] font-bold text-fm-on-surface-variant">+{staff.length - 4}</span>
      )}
    </div>
  )
}

function GroupCard({ group, onEdit }: { group: ProgramGroupWithStaff; onEdit: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const daysLabel = WEEKDAYS.filter((w) => group.meeting_days.includes(w.code))
    .map((w) => w.label)
    .join(', ')

  return (
    <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest overflow-hidden">
      {/* Header — un solo botón para desplegar todo */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-fm-surface-container-low/40 transition-colors"
      >
        <span
          className={`material-symbols-outlined text-fm-on-surface-variant transition-transform ${open ? 'rotate-90' : ''}`}
        >
          chevron_right
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-fm-on-surface truncate">{group.name}</h3>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PROGRAM_CHIP[group.program]}`}>
              {PROGRAM_LABEL[group.program]}
            </span>
            {!group.active && (
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-600">
                Inactivo
              </span>
            )}
          </div>
          <p className="text-xs text-fm-on-surface-variant mt-0.5 truncate">
            {daysLabel || 'sin días'} · {group.start_time_local} ({group.duration_minutes} min)
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StaffAvatars staff={group.staff} />
          <span className="inline-flex items-center gap-1 text-xs font-medium text-fm-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">group</span>
            {group.member_count}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-fm-outline-variant/15 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant">
              Miembros
            </p>
            <button type="button" onClick={onEdit} className="text-xs text-fm-primary hover:underline">
              Editar grupo
            </button>
          </div>
          <MembersList groupId={group.id} onChanged={() => router.refresh()} />
          <AttendanceHistory groupId={group.id} />
        </div>
      )}
    </div>
  )
}

/** Badge de asistencia "X/Y" con tono por %. */
function AttendanceBadge({ present, total, label }: { present: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.round((present / total) * 100) : null
  const tone =
    pct === null
      ? 'bg-fm-surface-container text-fm-on-surface-variant'
      : pct >= 80
        ? 'bg-emerald-100 text-emerald-800'
        : pct >= 50
          ? 'bg-amber-100 text-amber-900'
          : 'bg-rose-100 text-rose-800'
  return (
    <span
      title={label}
      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${tone}`}
    >
      {present}/{total}
      {pct !== null ? ` · ${pct}%` : ''}
    </span>
  )
}

function MembersList({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const [members, setMembers] = useState<GroupMemberWithAttendance[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, startSave] = useTransition()

  useEffect(() => {
    let cancel = false
    listGroupMembersWithAttendance(groupId).then((m) => {
      if (cancel) return
      setMembers(m)
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [groupId])

  function toggleDay(childId: string, code: string) {
    setMembers((prev) =>
      (prev ?? []).map((m) =>
        m.child_id === childId
          ? {
              ...m,
              attendance_days: m.attendance_days.includes(code)
                ? m.attendance_days.filter((d) => d !== code)
                : [...m.attendance_days, code],
            }
          : m,
      ),
    )
  }

  function saveDays(childId: string, days: string[]) {
    startSave(async () => {
      await setGroupMemberDays(groupId, childId, days)
      onChanged()
    })
  }

  function remove(childId: string) {
    startSave(async () => {
      await removeGroupMember(groupId, childId)
      setMembers((prev) => (prev ?? []).filter((m) => m.child_id !== childId))
      onChanged()
    })
  }

  if (loading || members === null) {
    return <p className="text-xs text-fm-on-surface-variant">Cargando miembros…</p>
  }
  if (members.length === 0) {
    return (
      <p className="text-xs text-fm-on-surface-variant italic">
        Sin miembros. Se agregan al generar el ciclo mensual del niño.
      </p>
    )
  }
  return (
    <ul className="space-y-2.5">
      {members.map((m) => (
        <li
          key={m.child_id}
          className="rounded-xl border border-fm-outline-variant/15 bg-fm-surface-container-low/30 px-3 py-2.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <UserAvatar name={m.child_full_name} avatarUrl={null} size="sm" />
              <span className="text-sm font-medium text-fm-on-surface break-words">{m.child_full_name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AttendanceBadge present={m.monthPresent} total={m.monthTotal} label="Asistencia del mes en curso" />
              <span
                className="text-[10px] text-fm-on-surface-variant tabular-nums"
                title="Asistencia acumulada (histórico en el grupo)"
              >
                hist. {m.allPresent}/{m.allTotal}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {WEEKDAYS.map((w) => {
              const active = m.attendance_days.includes(w.code)
              return (
                <button
                  key={w.code}
                  type="button"
                  onClick={() => toggleDay(m.child_id, w.code)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    active
                      ? 'bg-fm-primary text-white border-fm-primary'
                      : 'bg-white text-fm-on-surface-variant border-fm-outline-variant/30'
                  }`}
                >
                  {w.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => saveDays(m.child_id, m.attendance_days)}
              disabled={isSaving}
              className="text-[11px] text-fm-primary hover:underline ml-1 disabled:opacity-50"
            >
              Guardar días
            </button>
            <button
              type="button"
              onClick={() => remove(m.child_id)}
              disabled={isSaving}
              className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
            >
              Quitar
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

const ATT_STATUS_LABEL: Record<ProgramAttendanceStatus | 'unmarked', { label: string; cls: string }> = {
  present: { label: 'Presente', cls: 'text-emerald-700' },
  absent: { label: 'Ausente', cls: 'text-rose-700' },
  excused: { label: 'Justificado', cls: 'text-amber-700' },
  unmarked: { label: 'Sin marcar', cls: 'text-fm-on-surface-variant/60' },
}

function fmtDate(d: string): string {
  const [y, m, dd] = d.split('-').map(Number)
  return new Intl.DateTimeFormat('es-SV', { weekday: 'short', day: '2-digit', month: 'short' }).format(
    new Date(y, m - 1, dd, 12),
  )
}
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('es-SV', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1, 12))
}

function AttendanceHistory({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'session' | 'child'>('session')
  const [data, setData] = useState<GroupAttendanceHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  useEffect(() => {
    if (!open || data) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getGroupAttendanceHistory(groupId, 3).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [open, data, groupId])

  return (
    <div className="border-t border-fm-outline-variant/15 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-fm-on-surface-variant hover:text-fm-on-surface"
      >
        <span className={`material-symbols-outlined text-[16px] transition-transform ${open ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        Histórico de asistencias
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="inline-flex rounded-full border border-fm-outline-variant/30 p-0.5 bg-fm-surface-container-low">
            {(['session', 'child'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                  tab === t ? 'bg-fm-primary text-white' : 'text-fm-on-surface-variant hover:text-fm-on-surface'
                }`}
              >
                {t === 'session' ? 'Por sesión' : 'Por niño'}
              </button>
            ))}
          </div>

          {loading || !data ? (
            <p className="text-xs text-fm-on-surface-variant">Cargando histórico…</p>
          ) : tab === 'session' ? (
            data.bySession.length === 0 ? (
              <p className="text-xs italic text-fm-on-surface-variant">Sin sesiones en los últimos meses.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.bySession.map((s) => (
                  <li key={s.sessionId} className="rounded-lg border border-fm-outline-variant/15">
                    <button
                      type="button"
                      onClick={() => setExpandedSession((prev) => (prev === s.sessionId ? null : s.sessionId))}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-fm-surface-container-low/40"
                    >
                      <span className="text-sm capitalize text-fm-on-surface">{fmtDate(s.date)}</span>
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="text-emerald-700 font-semibold">{s.present} pres.</span>
                        {s.absent > 0 && <span className="text-rose-700">{s.absent} aus.</span>}
                        {s.excused > 0 && <span className="text-amber-700">{s.excused} just.</span>}
                        {s.status !== 'held' && (
                          <span className="text-fm-on-surface-variant/60 italic">sin pasar lista</span>
                        )}
                      </span>
                    </button>
                    {expandedSession === s.sessionId && (
                      <ul className="px-3 pb-2 pt-1 space-y-0.5 border-t border-fm-outline-variant/10">
                        {s.marks.map((mk) => (
                          <li key={mk.childId} className="flex items-center justify-between text-xs">
                            <span className="text-fm-on-surface break-words">{mk.childName}</span>
                            <span className={ATT_STATUS_LABEL[mk.status].cls}>{ATT_STATUS_LABEL[mk.status].label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : data.byChild.length === 0 ? (
            <p className="text-xs italic text-fm-on-surface-variant">Sin niños en el grupo.</p>
          ) : (
            <ul className="space-y-2">
              {data.byChild.map((c) => (
                <li key={c.childId} className="rounded-lg border border-fm-outline-variant/15 px-3 py-2">
                  <p className="text-sm font-medium text-fm-on-surface break-words">{c.childName}</p>
                  {c.months.length === 0 ? (
                    <p className="text-[11px] italic text-fm-on-surface-variant">Sin sesiones registradas.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {c.months.map((mo) => (
                        <span key={mo.month} className="inline-flex items-center gap-1 text-[11px]">
                          <span className="capitalize text-fm-on-surface-variant">{fmtMonth(mo.month)}</span>
                          <AttendanceBadge present={mo.present} total={mo.total} />
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function GroupEditor({
  group,
  staffUsers,
  onClose,
  onSaved,
}: {
  group: ProgramGroupWithStaff | null
  staffUsers: StaffUser[]
  onClose: () => void
  onSaved: () => void
}) {
  const [program, setProgram] = useState<MorningProgram>(group?.program ?? 'blue_kids')
  const [name, setName] = useState(group?.name ?? '')
  const [meetingDays, setMeetingDays] = useState<string[]>(
    group?.meeting_days ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
  )
  const [startTime, setStartTime] = useState(group?.start_time_local ?? '07:30')
  const [duration, setDuration] = useState(group?.duration_minutes ?? 180)
  const [active, setActive] = useState(group?.active ?? true)
  const [staffIds, setStaffIds] = useState<string[]>(group?.staff.map((s) => s.user_id) ?? [])
  const [leadId, setLeadId] = useState<string | null>(
    group?.staff.find((s) => s.is_lead)?.user_id ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  function toggleDay(code: string) {
    setMeetingDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code],
    )
  }
  function toggleStaff(id: string) {
    setStaffIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (!next.includes(id) && leadId === id) setLeadId(null)
      return next
    })
  }

  function handleSave() {
    setError(null)
    startSave(async () => {
      const res = await upsertGroup({
        id: group?.id,
        program,
        name,
        meetingDays,
        startTimeLocal: startTime,
        durationMinutes: duration,
        active,
        staffUserIds: staffIds,
        leadUserId: leadId,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-fm-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg my-8 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-fm-on-surface">
          {group ? 'Editar grupo' : 'Nuevo grupo'}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Programa
            </label>
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value as MorningProgram)}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            >
              {PROGRAM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. BlueKids Mañana A"
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
            Días que se reúne
          </label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => {
              const a = meetingDays.includes(w.code)
              return (
                <button
                  key={w.code}
                  type="button"
                  onClick={() => toggleDay(w.code)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                    a ? 'bg-fm-primary text-white border-fm-primary' : 'bg-white text-fm-on-surface border-fm-outline-variant/30'
                  }`}
                >
                  {w.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Hora de inicio
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
              Duración (min)
            </label>
            <input
              type="number"
              min={30}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-lg border border-fm-outline-variant/30 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wide text-fm-on-surface-variant mb-1">
            Maestras / staff del grupo
          </label>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-fm-outline-variant/20 divide-y divide-fm-outline-variant/10">
            {staffUsers.map((u) => {
              const checked = staffIds.includes(u.id)
              return (
                <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-fm-surface-container-low/40">
                  <input type="checkbox" checked={checked} onChange={() => toggleStaff(u.id)} />
                  <span className="flex-1">{u.full_name}</span>
                  <span className="text-[10px] text-fm-on-surface-variant">{u.role}</span>
                  {checked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        setLeadId(u.id)
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        leadId === u.id ? 'bg-fm-primary text-white' : 'bg-fm-surface-container text-fm-on-surface-variant'
                      }`}
                    >
                      {leadId === u.id ? 'Líder' : 'Hacer líder'}
                    </button>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-fm-on-surface">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm rounded-lg text-fm-on-surface hover:bg-fm-surface-container"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm rounded-lg bg-fm-primary text-white font-medium hover:opacity-90 disabled:opacity-60"
          >
            {isSaving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
