import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addProduct, advance, cancelOrder, decode, editLine, newOrder, parseCash, pay, total } from '../src/orders.ts'

const p = { id: 1, nombre: 'Completo', precio: 2500, imagen: null, disponible: true, categoria: 1, categoria_nombre: 'Completos' }
test('números diarios repetidos identifican pedidos independientes', () => {
  const a = { ...newOrder(1), day: '2026-09-12' }
  const b = { ...newOrder(1), day: '2026-09-13' }
  assert.equal(decode(JSON.stringify({ version: 1, orders: [a, b] })).orders.length, 2)
  assert.throws(() => decode(JSON.stringify({ version: 1, orders: [a, { ...b, day: a.day }] })))
})
test('eliminar antes de preparar recalcula el total sin alterar otro pedido', () => {
  const a = addProduct(newOrder(1), p), b = addProduct(newOrder(2), p)
  const empty = editLine(a, a.lines[0].id, { quantity: 0 })
  assert.equal(empty.lines.length, 0)
  assert.equal(total(empty), 0)
  assert.equal(total(b), 2500)
  assert.equal(a.payment, null)
  assert.equal(cancelOrder(a).status, 'Cancelado')
  assert.throws(() => editLine(advance(a), a.lines[0].id, { quantity: 0 }))
  assert.throws(() => cancelOrder(pay(a, 'Efectivo', '2500')))
})
test('pedidos independientes, cantidades y precio histórico', () => {
  const first = newOrder(1), second = newOrder(2)
  const order = addProduct(addProduct(first, p), p)
  assert.equal(total(order), 5000)
  assert.equal(total(second), 0)
  assert.equal(first.lines.length, 0)
  assert.equal(total(addProduct(order, { ...p, precio: 3000 })), 8000)
})
test('indicaciones diferentes se conservan en líneas independientes', () => {
  const order = addProduct(newOrder(1), p)
  order.lines[0].note = 'Sin tomate'
  const next = addProduct(order, p)
  assert.equal(next.lines.length, 2)
  assert.equal(next.lines[0].note, 'Sin tomate')
  assert.equal(next.lines[1].note, '')
})
test('cobro valida vacío, decimales, insuficiente y duplicado', () => {
  assert.throws(() => pay(newOrder(1), 'Efectivo', '10000'))
  const order = addProduct(newOrder(1), p)
  for (const amount of ['', '-1', '2500.5', '2.500', '2000', 'abc']) assert.throws(() => pay(order, 'Efectivo', amount))
  const paid = pay(order, 'Efectivo', '10000')
  assert.equal(paid.payment.change, 7500)
  assert.throws(() => pay(paid, 'Efectivo', '10000'))
  assert.throws(() => addProduct(paid, p))
  assert.equal(parseCash('0'), 0)
})
test('preparación y pago son independientes; cancelados y agotados se protegen', () => {
  const order = advance(advance(addProduct(newOrder(1), p)))
  assert.equal(order.status, 'Entregado')
  assert.equal(order.payment, null)
  assert.equal(pay(order, 'Tarjeta', '').payment.received, null)
  assert.throws(() => advance(order))
  assert.throws(() => addProduct(order, p))
  assert.throws(() => pay({ ...order, status: 'Cancelado' }, 'Tarjeta', ''))
  assert.throws(() => addProduct(newOrder(1), { ...p, disponible: false }))
})
test('almacenamiento conserva los pedidos y rechaza datos dañados', () => {
  const order = pay(addProduct(newOrder(1), p), 'Transferencia', '')
  const state = { version: 1, orders: [order] }
  assert.deepEqual(decode(JSON.stringify(state)), state)
  assert.throws(() => decode('{'))
  assert.throws(() => decode(JSON.stringify({ version: 2, orders: [] })))
  assert.throws(() => decode(JSON.stringify({ version: 1, orders: [order, order] })))
  assert.throws(() => decode(JSON.stringify({ version: 1, orders: [{ ...order, payment: { ...order.payment, total: 1 } }] })))
})
