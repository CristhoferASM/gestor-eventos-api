-- name: InsertarSolicitud :one
INSERT INTO solicitudes (evento_id, estado, datos) VALUES ($1, $2, $3) RETURNING id;

-- name: ListarSolicitudes :many
SELECT id, estado, datos FROM solicitudes ORDER BY id;

-- name: RetirarSolicitudPendiente :one
-- UPDATE condicional atómico: solo cambia si la solicitud sigue en el estado esperado.
UPDATE solicitudes
   SET estado = sqlc.arg(estado_nuevo)::text,
       datos  = jsonb_set(
                  jsonb_set(datos, '{estado}', to_jsonb(sqlc.arg(estado_nuevo)::text)),
                  '{fecha_retiro}', to_jsonb(sqlc.arg(fecha_retiro)::text))
 WHERE id = sqlc.arg(id) AND estado = sqlc.arg(estado_requerido)::text
RETURNING estado, datos;

-- name: ExisteSolicitud :one
SELECT EXISTS (SELECT 1 FROM solicitudes WHERE id = $1);
