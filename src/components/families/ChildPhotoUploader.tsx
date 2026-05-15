'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChildAvatar } from '@/components/ui/ChildAvatar'
import { uploadChildPhoto, removeChildPhoto } from '@/app/actions/children'

interface Props {
  childId: string
  childName: string
  photoUrl: string | null
  canEdit: boolean
}

export function ChildPhotoUploader({ childId, childName, photoUrl, canEdit }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset el input para que onChange dispare aunque se elija el mismo archivo
    e.target.value = ''
    const fd = new FormData()
    fd.append('file', file)
    startTransition(async () => {
      const res = await uploadChildPhoto(fd, childId)
      if (res.ok) router.refresh()
    })
  }

  function handleRemove() {
    if (!confirm('¿Eliminar la foto del niño?')) return
    startTransition(async () => {
      await removeChildPhoto(childId)
      router.refresh()
    })
  }

  return (
    <div className="relative group inline-block flex-shrink-0">
      <ChildAvatar name={childName} photoUrl={photoUrl} size="xl" />

      {canEdit && !isPending && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
          title="Cambiar foto"
        >
          <span className="material-symbols-outlined text-white text-xl">photo_camera</span>
        </button>
      )}

      {canEdit && photoUrl && !isPending && (
        <button
          type="button"
          onClick={handleRemove}
          className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-fm-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Eliminar foto"
        >
          <span className="material-symbols-outlined leading-none" style={{ fontSize: '12px' }}>
            close
          </span>
        </button>
      )}

      {isPending && (
        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
          <span className="text-white text-xs font-medium">…</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
