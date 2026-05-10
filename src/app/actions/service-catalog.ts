'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  ServiceCatalogItem,
  ServiceCategory,
  MorningProgram,
} from '@/types/db'

type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string }

async function requireAdmin(): Promise<{ error: string } | { userId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (appUser?.role !== 'admin') {
    return { error: 'Solo administradores pueden editar el catálogo de tarifas.' }
  }
  return { userId: user.id }
}

export interface ServiceCatalogInput {
  code: string
  category: ServiceCategory
  name: string
  description?: string | null
  unit_price_usd: number
  duration_minutes?: number | null
  morning_program?: MorningProgram | null
  days_per_week?: number | null
  proration_group?: string | null
  applies_from_month?: number | null
  applies_to_month?: number | null
  active?: boolean
  sort_order?: number
  notes?: string | null
}

function validate(input: ServiceCatalogInput): string | null {
  if (!input.code || !/^[a-z0-9_]+$/.test(input.code)) {
    return 'El código debe ser snake_case (a-z, 0-9, _).'
  }
  if (!input.name.trim()) return 'El nombre es obligatorio.'
  if (input.unit_price_usd < 0) return 'El precio no puede ser negativo.'
  if (input.category === 'mensualidad') {
    if (!input.morning_program) return 'Las mensualidades requieren programa.'
    if (!input.days_per_week || input.days_per_week < 1 || input.days_per_week > 7) {
      return 'Días/semana debe estar entre 1 y 7.'
    }
  }
  if (input.proration_group) {
    if (!input.applies_from_month || !input.applies_to_month) {
      return 'Items prorrateados requieren mes de inicio y fin.'
    }
    if (input.applies_from_month > input.applies_to_month) {
      return 'El mes de inicio debe ser ≤ al mes de fin.'
    }
  }
  return null
}

export async function listServiceCatalog(options: {
  includeInactive?: boolean
} = {}): Promise<ActionResult<ServiceCatalogItem[]>> {
  const supabase = await createClient()
  let query = supabase
    .from('service_catalog')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!options.includeInactive) query = query.eq('active', true)

  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as ServiceCatalogItem[] }
}

export async function createServiceCatalogItem(
  input: ServiceCatalogInput,
): Promise<ActionResult<ServiceCatalogItem>> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const validationError = validate(input)
  if (validationError) return { ok: false, error: validationError }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_catalog')
    .insert({
      code: input.code,
      category: input.category,
      name: input.name.trim(),
      description: input.description ?? null,
      unit_price_usd: input.unit_price_usd,
      duration_minutes: input.duration_minutes ?? null,
      morning_program: input.morning_program ?? null,
      days_per_week: input.days_per_week ?? null,
      proration_group: input.proration_group ?? null,
      applies_from_month: input.applies_from_month ?? null,
      applies_to_month: input.applies_to_month ?? null,
      active: input.active ?? true,
      sort_order: input.sort_order ?? 0,
      notes: input.notes ?? null,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `Ya existe un item con código "${input.code}".` }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/tarifas')
  revalidatePath('/billing/invoices/nueva')
  return { ok: true, data: data as ServiceCatalogItem }
}

export async function updateServiceCatalogItem(
  id: string,
  patch: Partial<ServiceCatalogInput>,
): Promise<ActionResult<ServiceCatalogItem>> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No hay cambios para guardar.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_catalog')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/tarifas')
  revalidatePath('/billing/invoices/nueva')
  return { ok: true, data: data as ServiceCatalogItem }
}

export async function setServiceCatalogActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('service_catalog')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/tarifas')
  revalidatePath('/billing/invoices/nueva')
  return { ok: true }
}
