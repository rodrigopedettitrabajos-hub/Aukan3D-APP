-- Base D1 (SQLite) de Aukan3D. Cada registro del panel es un JSON en docs; col = productos, clientes, ventas, gastos, medios o usuarios.
CREATE TABLE IF NOT EXISTS docs (
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  actualizado INTEGER NOT NULL, -- ms; el panel pide solo lo cambiado desde su última lectura
  PRIMARY KEY (col, id)
);
CREATE INDEX IF NOT EXISTS docs_actualizado ON docs (actualizado);
-- Números de venta (tienda y panel comparten la serie, sin repetir).
CREATE TABLE IF NOT EXISTS contadores (nombre TEXT PRIMARY KEY, n INTEGER NOT NULL);
INSERT OR IGNORE INTO contadores (nombre, n) VALUES ('venta', 1000);
-- Límites de intentos (pedidos por WhatsApp, ingresos por IP).
CREATE TABLE IF NOT EXISTS limites (clave TEXT PRIMARY KEY, n INTEGER NOT NULL, hasta INTEGER NOT NULL);
