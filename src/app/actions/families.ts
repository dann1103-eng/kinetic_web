'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { Family, FamilyStatus } from '@/types/db'

/**
 * Crear una familia nueva.
 * Requiere rol admin / supervisor / directora / coordinadora_familias.
 */
export async function createFamily(input: {
  primary_contact_name: string
  primary_contact_email?: string | null
  primary_contact_phone?: string | null
  secondary_contact_name?: string | null
  secondary_contact_phone?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relation?: string | null
  fiscal_legal_name?: string | null
  fiscal_nit?: string | null
  fiscal_dui?: string | null
  fiscal_address?: string | null
  notes?: string | null
}): Promise<{ ok: true; familyId: string } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  const allowed = ['admin', 'supervisor', 'directora', 'coordinadora_familias']
  if (!allowed.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para crear familias' }
  }

  if (!input.primary_contact_name?.trim()) {
    return { ok: false, error: 'El nombre del contacto principal es obligatorio' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('families')
    .insert({
      primary_contact_name: input.primary_contact_name.trim(),
      primary_contact_email: input.primary_contact_email?.trim() || null,
      primary_contact_phone: input.primary_contact_phone?.trim() || null,
      secondary_contact_name: input.secondary_contact_name?.trim() || null,
      secondary_contact_phone: input.secondary_contact_phone?.trim() || null,
      emergency_contact_name: input.emergency_contact_name?.trim() || null,
      emergency_contact_phone: input.emergency_contact_phone?.trim() || null,
      emergency_contact_relation: input.emergency_contact_relation?.trim() || null,
      fiscal_legal_name: input.fiscal_legal_name?.trim() || null,
      fiscal_nit: input.fiscal_nit?.trim() || null,
      fiscal_dui: input.fiscal_dui?.trim() || null,
      fiscal_address: input.fiscal_address?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by_user_id: ctx.appUser.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Error desconocido al crear familia' }
  }

  revalidatePath('/familias')
  return { ok: true, familyId: data.id }
}

export async function updateFamily(
  familyId: string,
  patch: Partial<Omit<Family, 'id' | 'created_at' | 'created_by_user_id' | 'updated_at'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  const allowed = ['admin', 'supervisor', 'directora', 'coordinadora_familias', 'recepcion', 'contable']
  if (!allowed.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('families').update(patch).eq('id', familyId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/familias')
  revalidatePath(`/familias/${familyId}`)
  return { ok: true }
}

export async function setFamilyStatus(
  familyId: string,
  status: FamilyStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateFamily(familyId, { status })
}

export async function deleteFamily(
  familyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  if (ctx.appUser.role !== 'admin') return { ok: false, error: 'Solo admin puede eliminar' }

  const supabase = await createClient()
  const { error } = await supabase.from('families').delete().eq('id', familyId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/familias')
  redirect('/familias')
}
