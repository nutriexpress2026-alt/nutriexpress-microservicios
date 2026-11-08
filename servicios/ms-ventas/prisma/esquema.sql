-- Base ventas_db de ms-ventas (RNF-ARQ-02). Fuente del esquema: schema.prisma se
-- deriva de este archivo. Lo ejecuta prisma/inicializar.ts si la base está vacía.
--
-- Adaptado del sistema anterior (venta, detalle_venta). Sin claves foráneas a
-- tablas de otros servicios: el cliente, el empleado, el producto, el almacén, la
-- reserva y el cobro se guardan por su número, y lo que el comprobante muestra
-- (nombres y precios) se copia al vender, para que la historia no cambie.

-- HU-18 · La venta de mostrador, en mesa o para llevar.
CREATE TABLE venta (
    id_venta           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo_venta         VARCHAR(10) NOT NULL DEFAULT 'Mesa',
    metodo_pago        VARCHAR(20) NOT NULL,
    -- Pagado al vender en efectivo; Pendiente hasta que se acredite el QR.
    estado_pago        VARCHAR(20) NOT NULL DEFAULT 'Pagado',
    total              NUMERIC(12,2) NOT NULL,
    -- HU-20 · El cliente es opcional (consumidor final); vive en ms-identidad.
    id_cliente         INT,
    cliente_nombre     VARCHAR(120),
    -- Quien atendió (un empleado de ms-identidad, tomado de su token).
    id_empleado        INT NOT NULL,
    empleado_nombre    VARCHAR(100) NOT NULL,
    empleado_apellido  VARCHAR(100) NOT NULL,
    -- HU-17 · La reserva que se consumió en ms-inventario, y su nota de egreso.
    id_reserva         VARCHAR(60) NOT NULL UNIQUE,
    id_nota_egreso     INT,
    -- HU-26 · El cobro con QR en ms-pagos (nulo en efectivo).
    id_pago            INT,
    -- HU-19 · Por qué y cuándo se anuló.
    motivo_anulacion   VARCHAR(200),
    anulada_en         TIMESTAMP,
    CONSTRAINT ck_venta_tipo   CHECK (tipo_venta  IN ('Mesa','Llevar')),
    CONSTRAINT ck_venta_pago   CHECK (metodo_pago IN ('Efectivo','QR')),
    CONSTRAINT ck_venta_estado CHECK (estado_pago IN ('Pendiente','Pagado','Anulado')),
    CONSTRAINT ck_venta_total  CHECK (total > 0)
);
CREATE INDEX ix_venta_fecha   ON venta (fecha DESC);
CREATE INDEX ix_venta_cliente ON venta (id_cliente);

-- Cada producto vendido, por el almacén del que salió (para devolverlo ahí si se anula).
CREATE TABLE detalle_venta (
    id_venta         INT NOT NULL,
    id_producto      INT NOT NULL,
    id_almacen       INT NOT NULL,
    nombre_producto  VARCHAR(100) NOT NULL,
    nombre_almacen   VARCHAR(100) NOT NULL,
    cantidad         INT NOT NULL,
    precio_unitario  NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_venta, id_producto, id_almacen),
    CONSTRAINT fk_detventa_venta  FOREIGN KEY (id_venta) REFERENCES venta(id_venta),
    CONSTRAINT ck_detventa_cant   CHECK (cantidad > 0),
    CONSTRAINT ck_detventa_precio CHECK (precio_unitario >= 0)
);

-- HT-03 · Eventos ya procesados (RNF-DIS-03): uno repetido no se aplica dos veces.
CREATE TABLE evento_procesado (
    id_evento     UUID PRIMARY KEY,
    tipo          VARCHAR(60) NOT NULL,
    procesado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- HU-05 · Desde cuándo valen las sesiones de un usuario o de un rol, tras un
-- cambio de permisos (evento PermisosCambiados).
CREATE TABLE sesion_vigente (
    clave  VARCHAR(30) PRIMARY KEY,  -- 'usuario:5' o 'rol:2'
    desde  TIMESTAMP NOT NULL
);
