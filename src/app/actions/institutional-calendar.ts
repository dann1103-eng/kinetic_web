'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { InstitutionalClosure, InstitutionalClosureType } from '@/types/db'

export async function listInstitutionalClosures(year?: number): Promise<InstitutionalClosure[]> {
  const supabase = await createClient()
  let q = supabase.from('institutional_calendar').select('*').order('date')
  if (year) {
    q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
  }
  const { data } = await q
  return (data ?? []) as InstitutionalClosure[]
}

export async function addInstitutionalClosure(input: {
  date: string
  type: InstitutionalClosureType
  name: string
  description?: string | null
  all_day?: boolean
  year_recurring?: boolean
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  if (ctx.appUser.role !== 'admin' && ctx.appUser.role !== 'directora') {
    return { ok: false, error: 'Solo admin o directora pueden definir cierres institucionales' }
  }

  if (!input.date || !input.name?.trim()) {
    return { ok: false, error: 'Fecha y nombre son obligatorios' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('institutional_calendar')
    .insert({
      date: input.date,
      type: input.type,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      all_day: input.all_day ?? true,
      year_recurring: input.year_recurring ?? false,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Error desconocido' }
  revalidatePath('/agenda')
  return { ok: true, id: data.id }
}

export async function removeInstitutionalClosure(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  if (ctx.appUser.role !== 'admin') return { ok: false, error: 'Solo admin' }

  const supabase = await createClient()
  const { error } = await supabase.from('institutional_calendar').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/agenda')
  return { ok: true }
}
