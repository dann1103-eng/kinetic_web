'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type {
  ReportTemplate,
  ReportTemplateBlock,
  ReportTemplateBlockKind,
  ReportTemplateKind,
} from '@/types/db'

/** Respeta impersonación. */
async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

const SUPPORTED_BLOCK_KINDS: ReportTemplateBlockKind[] = [
  'rich_text',
  'numbered_list',
  // 'recommendations_by_area',  // schema-ready, UI deferred
  // 'categorized_text',         // schema-ready, UI deferred
]

/** Valida la forma de blocks_json. Retorna mensaje de error o null si OK. */
export async function validateBlocks(
  blocks: ReportTemplateBlock[],
): Promise<string | null> {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return 'La plantilla debe tener al menos un bloque.'
  }
  const seenKeys = new Set<string>()
  for (const b of blocks) {
    if (!b.key || !/^[a-z][a-z0-9_]*$/.test(b.key)) {
      return `Cada bloque necesita una "key" válida (minúsculas, sin espacios). Inválido: "${b.key ?? ''}".`
    }
    if (seenKeys.has(b.key)) return `Hay bloques con la misma key: "${b.key}".`
    seenKeys.add(b.key)
    if (!b.label || !b.label.trim()) return `El bloque "${b.key}" no tiene etiqueta.`
    if (!SUPPORTED_BLOCK_KINDS.includes(b.kind)) {
      return `Tipo de bloque no soportado todavía: "${b.kind}" (en bloque "${b.key}").`
    }
    if (typeof b.required !== 'boolean') {
      return `El bloque "${b.key}" no marca "required".`
    }
  }
  return null
}

// ── Lookups ────────────────────────────────────────────────────────────────

export interface ListReportTemplatesOptions {
  kind?: ReportTemplateKind
  serviceType?: string | null
  /** Si true (default), solo plantillas activas. */
  activeOnly?: boolean
  /** Si serviceType viene definido, también incluye las universales (NULL). */
  includeUniversal?: boolean
}

export async function listReportTemplates(
  opts: ListReportTemplatesOptions = {},
): Promise<ReportTemplate[]> {
  const { supabase } = await getActor()
  const activeOnly = opts.activeOnly ?? true

  let query = supabase.from('report_templates').select('*')
  if (opts.kind) query = query.eq('kind', opts.kind)
  if (activeOnly) query = query.eq('active', true)

  // Filtro por service_type:
  //   - serviceType undefined           → no filtrar
  //   - serviceType null + includeUniversal=true → solo universales
  //   - serviceType string + includeUniversal=true → universales + ese servicio
  //   - serviceType string + !includeUniversal → solo ese servicio
  if (opts.serviceType !== undefined) {
    if (opts.serviceType === null) {
      query = query.is('service_type', null)
    } else if (opts.includeUniversal) {
      query = query.or(`service_type.is.null,service_type.eq.${opts.serviceType}`)
    } else {
      query = query.eq('service_type', opts.serviceType)
    }
  }

  query = query.order('name', { ascending: true })

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as ReportTemplate[]
}

export async function getReportTemplate(id: string): Promise<ReportTemplate | null> {
  const { supabase } = await getActor()
  const { data, error } = await supabase
    .from('report_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as ReportTemplate | null) ?? null
}

// ── Mutaciones (admin/directora) ───────────────────────────────────────────

export interface CreateReportTemplateInput {
  name: string
  kind: ReportTemplateKind
  serviceType: string | null
  blocks: ReportTemplateBlock[]
  defaultSignersRole?: string | null
}

export async function createReportTemplate(
  input: CreateReportTemplateInput,
): Promise<{ ok: true; template: ReportTemplate } | { ok: false; error: string }> {
  const { supabase, user } = await getActor()

  if (!input.name?.trim()) return { ok: false, error: 'El nombre es obligatorio.' }
  const blockErr = await validateBlocks(input.blocks)
  if (blockErr) return { ok: false, error: blockErr }

  const { data, error } = await supabase
    .from('report_templates')
    .insert({
      name: input.name.trim(),
      kind: input.kind,
      service_type: input.serviceType,
      blocks_json: input.blocks,
      default_signers_role: input.defaultSignersRole ?? null,
      active: true,
      version: 1,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo crear la plantilla.' }
  }

  revalidatePath('/admin/plantillas')
  return { ok: true, template: data as ReportTemplate }
}

export interface UpdateReportTemplateInput {
  name?: string
  serviceType?: string | null
  blocks?: ReportTemplateBlock[]
  defaultSignersRole?: string | null
}

export async function updateReportTemplate(
  id: string,
  input: UpdateReportTemplateInput,
): Promise<{ ok: true; template: ReportTemplate } | { ok: false; error: string }> {
  const { supabase } = await getActor()

  if (input.blocks) {
    const blockErr = await validateBlocks(input.blocks)
    if (blockErr) return { ok: false, error: blockErr }
  }

  const patch: Partial<Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at'>> = {}
  if (input.name !== undefined) {
    if (!input.name.trim()) return { ok: false, error: 'El nombre no puede estar vacío.' }
    patch.name = input.name.trim()
  }
  if (input.serviceType !== undefined) patch.service_type = input.serviceType
  if (input.blocks !== undefined) patch.blocks_json = input.blocks
  if (input.defaultSignersRole !== undefined) patch.default_signers_role = input.defaultSignersRole

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No hay cambios que guardar.' }
  }

  const { data, error } = await supabase
    .from('report_templates')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'No se pudo actualizar la plantilla.' }
  }

  revalidatePath('/admin/plantillas')
  revalidatePath(`/admin/plantillas/${id}`)
  return { ok: true, template: data as ReportTemplate }
}

export async function toggleReportTemplateActive(
  id: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await getActor()
  const { error } = await supabase
    .from('report_templates')
    .update({ active })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/plantillas')
  return { ok: true }
}
