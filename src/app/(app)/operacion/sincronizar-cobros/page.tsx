import { redirect } from 'next/navigation'
import { getEffectiveUser } from '@/lib/auth/effective-user'
import { SincronizarCobrosClient } from './SincronizarCobrosClient'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'directora',
  'coordinadora_familias',
  'coordinadora_terapias',
  'recepcion',
  'contable',
]

export default async function SincronizarCobrosPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')
  if (!ALLOWED_ROLES.includes(ctx.appUser.role)) redirect('/dashboard')

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-fm-on-surface">Revisar cobros contra la agenda</h1>
        <p className="mt-1 text-sm text-fm-on-surface-variant">
          Busca los ciclos del mes que cobran una cantidad de sesiones distinta a la que tienen
          realmente agendada, y los empareja. Desde que el cobro sigue a la agenda esto no debería
          volver a pasar solo; sirve para los ciclos generados antes, o para revisar antes de
          facturar.
        </p>
        <ul className="mt-2 text-xs text-fm-on-surface-variant list-disc pl-5 space-y-0.5">
          <li>
            Las <b>reposiciones</b> no cuentan (reponen una falta ya cobrada) y las{' '}
            <b>mensualidades</b> de programas matutinos tampoco (se cobran por mes, no por sesión).
          </li>
          <li>
            Las <b>faltas</b> y <b>cancelaciones</b> sí cuentan: se cobran este mes y se acreditan
            el siguiente por rollover.
          </li>
          <li>
            Un ciclo <b>pagado</b> no se re-cobra: la diferencia se arrastra como ajuste a la
            mensualidad siguiente.
          </li>
          <li>
            A los ciclos pendientes que ya tenían <b>factura</b> se les regenera con el detalle al
            día.
          </li>
          <li>
            Los niños <b>en pausa temporal</b> salen destildados: pausar no cancela sus citas, así
            que su agenda suele tener sesiones que no se van a dar. Ahí lo que hay que corregir es
            la agenda, no el cobro.
          </li>
        </ul>
      </div>
      <SincronizarCobrosClient />
    </div>
  )
}
