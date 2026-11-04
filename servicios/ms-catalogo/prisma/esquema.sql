-- Base de datos de ms-catalogo (catalogo_db). Fuente de verdad del esquema:
-- prisma/schema.prisma se genera desde aquí (`npm run db:pull`).
--
-- Productos, categorías, información nutricional y los datos públicos del
-- negocio (configuración NEGOCIO_*). Las recetas y las órdenes de producción se
-- agregan en el Sprint 3. Las existencias y el costo de cada producto los lleva
-- ms-inventario: este servicio se los pide por REST interno (RNF-ARQ-02).


CREATE TABLE categoria (
    id_categoria    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE producto (
    id_producto         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         VARCHAR(250),
    precio_venta        NUMERIC(10,2) NOT NULL,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    tipo_conservacion   VARCHAR(20) NOT NULL DEFAULT 'Seco',
    id_categoria        INT NOT NULL,
    -- La foto del producto vive en la misma fila, no en el disco del
    -- servidor: Railway lo reinicia en cada despliegue y una imagen guardada
    -- ahí desaparecería con el siguiente `git push`. Así viaja con el resto
    -- del producto y con las mismas copias de seguridad de la base.
    imagen               BYTEA,
    imagen_tipo          VARCHAR(20),
    imagen_actualizada_en TIMESTAMPTZ,
    CONSTRAINT fk_producto_categoria FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria),
    CONSTRAINT ck_producto_precio CHECK (precio_venta >= 0),
    CONSTRAINT ck_producto_conservacion CHECK (tipo_conservacion IN ('Seco','Refrigerado')),
    -- El tipo declarado lo decide el servidor tras mirar los primeros bytes
    -- del archivo, nunca lo que dice el cliente (RNF-SEG-04).
    CONSTRAINT ck_producto_imagen_tipo CHECK (imagen_tipo IS NULL OR imagen_tipo IN ('image/jpeg','image/png','image/webp')),
    CONSTRAINT ck_producto_imagen_completa CHECK ((imagen IS NULL) = (imagen_tipo IS NULL))
);

CREATE TABLE valor_nutricional (
    id_producto     INT PRIMARY KEY,
    calorias        INT NOT NULL,
    proteinas_g     NUMERIC(6,2) NOT NULL,
    carbohidratos_g NUMERIC(6,2) NOT NULL,
    grasas_g        NUMERIC(6,2) NOT NULL,
    fibra_g         NUMERIC(6,2),
    CONSTRAINT fk_valnut_producto FOREIGN KEY (id_producto)
        REFERENCES producto(id_producto) ON DELETE CASCADE
);

CREATE TABLE configuracion (
    clave           VARCHAR(50) PRIMARY KEY,
    valor           VARCHAR(200) NOT NULL,
    descripcion     VARCHAR(200),
    actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Quien hizo el ultimo cambio. Importa sobre todo para el modo de
    -- cobro: pasar a dinero real debe quedar con nombre y fecha.
    -- Quién la cambió: el id viene del token (el usuario vive en ms-identidad).
    id_usuario      INT
);

CREATE INDEX ix_producto_categoria       ON producto(id_categoria);
CREATE INDEX ix_producto_nombre          ON producto(lower(nombre));
CREATE INDEX ix_config_usuario          ON configuracion(id_usuario);

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

-- HU-09 · Réplica de los insumos de ms-inventario (RNF-ARQ-02): lo justo para
-- armar recetas y calcular su costo. La mantiene el evento InsumoGuardado y,
-- al arrancar, la lista completa de /interno/insumos de inventario.
CREATE TABLE IF NOT EXISTS insumo (
    id_ingrediente  INT PRIMARY KEY,           -- el mismo id que en ms-inventario
    nombre          VARCHAR(100) NOT NULL,
    unidad          VARCHAR(10) NOT NULL,      -- abreviatura: kg, L, u
    costo_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- HU-09 · Recetas (RF-PRO-04): varias versiones por producto y una sola activa,
-- que es la que se usa para producir. Una versión nueva nace inactiva.
CREATE TABLE IF NOT EXISTS receta (
    id_receta                   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_producto                 INT NOT NULL,
    nombre                      VARCHAR(100) NOT NULL,
    -- Cuántas porciones salen de una corrida.
    rendimiento                 INT NOT NULL,
    tiempo_preparacion_minutos  INT NOT NULL DEFAULT 0,
    instrucciones               VARCHAR(2000),
    -- Una bebida escala de forma continua; una bandeja de horno se prepara en
    -- corridas completas.
    divisible                   BOOLEAN NOT NULL DEFAULT TRUE,
    activa                      BOOLEAN NOT NULL DEFAULT FALSE,
    creada_en                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_receta_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
    CONSTRAINT ck_receta_rendimiento CHECK (rendimiento > 0),
    CONSTRAINT ck_receta_tiempo CHECK (tiempo_preparacion_minutos >= 0)
);

CREATE TABLE IF NOT EXISTS detalle_receta (
    id_receta           INT NOT NULL,
    id_ingrediente      INT NOT NULL,
    -- Tres decimales, como en inventario: 125 g se anotan 0,125 kg.
    cantidad_requerida  NUMERIC(12,3) NOT NULL,
    PRIMARY KEY (id_receta, id_ingrediente),
    CONSTRAINT fk_detreceta_receta  FOREIGN KEY (id_receta)      REFERENCES receta(id_receta) ON DELETE CASCADE,
    CONSTRAINT fk_detreceta_insumo  FOREIGN KEY (id_ingrediente) REFERENCES insumo(id_ingrediente),
    CONSTRAINT ck_detreceta_cantidad CHECK (cantidad_requerida > 0)
);

-- Una sola receta activa por producto (RF-PRO-04).
CREATE UNIQUE INDEX IF NOT EXISTS ux_receta_activa ON receta(id_producto) WHERE activa;
CREATE INDEX IF NOT EXISTS ix_receta_producto      ON receta(id_producto);
CREATE INDEX IF NOT EXISTS ix_detreceta_insumo     ON detalle_receta(id_ingrediente);