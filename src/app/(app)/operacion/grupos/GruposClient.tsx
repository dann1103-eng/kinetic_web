'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  upsertGroup,
  listGroupMembers,
  setGroupMemberDays,
  removeGroupMember,
  generateGroupSessionsForMonth,
  type ProgramGroupWithStaff,
} from '@/app/actions/program-groups'
import type { MorningProgram, ProgramGroupMember } from '@/types/db'

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
      <div className="flex items-center justify-between">
        <p className="text-sm text-fm-on-surface-variant">
          Grupos permanentes de programas matutinos. Los niños entran/salen al
          generar su ciclo mensual.
        </p>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="text-sm px-3 py-1.5 rounded-lg bg-fm-primary text-white font-medium hover:opacity-90"
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

function currentMonthSV(): string {
  // 'YYYY-MM' en zona El Salvador.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function GroupCard({ group, onEdit }: { group: ProgramGroupWithStaff; onEdit: () => void }) {
  const router = useRouter()
  const [showMembers, setShowMembers] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [isGen, startGen] = useTransition()

  function generateSessions() {
    setGenMsg(null)
    startGen(async () => {
      const ym = currentMonthSV()
      const res = await generateGroupSessionsForMonth(group.id, `${ym}-01`)
      if (!res.ok) {
        setGenMsg(res.error)
        return
      }
      setGenMsg(
        res.created > 0
          ? `${res.created} sesión(es) generadas para ${ym}.`
          : `Sin sesiones nuevas para ${ym} (ya estaban generadas).`,
      )
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-fm-outline-variant/20 bg-fm-surface-container-lowest p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-fm-on-surface">
            {group.name}
            {!group.active && (
              <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-600">
                Inactivo
              </span>
            )}
          </h3>
          <p className="text-xs text-fm-on-surface-variant mt-0.5">
            {PROGRAM_LABEL[group.program]} ·{' '}
            {WEEKDAYS.filter((w) => group.meeting_days.includes(w.code)).map((w) => w.label).join(', ')}
            {' · '}
            {group.start_time_local} ({group.duration_minutes} min)
          </p>
          <p className="text-xs text-fm-on-surface-variant mt-0.5">
            Maestra(s):{' '}
            <span className="text-fm-on-surface">
              {group.staff.length > 0 ? group.staff.map((s) => s.full_name).join(', ') : 'sin asignar'}
            </span>
            {' · '}
            {group.member_count} niño(s)
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-fm-primary hover:underline shrink-0"
        >
          Editar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-fm-outline-variant/15 pt-3">
        <button
          type="button"
          onClick={() => setShowMembers((v) => !v)}
          className="text-xs text-fm-primary hover:underline"
        >
          {showMembers ? 'Ocultar miembros' : 'Ver miembros'}
        </button>
        <button
          type="button"
          onClick={generateSessions}
          disabled={isGen}
          className="text-xs text-fm-primary hover:underline disabled:opacity-50"
          title="Crea las sesiones del grupo de este mes (idempotente) para que aparezcan en la agenda y mi-día"
        >
          {isGen ? 'Generando…' : 'Generar sesiones del mes'}
        </button>
        {genMsg && <span className="text-[11px] text-fm-on-surface-variant">{genMsg}</span>}
      </div>

      {showMembers && <MembersList groupId={group.id} onChanged={() => router.refresh()} />}
    </div>
  )
}

function MembersList({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const [members, setMembers] = useState<(ProgramGroupMember & { child_full_name: string })[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, startSave] = useTransition()

  useEffect(() => {
    let cancel = false
    listGroupMembers(groupId).then((m) => {
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
    return <p className="text-xs text-fm-on-surface-variant pt-2">Cargando miembros…</p>
  }
  if (members.length === 0) {
    return (
      <p className="text-xs text-fm-on-surface-variant italic pt-2">
        Sin miembros. Se agregan al generar el ciclo mensual del niño.
      </p>
    )
  }
  return (
    <ul className="space-y-2 pt-2 border-t border-fm-outline-variant/15">
      {members.map((m) => (
        <li key={m.child_id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-fm-on-surface">{m.child_full_name}</span>
          <div className="flex items-center gap-1.5">
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
              Guardar
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
