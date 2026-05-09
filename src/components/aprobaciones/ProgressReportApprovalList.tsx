'use client'

import { useState } from 'react'
import { ProgressReportApprovalCard } from './ProgressReportApprovalCard'
import type { ProgressReport, ReportTemplate } from '@/types/db'

interface ChildInfo {
  id: string
  full_name: string
  preferred_name: string | null
}

interface ProgressReportApprovalListProps {
  reports: ProgressReport[]
  childMap: Record<string, ChildInfo>
  authorMap: Record<string, string>
  templateMap: Record<string, ReportTemplate>
}

export function ProgressReportApprovalList({
  reports: initialReports,
  childMap,
  authorMap,
  templateMap,
}: ProgressReportApprovalListProps) {
  const [reports, setReports] = useState(initialReports)

  const handleResolved = (reportId: string) => {
    setReports((prev) => prev.filter((r) => r.id !== reportId))
  }

  if (reports.length === 0) return null

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <ProgressReportApprovalCard
          key={report.id}
          report={report}
          child={childMap[report.child_id]}
          authorName={
            report.authored_by_user_id ? authorMap[report.authored_by_user_id] ?? '—' : '—'
          }
          template={report.template_id ? templateMap[report.template_id] ?? null : null}
          onResolved={() => handleResolved(report.id)}
        />
      ))}
    </div>
  )
}
