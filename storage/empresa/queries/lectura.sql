-- ============================ Eventos ============================

-- name: ListarEventos :many
SELECT e.id_evento, e.codigo, c.codigo AS cliente_codigo, c.nombre_razon_social AS cliente_nombre,
       esp.nombre AS espacio, e.nombre, e.contacto, e.telefono, e.correo, e.observaciones, e.estado, e.version
  FROM evento e
  JOIN solicitud_cotizacion s ON s.id_solicitud = e.id_solicitud
  JOIN cliente c              ON c.id_cliente   = s.id_cliente
  JOIN espacio esp            ON esp.id_espacio = e.id_espacio
 ORDER BY e.id_evento;

-- name: ObtenerEvento :one
SELECT e.id_evento, e.codigo, c.codigo AS cliente_codigo, c.nombre_razon_social AS cliente_nombre,
       esp.nombre AS espacio, e.nombre, e.contacto, e.telefono, e.correo, e.observaciones, e.estado, e.version
  FROM evento e
  JOIN solicitud_cotizacion s ON s.id_solicitud = e.id_solicitud
  JOIN cliente c              ON c.id_cliente   = s.id_cliente
  JOIN espacio esp            ON esp.id_espacio = e.id_espacio
 WHERE e.id_evento = $1;

-- name: ListarBloquesEventos :many
SELECT id_evento, tipo, inicio, fin, bloquea FROM evento_bloque ORDER BY id_evento, inicio;

-- name: ListarBloquesDeEvento :many
SELECT id_evento, tipo, inicio, fin, bloquea FROM evento_bloque WHERE id_evento = $1 ORDER BY inicio;

-- name: ListarAdicionalesEventos :many
SELECT ea.id_evento, a.codigo, a.nombre, a.unidad, a.precio_hora, ea.cantidad, ea.inicio, ea.fin
  FROM evento_adicional ea
  JOIN adicional a ON a.id_adicional = ea.id_adicional
 ORDER BY ea.id_evento, ea.id_evento_adicional;

-- name: ListarAdicionalesDeEvento :many
SELECT ea.id_evento, a.codigo, a.nombre, a.unidad, a.precio_hora, ea.cantidad, ea.inicio, ea.fin
  FROM evento_adicional ea
  JOIN adicional a ON a.id_adicional = ea.id_adicional
 WHERE ea.id_evento = $1
 ORDER BY ea.id_evento_adicional;

-- ============================ Clientes, bloqueos y catálogo ============================

-- name: ListarClientes :many
SELECT codigo, nombre_razon_social FROM cliente ORDER BY codigo;

-- name: ListarBloqueosActivos :many
SELECT b.id_bloqueo, esp.nombre AS espacio, b.tipo, b.titulo, b.inicio, b.fin, b.observaciones
  FROM bloqueo_espacio b
  JOIN espacio esp ON esp.id_espacio = b.id_espacio
 WHERE b.estado = 'ACTIVO'
 ORDER BY b.inicio;

-- name: ListarCatalogoAdicionales :many
SELECT codigo, nombre, unidad, precio_hora FROM adicional WHERE activo ORDER BY id_adicional;

-- ============================ Usuarios (solo para las cuentas de demostración) ============================

-- name: ListarUsuariosConRol :many
SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, c.codigo AS cliente_codigo, r.codigo AS rol
  FROM usuario u
  JOIN usuario_rol ur ON ur.id_usuario = u.id_usuario
  JOIN rol r          ON r.id_rol      = ur.id_rol
  LEFT JOIN cliente c ON c.id_cliente  = u.id_cliente
 WHERE u.estado = 'ACTIVO' AND u.correo IS NOT NULL
 ORDER BY u.id_usuario;
