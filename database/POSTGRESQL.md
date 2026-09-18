# Paso de Oracle a PostgreSQL

Estado: código y migración preparados. La aplicación continúa en Oracle hasta configurar el acceso, importar y verificar PostgreSQL.

## Crear el destino

Conectarse como administrador de PostgreSQL desde DBeaver o pgAdmin. Crear un usuario propio y una base nueva. No reutilizar la base de otro proyecto. Ejemplo (reemplazar la contraseña en el editor local):

```sql
CREATE ROLE tia_julia LOGIN PASSWORD 'REEMPLAZAR_CON_UNA_CLAVE_LOCAL';
CREATE DATABASE tia_julia OWNER tia_julia ENCODING 'UTF8' TEMPLATE template0;
```

Ejecutar CREATE DATABASE fuera de una transacción. Si alguno de los nombres ya existe, revisar su propietario y contenido; no borrar ni modificar roles existentes automáticamente.

Completar `backend/.env.postgresql` con host, puerto, base, usuario y contraseña. El archivo está excluido de Git. Las credenciales DB_NAME/DB_USER/DB_PASSWORD de Oracle permanecen en `backend/.env` para la copia.

## Crear tablas y transferir

Detener temporalmente el backend y no registrar ventas durante la transferencia. Desde backend, con `.venv` activo:

```powershell
python manage.py migrate --settings=config.settings_postgresql
python manage.py import_oracle --settings=config.settings_postgresql
python manage.py verify_sales --settings=config.settings_postgresql
```

PostgreSQL usa `ventas/migrations_postgresql`, una migración inicial completa con claves, relaciones y restricciones. Las migraciones históricas de Oracle se conservan separadas. No usar las migraciones de Oracle ni `--fake` sobre PostgreSQL.

La importación solo acepta un destino vacío (salvo permisos y tipos de contenido creados por Django). Copia categorías, productos, pedidos, detalles, pagos, fiados, números diarios, contadores, usuarios, grupos y registro de administración. No copia sesiones: habrá que iniciar sesión nuevamente. Exporta una copia privada en `.local-backups`, importa en una transacción, restablece las secuencias y compara cada registro. Una diferencia revierte la importación. No cambia datos de Oracle.

No ejecutar el importador nuevamente sobre un destino con datos. Si hubo nuevas ventas en Oracle después de la copia, mantener Oracle como base activa y planificar una nueva transferencia a un destino vacío, sin sobrescribir la copia anterior.

## Activar solamente después de validar

Agregar `DATABASE_ENGINE=postgresql` a `backend/.env` y reiniciar Django normalmente:

```powershell
python manage.py runserver
```

El frontend permanece en localhost:5174 y la API en 127.0.0.1:8000. Verificar desde la aplicación el catálogo y el historial antes de registrar ventas nuevas. Conservar Oracle como copia; regresar a Oracle después de nuevas ventas en PostgreSQL requiere conciliar esas ventas, no simplemente cambiar la variable.

`backup_sales` también funciona en PostgreSQL y exporta las ocho tablas del negocio. Para el servidor Ubuntu, configurar además respaldos completos de PostgreSQL y su restauración; esa parte todavía no está desplegada.
