'use client'

import { useEffect, useState, useCallback } from 'react'
import { listChildAttachments } from '@/app/actions/child-attachments'
import { ChildAttachmentManager } from './ChildAttachmentManager'
import type { ChildAttachment, ChildAttachmentKind } from '@/types/db'

interface Props {
  childId: string
  link?: {
    appointmentId?: string
    sessionReportId?: string
    progressReportId?: string
  }
  defaultKind?: ChildAttachmentKind
  defaultVisibleToFamily?: boolean
  title?: string
  allowedKinds?: ChildAttachmentKind[]
  readOnly?: boolean
}

/**
 * Self-fetching wrapper sobre ChildAttachmentManager. Útil cuando el padre
 * no quiere cargar los adjuntos server-side.
 */
export function ChildAttachmentManagerLazy(props: Props) {
  const [attachments, setAttachments] = useState<ChildAttachment[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const filter: {
      childId?: string
      appointmentId?: string
      sessionReportId?: string
      progressReportId?: string
    } = { childId: props.childId }
    if (props.link?.appointmentId) filter.appointmentId = props.link.appointmentId
    if (props.link?.sessionReportId) filter.sessionReportId = props.link.sessionReportId
    if (props.link?.progressReportId) filter.progressReportId = props.link.progressReportId
    const res = await listChildAttachments(filter)
    if (res.ok) {
      setAttachments(res.data)
      setLoaded(true)
    }
  }, [
    props.childId,
    props.link?.appointmentId,
    props.link?.sessionReportId,
    props.link?.progressReportId,
  ])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!loaded) {
    return (
      <p className="text-xs italic text-fm-on-surface-variant">Cargando adjuntos…</p>
    )
  }

  return (
    <ChildAttachmentManager
      childId={props.childId}
      attachments={attachments}
      link={props.link}
      defaultKind={props.defaultKind}
      defaultVisibleToFamily={props.defaultVisibleToFamily}
      title={props.title}
      allowedKinds={props.allowedKinds}
      readOnly={props.readOnly}
      onChange={() => void refresh()}
    />
  )
}
