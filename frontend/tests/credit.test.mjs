import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addProduct, advance, cancelOrder, decode, editLine, editable, isOpenOrder, leaveOnCredit, newOrder, normalizePhone, pay, validDate } from '../src/orders.ts'
import { creditMessage, creditStatus, whatsappLink } from '../src/creditReminders.ts'
import { dailySales } from '../src/dailySales.ts'

const today = '2026-09-11'
const now = new Date('2026-09-11T16:00:00Z')
const input = { name: 'Ana Ejemplo', phone: '9 1234 5678', dueDate: '2026-09-13' }
const product = { id: 1, nombre: 'Completo', precio: 2500, imagen: null, disponible: true, categoria: 1, categoria_nombre: 'Completos' }
const order = () => addProduct(newOrder(1), product)
test('fiado entregado sale del tablero y sigue en detalle diario sin sumar dinero cobrado', () => {
  const credit = leaveOnCredit(order(), input, today, now)
  assert.equal(isOpenOrder(credit), true)
  assert.equal(isOpenOrder(advance(credit)), true)
  const delivered = advance(advance(credit))
  assert.equal(isOpenOrder(delivered), false)
  assert.equal(isOpenOrder(advance(advance(order()))), true)
  const report = dailySales([delivered], now)
  assert.equal(report.amount, 0)
  assert.equal(report.count, 0)
  assert.equal(report.creditAmount, 2500)
  assert.equal(report.creditPendingAmount, 2500)
  assert.equal(report.credits[0].id, credit.id)
  const settled = pay(delivered, 'Tarjeta', '')
  settled.payment.date = '2026-09-12T18:00:00Z'
  const nextDay = dailySales([settled], '2026-09-12T19:00:00Z')
  assert.equal(nextDay.amount, 2500)
  assert.equal(nextDay.credits.length, 0)
  assert.equal(dailySales([settled], now).creditPendingAmount, 0)
})

test('fiado conserva monto, cliente, celular y fecha sin registrar pago', () => {
  const original = order()
  const credit = leaveOnCredit(original, input, today, now)
  assert.equal(original.credit, undefined)
  assert.equal(credit.name, input.name)
  assert.equal(credit.credit.phone, '+56912345678')
  assert.equal(credit.credit.amount, 2500)
  assert.equal(credit.credit.dueDate, input.dueDate)
  assert.equal(credit.payment, null)
  assert.equal(dailySales([credit], now).amount, 0)
  assert.equal(editable(credit), false)
  assert.throws(() => editLine(credit, credit.lines[0].id, { quantity: 0 }))
  assert.throws(() => cancelOrder(credit))
  assert.equal(advance(credit).status, 'En preparación')
})

test('fiado rechaza datos incompletos, fechas inválidas, duplicados y pedidos pagados', () => {
  for (const change of [{ name: '  ' }, { phone: '123' }, { phone: '+56 2 1234 5678' }, { dueDate: '2026-02-30' }, { dueDate: '2026-09-10' }, { dueDate: '' }]) {
    assert.throws(() => leaveOnCredit(order(), { ...input, ...change }, today, now))
  }
  assert.equal(validDate('2028-02-29'), true)
  assert.equal(validDate('2026-02-29'), false)
  assert.equal(normalizePhone('+56 (9) 1234-5678'), '+56912345678')
  assert.equal(normalizePhone('+1 202 555 0100'), '+12025550100')
  assert.equal(normalizePhone('tel:912345678'), null)
  const c = leaveOnCredit(order(), input, today, now)
  assert.throws(() => leaveOnCredit(c, input, today, now))
  assert.throws(() => leaveOnCredit(pay(order(), 'Tarjeta', ''), input, today, now))
  assert.throws(() => leaveOnCredit(newOrder(1), input, today, now))
  assert.throws(() => leaveOnCredit(cancelOrder(order()), input, today, now))
})

test('vencimiento y recordatorio preparan el mensaje sin envío automático', () => {
  const c = leaveOnCredit(order(), input, today, now)
  assert.equal(creditStatus(c, today), 'Próximo')
  assert.equal(creditStatus(c, '2026-09-13'), 'Para hoy')
  assert.equal(creditStatus(c, '2026-09-14'), 'Vencido')
  const url = new URL(whatsappLink(c))
  assert.equal(url.origin, 'https://wa.me')
  assert.equal(url.pathname, '/56912345678')
  assert.equal(url.searchParams.get('text'), creditMessage(c))
  assert.match(creditMessage(c), /13\/09\/2026/)
  const paid = pay(c, 'Efectivo', '5000')
  assert.equal(creditStatus(paid, today), 'Pagado')
  assert.throws(() => creditMessage(paid))
})

test('liquidar fiado registra una sola venta al pagar y conserva el historial', () => {
  const c = leaveOnCredit(order(), input, today, now)
  const settled = pay(c, 'Efectivo', '10000')
  assert.equal(settled.payment.change, 7500)
  assert.deepEqual(settled.credit, c.credit)
  assert.equal(dailySales([settled], new Date(settled.payment.date)).amount, 2500)
  assert.throws(() => pay(settled, 'Tarjeta', ''))
  const persisted = { version: 1, orders: [settled] }
  assert.deepEqual(decode(JSON.stringify(persisted)), persisted)
  assert.doesNotThrow(() => decode(JSON.stringify({ version: 1, orders: [order()] })))
  assert.throws(() => decode(JSON.stringify({ version: 1, orders: [{ ...c, credit: { ...c.credit, amount: 1 } }] })))
  assert.throws(() => decode(JSON.stringify({ version: 1, orders: [{ ...c, credit: { ...c.credit, phone: 'invalid' } }] })))
})
