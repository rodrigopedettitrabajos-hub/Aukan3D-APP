// Arma semilla.sql con el catálogo actual de la tienda (../productos.csv), los medios de pago y el usuario administrador.
// Uso: node semilla.mjs && npx wrangler d1 execute aukan3d --remote --file=semilla.sql
// INSERT OR IGNORE: si ya existe un registro con ese id, no lo pisa.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const requerir = createRequire(import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.assign(globalThis, requerir("../catalogo.js")); // datos.js usa parseCsv como global, igual que en el navegador
const { catalogoDesdeCsv } = requerir("../admin/datos.js");
const ahora = Date.now();
const productos = catalogoDesdeCsv(readFileSync(new URL("../productos.csv", import.meta.url), "utf8"));
const medios = [
  { id: "m1", nombre: "Efectivo", detalle: "" }, { id: "m2", nombre: "Transferencia BROU", detalle: "" },
  { id: "m3", nombre: "Mercado Pago", detalle: "" }, { id: "m4", nombre: "Tarjeta (POS)", detalle: "" },
];
const usuarios = [{ id: "u1", nombre: "Administrador", rol: "Administrador", comision: 0 }];

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const filas = [...productos.map((p) => ["productos", p]), ...medios.map((m) => ["medios", m]), ...usuarios.map((u) => ["usuarios", u])]
  .map(([col, d]) => `INSERT OR IGNORE INTO docs (col, id, data, actualizado) VALUES (${q(col)}, ${q(d.id)}, ${q(JSON.stringify(d))}, ${ahora});`);
writeFileSync(new URL("semilla.sql", import.meta.url), filas.join("\n") + "\n");
console.log(`semilla.sql: ${productos.length} productos, ${medios.length} medios, ${usuarios.length} usuario`);
