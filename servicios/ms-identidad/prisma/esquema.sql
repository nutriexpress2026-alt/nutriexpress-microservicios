-- Base de datos de ms-identidad (identidad_db). Fuente de verdad del esquema:
-- prisma/schema.prisma se genera desde aquí con `npm run db:pull`.
--
-- Son las tablas de Administración y Seguridad del sistema anterior, que este
-- servicio es el único en leer y escribir (RNF-ARQ-02). Los demás servicios
-- conocen al usuario por el token: su id, rol, cargo y permisos.

CREATE TABLE rol (
    id_rol      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE permiso (
    id_permiso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE rol_permiso (
    id_rol_permiso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_rol          INT NOT NULL,
    id_permiso      INT NOT NULL,
    CONSTRAINT uq_rol_permiso UNIQUE (id_rol, id_permiso),
    CONSTRAINT fk_rol_permiso_rol     FOREIGN KEY (id_rol)     REFERENCES rol(id_rol),
    CONSTRAINT fk_rol_permiso_permiso FOREIGN KEY (id_permiso) REFERENCES permiso(id_permiso)
);

CREATE TABLE usuario (
    id_usuario          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(100) NOT NULL,
    apellido            VARCHAR(100) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,
    telefono            VARCHAR(20),
    nombre_usuario      VARCHAR(50)  NOT NULL UNIQUE,
    contrasena_hash     VARCHAR(255) NOT NULL,
    intentos_fallidos   INT     NOT NULL DEFAULT 0,
    bloqueado           BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_bloqueo       TIMESTAMP,
    -- Cuántas veces se bloqueó desde el último acceso correcto: el primer
    -- bloqueo dura un minuto, el segundo cinco y el tercero no caduca (RF-SEG-04).
    veces_bloqueado     INT     NOT NULL DEFAULT 0,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso       TIMESTAMP,
    id_rol              INT NOT NULL,
    CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
);

CREATE TABLE usuario_rol_permiso (
    id_usuario_rol_permiso  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario              INT NOT NULL,
    id_rol_permiso          INT NOT NULL,
    CONSTRAINT uq_usuario_rol_permiso UNIQUE (id_usuario, id_rol_permiso),
    CONSTRAINT fk_urp_usuario     FOREIGN KEY (id_usuario)     REFERENCES usuario(id_usuario),
    CONSTRAINT fk_urp_rol_permiso FOREIGN KEY (id_rol_permiso) REFERENCES rol_permiso(id_rol_permiso)
);

CREATE TABLE cargo (
    id_cargo        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL UNIQUE,
    salario_base    NUMERIC(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT ck_cargo_salario CHECK (salario_base >= 0)
);

CREATE TABLE empleado (
    id_empleado     INT PRIMARY KEY,
    fecha_ingreso   DATE NOT NULL DEFAULT CURRENT_DATE,
    -- De turno o no; solo cuenta para el cargo Repartidor.
    disponible      BOOLEAN NOT NULL DEFAULT FALSE,
    id_cargo        INT NOT NULL,
    CONSTRAINT fk_empleado_usuario FOREIGN KEY (id_empleado) REFERENCES usuario(id_usuario),
    CONSTRAINT fk_empleado_cargo   FOREIGN KEY (id_cargo)    REFERENCES cargo(id_cargo)
);

CREATE TABLE cliente (
    id_cliente              INT PRIMARY KEY,
    preferencia_alimentaria VARCHAR(100),
    restriccion_dietetica   VARCHAR(100),
    CONSTRAINT fk_cliente_usuario FOREIGN KEY (id_cliente) REFERENCES usuario(id_usuario)
);

-- Código de «olvidé mi contraseña» (HU-06, Sprint 3): se guarda su huella HMAC.
CREATE TABLE recuperacion_contrasena (
    id_recuperacion INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario      INT NOT NULL,
    codigo_hash     VARCHAR(64) NOT NULL,
    creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en       TIMESTAMP NOT NULL,
    intentos        INT NOT NULL DEFAULT 0,
    usado_en        TIMESTAMP,
    CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CONSTRAINT ck_recuperacion_intentos CHECK (intentos >= 0),
    CONSTRAINT ck_recuperacion_plazo CHECK (expira_en > creado_en)
);

CREATE INDEX ix_recuperacion_usuario ON recuperacion_contrasena(id_usuario);
CREATE INDEX ix_usuario_rol          ON usuario(id_rol);
CREATE INDEX ix_rolpermiso_permiso   ON rol_permiso(id_permiso);
CREATE INDEX ix_usuariorolpermiso_rp ON usuario_rol_permiso(id_rol_permiso);
CREATE INDEX ix_empleado_cargo       ON empleado(id_cargo);

-- >>> Posteriores a la primera versión
-- Lo que sigue se aplica también a las bases que ya existían (prisma/inicializar.ts):
-- todo idempotente, sin borrar datos.

-- HU-33 (Sprint 6) · El tema y el modo que eligió cada usuario: se recuerdan en
-- cualquier dispositivo en que inicie sesión. Nulo = lo que diga el navegador.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS tema VARCHAR(10);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS modo VARCHAR(5);
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS ck_usuario_tema;
ALTER TABLE usuario ADD CONSTRAINT ck_usuario_tema CHECK (tema IS NULL OR tema IN ('ninos','jovenes','adultos'));
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS ck_usuario_modo;
ALTER TABLE usuario ADD CONSTRAINT ck_usuario_modo CHECK (modo IS NULL OR modo IN ('dia','noche','auto'));
