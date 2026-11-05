-- Base pagos_db de ms-pagos (RNF-ARQ-02). Fuente del esquema: schema.prisma se
-- deriva de este archivo. Lo ejecuta prisma/inicializar.ts si la base está vacía.
--
-- Adaptado del sistema anterior (pago, evento_pago, configuracion). El cobro ya
-- no tiene clave foránea al pedido ni a la venta: esas tablas viven en otros
-- servicios, y aquí solo se guarda su número.

-- HU-26 · Un cobro de un pedido (ms-pedidos) o de una venta de mostrador
-- (ms-ventas, Sprint 5).
CREATE TABLE pago (
    id_pago             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    monto               NUMERIC(12,2) NOT NULL,
    moneda              CHAR(3)      NOT NULL DEFAULT 'BOB',
    metodo              VARCHAR(20)  NOT NULL,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'Pendiente',
    -- HU-27 · Congela si el cobro fue simulado o con dinero real: cambiar el
    -- modo después no cambia los cobros que ya existen.
    modo                VARCHAR(10)  NOT NULL,
    pasarela            VARCHAR(30)  NOT NULL,
    -- Identificador del lado de la pasarela: las pasarelas reintentan sus
    -- avisos, y con él un aviso repetido no confirma dos veces.
    id_transaccion_ext  VARCHAR(100),
    -- Lo que se le muestra al cliente: el contenido del QR o la dirección del
    -- checkout, según lo devuelva la pasarela (tipo_datos).
    datos_cobro         TEXT,
    tipo_datos          VARCHAR(4),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion    TIMESTAMP,
    fecha_confirmacion  TIMESTAMP,
    -- Número del pedido o de la venta en su servicio (sin clave foránea).
    id_pedido           INT,
    id_venta            INT,
    CONSTRAINT ck_pago_monto  CHECK (monto > 0),
    CONSTRAINT ck_pago_metodo CHECK (metodo IN ('Efectivo','Tarjeta','QR')),
    CONSTRAINT ck_pago_estado CHECK (estado IN ('Pendiente','Pagado','Fallido','Vencido','Reembolsado')),
    CONSTRAINT ck_pago_modo   CHECK (modo   IN ('Simulado','Real')),
    CONSTRAINT ck_pago_tipo_datos CHECK (tipo_datos IS NULL OR tipo_datos IN ('qr','url')),
    -- Un cobro paga un pedido o una venta, nunca los dos ni ninguno.
    CONSTRAINT ck_pago_origen CHECK ((id_venta IS NOT NULL) <> (id_pedido IS NOT NULL))
);
CREATE INDEX ix_pago_pedido ON pago (id_pedido);
CREATE INDEX ix_pago_pendiente ON pago (fecha_expiracion) WHERE estado = 'Pendiente';

-- RF-PAG-02 · Bitácora de todo lo que le ocurrió al cobro, tal como llegó: es lo
-- único que permite reconstruir un reclamo de «yo pagué y no me llegó».
CREATE TABLE evento_pago (
    id_evento    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pago      INT NOT NULL,
    tipo         VARCHAR(40)  NOT NULL,
    origen       VARCHAR(20)  NOT NULL,
    cuerpo       TEXT         NOT NULL,
    recibido_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evento_pago FOREIGN KEY (id_pago) REFERENCES pago(id_pago),
    CONSTRAINT ck_evento_origen CHECK (origen IN ('Pasarela','Sistema','Empleado','Cliente'))
);

-- HU-27 · Modo de cobro vigente (clave MODO_COBRO). Quién lo cambió queda con
-- nombre: pasar a dinero real tiene que tener responsable.
CREATE TABLE configuracion (
    clave            VARCHAR(50) PRIMARY KEY,
    valor            VARCHAR(200) NOT NULL,
    actualizado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por  VARCHAR(120)
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
