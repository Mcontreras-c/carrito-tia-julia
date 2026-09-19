import { useEffect, useRef, useState } from 'react'
import { addProduct, advance, cancelOrder, editLine, editable, isOpenOrder, isProduct, leaveOnCredit, money, newId, pay, total } from './orders'
import type { Order, Product, Store } from './orders'
import './App.css'
import DailySales from './SalesToday'
import CreditAccounts from './CreditAccounts'
import Checkout from './Checkout'
import { salesDay } from './dailySales'
import { dueLabel } from './creditReminders'
import SavedInput from './SavedInput'
import { ApiError, changeOrder, createOrder, listOrders } from './orderApi'

type View = 'sale' | 'orders' | 'pay' | 'daily' | 'credit'
function Picture({ product: p }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  const icon = /papa/i.test(p.nombre) ? '🍟' : /completo/i.test(p.nombre) ? '🌭' : /churrasco/i.test(p.nombre) ? '🥪' : /agua/i.test(p.nombre) ? '💧' : '🥤'
  return <div className="food-picture">{p.imagen && !failed ? <img src={p.imagen} alt="" onError={() => setFailed(true)} /> : <><span aria-hidden="true">{icon}</span><small>Imagen referencial</small></>}</div>
}
function App() {

  const [store, setStore] = useState<Store>({ version: 1, orders: [] })
  const currentStore = useRef(store)
  const queue = useRef(Promise.resolve())
  const blocked = useRef(false)
  const retryRequest = useRef<null | (() => Promise<void>)>(null)
  const inFlight = useRef(0)
  const [busy, setBusy] = useState(false)
  const [canRetry, setCanRetry] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [active, setActive] = useState('')
  const [view, setView] = useState<View>('sale')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [category, setCategory] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [today, setToday] = useState(() => salesDay(new Date()))

  const [cancelId, setCancelId] = useState<string | null>(null)
  const [history, setHistory] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const order = store.orders.find(o => o.id === active)
  const open = store.orders.filter(isOpenOrder)
  const closed = store.orders.filter(o => !isOpenOrder(o))
  useEffect(() => {
    const refresh = () => setToday(salesDay(new Date()))
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  const debts = store.orders.filter(o => o.credit && !o.payment && o.status !== 'Cancelado')
  const dueDebts = debts.filter(o => o.credit!.dueDate <= today)
  useEffect(() => { heading.current?.focus() }, [view])
  useEffect(() => {
    const controller = new AbortController()
    let valid = true
    const timer = window.setTimeout(() => controller.abort(), 12000)
    async function load() {
      try {
        const res = await fetch('/api/productos/', { headers: { Accept: 'application/json' }, signal: controller.signal })
        if (!res.ok) throw Error()
        const data: unknown = await res.json()
        if (!Array.isArray(data) || !data.every(isProduct)) throw Error()
        if (valid) setProducts(data)
      } catch { if (valid) setCatalogError(true) }
      finally { clearTimeout(timer); if (valid) setLoading(false) }
    }
    void load()
    return () => { valid = false; clearTimeout(timer); controller.abort() }
  }, [attempt])
  function accept(orders: Order[]) {
    const next = { version: 1 as const, orders }
    currentStore.current = next
    setStore(next)
  }
  async function refresh() {
    if (inFlight.current > 0) return
    setLoadingOrders(true)
    setLoading(true)
    setCatalogError(false)
    setAttempt(value => value + 1)
    try {
      const orders = await listOrders()
      accept(orders)
      setActive(id => orders.some(o => o.id === id) ? id : orders.find(isOpenOrder)?.id ?? '')
      setReady(true)
      blocked.current = false
      retryRequest.current = null
      setCanRetry(false)
      setError('')
    } catch { setError('No pudimos consultar el sistema. Comprueba que Django y la base de datos estén encendidos.') }
    finally { setLoadingOrders(false) }
  }
  useEffect(() => {
    let valid = true
    void listOrders().then(orders => {
      if (!valid) return
      accept(orders)
      setActive(orders.find(isOpenOrder)?.id ?? '')
      setReady(true)
    }).catch(() => { if (valid) setError('No pudimos consultar el sistema. Comprueba que Django y la base de datos estén encendidos.') })
      .finally(() => { if (valid) setLoadingOrders(false) })
    return () => { valid = false }
  }, [])
  function remember(order: Order) {
    const previous = currentStore.current.orders
    accept(previous.some(o => o.id === order.id) ? previous.map(o => o.id === order.id ? order : o) : [...previous, order])
  }
  async function execute(task: () => Promise<void>) {
    try { await task(); setError(''); retryRequest.current = null; setCanRetry(false); return true }
    catch (e) {
      blocked.current = true
      retryRequest.current = e instanceof ApiError && e.status < 500 ? null : task
      setCanRetry(retryRequest.current !== null)
      setError(e instanceof ApiError ? e.message : 'No se pudo confirmar el guardado. Reintenta la misma operación o actualiza los pedidos para comprobar su estado.')
      return false
    }
  }
  function enqueue(task: () => Promise<boolean>): Promise<boolean> {
    inFlight.current += 1
    setBusy(true)
    const result = queue.current.then(async () => {
      if (blocked.current) return false
      return task()
    }).catch(e => { setError(e instanceof Error ? e.message : 'No se pudo cambiar el pedido.'); return false })
    queue.current = result.then(() => { inFlight.current -= 1; setBusy(inFlight.current > 0) })
    return result
  }
  function update(id: string, fn: (o: Order) => Order): Promise<boolean> {
    return enqueue(async () => {
      const before = currentStore.current.orders.find(o => o.id === id)
      if (!before) return false
      const after = fn(before)
      const key = newId()
      return execute(async () => { remember(await changeOrder(before, after, key)) })
    })
  }
  async function create() {
    await enqueue(async () => {
      const key = newId()
      return execute(async () => {
        const next = await createOrder(key)
        remember(next)
        setActive(next.id); setView('sale'); setNotice(`Pedido #${next.number} creado en el sistema`); setCancelId(null)
      })
    })
  }
  async function retrySave() {
    const task = retryRequest.current
    if (!task || inFlight.current > 0) return
    blocked.current = false
    const ok = await enqueue(() => execute(task))
    if (ok) setNotice('Operación confirmada en el sistema. Puedes continuar.')
  }
  function select(o: Order) { setActive(o.id); setView('sale'); setCancelId(null); setNotice('') }
  function collect(o: Order) { setActive(o.id); setView('pay'); setNotice('') }
  function changeLine(id: string, change: { quantity?: number; note?: string }) {
    if (!order) return
    return update(order.id, o => {
      return editLine(o, id, change)
    })
  }
  function adjustLine(id: string, delta: number) {
    if (!order) return
    return update(order.id, current => {
      const line = current.lines.find(item => item.id === id)
      return line ? editLine(current, id, { quantity: line.quantity + delta }) : current
    })
  }
  async function split(id: string) {
    if (!order) return
    const ok = await update(order.id, o => {
      if (!editable(o)) throw Error('Este pedido ya no se puede editar.')
      const line = o.lines.find(l => l.id === id)
      if (!line || line.quantity < 2) return o
      return { ...o, lines: [...o.lines.map(l => l.id === id ? { ...l, quantity: l.quantity - 1 } : l), { ...line, id: newId(), quantity: 1 }] }
    })
    if (ok) setNotice('Unidad separada. Puedes escribir una indicación diferente en su línea.')
  }
  const categories = [...new Map(products.map(p => [p.categoria, p.categoria_nombre])).entries()]
  const filtered = products.filter(p => category === null || p.categoria === category)
  const name = (o: Order) => o.name || 'Sin nombre'
  const paidBadge = (o: Order) => <span className={`badge ${o.payment ? 'green' : 'amber'}`}>{o.payment ? '✓ Pagado' : o.credit ? 'Fiado' : 'Sin pagar'}</span>
  function lines(o: Order, controls: boolean) {
    return o.lines.length ? o.lines.map(l => <div className="order-line" key={l.id}>
      <div className="between"><strong>{l.name}</strong><span className="line-total">{money(l.price * l.quantity)}</span></div>
      {controls ? <><div className="quantity-row"><div className="stepper"><button aria-label={`Quitar una unidad de ${l.name}`} onClick={() => adjustLine(l.id, -1)}>−</button><span>{l.quantity}</span><button disabled={l.quantity >= 99} aria-label={`Agregar una unidad de ${l.name}`} onClick={() => adjustLine(l.id, 1)}>+</button></div><small>{money(l.price)} c/u</small><button className="remove" onClick={() => changeLine(l.id, { quantity: 0 })} aria-label={`Eliminar ${l.name}`}>Eliminar</button></div><label className="line-note">Indicaciones<SavedInput maxLength={500} value={l.note} placeholder="Ej. sin tomate" onSave={value => changeLine(l.id, { note: value }) ?? Promise.resolve(false)} /></label>{l.quantity > 1 && <button className="text-button split" onClick={() => split(l.id)}>Separar una unidad para personalizar</button>}</> : <><small>{l.quantity} × {money(l.price)}</small>{l.note && <p className="note-display">{l.note}</p>}</>}
    </div>) : <div className="empty-order"><span aria-hidden="true">＋</span><h3>Armemos este pedido</h3><p>Haz clic en un producto del menú para agregarlo.</p></div>
  }
  if (!ready) return <main><section className="message"><h1>Cargando tus pedidos</h1><p role="status">{loadingOrders ? 'Cargando pedidos…' : error}</p>{!loadingOrders && <button onClick={() => void refresh()}>Reintentar</button>}</section></main>
  return <div className="app">
    <header className="app-header"><div className="brand"><span className="brand-mark" aria-hidden="true">TJ</span><div>Tía Julia<small>HECHO CON CARIÑO</small></div></div><nav className="main-nav" aria-label="Pantallas"><button className={view === 'sale' || view === 'pay' ? 'selected' : ''} onClick={() => setView('sale')}>Venta</button><button className={view === 'orders' ? 'selected' : ''} onClick={() => setView('orders')}>Pedidos <span>{open.length}</span></button><button className={view === 'daily' ? 'selected' : ''} onClick={() => setView('daily')}>Ventas del día</button><button className={view === 'credit' ? 'selected' : ''} onClick={() => setView('credit')}>Fiados <span>{debts.length}</span></button></nav><span className="local-mode">{busy ? 'Guardando en el sistema…' : error ? 'Revisar guardado' : 'Conectado'}</span></header>

    <main>
      {error && <div className="alert" role="alert">{error}{canRetry && <button disabled={busy} onClick={() => void retrySave()}>Reintentar guardado</button>}</div>}<div className="between sync-toolbar"><span role="status">{busy ? 'Guardando cambios…' : 'Pedidos guardados'}</span><button disabled={busy || loadingOrders} onClick={() => void refresh()}>Actualizar pedidos</button></div>
      <div className="live-notice" role="status">{notice}</div>
      {view !== 'credit' && dueDebts.length > 0 && <div className="credit-attention"><span>{dueDebts.length} {dueDebts.length === 1 ? 'fiado para recordar hoy o vencido' : 'fiados para recordar hoy o vencidos'}</span><button className="text-button" onClick={() => setView('credit')}>Ver fiados →</button></div>}
      {view === 'credit' && <CreditAccounts orders={store.orders} today={today} onCollect={collect} onSelect={select} />}
      {view === 'daily' && <DailySales orders={store.orders} onSelect={select} />}
      {view === 'sale' && <>
        <div className="page-heading"><div><p className="eyebrow">AQUÍ EMPIEZA UN BUEN PEDIDO</p><h1 ref={heading} tabIndex={-1}>¿Qué va a llevar?</h1><p>Un pedido por cliente, todo en su lugar.</p></div><button className="primary" disabled={busy || !!error} onClick={create}>＋ Nuevo pedido</button></div>
        <div className="order-tabs" aria-label="Pedidos abiertos">{open.map(o => <button key={o.id} aria-pressed={active === o.id} onClick={() => select(o)}><strong>#{o.number}</strong> {name(o)}{o.payment && <span className="paid-dot" aria-label="Pagado">✓</span>}</button>)}</div>
        <div className="sale-layout"><section className="catalog" aria-label="Menú"><div className="categories"><button aria-pressed={category === null} onClick={() => setCategory(null)}>Todo el menú</button>{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div>
          {loading ? <div className="message" role="status">Cargando el menú…</div> : catalogError ? <div className="message" role="alert"><h2>No pudimos cargar el menú</h2><p>Comprueba la conexión y que el servidor esté encendido.</p><button onClick={() => { setLoading(true); setCatalogError(false); setAttempt(a => a + 1) }}>Reintentar</button></div> : !products.length ? <div className="message">Todavía no hay productos activos en el menú.</div> : <><p className="catalog-caption">{filtered.length} productos · Haz clic para agregar</p><div className="product-grid">{filtered.map(p => <button className="product" key={p.id} disabled={!p.disponible || !order || !editable(order)} onClick={() => order && update(order.id, o => addProduct(o, p))} aria-label={`Agregar ${p.nombre}, ${money(p.precio)}${p.disponible ? '' : ', agotado'}`}><Picture key={`${p.id}-${p.imagen}`} product={p} /><div className="product-copy"><small>{p.categoria_nombre}</small><h2>{p.nombre}</h2><div className="between"><strong>{money(p.precio)}</strong>{p.disponible ? <span className="add-sign" aria-hidden="true">＋</span> : <span className="badge amber">Agotado</span>}</div></div></button>)}</div></>}
        </section><aside className={`receipt${order ? '' : ' receipt-idle'}`}>{order ? <><div className="receipt-header"><div><small>PEDIDO ACTUAL</small><h2>Pedido #{order.number}</h2></div>{paidBadge(order)}</div><div className="receipt-body"><span className="status-label">{order.status}</span><label>Nombre del cliente <span>(opcional)</span><SavedInput value={order.name} maxLength={120} disabled={!editable(order)} placeholder="Ej. Ana" onSave={value => update(order.id, o => ({ ...o, name: value }))} /></label>{!editable(order) && <p className="locked-note">{order.status === 'Cancelado' ? 'Pedido cancelado.' : 'El pedido queda sin edición después de cobrar, dejar fiado o comenzar su preparación.'}</p>}{order.credit && <div className="receipt-credit"><strong>{order.payment ? 'Fiado pagado' : 'Pedido fiado'}</strong><span>{order.credit.name} · {order.credit.phone}</span><span>Fecha prometida: {dueLabel(order.credit.dueDate)}</span><button className="text-button" onClick={() => setView('credit')}>Ver fiados y recordatorios →</button></div>}{lines(order, editable(order))}<div className="total-row"><span>Total</span><strong>{money(total(order))}</strong></div><button className="primary full" disabled={!order.lines.length || !!order.payment || order.status === 'Cancelado'} onClick={() => collect(order)}>Cobrar {money(total(order))}</button><button className="full secondary" disabled={!order.lines.length} onClick={create}>Guardar y crear otro pedido</button><p className="parallel-hint">Puedes atender otro pedido sin cobrar este.</p><button className="full secondary" onClick={() => { setView('orders'); setNotice('Los cambios confirmados quedan guardados en el sistema.') }}>Ver pedidos</button>{editable(order) && <div className="cancel-area">{cancelId === order.id ? <><p>¿Cancelar este pedido?</p><div className="between"><button onClick={() => setCancelId(null)}>Conservar</button><button className="danger" onClick={async () => { if (await update(order.id, cancelOrder)) { setCancelId(null); setView('orders'); setNotice(`Pedido #${order.number} cancelado`) } }}>Sí, cancelar</button></div></> : <button className="danger full" onClick={() => setCancelId(order.id)}>Cancelar pedido completo</button>}</div>}</div></> : <div className="receipt-placeholder"><span className="placeholder-icon" aria-hidden="true">☰</span><h2>Aún no hay un pedido seleccionado</h2><p>Usa <strong>＋ Nuevo pedido</strong> arriba para comenzar a agregar productos.</p></div>}</aside></div>
      </>}
      {view === 'orders' && <><div className="page-heading"><div><p className="eyebrow">CADA CLIENTE, SU PEDIDO</p><h1 ref={heading} tabIndex={-1}>Pedidos del local</h1><p>Preparación y pago se controlan por separado.</p></div><button className="primary" disabled={busy || !!error} onClick={create}>＋ Nuevo pedido</button></div><div className="board">{(['Pendiente', 'En preparación', 'Entregado'] as const).map(status => <section className="board-column" key={status}><h2><span className={`status-dot s-${status === 'Pendiente' ? 'pending' : status === 'Entregado' ? 'done' : 'cooking'}`} />{status === 'Entregado' ? 'Entregados por cobrar' : status}<span className="column-count">{open.filter(o => o.status === status).length}</span></h2>{open.filter(o => o.status === status).map(o => <article className="order-card" key={o.id}><div className="between"><strong className="order-number">#{o.number}</strong>{paidBadge(o)}</div><h3>{name(o)}</h3><small>{new Date(o.created).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>{lines(o, false)}<div className="between card-total"><strong>{money(total(o))}</strong><button className="text-button" onClick={() => select(o)}>Ver detalle →</button></div>{status !== 'Entregado' && <button className="full secondary" disabled={busy || !!error || !o.lines.length} onClick={() => update(o.id, advance)}>{status === 'Pendiente' ? 'Empezar preparación' : 'Marcar entregado'}</button>}{!o.payment && <button className="primary full" disabled={!o.lines.length} onClick={() => collect(o)}>Cobrar</button>}</article>)}{!open.some(o => o.status === status) && <div className="column-empty">Sin pedidos por ahora</div>}</section>)}</div><section className="history"><button className="text-button" aria-expanded={history} onClick={() => setHistory(!history)}>{history ? 'Ocultar' : 'Ver'} terminados y cancelados ({closed.length})</button>{history && <div className="history-list">{closed.map(o => <button key={o.id} onClick={() => select(o)}><span>#{o.number} · {name(o)}{o.day && <small> · {dueLabel(o.day)}</small>}</span><span>{o.status}{o.credit && !o.payment ? ' · Fiado' : ''} · {money(total(o))}</span></button>)}{!closed.length && <p>No hay pedidos cerrados todavía.</p>}</div>}</section></>}
      {view === 'pay' && order && <Checkout key={order.id} busy={busy || !!error} order={order} today={today} onBack={() => setView('sale')} onPay={async (method, cash) => { if (await update(order.id, o => pay(o, method, cash))) { setNotice(`Pago del pedido #${order.number} guardado en el sistema.${method === 'Efectivo' ? ' Vuelto: ' + money(Number(cash) - total(order)) : ''}`); setView(order.credit ? 'credit' : 'orders') } }} onCredit={async input => { if (await update(order.id, o => leaveOnCredit(o, input, salesDay(new Date())))) { setNotice(`Pedido #${order.number} guardado como fiado para el ${dueLabel(input.dueDate)}.`); setView('credit') } }}>{lines(order, false)}</Checkout>}
    </main><footer>Tía Julia · Cada pedido, con cariño.</footer>
  </div>
}
export default App







