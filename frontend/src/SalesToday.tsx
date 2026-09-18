import { useEffect, useRef, useState } from 'react'
import { dailySales, SALES_TIMEZONE } from './dailySales'
import { money } from './orders'
import type { Order } from './orders'
import { dueLabel } from './creditReminders'

export default function DailySales({ orders, onSelect }: { orders: Order[]; onSelect: (order: Order) => void }) {
  const [now, setNow] = useState(() => new Date())
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const summary = dailySales(orders, now)
  const date = new Intl.DateTimeFormat('es-CL', { timeZone: SALES_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  const time = new Intl.DateTimeFormat('es-CL', { timeZone: SALES_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return <section aria-label="Ventas del día">
    <div className="page-heading"><div><p className="eyebrow">LAS CUENTAS DEL DÍA</p><h1 ref={heading} tabIndex={-1}>Ventas del día</h1><p className="sales-date">{date} · horario de Santiago</p></div><span className="local-mode">Registros de Oracle</span></div>
    <div className="sales-overview" aria-live="polite"><article className="sales-stat sales-highlight"><span>Total cobrado hoy</span><strong>{money(summary.amount)}</strong><small>Solo dinero recibido; los fiados pendientes no se suman</small></article><article className="sales-stat"><span>Pedidos pagados</span><strong>{summary.count}</strong><small>Incluye los que siguen en preparación</small></article></div>
    <section className="sales-methods" aria-label="Ventas por medio de pago">{summary.methods.map(m => <article className="sales-stat" key={m.method}><span>{m.method}</span><strong>{money(m.amount)}</strong><small>{m.count} {m.count === 1 ? 'pago' : 'pagos'}</small></article>)}</section>
    <p className="sales-explanation">El efectivo corresponde al valor vendido, descontando el vuelto. No incluye dinero inicial de caja ni gastos. Los pedidos sin pagar o cancelados no se suman.</p>
    <section className="sales-payments"><div className="between"><h2>Pagos de hoy</h2><span className="status-label">Más recientes primero</span></div>{summary.paid.length === 0 ? <div className="message"><h3>Todavía no hay ventas pagadas hoy</h3><p>Cuando confirmes un pago, aparecerá aquí automáticamente.</p></div> : <div className="sales-table-wrap"><table className="sales-table"><caption>Pedidos con pago registrado hoy, en horario de Santiago</caption><thead><tr><th scope="col">Hora</th><th scope="col">Pedido / cliente</th><th scope="col">Medio de pago</th><th scope="col">Total</th><th scope="col">Detalle</th></tr></thead><tbody>{summary.paid.map(o => <tr key={o.id}><td>{time.format(new Date(o.payment.date))}</td><td><strong>#{o.number}</strong>{o.day && <small className="sales-customer">Pedido del {dueLabel(o.day)}</small>}<span className="sales-customer">{o.name || 'Sin nombre'}</span></td><td>{o.payment.method}</td><td className="sales-money">{money(o.payment.total)}</td><td><button className="text-button" onClick={() => onSelect(o)} aria-label={`Ver pedido ${o.number}`}>Ver pedido →</button></td></tr>)}</tbody></table></div>}</section>
    <section className="sales-payments daily-credits"><div className="between"><h2>Fiados registrados hoy</h2><span className="badge amber">Registro de deuda, no de cobro</span></div><div className="sales-overview"><article className="sales-stat"><span>Monto dejado fiado hoy</span><strong>{money(summary.creditAmount)}</strong><small>{summary.credits.length} pedidos · separado del total cobrado</small></article><article className="sales-stat"><span>De estos fiados, queda por cobrar</span><strong>{money(summary.creditPendingAmount)}</strong><small>Los ya pagados conservan su historial</small></article></div>{!summary.credits.length ? <p className="sales-explanation">No se registraron fiados hoy.</p> : <div className="sales-table-wrap"><table className="sales-table"><caption>Fiados según la fecha en que se registró la deuda, en horario de Santiago</caption><thead><tr><th scope="col">Hora</th><th scope="col">Pedido / cliente</th><th scope="col">Estado</th><th scope="col">Monto fiado</th><th scope="col">Fecha prometida</th><th scope="col">Detalle</th></tr></thead><tbody>{summary.credits.map(o => <tr key={o.id}><td>{time.format(new Date(o.credit.date))}</td><td><strong>#{o.number}</strong>{o.day && <small className="sales-customer">Pedido del {dueLabel(o.day)}</small>}<span className="sales-customer">{o.credit.name}</span></td><td><span className={`badge ${o.payment ? 'green' : 'amber'}`}>{o.payment ? 'Fiado pagado' : 'Fiado pendiente'}</span></td><td className="sales-money">{money(o.credit.amount)}</td><td>{dueLabel(o.credit.dueDate)}</td><td><button className="text-button" onClick={() => onSelect(o)}>Ver pedido →</button></td></tr>)}</tbody></table></div>}</section>
  </section>
}

