-- name: ObtenerUsuarioPorCorreo :one
SELECT correo, id, nombre, rol, cliente_id, proveedor, password_hash FROM usuarios WHERE correo = $1;

-- name: ListarUsuarios :many
SELECT correo, id, nombre, rol, cliente_id, proveedor, password_hash FROM usuarios ORDER BY correo;

-- name: GuardarUsuario :exec
INSERT INTO usuarios (correo, id, nombre, rol, cliente_id, proveedor, password_hash)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (correo) DO UPDATE SET
  id = EXCLUDED.id, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, cliente_id = EXCLUDED.cliente_id,
  proveedor = EXCLUDED.proveedor, password_hash = EXCLUDED.password_hash;

-- name: InsertarUsuarioSiFalta :exec
INSERT INTO usuarios (correo, id, nombre, rol, cliente_id, proveedor, password_hash)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (correo) DO NOTHING;

-- name: BorrarDesafiosVencidos :exec
DELETE FROM desafios WHERE expira_en < now() - interval '1 day';

-- name: GuardarDesafio :exec
INSERT INTO desafios (id_hash, correo, codigo, expira_en, reenvio_desde, intentos)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id_hash) DO UPDATE SET
  correo = EXCLUDED.correo, codigo = EXCLUDED.codigo, expira_en = EXCLUDED.expira_en,
  reenvio_desde = EXCLUDED.reenvio_desde, intentos = EXCLUDED.intentos;

-- name: ObtenerDesafio :one
SELECT correo, codigo, expira_en, reenvio_desde, intentos FROM desafios WHERE id_hash = $1;

-- name: EliminarDesafio :exec
DELETE FROM desafios WHERE id_hash = $1;

-- name: BorrarSesionesVencidas :exec
DELETE FROM sesiones WHERE expira_en < now();

-- name: GuardarSesion :exec
INSERT INTO sesiones (token_hash, correo, expira_en) VALUES ($1, $2, $3)
ON CONFLICT (token_hash) DO UPDATE SET correo = EXCLUDED.correo, expira_en = EXCLUDED.expira_en;

-- name: ObtenerSesion :one
SELECT correo, expira_en FROM sesiones WHERE token_hash = $1;

-- name: EliminarSesion :exec
DELETE FROM sesiones WHERE token_hash = $1;

-- name: GuardarVerificacionDiaria :exec
INSERT INTO verificaciones_diarias (dispositivo_hash, correo, dia) VALUES ($1, $2, $3)
ON CONFLICT (dispositivo_hash, correo) DO UPDATE SET dia = EXCLUDED.dia;

-- name: ObtenerVerificacionDiaria :one
SELECT dia FROM verificaciones_diarias WHERE dispositivo_hash = $1 AND correo = $2;
