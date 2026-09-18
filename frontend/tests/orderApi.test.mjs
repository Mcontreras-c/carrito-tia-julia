import test from 'node:test'
import assert from 'node:assert/strict'
import { createOrder, changeOrder, listOrders, ApiError } from '../src/orderApi.ts'
import { newOrder, addProduct, pay } from '../src/orders.ts'

test('API usa CSRF y conserva la misma clave al reintentar un cobro', async t => {
  const before = { ...addProduct(newOrder(1), { id: 1, nombre: 'Completo', precio: 2500, disponible: true }), id: '45', day: '2026-09-12', revision: 3 }
  const after = pay(before, 'Efectivo', '5000')
  const requests = []
  let paymentCalls = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    if (url === '/api/csrf/') return Response.json({ token: 'test-token' })
    if (++paymentCalls === 1) throw new TypeError('Connection lost')
    return Response.json({ ...after, revision: 4 })
  })
  const key = crypto.randomUUID()
  await assert.rejects(changeOrder(before, after, key), TypeError)
  const confirmed = await changeOrder(before, after, key)
  assert.equal(confirmed.revision, 4)
  assert.equal(requests.length, 3)
  assert.equal(requests[2].url, '/api/pedidos/45/operaciones/')
  assert.equal(requests[1].options.body, requests[2].options.body)
  assert.equal(requests[2].options.headers['X-CSRFToken'], 'test-token')
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    requestId: key, revision: 3, action: 'pay', data: { method: 'Efectivo', received: 5000 },
  })
})

test('API rechaza un conflicto sin presentar un cambio como guardado', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Actualiza los pedidos.' }, { status: 409 }))
  await assert.rejects(createOrder(crypto.randomUUID()), error => error instanceof ApiError && error.status === 409)
})

test('API rechaza registros sin revisión para no sobrescribir datos antiguos', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([newOrder(1)]))
  await assert.rejects(listOrders(), /inválida/)
})
