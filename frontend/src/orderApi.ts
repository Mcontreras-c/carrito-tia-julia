import { decode } from './orders.ts'
import type { Order } from './orders'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
let csrf: string | null = null
async function request(path: string, data?: unknown): Promise<unknown> {
  if (data !== undefined && !csrf) {
    const value = await request('/api/csrf/') as { token: string }
    csrf = value.token
  }
  const res = await fetch(path, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(data !== undefined ? { 'Content-Type': 'application/json', 'X-CSRFToken': csrf! } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 403) csrf = null
    throw new ApiError(typeof body?.detail === 'string' ? body.detail : Array.isArray(body) ? body.join(' ') : 'No se pudo completar la operación. Comprueba Django y Oracle.', res.status)
  }
  return body
}
function asOrder(data: unknown): Order {
  const order = decode(JSON.stringify({ version: 1, orders: [data] })).orders[0]
  if (!Number.isSafeInteger(order.revision)) throw Error('Respuesta de pedido inválida.')
  return order
}
export async function listOrders(): Promise<Order[]> {
  const orders = decode(JSON.stringify({ version: 1, orders: await request('/api/pedidos/') })).orders
  if (!orders.every(o => Number.isSafeInteger(o.revision))) throw Error('Respuesta de pedidos inválida.')
  return orders
}
export async function createOrder(requestId: string) {
  return asOrder(await request('/api/pedidos/', { requestId }))
}
export function mutation(before: Order, after: Order, requestId: string) {
  let action = 'edit'
  let data: unknown = { name: after.name, lines: after.lines }
  if (!before.payment && after.payment) { action = 'pay'; data = { method: after.payment.method, received: after.payment.received } }
  else if (!before.credit && after.credit) { action = 'credit'; data = { name: after.credit.name, phone: after.credit.phone, dueDate: after.credit.dueDate } }
  else if (before.status !== after.status) { action = after.status === 'Cancelado' ? 'cancel' : 'advance'; data = {} }
  return { requestId, revision: before.revision, action, data }
}
export async function changeOrder(before: Order, after: Order, requestId: string) {
  return asOrder(await request(`/api/pedidos/${encodeURIComponent(before.id)}/operaciones/`, mutation(before, after, requestId)))
}
