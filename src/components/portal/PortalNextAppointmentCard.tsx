'use client'

import { useState } from 'react'

export interface PortalAppointmentData {
  id: string
  starts_at: string
  ends_at: string | null
  child_name: string
  therapist_name: string | null
  service_type: string | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-SV', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-SV', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function PortalNextAppointmentCard({
  appointment,
}: {
  appointment: PortalAppointmentData | null
}) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[32px] p-6 portal-card-shadow">

      {/* Header row */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-kp-primary bg-kp-primary-container/20 px-3 py-1 rounded-full">
            Próxima Cita
          </span>
          {appointment && (
            <h2 className="text-[24px] font-bold text-fm-on-surface mt-2 capitalize">
              {formatDate(appointment.starts_at)}
            </h2>
          )}
        </div>
        <div className="w-12 h-12 bg-kp-secondary-container/20 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-kp-secondary">calendar_month</span>
        </div>
      </div>

      {/* No appointment */}
      {!appointment && (
        <p className="text-[14px] text-fm-on-surface-variant text-center py-4">
          Sin citas próximas programadas.
        </p>
      )}

      {/* Appointment details */}
      {appointment && (
        <>
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-fm-on-surface-variant text-[20px]">schedule</span>
              <p className="text-[16px] text-fm-on-surface-variant">
                {formatTime(appointment.starts_at)}
                {appointment.ends_at && ` — ${formatTime(appointment.ends_at)}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-fm-on-surface-variant text-[20px]">child_care</span>
              <p className="text-[16px] text-fm-on-surface-variant">
                Paciente:{' '}
                <span className="font-semibold text-fm-on-surface">{appointment.child_name}</span>
              </p>
            </div>
            {appointment.therapist_name && (
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-fm-on-surface-variant text-[20px]">medical_services</span>
                <p className="text-[16px] text-fm-on-surface-variant">
                  Especialista:{' '}
                  <span className="font-semibold text-fm-on-surface">{appointment.therapist_name}</span>
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              disabled={confirmed}
              className="bg-kp-primary text-kp-on-primary text-[14px] font-semibold tracking-[0.05em] py-3 rounded-full active:scale-95 transition-all text-center disabled:opacity-60"
            >
              {confirmed ? '✓ Confirmada' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => {
                // TODO: abrir flujo de reprogramación
                alert('Para reprogramar tu cita, comunicate con Kinetic.')
              }}
              className="border border-kp-primary text-kp-primary text-[14px] font-semibold tracking-[0.05em] py-3 rounded-full active:scale-95 transition-transform text-center"
            >
              Reprogramar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
