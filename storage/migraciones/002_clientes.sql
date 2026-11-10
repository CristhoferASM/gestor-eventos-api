-- Clientes que contratan los eventos. Por ahora solo código y razón social; el resto de datos del cliente
-- (RUC, contacto principal...) se añadirá en otra migración cuando el ingeniero lo confirme.
-- No hay clave foránea desde eventos.cliente_id ni usuarios.cliente_id: hay datos previos con códigos que aún no
-- tienen fila aquí, y el cliente sin registrar se muestra como «No disponible» en vez de fallar.

CREATE TABLE clientes (
    id           TEXT PRIMARY KEY,
    razon_social TEXT NOT NULL
);
