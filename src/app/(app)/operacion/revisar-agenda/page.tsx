import { redirect } from 'next/navigation'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { RevisarAgendaClient } from './RevisarAgendaClient'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
  'contable',
]

export default async function RevisarAgendaPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-fm-on-surface">Revisar la agenda contra el plan</h1>
        <p className="mt-1 text-sm text-fm-on-surface-variant">
          Busca los niños cuya agenda del mes no coincide con su plan de tratamiento —citas en días
          u horas que el plan no tiene, o de una terapia que ya no es del plan— y la pone al día sin
          anular el ciclo.
        </p>
        <ul className="mt-2 text-xs text-fm-on-surface-variant list-disc pl-5 space-y-0.5">
          <li>
            Solo se toca lo que <b>todavía no se dio</b>. Las sesiones ya dadas, las faltas y las
            cancelaciones de la familia quedan como están.
          </li>
          <li>
            No se tocan las <b>reposiciones</b>, las citas <b>agendadas a mano</b> (terapias extra)
            ni las que alguien <b>reagendó</b> a propósito.
          </li>
          <li>
            Funciona también con el <b>mes ya pagado</b>: no se re-cobra, y si cambia la cantidad de
            sesiones la diferencia pasa a la mensualidad siguiente.
          </li>
          <li>
            El plan manda. Si lo que está mal es el plan, corregilo primero en la ficha del niño/a:
            al guardarlo la agenda se actualiza sola.
          </li>
        </ul>
      </div>
      <RevisarAgendaClient />
    </div>
  )
}
