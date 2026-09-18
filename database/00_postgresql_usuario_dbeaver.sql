-- SOLO PostgreSQL. No ejecutar en una conexión Oracle.
-- En DBeaver, conectarse a PostgreSQL como administrador (normalmente postgres):
-- host localhost, puerto 5432, base postgres.
-- Activar Auto-commit y ejecutar cada sentencia por separado con Ctrl+Enter.

-- 1. Confirmar la conexión y comprobar si los nombres ya existen.
SELECT current_user, current_database(), version();
SELECT rolname FROM pg_roles WHERE rolname = 'tia_julia';
SELECT datname FROM pg_database WHERE datname = 'tia_julia';

-- 2. Solo si el usuario no existe, REEMPLAZAR la contraseña del ejemplo
-- en el editor local antes de ejecutar. No subir la contraseña a GitHub.
CREATE ROLE tia_julia LOGIN PASSWORD 'REEMPLAZAR_CON_UNA_CLAVE_LOCAL';

-- 3. Solo si la base no existe. Ejecutar fuera de una transacción:
CREATE DATABASE tia_julia
    OWNER tia_julia
    ENCODING 'UTF8'
    TEMPLATE template0;

-- 4. Crear una nueva conexión de DBeaver a la base tia_julia,
-- con usuario tia_julia y la contraseña elegida.
-- Completar los mismos datos en backend/.env.postgresql.
-- Las tablas las crea Django; NO ejecutar aquí los scripts de Oracle.
-- Ver database/POSTGRESQL.md para las migraciones y la copia de datos.
