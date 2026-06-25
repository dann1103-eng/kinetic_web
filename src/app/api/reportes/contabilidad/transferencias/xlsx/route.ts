import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { resolveBankTransferDoc, parseOtrosParam } from '@/lib/domain/reports/bank-transfer-data'
import type { UserRole } from '@/types/db'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES: UserRole[] = ['admin', 'directora', 'contable', 'recepcion']

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = appUser?.role as UserRole | undefined
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year'))
  const month = Number(url.searchParams.get('month'))
  if (!year || !month) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
  const otros = parseOtrosParam(url.searchParams.get('otros'))

  const { rows, totals } = await resolveBankTransferDoc(supabase, year, month, otros)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Transferencias')
  ws.columns = [
    { header: '#', key: 'idx', width: 5 },
    { header: 'NOMBRE', key: 'nombre', width: 34 },
    { header: 'NO DE DUI/NIT', key: 'duiNit', width: 28 },
    { header: 'BANCO', key: 'banco', width: 20 },
    { header: 'TIPO DE CUENTA', key: 'tipo', width: 16 },
    { header: 'NUMERO DE CUENTA', key: 'cuenta', width: 24 },
    { header: 'SALARIO', key: 'salario', width: 12 },
    { header: 'HONORARIOS', key: 'honorarios', width: 12 },
    { header: 'OTROS', key: 'otros', width: 10 },
    { header: 'TOTAL A DEPOSITAR', key: 'total', width: 18 },
  ]
  ws.getRow(1).font = { bold: true }

  rows.forEach((r, i) => {
    ws.addRow({
      idx: i + 1,
      nombre: r.nombre,
      duiNit: r.duiNit,
      banco: r.banco,
      tipo: r.tipoCuenta,
      cuenta: r.numeroCuenta, // texto: los números de cuenta pueden ser largos
      salario: r.salario || null,
      honorarios: r.honorarios || null,
      otros: r.otros || null,
      total: r.total,
    })
  })

  const totalRow = ws.addRow({
    nombre: 'TOTAL A TRANSFERIR',
    salario: totals.salario,
    honorarios: totals.honorarios,
    otros: totals.otros,
    total: totals.total,
  })
  totalRow.font = { bold: true }

  for (const key of ['salario', 'honorarios', 'otros', 'total']) {
    ws.getColumn(key).numFmt = '"$"#,##0.00'
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `kinetic-transferencias-${year}-${String(month).padStart(2, '0')}.xlsx`

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
