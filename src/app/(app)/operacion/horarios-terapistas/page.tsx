import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import type { TherapistWorkScheduleBlock } from '@/types/db'
import { TherapistSchedulesList } from '@/components/operacion/TherapistSchedulesList'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'directora']

export default async function HorariosTerapistasPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  const supabase = await createClient()

  const { data: therapistsRaw } = await supabase
    .from('users')
    .select('id, full_name, max_hours_per_week')
    .in('role', ['terapista', 'maestra'])
    .order('full_name')

  const therapists = (therapistsRaw ?? []) as {
    id: string
    full_name: string
    max_hours_per_week: number | null
  }[]

  const therapistIds = therapists.map((t) => t.id)
  const { data: blocksRaw } = therapistIds.length
    ? await supabase
        .from('therapist_work_schedule')
        .select('*')
        .in('therapist_id', therapistIds)
        .order('day_of_week')
        .order('start_time')
    : { data: [] as TherapistWorkScheduleBlock[] }

  const blocks = (blocksRaw ?? []) as TherapistWorkScheduleBlock[]
  const blocksByTherapist = new Map<string, TherapistWorkScheduleBlock[]>()
  for (const b of blocks) {
    const arr = blocksByTherapist.get(b.therapist_id) ?? []
    arr.push(b)
    blocksByTherapist.set(b.therapist_id, arr)
  }

  const rows = therapists.map((t) => ({
    ...t,
    blocks: blocksByTherapist.get(t.id) ?? [],
  }))

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant">
          Operación
        </p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-fm-on-surface leading-tight">
          Horarios de terapistas
        </h1>
        <p className="text-sm text-fm-on-surface-variant max-w-prose">
          Configurá los bloques laborales de cada terapista. Esto determina la capacidad
          contractual para el cálculo de ocupación.
        </p>
      </header>

      <div className="flex justify-end">
        <Link
          href="/operacion/capacidad-terapistas"
          className="text-sm font-semibold text-fm-primary hover:underline"
        >
          Ver capacidad semanal →
        </Link>
      </div>

      <TherapistSchedulesList therapists={rows} />
    </div>
  )
}
