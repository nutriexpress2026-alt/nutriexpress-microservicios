-- Base pedidos_db de ms-pedidos (RNF-ARQ-02). Fuente del esquema: schema.prisma se
-- deriva de este archivo. Lo ejecuta prisma/inicializar.ts si la base está vacía.
--
-- Adaptado del sistema anterior (pedido, detalle_pedido, ubicacion,
-- posicion_repartidor). Sin claves foráneas a tablas de otros servicios: el
-- cliente, el producto, el repartidor y el cobro se guardan por su número, y lo
-- que el pedido necesita conservar (nombre y precio del producto, nombre del
-- cliente) se copia al confirmarlo, para que la historia no cambie si después
-- cambia el catálogo.

-- HU-22 · Direcciones de entrega de cada cliente, marcadas en el mapa.
CREATE TABLE ubicacion (
    id_ubicacion    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Dueño (usuario de ms-identidad con rol Cliente). Nulo en una dirección
    -- escrita al pedir sin guardarla: solo la usa ese pedido.
    id_usuario      INT,
    -- Nombre con el que el cliente la reconoce: «Casa», «Oficina».
    etiqueta        VARCHAR(50),
    calle           VARCHAR(150) NOT NULL,
    numero          VARCHAR(20),
    referencia      VARCHAR(150),
    -- Seis decimales: unos 10 cm, más que suficiente para encontrar la puerta.
    latitud         NUMERIC(8,6),
    longitud        NUMERIC(9,6),
    -- La que se ofrece primero al pedir. Una sola por cliente.
    principal       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Falso cuando se reemplazó por una versión corregida: deja de ofrecerse,
    -- pero los pedidos que la usaron la conservan tal como era.
    vigente         BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_ubicacion_lat CHECK (latitud  IS NULL OR latitud  BETWEEN  -90 AND  90),
    CONSTRAINT ck_ubicacion_lon CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX uq_ubicacion_principal ON ubicacion (id_usuario) WHERE principal AND vigente;

-- HU-21 · El pedido a domicilio.
CREATE TABLE pedido (
    id_pedido           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_pedido       VARCHAR(20) NOT NULL DEFAULT 'Recibido',
    estado_pago         VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    metodo_pago         VARCHAR(20) NOT NULL,
    -- Identificador del pago en la pasarela: lo informa ms-pagos al confirmarlo.
    referencia_pago     VARCHAR(100),
    total               NUMERIC(12,2) NOT NULL,
    fecha_entrega       TIMESTAMP,
    motivo_cancelacion  VARCHAR(20),
    id_usuario          INT NOT NULL,
    cliente_nombre      VARCHAR(120) NOT NULL,
    id_ubicacion        INT NOT NULL,
    -- HU-17 · La reserva de stock que ms-inventario guarda para este pedido.
    id_reserva          VARCHAR(60) NOT NULL UNIQUE,
    -- HU-26 · El cobro en línea en ms-pagos (nulo en efectivo).
    id_pago             INT,
    -- HU-23 (Sprint 5) · Empleado con cargo de repartidor.
    id_repartidor       INT,
    repartidor_nombre   VARCHAR(120),
    CONSTRAINT fk_pedido_ubicacion  FOREIGN KEY (id_ubicacion) REFERENCES ubicacion(id_ubicacion),
    CONSTRAINT ck_pedido_estado CHECK (estado_pedido IN ('Pendiente de pago','Recibido','En preparacion','En camino','Entregado','Cancelado')),
    CONSTRAINT ck_pedido_pago   CHECK (estado_pago  IN ('Pendiente','Pagado','Vencido')),
    CONSTRAINT ck_pedido_metodo CHECK (metodo_pago  IN ('Efectivo','Tarjeta','QR')),
    CONSTRAINT ck_pedido_total  CHECK (total > 0),
    CONSTRAINT ck_pedido_motivo_cancelacion CHECK (
        motivo_cancelacion IS NULL
        OR (estado_pedido = 'Cancelado' AND motivo_cancelacion IN ('Cliente','No entregado','Sin pago'))
    )
);
CREATE INDEX ix_pedido_usuario ON pedido (id_usuario, fecha DESC);

-- Las líneas del pedido, con el nombre y el precio que tenían al confirmarlo.
CREATE TABLE detalle_pedido (
    id_pedido        INT NOT NULL,
    id_producto      INT NOT NULL,
    nombre_producto  VARCHAR(100) NOT NULL,
    cantidad         INT NOT NULL,
    precio_unitario  NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_pedido, id_producto),
    CONSTRAINT fk_detpedido_pedido FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido),
    CONSTRAINT ck_detpedido_cant   CHECK (cantidad > 0),
    CONSTRAINT ck_detpedido_precio CHECK (precio_unitario >= 0)
);

-- HU-25 · Última posición del repartidor, para seguirlo en el mapa mientras el
-- pedido está en camino. La escribe el repartidor desde «Mis entregas» (HU-24, Sprint 5).
CREATE TABLE posicion_repartidor (
    id_empleado     INT PRIMARY KEY,
    latitud         NUMERIC(8,6) NOT NULL,
    longitud        NUMERIC(9,6) NOT NULL,
    -- Radio de incertidumbre que informa el teléfono, en metros.
    precision_m     NUMERIC(8,1),
    actualizada_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_posicion_lat CHECK (latitud  BETWEEN  -90 AND  90),
    CONSTRAINT ck_posicion_lon CHECK (longitud BETWEEN -180 AND 180),
    CONSTRAINT ck_posicion_precision CHECK (precision_m IS NULL OR precision_m >= 0)
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

-- >>> Posteriores a la primera versión (idempotentes: inicializar.ts las aplica en cada arranque)

-- HU-24 (Sprint 5) · Si el repartidor está de turno: solo a quien está de turno se le
-- sugieren pedidos. Es del reparto, por eso vive aquí y no en ms-identidad.
CREATE TABLE IF NOT EXISTS turno_repartidor (
    id_empleado     INT PRIMARY KEY,
    disponible      BOOLEAN NOT NULL DEFAULT FALSE,
    actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- HU-29 (Sprint 6) · El costo de lo entregado (costo promedio de inventario al salir),
-- para la ganancia del reporte de pedidos. Nulo hasta que el pedido se entrega.
ALTER TABLE detalle_pedido ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(10,2);
