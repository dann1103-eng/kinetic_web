import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Genera un ZIP con todos los archivos de una versión de revisión.
 * - Verifica acceso vía RLS leyendo `review_versions` con el cliente del usuario.
 * - Descarga blobs de Storage usando el cliente admin (bypass RLS — el gating ya lo hicimos).
 * - Stream el ZIP completo al cliente.
 */
export async function GET(req: NextRequest) {
  const versionId = req.nextUrl.searchParams.get('versionId')
  if (!versionId) {
    return NextResponse.json({ error: 'versionId requerido' }, { status: 400 })
  }

  const supabase = await createClient()

  // RLS gate: si el usuario puede leer la versión, puede bajarla.
  const { data: version, error: vErr } = await supabase
    .from('review_versions')
    .select('id, version_number, asset_id')
    .eq('id', versionId)
    .maybeSingle()

  if (vErr || !version) {
    return NextResponse.json({ error: 'Versión no encontrada o sin acceso' }, { status: 403 })
  }

  // Asset (para nombrar el ZIP)
  const { data: asset } = await supabase
    .from('review_assets')
    .select('name')
    .eq('id', version.asset_id as string)
    .maybeSingle()
  const assetName = (asset?.name as string | undefined) ?? 'asset'

  // Archivos de la versión (RLS aplica también)
  const { data: files, error: fErr } = await supabase
    .from('review_version_files')
    .select('id, storage_path, file_order, mime_type')
    .eq('version_id', versionId)
    .order('file_order', { ascending: true })

  if (fErr || !files || files.length === 0) {
    return NextResponse.json({ error: 'Sin archivos para descargar' }, { status: 404 })
  }

  // Descargar blobs (admin para bypass RLS de Storage; RLS de la tabla ya validó acceso).
  const admin = createAdminClient()
  const zip = new JSZip()

  type FileRow = {
    storage_path: string
    file_order: number
    mime_type: string | null
  }

  for (const fRaw of files as FileRow[]) {
    const { data: blob, error: dlErr } = await admin.storage
      .from('review-files')
      .download(fRaw.storage_path)
    if (dlErr || !blob) continue

    const buf = Buffer.from(await blob.arrayBuffer())
    const sourcePath = fRaw.storage_path
    const ext = sourcePath.includes('.') ? sourcePath.split('.').pop() : ''
    const idx = (fRaw.file_order ?? 0) + 1
    const fileName = ext
      ? `${assetName}-v${version.version_number}-${idx}.${ext}`
      : `${assetName}-v${version.version_number}-${idx}`
    zip.file(fileName, buf)
  }

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' })
  const zipName = `${assetName}-v${version.version_number}.zip`

  return new NextResponse(new Uint8Array(zipBuf), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
