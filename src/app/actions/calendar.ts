'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertNotImpersonating } from './impersonation'

export async function createInternalEvent(input: {
  title: string
  scheduled_at: string
  scheduled_duration_minutes: number
  scheduled_attendees: string[]
  notes?: string
}): Promise<{ error?: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!appUser || !['admin', 'supervisor'].includes(appUser.role)) {
    return { error: 'Sin permisos para crear eventos' }
  }

  // Anti-choque con otros eventos de calendario
  const conflict = await checkSchedulingConflict({
    starts_at: input.scheduled_at,
    duration_minutes: input.scheduled_duration_minutes,
    attendees: input.scheduled_attendees,
  })
  if (conflict) return { error: conflict }

  const scheduledAt = new Date(input.scheduled_at)
  const scheduledEnd = new Date(scheduledAt.getTime() + input.scheduled_duration_minutes * 60 * 1000)

  const { error: insertError } = await supabase
    .from('time_entries')
    .insert({
      user_id: user.id,
      entry_type: 'administrative',
      category: 'reunion_interna',
      phase: 'administrative',
      title: input.title,
      notes: input.notes ?? null,
      // Closed immediately so it doesn't block the one-active-timer constraint
      started_at: scheduledAt.toISOString(),
      ended_at: scheduledEnd.toISOString(),
      duration_seconds: input.scheduled_duration_minutes * 60,
      scheduled_at: input.scheduled_at,
      scheduled_duration_minutes: input.scheduled_duration_minutes,
      scheduled_attendees: input.scheduled_attendees,
    })

  if (insertError) {
    console.error('[createInternalEvent]', insertError)
    return { error: 'Error al crear el evento' }
  }
  revalidatePath('/calendario')
  return {}
}

export async function rescheduleEvent(input: {
  source: 'requirement' | 'time_entry'
  id: string
  new_starts_at: string
}): Promise<{ error?: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!appUser || !['admin', 'supervisor'].includes(appUser.role)) {
    return { error: 'Sin permisos para mover eventos' }
  }

  if (input.source === 'requirement') {
    const { data: req } = await supabase
      .from('requirements')
      .select('id, estimated_time_minutes, assigned_to')
      .eq('id', input.id)
      .single()
    if (!req) return { error: 'Requerimiento no encontrado' }

    const conflict = await checkSchedulingConflict({
      starts_at: input.new_starts_at,
      duration_minutes: req.estimated_time_minutes ?? 60,
      attendees: req.assigned_to ?? [],
      excludeRequirementId: input.id,
    })
    if (conflict) return { error: conflict }

    const { error } = await supabase
      .from('requirements')
      .update({ starts_at: input.new_starts_at })
      .eq('id', input.id)
    if (error) return { error: 'Error al mover el evento' }
  } else {
    const { data: entry } = await supabase
      .from('time_entries')
      .select('id, scheduled_duration_minutes, scheduled_attendees')
      .eq('id', input.id)
      .single()
    if (!entry) return { error: 'Evento no encontrado' }

    const duration = entry.scheduled_duration_minutes ?? 60
    const conflict = await checkSchedulingConflict({
      starts_at: input.new_starts_at,
      duration_minutes: duration,
      attendees: entry.scheduled_attendees ?? [],
      excludeTimeEntryId: input.id,
    })
    if (conflict) return { error: conflict }

    const newStart = new Date(input.new_starts_at)
    const newEnd = new Date(newStart.getTime() + duration * 60 * 1000)

    const { error } = await supabase
      .from('time_entries')
      .update({
        scheduled_at: input.new_starts_at,
        started_at: newStart.toISOString(),
        ended_at: newEnd.toISOString(),
      })
      .eq('id', input.id)
    if (error) return { error: 'Error al mover el evento' }
  }

  revalidatePath('/calendario')
  return {}
}

export async function updateCalendarEvent(input: {
  source: 'requirement' | 'time_entry'
  id: string
  title?: string
  starts_at?: string
  duration_minutes?: number
  attendees?: string[]
  notes?: string | null
}): Promise<{ error?: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!appUser || !['admin', 'supervisor'].includes(appUser.role)) {
    return { error: 'Sin permisos para editar eventos' }
  }

  if (input.source === 'requirement') {
    const { data: req } = await supabase
      .from('requirements')
      .select('id, estimated_time_minutes, assigned_to, starts_at')
      .eq('id', input.id)
      .single()
    if (!req) return { error: 'Requerimiento no encontrado' }

    const newStart = input.starts_at ?? req.starts_at
    const newDuration = input.duration_minutes ?? req.estimated_time_minutes ?? 60
    const newAttendees = input.attendees ?? req.assigned_to ?? []

    if (newStart) {
      const conflict = await checkSchedulingConflict({
        starts_at: newStart,
        duration_minutes: newDuration,
        attendees: newAttendees,
        excludeRequirementId: input.id,
      })
      if (conflict) return { error: conflict }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.starts_at !== undefined) patch.starts_at = input.starts_at
    if (input.duration_minutes !== undefined) patch.estimated_time_minutes = input.duration_minutes
    if (input.attendees !== undefined) patch.assigned_to = input.attendees
    if (input.notes !== undefined) patch.notes = input.notes

    const { error } = await supabase
      .from('requirements')
      .update(patch)
      .eq('id', input.id)
    if (error) return { error: 'Error al actualizar el evento' }
  } else {
    const { data: entry } = await supabase
      .from('time_entries')
      .select('id, scheduled_at, scheduled_duration_minutes, scheduled_attendees')
      .eq('id', input.id)
      .single()
    if (!entry) return { error: 'Evento no encontrado' }

    const newStart = input.starts_at ?? entry.scheduled_at
    const newDuration = input.duration_minutes ?? entry.scheduled_duration_minutes ?? 60
    const newAttendees = input.attendees ?? entry.scheduled_attendees ?? []

    if (newStart) {
      const conflict = await checkSchedulingConflict({
        starts_at: newStart,
        duration_minutes: newDuration,
        attendees: newAttendees,
        excludeTimeEntryId: input.id,
      })
      if (conflict) return { error: conflict }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.notes !== undefined) patch.notes = input.notes
    if (input.attendees !== undefined) patch.scheduled_attendees = input.attendees
    if (input.starts_at !== undefined || input.duration_minutes !== undefined) {
      const startISO = input.starts_at ?? entry.scheduled_at!
      const dur = input.duration_minutes ?? entry.scheduled_duration_minutes ?? 60
      const startD = new Date(startISO)
      patch.scheduled_at = startISO
      patch.started_at = startD.toISOString()
      patch.ended_at = new Date(startD.getTime() + dur * 60 * 1000).toISOString()
      patch.scheduled_duration_minutes = dur
      patch.duration_seconds = dur * 60
    }

    const { error } = await supabase
      .from('time_entries')
      .update(patch)
      .eq('id', input.id)
    if (error) return { error: 'Error al actualizar el evento' }
  }

  revalidatePath('/calendario')
  return {}
}

export async function deleteCalendarEvent(input: {
  source: 'requirement' | 'time_entry'
  id: string
}): Promise<{ error?: string }> {
  await assertNotImpersonating()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!appUser || !['admin', 'supervisor'].includes(appUser.role)) {
    return { error: 'Sin permisos para borrar eventos' }
  }

  if (input.source === 'requirement') {
    // No-destructivo: marca voided=true y limpia starts_at para sacarlo del calendario
    // pero preservar el log y cualquier fase histórica.
    const { error } = await supabase
      .from('requirements')
      .update({
        voided: true,
        voided_by_user_id: user.id,
        voided_at: new Date().toISOString(),
        starts_at: null,
      })
      .eq('id', input.id)
    if (error) return { error: 'Error al borrar el evento' }
  } else {
    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', input.id)
    if (error) return { error: 'Error al borrar el evento' }
  }

  revalidatePath('/calendario')
  return {}
}

async function checkSchedulingConflict(input: {
  starts_at: string
  duration_minutes: number
  attendees: string[]
  excludeRequirementId?: string
  excludeTimeEntryId?: string
}): Promise<string | null> {
  if (input.attendees.length === 0) return null

  const supabase = await createClient()
  const newStart = new Date(input.starts_at)
  const newEnd = new Date(newStart.getTime() + input.duration_minutes * 60 * 1000)

  // Check requirements
  let reqQuery = supabase
    .from('requirements')
    .select('id, title, starts_at, estimated_time_minutes, assigned_to')
    .in('content_type', ['reunion', 'produccion'])
    .eq('voided', false)
    .not('starts_at', 'is', null)
    .overlaps('assigned_to', input.attendees)

  if (input.excludeRequirementId) {
    reqQuery = reqQuery.neq('id', input.excludeRequirementId)
  }

  const { data: reqConflicts } = await reqQuery
  if (reqConflicts) {
    for (const c of reqConflicts) {
      const cStart = new Date(c.starts_at!)
      const cEnd = new Date(cStart.getTime() + (c.estimated_time_minutes ?? 60) * 60 * 1000)
      if (newStart < cEnd && newEnd > cStart) {
        const conflictingIds = (c.assigned_to ?? []).filter((id: string) => input.attendees.includes(id))
        const { data: users } = await supabase
          .from('users').select('id, full_name').in('id', conflictingIds)
        const names = (users ?? []).map(u => u.full_name).join(', ')
        const timeStr = cStart.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
        return `${names} ya ${conflictingIds.length === 1 ? 'está programado' : 'están programados'} para "${c.title || 'otra reunión/producción'}" a las ${timeStr}.`
      }
    }
  }

  // Check time_entries (internal meetings)
  let teQuery = supabase
    .from('time_entries')
    .select('id, title, scheduled_at, scheduled_duration_minutes, scheduled_attendees')
    .eq('entry_type', 'administrative')
    .eq('category', 'reunion_interna')
    .not('scheduled_at', 'is', null)
    .overlaps('scheduled_attendees', input.attendees)

  if (input.excludeTimeEntryId) {
    teQuery = teQuery.neq('id', input.excludeTimeEntryId)
  }

  const { data: teConflicts } = await teQuery
  if (teConflicts) {
    for (const c of teConflicts) {
      const cStart = new Date(c.scheduled_at!)
      const cEnd = new Date(cStart.getTime() + (c.scheduled_duration_minutes ?? 60) * 60 * 1000)
      if (newStart < cEnd && newEnd > cStart) {
        const conflictingIds = (c.scheduled_attendees ?? []).filter((id: string) => input.attendees.includes(id))
        const { data: users } = await supabase
          .from('users').select('id, full_name').in('id', conflictingIds)
        const names = (users ?? []).map(u => u.full_name).join(', ')
        const timeStr = cStart.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
        return `${names} ya ${conflictingIds.length === 1 ? 'está programado' : 'están programados'} para "${c.title || 'reunión interna'}" a las ${timeStr}.`
      }
    }
  }

  return null
}
