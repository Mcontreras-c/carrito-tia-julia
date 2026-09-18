export type Product = { id: number; nombre: string; precio: number; imagen: string | null; disponible: boolean; categoria: number; categoria_nombre: string }
export type Line = { id: string; productId: number; name: string; price: number; quantity: number; note: string }
export type Status = 'Pendiente' | 'En preparación' | 'Entregado' | 'Cancelado'
export type Method = 'Efectivo' | 'Transferencia' | 'Tarjeta'
export type Credit = { name: string; phone: string; dueDate: string; amount: number; date: string }
export type CreditInput = { name: string; phone: string; dueDate: string }
export type Order = { id: string; number: number; day?: string; revision?: number; name: string; created: string; status: Status; lines: Line[]; credit?: Credit; payment: null | { method: Method; total: number; received: number | null; change: number | null; date: string } }
export type Store = { version: 1; orders: Order[] }
export const KEY = 'tia-julia.orders.v1'
export const money = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
export const total = (o: Order) => o.lines.reduce((s, l) => s + l.price * l.quantity, 0)
export const editable = (o: Order) => o.status === 'Pendiente' && !o.payment && !o.credit
export const isOpenOrder = (o: Order) => o.status !== 'Cancelado' && (o.status !== 'Entregado' || (!o.payment && !o.credit))
export function editLine(o: Order, id: string, change: { quantity?: number; note?: string }): Order {
  if (!editable(o)) throw Error('Solo se pueden modificar productos de pedidos pendientes y sin pagar.')
  if (change.quantity !== undefined && (!Number.isInteger(change.quantity) || change.quantity < 0 || change.quantity > 99)) throw Error('La cantidad debe estar entre 0 y 99.')
  return { ...o, lines: o.lines.map(l => l.id === id ? { ...l, ...change } : l).filter(l => l.quantity > 0) }
}
export function cancelOrder(o: Order): Order {
  if (!editable(o)) throw Error('Solo se pueden cancelar pedidos pendientes y sin pagar.')
  return { ...o, status: 'Cancelado' }
}
export function newOrder(number: number): Order { return { id: crypto.randomUUID(), number, name: '', created: new Date().toISOString(), status: 'Pendiente', lines: [], payment: null } }
export function isProduct(v: unknown): v is Product {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return Number.isSafeInteger(p.id) && typeof p.nombre === 'string' && typeof p.precio === 'number' && Number.isSafeInteger(p.precio) && p.precio > 0 && p.precio <= 999999999999 && (p.imagen === null || typeof p.imagen === 'string') && typeof p.disponible === 'boolean' && Number.isSafeInteger(p.categoria) && typeof p.categoria_nombre === 'string'
}
export function addProduct(o: Order, p: Product): Order {
  if (!editable(o)) throw Error('Este pedido ya no se puede editar.')
  if (!p.disponible) throw Error('Este producto está agotado.')
  const line = o.lines.find(l => l.productId === p.id && l.price === p.precio && !l.note)
  if (line && line.quantity >= 99) throw Error('Máximo 99 unidades por línea.')
  return { ...o, lines: line ? o.lines.map(l => l.id === line.id ? { ...l, quantity: l.quantity + 1 } : l) : [...o.lines, { id: crypto.randomUUID(), productId: p.id, name: p.nombre, price: p.precio, quantity: 1, note: '' }] }
}
export function parseCash(text: string): number | null {
  if (!/^\d{1,12}$/.test(text)) return null
  const n = Number(text)
  return Number.isSafeInteger(n) ? n : null
}
export function pay(o: Order, method: Method, cash: string): Order {
  const amount = total(o)
  if (o.payment) throw Error('Este pedido ya está pagado.')
  if (o.status === 'Cancelado' || amount <= 0 || !Number.isSafeInteger(amount)) throw Error('No se puede cobrar este pedido.')
  const received = method === 'Efectivo' ? parseCash(cash) : null
  if (method === 'Efectivo' && (received === null || received < amount)) throw Error('El monto recibido no alcanza para pagar.')
  return { ...o, payment: { method, total: amount, received, change: received === null ? null : received - amount, date: new Date().toISOString() } }
}
export function advance(o: Order): Order {
  if (!o.lines.length) throw Error('Agrega productos antes de preparar el pedido.')
  if (o.status === 'Pendiente') return { ...o, status: 'En preparación' }
  if (o.status === 'En preparación') return { ...o, status: 'Entregado' }
  throw Error('Este pedido ya está cerrado.')
}
export function decode(raw: string): Store {
  const s = JSON.parse(raw) as Store
  const safe = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0
  if (s?.version !== 1 || !Array.isArray(s.orders) || !s.orders.every(o =>
    typeof o.id === 'string' && safe(o.number) && typeof o.name === 'string' && typeof o.created === 'string' && Number.isFinite(Date.parse(o.created)) && ['Pendiente', 'En preparación', 'Entregado', 'Cancelado'].includes(o.status)
    && Array.isArray(o.lines) && o.lines.every(l => typeof l.id === 'string' && safe(l.productId) && typeof l.name === 'string' && safe(l.price) && safe(l.quantity) && l.quantity <= 99 && typeof l.note === 'string')
    && (o.credit === undefined || validCredit(o.credit, o))
    && Number.isSafeInteger(total(o)) && (o.payment === null || (o.payment && ['Efectivo', 'Transferencia', 'Tarjeta'].includes(o.payment.method) && o.payment.total === total(o) && safe(o.payment.total) && typeof o.payment.date === 'string' && Number.isFinite(Date.parse(o.payment.date)) && (o.payment.method === 'Efectivo' ? typeof o.payment.received === 'number' && Number.isSafeInteger(o.payment.received) && o.payment.received >= o.payment.total && o.payment.change === o.payment.received - o.payment.total : o.payment.received === null && o.payment.change === null)))
    && (o.day === undefined || (typeof o.day === 'string' && validDate(o.day)))
  ) || new Set(s.orders.map(o => o.id)).size !== s.orders.length || new Set(s.orders.map(o => `${o.day ?? 'local'}:${o.number}`)).size !== s.orders.length) throw Error('No pudimos leer los pedidos guardados. Conservamos los datos; no se sobrescribirán.')
  return s
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function normalizePhone(value: string): string | null {
  const clean = value.replace(/[\s()-]/g, '')
  if (/^9\d{8}$/.test(clean)) return '+56' + clean
  if (/^569\d{8}$/.test(clean)) return '+' + clean
  if (/^\+56/.test(clean)) return /^\+569\d{8}$/.test(clean) ? clean : null
  return /^\+[1-9]\d{7,14}$/.test(clean) ? clean : null
}

function validCredit(c: Credit, o: Order): boolean {
  return !!c && typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 120
    && typeof c.phone === 'string' && normalizePhone(c.phone) === c.phone
    && typeof c.dueDate === 'string' && validDate(c.dueDate)
    && c.amount === total(o) && c.amount > 0 && Number.isSafeInteger(c.amount)
    && typeof c.date === 'string' && Number.isFinite(Date.parse(c.date)) && o.status !== 'Cancelado'
}

export function leaveOnCredit(o: Order, input: CreditInput, today: string, now = new Date()): Order {
  if (o.payment || o.credit || o.status === 'Cancelado' || total(o) <= 0) throw Error('Este pedido no se puede dejar fiado.')
  const name = input.name.trim()
  if (!name || name.length > 120) throw Error('Escribe el nombre del cliente.')
  const phone = normalizePhone(input.phone)
  if (!phone) throw Error('Ingresa un celular válido: 9 dígitos para Chile, o un número internacional con + y código de país.')
  if (!validDate(input.dueDate) || !validDate(today) || input.dueDate < today) throw Error('Elige la fecha prometida de pago, desde hoy en adelante.')
  return { ...o, name, credit: { name, phone, dueDate: input.dueDate, amount: total(o), date: now.toISOString() } }
}
