CREATE USER tia_julia
    IDENTIFIED BY "123456"
    DEFAULT TABLESPACE users
    TEMPORARY TABLESPACE temp
    QUOTA 100M ON users;

GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW
TO tia_julia;

-- 3. Comprobar desde SYSTEM.
SELECT username, account_status, default_tablespace
FROM dba_users
WHERE username = 'TIA_JULIA';

-- 4. Crear otra conexion DBeaver con TIA_JULIA, su contraseña y XEPDB1.
-- Ejecutar la siguiente consulta EN ESA NUEVA CONEXION antes del esquema.
-- SELECT USER, SYS_CONTEXT('USERENV', 'CON_NAME') AS contenedor FROM dual;
