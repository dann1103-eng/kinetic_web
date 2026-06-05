'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'

// ── Foto del niño ─────────────────────────────────────────────────────────────

const PHOTO_BUCKET = 'child-photos'
const PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PHOTO_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

const PHOTO_STAFF_ROLES = [
  'admin', 'directora', 'coordinadora_terapias', 'coordinadora_familias',
  'recepcion', 'terapista', 'maestra', 'contable',
]

type PhotoResult = { ok: true; url: string } | { ok: false; error: string }

export async function uploadChildPhoto(
  formData: FormData,
  childId: string,
): Promise<PhotoResult> {
  const ctx = await getEffectiveUser()
  if (!ctx || !PHOTO_STAFF_ROLES.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permiso.' }
  }

  const file = formData.get('file') as File | null
  if (!file) return { ok: false, error: 'No se recibió archivo.' }
  if (!PHOTO_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Formato no permitido. Usá JPG, PNG o WebP.' }
  }
  if (file.size > PHOTO_MAX_BYTES) return { ok: false, error: 'El archivo supera 5 MB.' }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${childId}/photo.${ext}`

  const admin = createAdminClient()

  // Borrar versiones anteriores (best-effort)
  await admin.storage.from(PHOTO_BUCKET).remove([
    `${childId}/photo.jpg`,
    `${childId}/photo.png`,
    `${childId}/photo.webp`,
  ])

  const { error: uploadErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: { publicUrl } } = admin.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  // Timestamp para forzar re-descarga en el navegador tras reemplazar
  const url = `${publicUrl}?t=${Date.now()}`

  await admin.from('children').update({ photo_url: url }).eq('id', childId)

  revalidatePath('/ninos')
  revalidatePath('/familias', 'layout')

  return { ok: true, url }
}

export async function removeChildPhoto(
  childId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx || !PHOTO_STAFF_ROLES.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permiso.' }
  }

  const admin = createAdminClient()
  await admin.storage.from(PHOTO_BUCKET).remove([
    `${childId}/photo.jpg`,
    `${childId}/photo.png`,
    `${childId}/photo.webp`,
  ])
  await admin.from('children').update({ photo_url: null }).eq('id', childId)

  revalidatePath('/ninos')
  revalidatePath('/familias', 'layout')

  return { ok: true }
}
import type {
  Child,
  DiagnosisCode,
  MorningProgram,
  ReferralSourceType,
} from '@/types/db'

/**
 * Crea un niño dentro de una familia. El código se autoasigna por trigger
 * (function `generate_child_code` en migración 0091).
 */
export async function createChild(input: {
  family_id: string
  full_name: string
  preferred_name?: string | null
  birth_date?: string | null
  gender?: 'M' | 'F' | 'other' | null
  blood_type?: string | null
  allergies_text?: string | null
  medications_text?: string | null
  preferred_hospital?: string | null
  school_name?: string | null
  school_grade?: string | null
  diagnoses_json?: DiagnosisCode[]
  diagnoses_display_text?: string | null
  referral_source_type?: ReferralSourceType | null
  referral_source_id?: string | null
  referral_notes?: string | null
  /** Sub-fase del catálogo intake_phase_catalog (default: '1_1_contacto_inicial'). */
  current_phase_code?: string
  enrolled_program?: MorningProgram | null
  notes?: string | null
}): Promise<{ ok: true; childId: string; code: string } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  const allowed = ['admin', 'supervisor', 'directora', 'coordinadora_familias', 'recepcion', 'contable']
  if (!allowed.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos para registrar niños' }
  }

  if (!input.family_id) return { ok: false, error: 'Falta family_id' }
  if (!input.full_name?.trim()) return { ok: false, error: 'El nombre completo es obligatorio' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('children')
    .insert({
      family_id: input.family_id,
      full_name: input.full_name.trim(),
      preferred_name: input.preferred_name?.trim() || null,
      birth_date: input.birth_date || null,
      gender: input.gender ?? null,
      blood_type: input.blood_type?.trim() || null,
      allergies_text: input.allergies_text?.trim() || null,
      medications_text: input.medications_text?.trim() || null,
      preferred_hospital: input.preferred_hospital?.trim() || null,
      school_name: input.school_name?.trim() || null,
      school_grade: input.school_grade?.trim() || null,
      diagnoses_json: input.diagnoses_json ?? [],
      diagnoses_display_text: input.diagnoses_display_text?.trim() || null,
      referral_source_type: input.referral_source_type ?? null,
      referral_source_id: input.referral_source_id ?? null,
      referral_notes: input.referral_notes?.trim() || null,
      current_phase_code: input.current_phase_code ?? '1_1_contacto_inicial',
      enrolled_program: input.enrolled_program ?? null,
      notes: input.notes?.trim() || null,
      created_by_user_id: ctx.appUser.id,
      // code: se autoasigna por trigger BEFORE INSERT
    })
    .select('id, code')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Error desconocido al crear niño' }
  }

  revalidatePath(`/familias/${input.family_id}`)
  return { ok: true, childId: data.id, code: data.code ?? '' }
}

export async function updateChild(
  childId: string,
  patch: Partial<Omit<Child, 'id' | 'family_id' | 'code' | 'created_at' | 'created_by_user_id' | 'updated_at'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }

  const allowed = ['admin', 'supervisor', 'directora', 'coordinadora_familias', 'contable', 'recepcion']
  if (!allowed.includes(ctx.appUser.role)) {
    return { ok: false, error: 'Sin permisos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('children')
    .update(patch)
    .eq('id', childId)
    .select('family_id')
    .single()

  if (error) return { ok: false, error: error.message }

  if (data?.family_id) {
    revalidatePath(`/familias/${data.family_id}`)
    revalidatePath(`/familias/${data.family_id}/children/${childId}`)
  }
  return { ok: true }
}

// setChildIntakePhase y setChildTreatmentStatus eliminadas en mig 0124.
// Para cambiar la fase de un niño usar `advanceChildPhase` de
// src/app/actions/intake-pipeline.ts — gestiona validación, history,
// cancelación de citas y notificaciones.

export async function deleteChild(
  childId: string,
): Promise<{ ok: true; familyId: string } | { ok: false; error: string }> {
  const ctx = await getEffectiveUser()
  if (!ctx) return { ok: false, error: 'No autenticado' }
  if (ctx.appUser.role !== 'admin') return { ok: false, error: 'Solo admin puede eliminar' }

  const supabase = await createClient()
  const { data: childRow } = await supabase
    .from('children')
    .select('family_id')
    .eq('id', childId)
    .single()

  const { error } = await supabase.from('children').delete().eq('id', childId)
  if (error) return { ok: false, error: error.message }

  if (childRow?.family_id) {
    revalidatePath(`/familias/${childRow.family_id}`)
    return { ok: true, familyId: childRow.family_id }
  }
  redirect('/familias')
}
