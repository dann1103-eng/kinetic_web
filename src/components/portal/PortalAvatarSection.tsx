'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadUserAvatar } from '@/lib/supabase/upload-avatar'
import { setClientAvatarUrl } from '@/app/actions/portalProfile'
import { UserAvatar } from '@/components/ui/UserAvatar'

export function PortalAvatarSection() {
  const [userId, setUserId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data } = await supabase
        .from('users')
        .select('id, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled || !data) return
      setUserId(data.id)
      setFullName(data.full_name ?? user.email ?? '')
      setAvatarUrl(data.avatar_url ?? null)
    })()
    return () => { cancelled = true }
  }, [])

  function handlePick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !userId) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        const url = await uploadUserAvatar(file, userId)
        const r = await setClientAvatarUrl(url)
        if ('error' in r) {
          setError(r.error)
          return
        }
        setAvatarUrl(url)
        setSuccess('Foto actualizada.')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
      }
    })
  }

  function handleRemove() {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const r = await setClientAvatarUrl(null)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setAvatarUrl(null)
      setSuccess('Foto eliminada.')
    })
  }

  return (
    <div className="glass-panel p-5 space-y-4">
      <h2 className="text-base font-semibold text-fm-on-surface">Foto de perfil</h2>
      <p className="text-xs text-fm-on-surface-variant">
        Esta es tu foto personal — distinta del logo de tu marca. Se muestra en los chats
        y revisiones donde participas.
      </p>

      <div className="flex items-center gap-4">
        <UserAvatar name={fullName} avatarUrl={avatarUrl} size="lg" />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handlePick}
            disabled={isPending || !userId}
            className="text-sm font-semibold rounded-lg bg-fm-primary text-white px-4 py-2 disabled:opacity-50"
          >
            {isPending ? 'Subiendo…' : avatarUrl ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className="text-xs text-fm-error hover:underline disabled:opacity-50"
            >
              Quitar foto
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && <p className="text-sm text-fm-error">{error}</p>}
      {success && <p className="text-sm text-fm-primary">{success}</p>}

      <p className="text-[11px] text-fm-outline">PNG, JPG o WebP · máx. 2 MB.</p>
    </div>
  )
}
