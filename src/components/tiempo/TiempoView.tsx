'use client'

import { useState } from 'react'
import { ShiftPanel } from './ShiftPanel'
import { EquipoJornadasPanel } from './EquipoJornadasPanel'

interface StaffLite {
  id: string
  full_name: string
  role: string
}

/**
 * Vista de /tiempo: jornada personal para todos, y una pestaña "Equipo" para
 * admin/directora/recepción que administra (ve/edita/crea/borra) las jornadas
 * marcadas (`work_sessions`) de cualquier persona.
 */
export function TiempoView({ canAdmin, staff }: { canAdmin: boolean; staff: StaffLite[] }) {
  const [tab, setTab] = useState<'personal' | 'equipo'>('personal')

  if (!canAdmin) return <ShiftPanel />

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 bg-fm-surface-container-low rounded-2xl w-fit">
        {(['personal', 'equipo'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t
                ? 'bg-fm-surface-container-lowest text-fm-primary shadow-sm'
                : 'text-fm-on-surface-variant hover:text-fm-on-surface'
            }`}
          >
            {t === 'personal' ? 'Mi jornada' : 'Equipo'}
          </button>
        ))}
      </div>

      {tab === 'personal' ? <ShiftPanel /> : <EquipoJornadasPanel staff={staff} />}
    </div>
  )
}
