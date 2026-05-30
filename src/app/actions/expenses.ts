'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { ExpenseCategory, GeneralExpense, UserRole } from '@/types/db'

const EXPENSE_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

async function getActor() {
  const supabase = await createClient()
  const ctx = await getEffectiveUser()
  if (!ctx) throw new Error('No autenticado')
  return { supabase, user: { id: ctx.appUser.id, role: ctx.appUser.role } }
}

function canManageExpenses(role: UserRole): boolean {
  return EXPENSE_ROLES.includes(role)
}

export interface ExpenseInput {
  category: ExpenseCategory
  subcategory?: string | null
  description?: string | null
  amountUsd: number
  expenseDate: string             // YYYY-MM-DD
  paymentMethod?: string | null
  provider?: string | null
  invoiceReference?: string | null
  notes?: string | null
}

export async function createExpense(
  input: ExpenseInput,
): Promise<{ ok: true; expense: GeneralExpense } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!canManageExpenses(user.role)) return { ok: false, error: 'No autorizado.' }
  if (input.amountUsd <= 0) return { ok: false, error: 'El monto debe ser mayor que cero.' }
  if (!input.expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)) {
    return { ok: false, error: 'Fecha inválida.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('general_expenses')
    .insert({
      category: input.category,
      subcategory: input.subcategory?.trim() || null,
      description: input.description?.trim() || null,
      amount_usd: input.amountUsd,
      expense_date: input.expenseDate,
      payment_method: input.paymentMethod?.trim() || null,
      provider: input.provider?.trim() || null,
      invoice_reference: input.invoiceReference?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by_user_id: user.id,
    })
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'No se pudo crear el gasto.' }

  revalidatePath('/reportes/egresos')
  revalidatePath('/dashboard')
  return { ok: true, expense: data as GeneralExpense }
}

export async function updateExpense(
  expenseId: string,
  patch: Partial<ExpenseInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!canManageExpenses(user.role)) return { ok: false, error: 'No autorizado.' }

  const update: Partial<{
    category: ExpenseCategory
    subcategory: string | null
    description: string | null
    amount_usd: number
    expense_date: string
    payment_method: string | null
    provider: string | null
    invoice_reference: string | null
    notes: string | null
  }> = {}
  if (patch.category !== undefined) update.category = patch.category
  if (patch.subcategory !== undefined) update.subcategory = patch.subcategory?.trim() || null
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.amountUsd !== undefined) {
    if (patch.amountUsd <= 0) return { ok: false, error: 'El monto debe ser mayor que cero.' }
    update.amount_usd = patch.amountUsd
  }
  if (patch.expenseDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.expenseDate)) return { ok: false, error: 'Fecha inválida.' }
    update.expense_date = patch.expenseDate
  }
  if (patch.paymentMethod !== undefined) update.payment_method = patch.paymentMethod?.trim() || null
  if (patch.provider !== undefined) update.provider = patch.provider?.trim() || null
  if (patch.invoiceReference !== undefined) update.invoice_reference = patch.invoiceReference?.trim() || null
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null

  if (Object.keys(update).length === 0) return { ok: false, error: 'No hay cambios.' }

  const admin = createAdminClient()
  const { error } = await admin.from('general_expenses').update(update).eq('id', expenseId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/reportes/egresos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteExpense(
  expenseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await getActor()
  if (!canManageExpenses(user.role)) return { ok: false, error: 'No autorizado.' }

  const admin = createAdminClient()
  const { error } = await admin.from('general_expenses').delete().eq('id', expenseId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/reportes/egresos')
  revalidatePath('/dashboard')
  return { ok: true }
}

export interface ListExpensesFilters {
  fromDate?: string
  toDate?: string
  category?: ExpenseCategory
}

export async function listExpenses(filters: ListExpensesFilters = {}): Promise<GeneralExpense[]> {
  const { supabase } = await getActor()
  let query = supabase
    .from('general_expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.fromDate) query = query.gte('expense_date', filters.fromDate)
  if (filters.toDate) query = query.lte('expense_date', filters.toDate)
  if (filters.category) query = query.eq('category', filters.category)

  const { data } = await query
  return (data ?? []) as GeneralExpense[]
}
