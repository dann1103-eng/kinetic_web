import { describe, it, expect } from 'vitest'
import { buildBankTransferRows, type BankTransferUser } from './bank-transfer'

const users: BankTransferUser[] = [
  { id: 'u1', full_name: 'Ana Zelaya', dui: '0000-1', nit: null, bank_name: 'Banco X', account_type: 'Ahorro', account_number: '123' },
  { id: 'u2', full_name: 'Luis Escobar', dui: null, nit: '0614-1', bank_name: 'Banco Y', account_type: 'Ahorro', account_number: '456' },
  { id: 'u3', full_name: 'Mara Molina', dui: null, nit: null, bank_name: null, account_type: null, account_number: null },
]

describe('buildBankTransferRows', () => {
  it('consolida neto normal + SP + otros y totaliza', () => {
    const { rows, totals } = buildBankTransferRows({
      users,
      normalNetByUser: new Map([['u1', 500]]),
      spNetByUser: new Map([['u1', 200], ['u2', 300]]),
      otrosByUser: new Map([['u1', 50]]),
    })
    const r1 = rows.find((r) => r.userId === 'u1')!
    expect(r1.salario).toBe(500)
    expect(r1.honorarios).toBe(200)
    expect(r1.otros).toBe(50)
    expect(r1.total).toBe(750)
    expect(r1.duiNit).toBe('0000-1')

    const r2 = rows.find((r) => r.userId === 'u2')!
    expect(r2.total).toBe(300)
    expect(r2.duiNit).toBe('0614-1')

    expect(totals.salario).toBe(500)
    expect(totals.honorarios).toBe(500)
    expect(totals.otros).toBe(50)
    expect(totals.total).toBe(1050)
  })

  it('excluye a quien no tiene ningún monto', () => {
    const { rows } = buildBankTransferRows({
      users,
      normalNetByUser: new Map([['u1', 100]]),
      spNetByUser: new Map(),
      otrosByUser: new Map(),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe('u1')
  })

  it('marca a quien tiene monto pero le faltan datos bancarios', () => {
    const { rows } = buildBankTransferRows({
      users,
      normalNetByUser: new Map([['u3', 100]]),
      spNetByUser: new Map(),
      otrosByUser: new Map(),
    })
    expect(rows[0].userId).toBe('u3')
    expect(rows[0].missingBank).toBe(true)
  })

  it('combina DUI y NIT cuando ambos existen', () => {
    const { rows } = buildBankTransferRows({
      users: [{ id: 'u4', full_name: 'Eva Padilla', dui: '111-1', nit: '222-2', bank_name: 'B', account_type: 'Ahorro', account_number: '9' }],
      normalNetByUser: new Map([['u4', 10]]),
      spNetByUser: new Map(),
      otrosByUser: new Map(),
    })
    expect(rows[0].duiNit).toBe('111-1 / 222-2')
    expect(rows[0].missingBank).toBe(false)
  })
})
