import { getEffectiveUser } from '@/lib/auth/effective-user'
import { redirect } from 'next/navigation'
import { TopNav } from '@/components/layout/TopNav'
import { ShiftPanel } from '@/components/tiempo/ShiftPanel'

export const dynamic = 'force-dynamic'

/**
 * Kinetic /tiempo: solo marca de jornada (turnos/breaks).
 *
 * El panel de tiempos internos por categoría (ClockInPanel) y la vista admin
 * (TiempoTabs) son legacy del CRM FM (Comm Solutions). Esos componentes
 * siguen en el filesystem pero no se renderizan acá hasta que Kinetic
 * defina sus propias categorías de tiempo interno.
 */
export default async function TiempoPage() {
  const ctx = await getEffectiveUser()
  if (!ctx) redirect('/login')

  return (
    <div className="flex flex-col min-h-full bg-fm-background">
      <TopNav title="Jornada" />

      <div className="flex-1 px-4 py-8 md:px-10 md:py-12 max-w-3xl mx-auto w-full">
        <header className="mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fm-on-surface-variant mb-3">
            Tiempo
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-fm-on-surface leading-none">
            Mi jornada
          </h1>
          <p className="text-base text-fm-on-surface-variant mt-4 max-w-prose">
            Iniciá tu turno al llegar al centro y finalizalo al salir. Si te
            tomás un descanso (almuerzo o salir del centro), marcalo desde el
            mismo widget.
          </p>
        </header>

        <ShiftPanel />
      </div>
    </div>
  )
}
