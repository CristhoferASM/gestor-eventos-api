-- Subconjunto del esquema `showtech` de la base de datos de la empresa (Neon, PostgreSQL 18) que usa este módulo.
--
-- Solo sirve para que sqlc conozca los tipos de las consultas de storage/empresa/queries. NO se ejecuta nunca:
-- el usuario del backend (backend_showtech) no puede crear tablas y los cambios de estructura los hace el administrador
-- con su script versionado. Si la estructura cambia allí, actualizar este archivo y ejecutar `sqlc generate`.
--
-- Las columnas de auditoría (creado_en, creado_por, actualizado_*) se omiten salvo que se usen.

CREATE TABLE cliente (
    id_cliente          integer PRIMARY KEY,
    codigo              varchar(15)  NOT NULL,
    tipo_doc            varchar(3)   NOT NULL,
    num_doc             varchar(11)  NOT NULL,
    nombre_razon_social varchar(150) NOT NULL,
    contacto            varchar(120),
    telefono            varchar(25),
    correo              varchar(254),
    estado              varchar(15)  NOT NULL
);

CREATE TABLE espacio (
    id_espacio smallint PRIMARY KEY,
    nombre     varchar(120) NOT NULL,
    estado     varchar(10)  NOT NULL
);

CREATE TABLE solicitud_cotizacion (
    id_solicitud integer PRIMARY KEY,
    codigo       varchar(20) NOT NULL,
    id_cliente   integer     NOT NULL REFERENCES cliente (id_cliente)
);

CREATE TABLE adicional (
    id_adicional    smallint PRIMARY KEY,
    codigo          varchar(30) NOT NULL,
    nombre          varchar(80) NOT NULL,
    unidad          varchar(30) NOT NULL,
    precio_hora     numeric     NOT NULL,
    cantidad_maxima integer,
    activo          boolean     NOT NULL DEFAULT true
);

CREATE TABLE evento (
    id_evento     integer PRIMARY KEY,
    codigo        varchar(15)  NOT NULL,
    id_solicitud  integer      NOT NULL REFERENCES solicitud_cotizacion (id_solicitud),
    id_espacio    smallint     NOT NULL REFERENCES espacio (id_espacio),
    nombre        varchar(120) NOT NULL,
    contacto      varchar(120) NOT NULL,
    telefono      varchar(25),
    correo        varchar(254),
    observaciones varchar(300),
    estado        varchar(25)  NOT NULL,
    version       integer      NOT NULL DEFAULT 1
);

-- Horario del evento: un bloque por tipo (EVENTO, MONTAJE, DESMONTAJE, ENSAYO). `bloquea` lo fija la base según el
-- estado del evento (solo los eventos con primer pago ocupan el auditorio) y ex_bloque_sin_cruce impide cruces.
CREATE TABLE evento_bloque (
    id_evento_bloque integer PRIMARY KEY,
    id_evento        integer     NOT NULL REFERENCES evento (id_evento),
    tipo             varchar(12) NOT NULL,
    inicio           timestamp   NOT NULL,
    fin              timestamp   NOT NULL,
    id_espacio       smallint    NOT NULL,
    bloquea          boolean     NOT NULL
);

CREATE TABLE evento_adicional (
    id_evento_adicional integer PRIMARY KEY,
    id_evento           integer   NOT NULL REFERENCES evento (id_evento),
    id_adicional        smallint  NOT NULL REFERENCES adicional (id_adicional),
    cantidad            integer   NOT NULL,
    inicio              timestamp NOT NULL,
    fin                 timestamp NOT NULL
);

CREATE TABLE bloqueo_espacio (
    id_bloqueo    integer PRIMARY KEY,
    id_espacio    smallint     NOT NULL REFERENCES espacio (id_espacio),
    tipo          varchar(15)  NOT NULL,
    titulo        varchar(150) NOT NULL,
    inicio        timestamp    NOT NULL,
    fin           timestamp    NOT NULL,
    observaciones text,
    estado        varchar(10)  NOT NULL
);

CREATE TABLE usuario (
    id_usuario    integer PRIMARY KEY,
    id_cliente    integer REFERENCES cliente (id_cliente),
    nombres       varchar(100) NOT NULL,
    apellidos     varchar(100),
    correo        varchar(254),
    password_hash varchar(255),
    estado        varchar(10)  NOT NULL
);

CREATE TABLE rol (
    id_rol smallint PRIMARY KEY,
    codigo varchar(30) NOT NULL,
    nombre varchar(80) NOT NULL
);

CREATE TABLE usuario_rol (
    id_usuario integer  NOT NULL REFERENCES usuario (id_usuario),
    id_rol     smallint NOT NULL REFERENCES rol (id_rol),
    PRIMARY KEY (id_usuario, id_rol)
);

-- Solicitud de cambio de un evento. Hay a lo sumo una PENDIENTE por evento (índice un_solicitud_mod_pendiente).
-- El código (SOLM-AAAA-NNNN) lo envía el backend.
CREATE TABLE solicitud_modificacion (
    id_solicitud_mod    integer PRIMARY KEY,
    codigo              varchar(20)  NOT NULL,
    id_evento           integer      NOT NULL REFERENCES evento (id_evento),
    solicitante_usuario integer      NOT NULL REFERENCES usuario (id_usuario),
    version_evento_base integer      NOT NULL,
    motivo              varchar(400) NOT NULL,
    estado              varchar(10)  NOT NULL DEFAULT 'PENDIENTE',
    enviada_en          timestamptz  NOT NULL DEFAULT now(),
    retirada_en         timestamptz,
    resuelta_en         timestamptz,
    resuelta_por        integer,
    motivo_resolucion   text
);

-- «Antes y después» de una solicitud: dos versiones (ORIGINAL y PROPUESTA) con sus bloques y adicionales.
CREATE TABLE evento_version (
    id_version       integer PRIMARY KEY,
    id_evento        integer      NOT NULL REFERENCES evento (id_evento),
    id_solicitud_mod integer      REFERENCES solicitud_modificacion (id_solicitud_mod),
    id_modificacion  integer,
    tipo             varchar(10)  NOT NULL,
    numero_version   integer      NOT NULL,
    nombre_evento    varchar(120) NOT NULL,
    contacto         varchar(120) NOT NULL,
    telefono         varchar(25),
    correo           varchar(254),
    observaciones    varchar(300),
    creado_en        timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE evento_version_bloque (
    id_version_bloque integer PRIMARY KEY,
    id_version        integer     NOT NULL REFERENCES evento_version (id_version),
    tipo              varchar(12) NOT NULL,
    inicio            timestamp   NOT NULL,
    fin               timestamp   NOT NULL
);

CREATE TABLE evento_version_adicional (
    id_version_adicional integer PRIMARY KEY,
    id_version           integer   NOT NULL REFERENCES evento_version (id_version),
    id_adicional         smallint  NOT NULL REFERENCES adicional (id_adicional),
    cantidad             integer   NOT NULL,
    inicio               timestamp NOT NULL,
    fin                  timestamp NOT NULL
);
