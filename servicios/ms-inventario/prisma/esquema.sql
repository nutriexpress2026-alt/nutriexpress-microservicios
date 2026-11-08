-- Base de datos de ms-inventario (inventario_db). Fuente de verdad del esquema:
-- prisma/schema.prisma se genera desde aquí (`npm run db:pull`).
--
-- Insumos, almacenes, existencias, notas de ingreso y egreso y lotes con
-- vencimiento: las tablas de Inventario del sistema anterior, que solo este
-- servicio lee y escribe.

-- Réplicas de datos ajenos (RNF-ARQ-02). Las mantiene al día su dueño:
-- ms-catalogo los productos y el token de ms-identidad los empleados.
-- No se editan desde inventario.
CREATE TABLE producto (
    id_producto         INT PRIMARY KEY,          -- el mismo id que en ms-catalogo
    nombre              VARCHAR(100) NOT NULL,
    tipo_conservacion   VARCHAR(20) NOT NULL DEFAULT 'Seco',
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_producto_conservacion CHECK (tipo_conservacion IN ('Seco','Refrigerado'))
);

CREATE TABLE empleado (
    id_empleado     INT PRIMARY KEY,              -- el mismo id que en ms-identidad
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100) NOT NULL
);

CREATE TABLE unidad_medida (
    id_unidad       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(20) NOT NULL UNIQUE,
    abreviatura     VARCHAR(5)  NOT NULL
);

CREATE TABLE almacen (
    id_almacen          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(50) NOT NULL UNIQUE,
    tipo_conservacion   VARCHAR(20) NOT NULL,
    ubicacion_fisica    VARCHAR(150),
    -- Destino por omision de lo que se produce con esta conservacion.
    -- Con un solo almacen por tipo el sistema deduce el destino solo; al
    -- aparecer el segundo deja de poder hacerlo y lo pide en cada produccion.
    -- Marcar uno como preferido devuelve esa deduccion sin quitar la
    -- posibilidad de elegir otro cuando haga falta.
    preferido           BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_almacen_tipo CHECK (tipo_conservacion IN ('Seco','Refrigerado'))
);

CREATE TABLE ingrediente (
    id_ingrediente      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    -- Las cantidades de insumo llevan tres decimales: el gramo y el
    -- mililitro. Con dos, la resolución era de 10 g y 125 g se guardaban
    -- como 130 g (utils/cantidad.ts).
    stock_minimo        NUMERIC(12,3) NOT NULL DEFAULT 0,
    costo_unitario      NUMERIC(10,2) NOT NULL DEFAULT 0,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    tipo_conservacion   VARCHAR(20) NOT NULL DEFAULT 'Seco',
    controla_vencimiento BOOLEAN NOT NULL DEFAULT FALSE,
    id_unidad           INT NOT NULL,
    CONSTRAINT fk_ingrediente_unidad FOREIGN KEY (id_unidad) REFERENCES unidad_medida(id_unidad),
    CONSTRAINT ck_ingrediente_conservacion CHECK (tipo_conservacion IN ('Seco','Refrigerado')),
    CONSTRAINT ck_ingrediente_costo  CHECK (costo_unitario >= 0),
    CONSTRAINT ck_ingrediente_minimo CHECK (stock_minimo >= 0)
);

CREATE TABLE ingrediente_almacen (
    id_ingrediente  INT NOT NULL,
    id_almacen      INT NOT NULL,
    stock_actual    NUMERIC(12,3) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_ingrediente, id_almacen),
    CONSTRAINT fk_ingalm_ingrediente FOREIGN KEY (id_ingrediente) REFERENCES ingrediente(id_ingrediente),
    CONSTRAINT fk_ingalm_almacen     FOREIGN KEY (id_almacen)     REFERENCES almacen(id_almacen),
    CONSTRAINT ck_ingalm_stock CHECK (stock_actual >= 0)
);

CREATE TABLE producto_almacen (
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    stock_actual    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id_producto, id_almacen),
    CONSTRAINT fk_prodalm_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
    CONSTRAINT fk_prodalm_almacen  FOREIGN KEY (id_almacen)  REFERENCES almacen(id_almacen),
    CONSTRAINT ck_prodalm_stock CHECK (stock_actual >= 0)
);

CREATE TABLE nota_ingreso (
    id_nota_ingreso     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo              VARCHAR(20) NOT NULL DEFAULT 'Compra',
    proveedor           VARCHAR(150),
    numero_documento    VARCHAR(50),
    total               NUMERIC(12,2) NOT NULL DEFAULT 0,
    id_empleado         INT NOT NULL,
    -- En una Reposicion, la devolucion al proveedor que repone. Su clave
    -- foranea se declara junto a nota_egreso, que se crea despues.
    id_nota_egreso      INT,
    CONSTRAINT fk_notaing_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado),
    -- Produccion solo lo escribe la orden al finalizarse. Devolucion es lo que
    -- vuelve del cliente; Reposicion, lo que el proveedor repone de lo que se
    -- le devolvio, sin nuevo pago.
    CONSTRAINT ck_notaing_motivo CHECK (motivo IN ('Compra','Produccion','Ajuste','Devolucion','Reposicion')),
    -- Solo una reposicion dice que devolucion repone.
    CONSTRAINT ck_notaing_reposicion CHECK (id_nota_egreso IS NULL OR motivo = 'Reposicion')
);

CREATE TABLE detalle_ingreso_insumo (
    id_nota_ingreso INT NOT NULL,
    id_ingrediente  INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        NUMERIC(12,3) NOT NULL,
    costo_unitario  NUMERIC(10,2) NOT NULL,
    -- El lote de vencimiento al que entro, si el insumo es perecedero. Su
    -- clave foranea se declara junto a la tabla lote, que se crea despues.
    id_lote         INT,
    PRIMARY KEY (id_nota_ingreso, id_ingrediente, id_almacen),
    CONSTRAINT fk_detingins_nota FOREIGN KEY (id_nota_ingreso) REFERENCES nota_ingreso(id_nota_ingreso),
    CONSTRAINT fk_detingins_stock FOREIGN KEY (id_ingrediente, id_almacen)
        REFERENCES ingrediente_almacen(id_ingrediente, id_almacen),
    CONSTRAINT ck_detingins_cant CHECK (cantidad > 0)
);

CREATE TABLE detalle_ingreso_producto (
    id_nota_ingreso INT NOT NULL,
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        INT NOT NULL,
    costo_unitario  NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (id_nota_ingreso, id_producto, id_almacen),
    CONSTRAINT fk_detingprod_nota FOREIGN KEY (id_nota_ingreso) REFERENCES nota_ingreso(id_nota_ingreso),
    CONSTRAINT fk_detingprod_stock FOREIGN KEY (id_producto, id_almacen)
        REFERENCES producto_almacen(id_producto, id_almacen),
    CONSTRAINT ck_detingprod_cant CHECK (cantidad > 0)
);

CREATE TABLE nota_egreso (
    id_nota_egreso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo          VARCHAR(20) NOT NULL,
    observacion     VARCHAR(200),
    id_empleado     INT NOT NULL,
    -- En una Devolucion, la compra que se le devuelve al proveedor: se
    -- devuelve de lo que entro en ella, y hasta lo que entro.
    id_nota_ingreso INT,
    CONSTRAINT fk_notaegr_empleado FOREIGN KEY (id_empleado) REFERENCES empleado(id_empleado),
    CONSTRAINT fk_notaegr_ingreso FOREIGN KEY (id_nota_ingreso) REFERENCES nota_ingreso(id_nota_ingreso),
    -- Devolucion es lo que se le devuelve al proveedor: vencido, danado o
    -- equivocado. Lo repone despues con una nota de ingreso por Reposicion.
    CONSTRAINT ck_notaegr_motivo CHECK (motivo IN ('Produccion','Merma','Ajuste','Devolucion')),
    -- Solo una devolucion dice que compra devuelve.
    CONSTRAINT ck_notaegr_devolucion CHECK (id_nota_ingreso IS NULL OR motivo = 'Devolucion')
);

CREATE TABLE detalle_egreso_insumo (
    id_nota_egreso  INT NOT NULL,
    id_ingrediente  INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        NUMERIC(12,3) NOT NULL,
    PRIMARY KEY (id_nota_egreso, id_ingrediente, id_almacen),
    CONSTRAINT fk_detegrins_nota FOREIGN KEY (id_nota_egreso) REFERENCES nota_egreso(id_nota_egreso),
    CONSTRAINT fk_detegrins_stock FOREIGN KEY (id_ingrediente, id_almacen)
        REFERENCES ingrediente_almacen(id_ingrediente, id_almacen),
    CONSTRAINT ck_detegrins_cant CHECK (cantidad > 0)
);

CREATE TABLE detalle_egreso_producto (
    id_nota_egreso  INT NOT NULL,
    id_producto     INT NOT NULL,
    id_almacen      INT NOT NULL,
    cantidad        INT NOT NULL,
    PRIMARY KEY (id_nota_egreso, id_producto, id_almacen),
    CONSTRAINT fk_detegrprod_nota FOREIGN KEY (id_nota_egreso) REFERENCES nota_egreso(id_nota_egreso),
    CONSTRAINT fk_detegrprod_stock FOREIGN KEY (id_producto, id_almacen)
        REFERENCES producto_almacen(id_producto, id_almacen),
    CONSTRAINT ck_detegrprod_cant CHECK (cantidad > 0)
);

CREATE TABLE lote (
    id_lote             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo              VARCHAR(50),
    fecha_vencimiento   DATE NOT NULL,
    fecha_registro      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_ingrediente      INT NOT NULL,
    CONSTRAINT fk_lote_ingrediente FOREIGN KEY (id_ingrediente)
        REFERENCES ingrediente(id_ingrediente)
);

CREATE TABLE lote_almacen (
    id_lote         INT NOT NULL,
    id_almacen      INT NOT NULL,
    stock_actual    NUMERIC(12,3) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_lote, id_almacen),
    CONSTRAINT fk_lotealm_lote    FOREIGN KEY (id_lote)    REFERENCES lote(id_lote),
    CONSTRAINT fk_lotealm_almacen FOREIGN KEY (id_almacen) REFERENCES almacen(id_almacen),
    CONSTRAINT ck_lotealm_stock CHECK (stock_actual >= 0)
);

ALTER TABLE nota_ingreso
    ADD CONSTRAINT fk_notaing_egreso FOREIGN KEY (id_nota_egreso) REFERENCES nota_egreso(id_nota_egreso);

ALTER TABLE detalle_ingreso_insumo
    ADD CONSTRAINT fk_detingins_lote FOREIGN KEY (id_lote) REFERENCES lote(id_lote);

CREATE INDEX ix_ingrediente_unidad       ON ingrediente(id_unidad);
CREATE INDEX ix_ingalm_almacen           ON ingrediente_almacen(id_almacen);
CREATE INDEX ix_prodalm_almacen          ON producto_almacen(id_almacen);
CREATE INDEX ix_notaing_empleado         ON nota_ingreso(id_empleado);
CREATE INDEX ix_notaegr_empleado         ON nota_egreso(id_empleado);
CREATE INDEX ix_detingins_stock          ON detalle_ingreso_insumo(id_ingrediente, id_almacen);
CREATE INDEX ix_detingprod_stock         ON detalle_ingreso_producto(id_producto, id_almacen);
CREATE INDEX ix_detegrins_stock          ON detalle_egreso_insumo(id_ingrediente, id_almacen);
CREATE INDEX ix_detegrprod_stock         ON detalle_egreso_producto(id_producto, id_almacen);
CREATE INDEX ix_producto_nombre          ON producto(lower(nombre));
CREATE INDEX ix_ingrediente_nombre       ON ingrediente(lower(nombre));
CREATE INDEX ix_notaing_fecha           ON nota_ingreso(fecha DESC);
CREATE INDEX ix_notaegr_fecha           ON nota_egreso(fecha DESC);
CREATE INDEX ix_notaegr_ingreso         ON nota_egreso(id_nota_ingreso);
CREATE INDEX ix_notaing_egreso          ON nota_ingreso(id_nota_egreso);
CREATE INDEX ix_lote_ingrediente          ON lote(id_ingrediente);
CREATE INDEX ix_lote_vencimiento          ON lote(fecha_vencimiento);
CREATE INDEX ix_lotealm_almacen           ON lote_almacen(id_almacen);
CREATE INDEX ix_detingins_lote            ON detalle_ingreso_insumo(id_lote);
CREATE UNIQUE INDEX ux_almacen_preferido  ON almacen(tipo_conservacion) WHERE preferido;

-- ============================================================================
-- >>> Posteriores a la primera versión
-- Todo lo que sigue es idempotente (IF NOT EXISTS) y prisma/inicializar.ts lo
-- aplica en cada arranque también a las bases que ya existían: así una tabla
-- nueva llega a todas las computadoras sin borrar datos. Agregar al final.
-- ============================================================================

-- HT-03 · Eventos ya procesados: un evento repetido no se procesa dos veces (RNF-DIS-03).
CREATE TABLE IF NOT EXISTS evento_procesado (
    id_evento     UUID PRIMARY KEY,
    tipo          VARCHAR(60) NOT NULL,
    procesado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- HU-05 · Desde cuándo valen las sesiones de un usuario o de un rol, tras un
-- cambio de permisos (evento PermisosCambiados de ms-identidad).
CREATE TABLE IF NOT EXISTS sesion_vigente (
    clave  VARCHAR(30) PRIMARY KEY,  -- 'usuario:5' o 'rol:2'
    desde  TIMESTAMP NOT NULL
);

-- HU-13 · Un solo almacén *preferido* por tipo de conservación, no un solo almacén
-- por tipo. La primera versión de este archivo perdió el WHERE preferido (el
-- schema.prisma sí lo tenía): las bases creadas con ella no dejaban registrar un
-- segundo almacén del mismo tipo. Esto las corrige, y no hace nada si el índice ya
-- está bien.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes
             WHERE indexname = 'ux_almacen_preferido' AND indexdef NOT LIKE '%WHERE%') THEN
    DROP INDEX ux_almacen_preferido;
    CREATE UNIQUE INDEX ux_almacen_preferido ON almacen(tipo_conservacion) WHERE preferido;
  END IF;
END $$;

-- HU-17 · Reservas de stock que piden otros servicios: ms-catalogo al finalizar
-- una orden de producción y, desde el Sprint 4, ms-pedidos. Lo reservado no se
-- puede usar para otra cosa (disponible = stock - reservado) hasta que se
-- consume o se libera.
CREATE TABLE IF NOT EXISTS reserva (
    -- La pone quien reserva ('orden-12', 'pedido-40'): repetir la misma reserva
    -- no descuenta dos veces.
    id_reserva          VARCHAR(60) PRIMARY KEY,
    origen              VARCHAR(30) NOT NULL,
    estado              VARCHAR(12) NOT NULL DEFAULT 'Activa',
    creada_en           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cerrada_en          TIMESTAMP,
    -- Producción: el almacén al que entra el producto terminado al consumirse.
    id_almacen_destino  INT,
    CONSTRAINT fk_reserva_almacen FOREIGN KEY (id_almacen_destino) REFERENCES almacen(id_almacen),
    CONSTRAINT ck_reserva_estado CHECK (estado IN ('Activa','Consumida','Liberada'))
);

CREATE TABLE IF NOT EXISTS detalle_reserva_insumo (
    id_reserva      VARCHAR(60) NOT NULL,
    id_ingrediente  INT NOT NULL,
    cantidad        NUMERIC(12,3) NOT NULL,
    PRIMARY KEY (id_reserva, id_ingrediente),
    CONSTRAINT fk_detresins_reserva FOREIGN KEY (id_reserva)     REFERENCES reserva(id_reserva),
    CONSTRAINT fk_detresins_insumo  FOREIGN KEY (id_ingrediente) REFERENCES ingrediente(id_ingrediente),
    CONSTRAINT ck_detresins_cant CHECK (cantidad > 0)
);

CREATE TABLE IF NOT EXISTS detalle_reserva_producto (
    id_reserva   VARCHAR(60) NOT NULL,
    id_producto  INT NOT NULL,
    cantidad     INT NOT NULL,
    PRIMARY KEY (id_reserva, id_producto),
    CONSTRAINT fk_detresprod_reserva  FOREIGN KEY (id_reserva)  REFERENCES reserva(id_reserva),
    CONSTRAINT fk_detresprod_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
    CONSTRAINT ck_detresprod_cant CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS ix_reserva_estado      ON reserva(estado);
CREATE INDEX IF NOT EXISTS ix_detresins_insumo    ON detalle_reserva_insumo(id_ingrediente);
CREATE INDEX IF NOT EXISTS ix_detresprod_producto ON detalle_reserva_producto(id_producto);

-- HU-18, HU-24 (Sprint 5) · Las ventas de mostrador y los pedidos entregados salen
-- con motivo Venta. Se vuelve a crear la restricción para sumarlo (idempotente).
ALTER TABLE nota_egreso DROP CONSTRAINT IF EXISTS ck_notaegr_motivo;
ALTER TABLE nota_egreso ADD CONSTRAINT ck_notaegr_motivo
    CHECK (motivo IN ('Produccion','Merma','Ajuste','Devolucion','Venta'));
