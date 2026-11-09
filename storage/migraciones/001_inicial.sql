-- Esquema inicial del Gestor de Eventos.
-- Eventos, solicitudes y bloqueos guardan el documento completo en JSONB (los snapshots de las solicitudes deben
-- conservarse exactamente como se enviaron) y, además, las columnas que se consultan o que garantizan reglas.

CREATE TABLE eventos (
    id         BIGINT PRIMARY KEY,
    cliente_id TEXT   NOT NULL DEFAULT '',
    fecha      TEXT   NOT NULL DEFAULT '',
    datos      JSONB  NOT NULL
);
CREATE INDEX eventos_cliente_idx ON eventos (cliente_id);
CREATE INDEX eventos_fecha_idx ON eventos (fecha);

CREATE TABLE bloqueos (
    id    TEXT  PRIMARY KEY,
    fecha TEXT  NOT NULL,
    datos JSONB NOT NULL
);
CREATE INDEX bloqueos_fecha_idx ON bloqueos (fecha);

CREATE TABLE solicitudes (
    id        BIGSERIAL   PRIMARY KEY,
    evento_id BIGINT      NOT NULL REFERENCES eventos (id),
    estado    TEXT        NOT NULL,
    datos     JSONB       NOT NULL,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX solicitudes_evento_idx ON solicitudes (evento_id);
-- Regla de negocio garantizada por la base de datos: máximo una solicitud pendiente por evento,
-- incluso con peticiones simultáneas.
CREATE UNIQUE INDEX solicitud_pendiente_unica ON solicitudes (evento_id) WHERE estado = 'Pendiente de revisión';

CREATE TABLE usuarios (
    correo        TEXT   PRIMARY KEY,
    id            BIGINT NOT NULL DEFAULT 0,
    nombre        TEXT   NOT NULL DEFAULT '',
    rol           TEXT   NOT NULL,
    cliente_id    TEXT   NOT NULL DEFAULT '',
    proveedor     TEXT   NOT NULL DEFAULT '',
    password_hash TEXT   NOT NULL DEFAULT ''
);

-- Los identificadores de desafío y los tokens de sesión se guardan como hash SHA-256: si alguien leyera la base de datos
-- no podría usarlos para entrar.
CREATE TABLE desafios (
    id_hash       TEXT        PRIMARY KEY,
    correo        TEXT        NOT NULL,
    codigo        TEXT        NOT NULL,
    expira_en     TIMESTAMPTZ NOT NULL,
    reenvio_desde TIMESTAMPTZ NOT NULL,
    intentos      INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE sesiones (
    token_hash TEXT        PRIMARY KEY,
    correo     TEXT        NOT NULL,
    expira_en  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sesiones_expira_idx ON sesiones (expira_en);

CREATE TABLE verificaciones_diarias (
    dispositivo_hash TEXT NOT NULL,
    correo           TEXT NOT NULL,
    dia              TEXT NOT NULL,
    PRIMARY KEY (dispositivo_hash, correo)
);
