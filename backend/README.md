# API de Tía Julia

Django REST Framework con Oracle XE 21c. Configuración privada en `.env`; no subirla a GitHub.

## Iniciar

Desde esta carpeta, con Oracle encendido y el entorno instalado:

```powershell
.\.venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py runserver
```

Las cinco tablas originales deben existir antes de las migraciones de ventas; se crean con los scripts de `database`. Los modelos originales siguen siendo `managed=False`: las migraciones no recrean esas tablas. `ventas.0001_initial` crea `fiados`; `0002_persistencia_pedidos` agrega revisión e identificadores de operaciones a pedidos y detalles. No usar `--fake` ni volver a ejecutar el esquema inicial sobre una base ya creada.

## Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/productos/` | Catálogo |
| GET | `/api/csrf/` | Cookie y token CSRF para escrituras |
| GET | `/api/pedidos/` | Pedidos, detalles, pagos y fiados |
| POST | `/api/pedidos/` | Crear pedido con `requestId` UUID |
| POST | `/api/pedidos/{id}/operaciones/` | `requestId`, `revision`, `action` y `data` |

Acciones: `edit`, `advance`, `cancel`, `credit`, `pay`. Las escrituras usan JSON, cookie CSRF y cabecera `X-CSRFToken`. Se permite el origen local de Vite configurado en settings. Los endpoints aún no exigen inicio de sesión; mantener el servidor en localhost hasta implementar autenticación para un despliegue.

Cada cambio bloquea primero el pedido dentro de una transacción. Una revisión antigua devuelve 409; el frontend debe consultar de nuevo. Repetir inmediatamente la misma operación y contenido devuelve el pedido sin volver a cobrar. Si hubo otra operación intermedia, la revisión antigua evita reaplicarla. Además, Oracle limita a un pago por pedido.

El servidor calcula montos, conserva los precios de las líneas existentes y fija fechas. `Fiado` conserva monto, cliente, celular y fecha prometida; la existencia de `Pagos` indica si se saldó. Aún no se admiten abonos. Los campos heredados `TIMESTAMP WITH TIME ZONE` se leen como UTC con `SYS_EXTRACT_UTC` para compatibilidad con el controlador Thin; las fechas del día se presentan en Santiago.

## Copia y comprobaciones

```powershell
python manage.py backup_sales
python manage.py check
python manage.py showmigrations ventas
python manage.py verify_sales
```

`backup_sales` exporta las tablas del negocio y los contadores diarios a `.local-backups`, excluida de Git. Contiene datos personales: conservarla como archivo privado. Es una exportación JSON, no un respaldo completo de Oracle ni incluye un restaurador automático.

`verify_sales` prueba creación, revisión, cantidades, fiado, entrega, pagos, reintentos, eliminación, cancelación y CSRF contra la base configurada dentro de una transacción que se revierte. No deja pedidos de prueba, aunque las secuencias de Oracle pueden avanzar. No ejecutarlo durante una venta real. El mensaje 403 sin cookie durante esta prueba es esperado.

La migración 0003 guarda un número por pedido y fecha (America/Santiago). La API devuelve id interno, number visible y day; las rutas de operaciones usan id, nunca number. El contador del día se bloquea al crear, y un reintento no consume otro número. La prueba verify_sales también comprueba el cambio de día.
