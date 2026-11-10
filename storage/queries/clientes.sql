-- name: ListarClientes :many
SELECT id, razon_social FROM clientes ORDER BY id;

-- name: InsertarClienteSiFalta :exec
INSERT INTO clientes (id, razon_social) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING;
