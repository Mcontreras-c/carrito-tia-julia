import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailySales, salesDay } from '../src/dailySales.ts'

function order(id, method, date, amount = 6500) {
  return { id: String(id), number: id, name: '', created: '2026-09-09T12:00:00Z', status: 'Pendiente', lines: [], payment: { method, total: amount, received: method === 'Efectivo' ? 10000 : null, change: method === 'Efectivo' ? 3500 : null, date } }
}
test('suma por fecha del pago, excluye impagos, cancelados y otros días', () => {
  const paid = order(1, 'Efectivo', '2026-09-11T18:00:00Z')
  const report = dailySales([paid, order(2, 'Tarjeta', '2026-09-11T19:00:00Z', 2000), order(3, 'Transferencia', '2026-09-11T20:00:00Z', 1000), { ...paid, id: '4', payment: null }, { ...paid, id: '5', status: 'Cancelado' }, order(6, 'Efectivo', '2026-09-10T18:00:00Z')], '2026-09-11T23:00:00Z')
  assert.equal(report.amount, 9500)
  assert.equal(report.count, 3)
  assert.equal(report.methods[0].amount, 6500) // No sumar el billete recibido.
  assert.deepEqual(report.paid.map(o => o.number), [3, 2, 1])
  assert.equal(report.methods.reduce((sum, m) => sum + m.amount, 0), report.amount)
})
test('corte de día usa Santiago, no UTC ni el huso del computador', () => {
  assert.equal(salesDay('2026-09-12T02:59:59Z'), '2026-09-11')
  assert.equal(salesDay('2026-09-12T03:00:00Z'), '2026-09-12')
  assert.equal(salesDay('2026-07-12T03:59:59Z'), '2026-07-11')
  assert.equal(salesDay('2026-07-12T04:00:00Z'), '2026-07-12')
  const report = dailySales([order(1, 'Efectivo', '2026-09-12T02:59:59Z'), order(2, 'Tarjeta', '2026-09-12T03:00:00Z')], '2026-09-11T23:00:00Z')
  assert.equal(report.count, 1)
  assert.equal(report.paid[0].number, 1)
})
test('día sin ventas muestra ceros', () => {
  const report = dailySales([], '2026-09-11T23:00:00Z')
  assert.equal(report.amount, 0)
  assert.equal(report.count, 0)
  assert.deepEqual(report.methods.map(m => m.amount), [0, 0, 0])
})
