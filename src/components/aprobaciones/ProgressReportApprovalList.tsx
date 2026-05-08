'use client'

import { useState } from 'react'
import { ProgressReportApprovalCard } from './ProgressReportApprovalCard'
import type { ProgressReport } from '@/types/db'

interface ChildInfo {
  id: string
  full_name: string
  preferred_name: string | null
}

interface ProgressReportApprovalListProps {
  reports: ProgressReport[]
  childMap: Record<string, ChildInfo>
  authorMap: Record<string, string>
}

export function ProgressReportApprovalList({
  reports: initialReports,
  childMap,
  authorMap,
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
          onResolved={() => handleResolved(report.id)}
        />
      ))}
    </div>
  )
}
