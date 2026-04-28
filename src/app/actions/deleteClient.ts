'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function deleteClient(clientId: string): Promise<void> {
  const supabase = await createClient()

  // Auth + admin check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (appUser?.role !== 'admin') throw new Error('Solo admins pueden eliminar clientes')

  const admin = createAdminClient()

  // ── 0. Limpiar usuarios de portal vinculados a este cliente ──────────────
  const { data: clientUserRows } = await admin
    .from('client_users')
    .select('user_id')
    .eq('client_id', clientId)

  for (const { user_id } of clientUserRows ?? []) {
    // ¿Este usuario tiene acceso a otros clientes?
    const { data: otherLinks } = await admin
      .from('client_users')
      .select('id')
      .eq('user_id', user_id)
      .neq('client_id', clientId)
      .limit(1)

    if (!otherLinks || otherLinks.length === 0) {
      // Solo estaba vinculado a este cliente → eliminar completamente
      await admin.from('users').delete().eq('id', user_id)
      await admin.auth.admin.deleteUser(user_id).catch((err) =>
        console.error(`No se pudo eliminar auth user ${user_id}:`, err)
      )
    }
  }

  await admin.from('client_users').delete().eq('client_id', clientId)

  // ── 1. Obtener IDs de ciclos ──────────────────────────────────────────────
  const { data: cycles } = await admin
    .from('billing_cycles').select('id').eq('client_id', clientId)
  const cycleIds = (cycles ?? []).map((c) => c.id)

  // ── 2. Obtener IDs de requerimientos ─────────────────────────────────────
  let requirementIds: string[] = []
  if (cycleIds.length > 0) {
    const { data: requirements } = await admin
      .from('requirements').select('id').in('billing_cycle_id', cycleIds)
    requirementIds = (requirements ?? []).map((r) => r.id)
  }

  // ── 3. Cleanup de adjuntos del chat ──────────────────────────────────────
  if (requirementIds.length > 0) {
    for (const reqId of requirementIds) {
      try {
        const { data: files } = await supabase.storage
          .from('requirement-attachments')
          .list(reqId)
        if (files && files.length > 0) {
          const paths = files.map((f) => `${reqId}/${f.name}`)
          await supabase.storage.from('requirement-attachments').remove(paths)
        }
      } catch (err) {
        console.error(`Cleanup de adjuntos para req ${reqId} falló:`, err)
      }
    }
  }

  // ── 4. Borrar logs de fases ───────────────────────────────────────────────
  if (requirementIds.length > 0) {
    await admin.from('requirement_phase_logs')
      .delete().in('requirement_id', requirementIds)
  }

  // ── 5. Borrar requerimientos ──────────────────────────────────────────────
  if (cycleIds.length > 0) {
    await admin.from('requirements')
      .delete().in('billing_cycle_id', cycleIds)
  }

  // ── 6. Borrar ciclos de facturación ──────────────────────────────────────
  if (cycleIds.length > 0) {
    await admin.from('billing_cycles')
      .delete().eq('client_id', clientId)
  }

  // ── 7. Borrar cliente ─────────────────────────────────────────────────────
  await admin.from('clients').delete().eq('id', clientId)

  redirect('/clients')
}
