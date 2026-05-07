'use client'

import { useState } from 'react'
import { SessionReportApprovalCard } from './SessionReportApprovalCard'
import type { SessionReport } from '@/types/db'

interface ChildInfo {
  id: string
  full_name: string
  preferred_name: string | null
}

interface AppointmentInfo {
  id: string
  starts_at: string
  service_type: string | null
}

interface SessionReportApprovalListProps {
  reports: SessionReport[]
  childMap: Record<string, ChildInfo>
  therapistMap: Record<string, string>
  appointmentMap: Record<string, AppointmentInfo>
}

export function SessionReportApprovalList({
  reports: initialReports,
  childMap,
  therapistMap,
  appointmentMap,
}: SessionReportApprovalListProps) {
  const [reports, setReports] = useState(initialReports)

  const handleResolved = (reportId: string) => {
    setReports((prev) => prev.filter((r) => r.id !== reportId))
  }

  if (reports.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-fm-on-surface-variant">
        Bandeja al día. No quedan reportes pendientes.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-fm-on-surface-variant">
        {reports.length} reporte{reports.length === 1 ? '' : 's'} esperando revisión.
      </p>
      {reports.map((report) => (
        <SessionReportApprovalCard
          key={report.id}
          report={report}
          child={childMap[report.child_id]}
          therapistName={report.therapist_id ? therapistMap[report.therapist_id] ?? '—' : '—'}
          appointment={appointmentMap[report.appointment_id]}
          onResolved={() => handleResolved(report.id)}
        />
      ))}
    </div>
  )
}
