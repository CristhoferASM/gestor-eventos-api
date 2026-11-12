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

-- name: InsertarSolicitudMod :one
INSERT INTO solicitud_modificacion (codigo, id_evento, solicitante_usuario, version_evento_base, motivo, estado)
VALUES ($1, $2, $3, $4, $5, 'PENDIENTE')
RETURNING id_solicitud_mod, enviada_en;

-- name: CrearSolicitudModCompleta :one
-- Crea la solicitud, sus dos versiones, todos los bloques de horario y todos los adicionales en UNA sola consulta (atómica):
-- una sola ida y vuelta a la base en vez de siete. El código SOLM-AAAA-NNNN sale del número siguiente del año.
-- versiones:   [{"tipo","delta","nombre","contacto","telefono","correo","observaciones"}]   (delta 0 = ORIGINAL, 1 = PROPUESTA)
-- bloques:     [{"version","tipo","inicio","fin"}]                                           (version = tipo de la versión)
-- adicionales: [{"version","codigo","cantidad","inicio","fin"}]
WITH previo AS (
  SELECT e.version,
         (SELECT (coalesce(max(substring(codigo from '[0-9]+$')::int), 0) + 1)::int
            FROM solicitud_modificacion
           WHERE codigo LIKE sqlc.arg(prefijo)::text || '%') AS siguiente
    FROM evento e
   WHERE e.id_evento = sqlc.arg(id_evento)::int
), sol AS (
  INSERT INTO solicitud_modificacion (codigo, id_evento, solicitante_usuario, version_evento_base, motivo, estado)
  SELECT sqlc.arg(prefijo)::text || lpad(previo.siguiente::text, 4, '0'), sqlc.arg(id_evento)::int,
         sqlc.arg(solicitante)::int, previo.version, sqlc.arg(motivo)::text, 'PENDIENTE'
    FROM previo
  RETURNING id_solicitud_mod, codigo, enviada_en
), ver AS (
  INSERT INTO evento_version (id_evento, id_solicitud_mod, tipo, numero_version, nombre_evento, contacto, telefono, correo, observaciones)
  SELECT sqlc.arg(id_evento)::int, sol.id_solicitud_mod, v->>'tipo', previo.version + (v->>'delta')::int, v->>'nombre', v->>'contacto',
         NULLIF(v->>'telefono', ''), NULLIF(v->>'correo', ''), NULLIF(v->>'observaciones', '')
    FROM sol, previo, jsonb_array_elements(sqlc.arg(versiones)::jsonb) AS v
  RETURNING id_version, tipo
), blo AS (
  INSERT INTO evento_version_bloque (id_version, tipo, inicio, fin)
  SELECT ver.id_version, b->>'tipo', (b->>'inicio')::timestamp, (b->>'fin')::timestamp
    FROM jsonb_array_elements(sqlc.arg(bloques)::jsonb) AS b
    JOIN ver ON ver.tipo = b->>'version'
  RETURNING id_version
), adi AS (
  INSERT INTO evento_version_adicional (id_version, id_adicional, cantidad, inicio, fin)
  SELECT ver.id_version, a.id_adicional, (x->>'cantidad')::int, (x->>'inicio')::timestamp, (x->>'fin')::timestamp
    FROM jsonb_array_elements(sqlc.arg(adicionales)::jsonb) AS x
    JOIN ver      ON ver.tipo = x->>'version'
    JOIN adicional a ON a.codigo = x->>'codigo'
  RETURNING id_version
)
SELECT sol.id_solicitud_mod, sol.codigo, sol.enviada_en FROM sol;

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
