-- Una base y un usuario por microservicio (RNF-ARQ-02).
--
-- PostgreSQL ejecuta este archivo solo la primera vez que arranca con el
-- volumen vacio. Cada usuario es dueno de su base y no tiene permiso de
-- conectarse a las demas: ningun servicio puede leer las tablas de otro.
--
-- Las contrasenas son las de desarrollo; en el servidor se cambian con
-- ALTER ROLE ... PASSWORD y la variable del servicio en .env.

CREATE ROLE identidad  LOGIN PASSWORD 'identidad';
CREATE ROLE catalogo   LOGIN PASSWORD 'catalogo';
CREATE ROLE inventario LOGIN PASSWORD 'inventario';
CREATE ROLE ventas     LOGIN PASSWORD 'ventas';
CREATE ROLE pedidos    LOGIN PASSWORD 'pedidos';
CREATE ROLE pagos      LOGIN PASSWORD 'pagos';

CREATE DATABASE identidad_db  OWNER identidad;
CREATE DATABASE catalogo_db   OWNER catalogo;
CREATE DATABASE inventario_db OWNER inventario;
CREATE DATABASE ventas_db     OWNER ventas;
CREATE DATABASE pedidos_db    OWNER pedidos;
CREATE DATABASE pagos_db      OWNER pagos;

-- Nadie entra a una base ajena: se quita el permiso CONNECT que PUBLIC trae
-- por defecto y se deja solo al dueno.
REVOKE CONNECT ON DATABASE identidad_db, catalogo_db, inventario_db, ventas_db, pedidos_db, pagos_db FROM PUBLIC;
