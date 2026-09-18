# Base de datos de Tía Julia

Diseño inicial para Oracle XE 21c, servicio `XEPDB1`, imagen propuesta `gvenzl/oracle-xe:21-slim`. Todos los montos se expresan en pesos chilenos enteros.

## Archivos y ejecución

0. `00_usuario_dbeaver.sql`: creación del usuario desde SYSTEM en XEPDB1, con pasos para DBeaver y un marcador de contraseña que debes reemplazar localmente.
1. `01_schema.sql`: crea cinco tablas, índices, restricciones y la vista `resumen_pedidos`.
2. `02_demo.sql`: carga seis productos y un pedido ficticio de $6.500, sin pagar. Es opcional y no debe ejecutarse en producción.

Conectar SQLcl o SQL*Plus a `localhost:1521/XEPDB1` usando un usuario de aplicación ya creado, con cuota de almacenamiento y permisos `CREATE SESSION`, `CREATE TABLE`, `CREATE SEQUENCE` y `CREATE VIEW`. No ejecutar el esquema como SYS o SYSTEM. Si el cliente está en otro contenedor, usar el nombre del servicio de Oracle en la red de Compose.

Desde la raíz del proyecto, en la sesión SQL:

```sql
@database/01_schema.sql
@database/02_demo.sql
```

Los archivos están pensados para un esquema vacío. No eliminan objetos existentes ni son reejecutables. Oracle confirma el DDL implícitamente: un fallo puede dejar parte del esquema creado. No volver a ejecutar a ciegas después de un fallo; revisar el error y los objetos existentes. Las contraseñas no se incluyen en el repositorio.

### Si usas DBeaver

El puerto depende de la publicación del contenedor: en la captura compartida aparece `1521`, aunque se mencionó `1512`. Revisar la conexión; el script SQL no establece el puerto. Configurar `XEPDB1` como nombre de servicio, no como SID.

Abrir `00_usuario_dbeaver.sql` en una conexión SYSTEM a XEPDB1. Ejecutar cada sentencia con Ctrl+Enter, verificando primero el contenedor. Reemplazar el marcador de contraseña solo en el editor local. Si aparece `CDB$ROOT`, reconectar al servicio XEPDB1 antes de crear el usuario. No ejecutar el archivo entero sin revisar estos pasos.

Luego crear una conexión independiente con `TIA_JULIA` y ejecutar el esquema allí. `01_schema.sql` y `02_demo.sql` incluyen comandos de SQL*Plus: para el editor JDBC de DBeaver, omitir las líneas `WHENEVER SQLERROR`, `SET DEFINE` y `PROMPT`. Ejecutar el bloque `DECLARE ... END;` del ejemplo como una sola sentencia, sin incluir la barra `/` separadora, y confirmar con `COMMIT` solamente si terminó correctamente. Si falla, ejecutar `ROLLBACK` para el DML del ejemplo.

La cuota inicial es de 100 MB en USERS y se puede ampliar después. Este usuario puede crear los objetos del esquema propuesto; no tiene rol DBA. La creación automática de bases/usuarios de pruebas por Django necesitará una configuración separada.

## Relaciones y decisiones

- Categoría → productos; pedido → detalles; producto → detalles; pedido → cero o un pago.
- El ID del pedido es interno y global. Desde la migración 0003, el número visible se guarda por día y comienza en 1 en horario de Santiago. Los cancelados conservan su número.
- Cada línea conserva el nombre y el precio vendido. Dos completos con indicaciones distintas se registran en líneas separadas.
- El total se calcula sumando cantidad por precio unitario. La vista permite consultarlo junto con el estado de pago.
- Pago y preparación son independientes: entregar no implica cobrar.
- Solo se admite un pago completo por pedido. La restricción única evita insertar dos pagos para el mismo pedido.
- Efectivo exige recibido suficiente y vuelto correcto. Tarjeta y transferencia dejan recibido y vuelto en NULL.
- Los productos se desactivan; las claves foráneas impiden eliminar productos referenciados. No hay borrados en cascada del historial.
- Las imágenes se guardarán en almacenamiento de archivos; Oracle conserva su ruta.

## Integración actual con Django

El esquema inicial ya está en uso en Oracle. La API valida cantidades enteras, disponibilidad, precios, transiciones, pago y fiado; usa transacciones que bloquean primero el pedido. El SQL directo puede saltarse estas reglas de negocio.

Las migraciones de ventas agregan sobre las cinco tablas originales:

- `0001_initial`: tabla `fiados`, relacionada uno a uno con pedidos, con cliente, celular, fecha prometida, monto y fecha de registro. Los modelos de tablas existentes quedan como no administrados para evitar recrearlas.
- `0002_persistencia_pedidos`: revisión e identificadores de operación en pedidos e identificador externo en detalles, con restricciones únicas para coordinar reintentos.

En una instalación nueva, ejecutar primero el esquema inicial y después `python manage.py migrate` desde backend. En la instalación actual ambas migraciones ya están aplicadas; no volver a crear las tablas ni usar `--fake`. Oracle confirma DDL implícitamente; la segunda migración comprueba cada objeto antes de agregarlo para poder reanudarse después de una interrupción.

Un fiado no crea una fila en pagos. Al saldarlo se conserva fiados y se registra el pago; la interfaz lo cuenta en el día del cobro. La vista SQL inicial no incorpora datos del fiado: la aplicación consulta esa información mediante la API.

## Verificación y copias

Se verificaron contra Oracle creación, edición, validaciones, fiado, entrega, cobro, reintentos y lectura; las pruebas se ejecutan con rollback. La numeración puede presentar saltos porque Oracle no revierte las secuencias.

Desde backend, `python manage.py backup_sales` exporta las seis tablas del negocio a JSON en `.local-backups`, sin credenciales. Se guardó una copia antes de las migraciones. La exportación no sustituye un respaldo completo de Oracle y no tiene restauración automática. Ver `backend/README.md` para los comandos de comprobación y las rutas de API.
La migración 0003 agrega numeros_pedido y contador_pedidos_dia, asigna números diarios a los pedidos existentes por fecha de creación y bloquea el contador del día para impedir números repetidos. La copia JSON también incluye ambas tablas.
