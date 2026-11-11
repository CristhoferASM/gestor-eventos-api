-- ============================ Lectura ============================

-- name: ListarSolicitudesMod :many
SELECT id_solicitud_mod, codigo, id_evento, solicitante_usuario, version_evento_base, motivo, estado, enviada_en, retirada_en
  FROM solicitud_modificacion
 ORDER BY id_solicitud_mod;

-- name: ObtenerSolicitudMod :one
SELECT id_solicitud_mod, codigo, id_evento, solicitante_usuario, version_evento_base, motivo, estado, enviada_en, retirada_en
  FROM solicitud_modificacion
 WHERE id_solicitud_mod = $1;

-- name: ListarVersionesSolicitudes :many
SELECT id_version, id_solicitud_mod, tipo, numero_version, nombre_evento, contacto, telefono, correo, observaciones
  FROM evento_version
 WHERE id_solicitud_mod IS NOT NULL
 ORDER BY id_version;

-- name: ListarVersionBloquesSolicitudes :many
SELECT vb.id_version, vb.tipo, vb.inicio, vb.fin
  FROM evento_version_bloque vb
  JOIN evento_version v ON v.id_version = vb.id_version
 WHERE v.id_solicitud_mod IS NOT NULL
 ORDER BY vb.id_version, vb.inicio;

-- name: ListarVersionAdicionalesSolicitudes :many
SELECT va.id_version, a.codigo, a.nombre, a.unidad, a.precio_hora, va.cantidad, va.inicio, va.fin
  FROM evento_version_adicional va
  JOIN adicional a      ON a.id_adicional = va.id_adicional
  JOIN evento_version v ON v.id_version   = va.id_version
 WHERE v.id_solicitud_mod IS NOT NULL
 ORDER BY va.id_version, va.id_version_adicional;

-- ============================ Escritura ============================

-- name: SiguienteNumeroSolicitudMod :one
-- Siguiente número del código SOLM-AAAA-NNNN para el año indicado (SOLM-2026-0002 -> 3).
SELECT (coalesce(max(substring(codigo from '[0-9]+$')::int), 0) + 1)::int AS siguiente
  FROM solicitud_modificacion
 WHERE codigo LIKE sqlc.arg(prefijo)::text || '%';

-- name: InsertarSolicitudMod :one
INSERT INTO solicitud_modificacion (codigo, id_evento, solicitante_usuario, version_evento_base, motivo, estado)
VALUES ($1, $2, $3, $4, $5, 'PENDIENTE')
RETURNING id_solicitud_mod, enviada_en;

-- name: InsertarVersion :one
INSERT INTO evento_version (id_evento, id_solicitud_mod, tipo, numero_version, nombre_evento, contacto, telefono, correo, observaciones)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id_version;

-- name: InsertarVersionBloque :exec
INSERT INTO evento_version_bloque (id_version, tipo, inicio, fin) VALUES ($1, $2, $3, $4);

-- name: InsertarVersionAdicional :exec
-- El adicional se identifica por su código del catálogo (ej. COCHERA).
INSERT INTO evento_version_adicional (id_version, id_adicional, cantidad, inicio, fin)
SELECT sqlc.arg(id_version)::int, a.id_adicional, sqlc.arg(cantidad)::int, sqlc.arg(inicio)::timestamp, sqlc.arg(fin)::timestamp
  FROM adicional a
 WHERE a.codigo = sqlc.arg(codigo)::text;

-- name: RetirarSolicitudMod :one
-- UPDATE condicional atómico: solo cambia si la solicitud sigue PENDIENTE.
UPDATE solicitud_modificacion
   SET estado = 'RETIRADA', retirada_en = $2
 WHERE id_solicitud_mod = $1 AND estado = 'PENDIENTE'
RETURNING id_solicitud_mod;

-- name: ExisteSolicitudMod :one
SELECT EXISTS (SELECT 1 FROM solicitud_modificacion WHERE id_solicitud_mod = $1);

-- name: BorrarSolicitudMod :exec
-- Solo para las pruebas de integración: elimina una solicitud de prueba (sus versiones se borran en cascada).
DELETE FROM solicitud_modificacion WHERE id_solicitud_mod = $1;
