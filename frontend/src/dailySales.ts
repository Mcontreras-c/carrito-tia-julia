import type { Method, Order } from './orders'

export const SALES_TIMEZONE = 'America/Santiago'
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALES_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

export function salesDay(date: Date | string): string {
  const parts = dateFormatter.formatToParts(new Date(date))
  const part = (type: string) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

type PaidOrder = Order & { payment: NonNullable<Order['payment']> }
type CreditOrder = Order & { credit: NonNullable<Order['credit']> }
export function dailySales(orders: Order[], date: Date | string) {
  const day = salesDay(date)
  const paid = orders.filter((o): o is PaidOrder => o.status !== 'Cancelado' && o.payment !== null && salesDay(o.payment.date) === day)
    .sort((a, b) => Date.parse(b.payment.date) - Date.parse(a.payment.date))
  const methods: { method: Method; amount: number; count: number }[] = ['Efectivo', 'Transferencia', 'Tarjeta'].map(method => ({ method: method as Method, amount: 0, count: 0 }))
  for (const o of paid) {
    const method = methods.find(m => m.method === o.payment.method)!
    method.amount += o.payment.total
    method.count += 1
  }
  const credits = orders.filter((o): o is CreditOrder => o.status !== 'Cancelado' && !!o.credit && salesDay(o.credit.date) === day)
    .sort((a, b) => Date.parse(b.credit.date) - Date.parse(a.credit.date))
  return {
    paid, methods, amount: paid.reduce((sum, o) => sum + o.payment.total, 0), count: paid.length,
    credits, creditAmount: credits.reduce((sum, o) => sum + o.credit.amount, 0),
    creditPendingAmount: credits.filter(o => !o.payment).reduce((sum, o) => sum + o.credit.amount, 0),
  }
}
