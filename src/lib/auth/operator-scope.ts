import { createClient } from '@/lib/supabase/server'

/**
 * Devuelve el conjunto de `client_id` donde `userId` tiene al menos
 * un requirement no anulado con su id en `assigned_to`.
 *
 * Usar en páginas (`/clients`, `/dashboard`) cuando el rol efectivo es
 * 'operator' para limitar la lista de clientes que ve. Admin y supervisor
 * no necesitan filtro.
 *
 * Si el operador no tiene asignaciones, retorna [].
 */
export async function getOperatorClientIds(userId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('requirements')
    .select('billing_cycles!inner(client_id)')
    .contains('assigned_to', [userId])
    .eq('voided', false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = new Set<string>((data ?? []).map((r: any) => r.billing_cycles.client_id))
  return [...ids]
}
