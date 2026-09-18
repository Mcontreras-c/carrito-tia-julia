import { useEffect, useRef, useState } from 'react'
import { money } from './orders'
import type { Order } from './orders'
import { creditMessage, creditStatus, dueLabel, whatsappLink } from './creditReminders'
import type { CreditStatus } from './creditReminders'

export default function CreditAccounts({ orders, today, onCollect, onSelect }: { orders: Order[]; today: string; onCollect: (o: Order) => void; onSelect: (o: Order) => void }) {
  const [filter, setFilter] = useState<'Pendientes' | CreditStatus>('Pendientes')
  const [preview, setPreview] = useState<string | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { title.current?.focus() }, [])
  const accounts = orders.filter(o => o.credit && o.status !== 'Cancelado').sort((a, b) => a.credit!.dueDate.localeCompare(b.credit!.dueDate) || a.number - b.number)
  const pending = accounts.filter(o => !o.payment)
  const overdue = pending.filter(o => creditStatus(o, today) === 'Vencido')
  const due = pending.filter(o => creditStatus(o, today) === 'Para hoy')
  const visible = accounts.filter(o => filter === 'Pendientes' ? !o.payment : creditStatus(o, today) === filter)
  return <section>
    <div className="page-heading"><div><p className="eyebrow">PARA QUE NINGÚN PAGO SE OLVIDE</p><h1 ref={title} tabIndex={-1}>Fiados y recordatorios</h1><p>Fecha de hoy: {dueLabel(today)} · horario de Santiago</p></div><span className="local-mode">Guardado en Oracle</span></div>
    <div className="credit-stats"><article className="sales-stat sales-highlight"><span>Total por cobrar</span><strong>{money(pending.reduce((sum, o) => sum + o.credit!.amount, 0))}</strong><small>{pending.length} pedidos fiados pendientes</small></article><article className="sales-stat"><span>Vencidos</span><strong>{overdue.length}</strong><small>{money(overdue.reduce((sum, o) => sum + o.credit!.amount, 0))} por cobrar</small></article><article className="sales-stat"><span>Prometidos para hoy</span><strong>{due.length}</strong><small>{money(due.reduce((sum, o) => sum + o.credit!.amount, 0))} por cobrar</small></article></div>
    <p className="sales-explanation">Para dejar un pedido fiado, abre su pantalla de cobro y elige «Fiado». Los avisos se consultan aquí; no se envían notificaciones con la aplicación cerrada.</p>
    <nav className="categories credit-filters" aria-label="Estado del fiado">{(['Pendientes', 'Vencido', 'Para hoy', 'Próximo', 'Pagado'] as const).map(f => <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); setPreview(null) }}>{f === 'Vencido' ? 'Vencidos' : f === 'Próximo' ? 'Próximos' : f === 'Pagado' ? 'Pagados' : f}</button>)}</nav>
    <p className="catalog-caption" role="status">{visible.length} {visible.length === 1 ? 'pedido' : 'pedidos'} · Ordenados por fecha prometida</p>
    {!visible.length ? <div className="message"><h2>No hay fiados en esta lista</h2><p>{filter === 'Pendientes' ? 'Aquí aparecerán los pedidos que registres como fiados.' : 'Prueba con otro estado para ver los demás pedidos.'}</p></div> : <div className="credit-grid">{visible.map(o => {
      const c = o.credit!
      const status = creditStatus(o, today)
      return <article className="credit-card" key={o.id}><div className="between"><span className="status-label">Pedido #{o.number}{o.day && <> · {dueLabel(o.day)}</>}</span><span className={`badge ${status === 'Pagado' ? 'green' : status === 'Vencido' ? 'credit-overdue' : 'amber'}`}>{status}</span></div><h2>{c.name}</h2><a className="credit-phone" href={`tel:${c.phone}`}>{c.phone}</a><dl className="credit-details"><div><dt>{o.payment ? 'Monto pagado' : 'Monto pendiente'}</dt><dd>{money(c.amount)}</dd></div><div><dt>Fecha prometida</dt><dd>{dueLabel(c.dueDate)}</dd></div></dl>{o.payment ? <p className="credit-paid">Pagado por {o.payment.method.toLowerCase()} el {new Date(o.payment.date).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' })}</p> : <><button className="primary full" onClick={() => onCollect(o)}>Registrar pago recibido</button><button className="secondary full" aria-expanded={preview === o.id} onClick={() => setPreview(preview === o.id ? null : o.id)}>{preview === o.id ? 'Cerrar recordatorio' : 'Preparar recordatorio'}</button>{preview === o.id && <div className="reminder-preview"><p>{creditMessage(o)}</p><a className="whatsapp-action" href={whatsappLink(o)} target="_blank" rel="noopener noreferrer">Abrir WhatsApp con este mensaje ↗</a><small>Revisa el destinatario y pulsa Enviar en WhatsApp. Abrirlo aquí no confirma el envío.</small></div>}</>}<button className="text-button credit-detail" onClick={() => onSelect(o)}>Ver detalle del pedido →</button></article>
    })}</div>}
  </section>
}

