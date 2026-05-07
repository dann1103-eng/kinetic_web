'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { JournalCategory } from '@/types/db'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return { supabase, user }
}

function revalidateJournalPaths(childId: string) {
  revalidatePath('/mi-dia')
  revalidatePath(`/familias/${childId}`)
  revalidatePath('/portal/agenda-digital')
}

interface CreateJournalEntryInput {
  childId: string
  category: JournalCategory
  body: string
  visibleToFamily: boolean
  linkedAppointmentId?: string
}

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getAuthUser()

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const isFamily = profile?.role === 'family'

  const category: JournalCategory = isFamily ? 'response' : input.category
  const visibleToFamily = isFamily ? true : input.visibleToFamily

  const { error } = await supabase.from('child_journal_entries').insert({
    child_id: input.childId,
    author_user_id: user.id,
    category,
    body: input.body,
    visible_to_family: visibleToFamily,
    linked_appointment_id: input.linkedAppointmentId ?? null,
  })

  if (error) return { ok: false, error: error.message }

  revalidateJournalPaths(input.childId)
  return { ok: true }
}

export async function toggleJournalEntryVisibility(entryId: string): Promise<
  | { ok: true; visibleToFamily: boolean }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getAuthUser()

  // Single role fetch — used for both family guard and admin check
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'family') {
    return { ok: false, error: 'No autorizado.' }
  }

  const { data: entry, error: fetchError } = await supabase
    .from('child_journal_entries')
    .select('id, visible_to_family, author_user_id, child_id')
    .eq('id', entryId)
    .single()

  if (fetchError || !entry) {
    return { ok: false, error: 'Entrada no encontrada.' }
  }

  const isAdmin = profile?.role === 'admin'

  if (entry.author_user_id !== user.id && !isAdmin) {
    return { ok: false, error: 'Solo puedes cambiar la visibilidad de tus propias entradas.' }
  }

  const newVisibility = !entry.visible_to_family

  const { error: updateError } = await supabase
    .from('child_journal_entries')
    .update({ visible_to_family: newVisibility })
    .eq('id', entryId)

  if (updateError) return { ok: false, error: updateError.message }

  revalidateJournalPaths(entry.child_id)
  return { ok: true, visibleToFamily: newVisibility }
}
