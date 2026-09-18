import { money } from './orders.ts'
import type { Order } from './orders.ts'

export type CreditStatus = 'Vencido' | 'Para hoy' | 'Próximo' | 'Pagado'
export function creditStatus(order: Order, today: string): CreditStatus {
  if (!order.credit) throw Error('El pedido no está fiado.')
  if (order.payment) return 'Pagado'
  if (order.credit.dueDate < today) return 'Vencido'
  return order.credit.dueDate === today ? 'Para hoy' : 'Próximo'
}
export function dueLabel(day: string) {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}
export function creditMessage(order: Order) {
  const c = order.credit
  if (!c || order.payment || order.status === 'Cancelado') throw Error('No hay un fiado pendiente para recordar.')
  return `Hola ${c.name}, te escribimos de Tía Julia para recordarte el pago pendiente de ${money(c.amount)} del pedido #${order.number}, acordado para el ${dueLabel(c.dueDate)}. ¿Nos confirmas cuándo podrás pagarlo? Muchas gracias.`
}
export function whatsappLink(order: Order) {
  return `https://wa.me/${order.credit!.phone.slice(1)}?text=${encodeURIComponent(creditMessage(order))}`
}
