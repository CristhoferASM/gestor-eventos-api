-- name: ListarEventos :many
SELECT datos FROM eventos ORDER BY id;

-- name: ObtenerEventoPorID :one
SELECT datos FROM eventos WHERE id = $1;

-- name: ContarEventos :one
SELECT count(*) FROM eventos;

-- name: InsertarEvento :exec
INSERT INTO eventos (id, cliente_id, fecha, datos) VALUES ($1, $2, $3, $4);

-- name: ListarBloqueos :many
SELECT datos FROM bloqueos ORDER BY id;

-- name: InsertarBloqueo :exec
INSERT INTO bloqueos (id, fecha, datos) VALUES ($1, $2, $3);
