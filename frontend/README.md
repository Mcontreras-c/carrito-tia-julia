# Frontend de Tía Julia

React + TypeScript + Vite. Interfaz para mouse y teclado, con catálogo, pedidos paralelos, cobro, ventas del día y fiados.

## Desarrollo

Desde esta carpeta:

```powershell
npm.cmd install
npm.cmd run dev
```

Mantener Oracle encendido y Django en `http://127.0.0.1:8000`. Abrir la dirección que muestra Vite (`http://localhost:5174`). El proxy redirige `/api` a Django. Si se cambia el origen del frontend, ajustar `CSRF_TRUSTED_ORIGINS` del backend. Esta configuración es para desarrollo local.

## Guardado

Catálogo, pedidos, líneas, pagos y fiados provienen de Django y Oracle. El número visible comienza en 1 cada día según America/Santiago. Se conserva al cobrar o cancelar; el ID interno, distinto, identifica cada pedido en la API. La fecha distingue números iguales en el historial y los fiados. Los nombres e indicaciones se guardan al salir del campo o pulsar Enter. Los demás cambios se envían al realizarlos. La pantalla actualiza el pedido cuando el servidor confirma el guardado.

Las operaciones se envían en orden. Si se pierde la conexión, se ofrece reintentar la misma operación con su identificador original o actualizar los pedidos para consultar el estado del servidor. Ante una revisión obsoleta se requiere actualizar. Los cambios de otro navegador aparecen al pulsar **Actualizar pedidos**; aún no hay actualización en tiempo real ni edición sin conexión.

La copia anterior de `localStorage` (`tia-julia.orders.v1`) permanece intacta. La interfaz no muestra avisos ni botones sobre esa copia antigua. No se importa automáticamente ni se suma a los registros de Oracle. Los números antiguos y los actuales pueden coincidir aunque representen pedidos diferentes.

## Reglas

- Se pueden armar varios pedidos sin cobrar el anterior.
- Los pedidos pendientes sin pago ni fiado admiten edición, eliminación de productos y cancelación.
- Comenzar la preparación, cobrar o dejar fiado bloquea la edición de productos.
- El servidor valida productos, cantidades y disponibilidad; calcula el total y el vuelto.
- Efectivo, transferencia y tarjeta registran un pago completo. No realizan cargos ni emiten boletas.
- Fiado exige nombre, celular y fecha prometida elegida con calendario. Guarda la deuda sin crear un pago.
- Al entregarlo, el fiado sale del tablero activo y permanece en Fiados e historial.
- Ventas del día distingue dinero cobrado y fiados. Un fiado pagado se cuenta en la fecha real del cobro, usando el día de Santiago.
- Preparar recordatorio permite revisar el texto y abrir WhatsApp. La usuaria realiza el envío; la aplicación no envía mensajes automáticamente.

Pendientes: abonos parciales, cambio de fecha prometida, autenticación para despliegue y una importación revisada de pedidos locales antiguos.

## Verificación

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

Las pruebas usan Node 24 y cubren reglas de pedidos, fiados, fechas, ventas y comunicación con la API. Las pruebas de Oracle están en el backend. La compilación no sustituye una revisión visual en navegador.
