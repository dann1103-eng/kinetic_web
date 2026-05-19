'use client'

import { useState } from 'react'

export interface PortalAppointmentData {
  id: string
  starts_at: string
  ends_at: string | null
  child_name: string
  therapist_name: string | null
  therapist_avatar_url?: string | null
  service_type: string | null
}

function therapistInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function TherapistAvatar({
  name,
  url,
  size,
}: {
  name: string | null
  url: string | null | undefined
  size: number
}) {
  const initials = therapistInitials(name)
  return (
    <div
      className="rounded-full overflow-hidden flex-shrink-0 border-2 border-kp-primary-container/30 bg-kp-primary-container/15 flex items-center justify-center"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name ?? 'Terapista'}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[10px] font-bold text-kp-primary">{initials}</span>
      )}
    </div>
  )
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

  function handleReschedule() {
    // TODO: abrir flujo de reprogramación
    alert('Para reprogramar tu cita, comunicate con Kinetic.')
  }

  return (
    <div className="bg-fm-surface-container-lowest border border-fm-outline-variant rounded-[32px] portal-card-shadow">

      {/* ── Mobile layout (hidden md+) ── */}
      <div className="md:hidden p-6">
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

        {!appointment && (
          <p className="text-[14px] text-fm-on-surface-variant text-center py-4">
            Sin citas próximas programadas.
          </p>
        )}

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
                  <TherapistAvatar
                    name={appointment.therapist_name}
                    url={appointment.therapist_avatar_url}
                    size={28}
                  />
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold bg-kp-primary-container/15 text-kp-primary px-3 py-1 rounded-full">
                    con {appointment.therapist_name}
                  </span>
                </div>
              )}
            </div>

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
                onClick={handleReschedule}
                className="border border-kp-primary text-kp-primary text-[14px] font-semibold tracking-[0.05em] py-3 rounded-full active:scale-95 transition-transform text-center"
              >
                Reprogramar
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Desktop layout (hidden below md) ── */}
      <div className="hidden md:flex items-center gap-8 p-8">

        {/* Left: info */}
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-kp-primary bg-kp-primary-container/20 px-3 py-1 rounded-full">
            Próxima Cita
          </span>
          {!appointment && (
            <p className="text-[15px] text-fm-on-surface-variant mt-4">
              Sin citas próximas programadas.
            </p>
          )}
          {appointment && (
            <>
              <h2 className="text-[26px] font-bold text-fm-on-surface mt-3 mb-4 capitalize">
                {formatDate(appointment.starts_at)}
              </h2>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-fm-on-surface-variant text-[18px]">schedule</span>
                  <p className="text-[15px] text-fm-on-surface-variant">
                    {formatTime(appointment.starts_at)}
                    {appointment.ends_at && ` — ${formatTime(appointment.ends_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-fm-on-surface-variant text-[18px]">child_care</span>
                  <p className="text-[15px] text-fm-on-surface-variant">
                    Paciente:{' '}
                    <span className="font-semibold text-fm-on-surface">{appointment.child_name}</span>
                  </p>
                </div>
                {appointment.therapist_name && (
                  <div className="flex items-center gap-2.5">
                    <TherapistAvatar
                      name={appointment.therapist_name}
                      url={appointment.therapist_avatar_url}
                      size={26}
                    />
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold bg-kp-primary-container/15 text-kp-primary px-3 py-1 rounded-full">
                      con {appointment.therapist_name}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Center: decorative calendar circle */}
        <div className="flex-shrink-0 relative w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-kp-primary-container/10" />
          <div className="absolute inset-3 rounded-full bg-kp-primary-container/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="material-symbols-outlined text-kp-primary"
              style={{ fontSize: '40px' }}
            >
              calendar_month
            </span>
          </div>
        </div>

        {/* Right: action buttons */}
        {appointment && (
          <div className="flex flex-col gap-3 flex-shrink-0 w-44">
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              disabled={confirmed}
              className="bg-kp-primary text-kp-on-primary text-[14px] font-semibold py-3 rounded-full disabled:opacity-60 hover:bg-kp-primary/90 transition-colors text-center"
            >
              {confirmed ? '✓ Confirmada' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={handleReschedule}
              className="bg-fm-surface-container-high text-fm-on-surface-variant text-[14px] font-semibold py-3 rounded-full hover:bg-fm-surface-container-highest transition-colors text-center"
            >
              Reprogramar
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
