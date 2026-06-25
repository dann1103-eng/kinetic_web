import { getEffectiveUser } from '@/lib/auth/effective-user'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'
import { TiempoView } from '@/components/tiempo/TiempoView'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

// Roles que pueden administrar las jornadas del equipo (pestaña "Equipo").
const ADMIN_JORNADA_ROLES: UserRole[] = ['admin', 'directora', 'recepcion']

// Personal con jornada (para el selector de la vista Equipo).
const STAFF_ROLES: UserRole[] = [
  'admin', 'directora', 'supervisor', 'coordinadora_familias',
  'coordinadora_terapias', 'terapista', 'maestra', 'recepcion', 'contable',
]

export default async function TiempoPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  const canAdmin = ADMIN_JORNADA_ROLES.includes(ctx.appUser.role)

  let staff: { id: string; full_name: string; role: string }[] = []
  if (canAdmin) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('users')
      .select('id, full_name, role')
      .in('role', STAFF_ROLES)
      .order('full_name')
    staff = (data ?? []) as { id: string; full_name: string; role: string }[]
  }

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Jornada" />

      <div className="flex-1 px-4 py-8 md:px-10 md:py-12 max-w-3xl mx-auto w-full">
        <header className="mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant mb-3">
            Tiempo
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-fm-on-surface leading-none">
            Jornada
          </h1>
          <p className="text-base text-fm-on-surface-variant mt-4 max-w-prose">
            Iniciá tu turno al llegar al centro y finalizalo al salir.
            {canAdmin && ' Desde la pestaña Equipo podés revisar y corregir las jornadas marcadas de cada persona.'}
          </p>
        </header>

        <TiempoView canAdmin={canAdmin} staff={staff} />
      </div>
    </div>
  )
}
