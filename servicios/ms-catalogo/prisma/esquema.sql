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
