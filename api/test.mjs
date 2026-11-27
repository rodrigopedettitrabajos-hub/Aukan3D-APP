// Prueba el servidor contra la base local. Antes: npm run dev (en otra terminal) con .dev.vars de prueba.
// Uso: node test.mjs [url] [contraseña]
import assert from "node:assert";

const API = process.argv[2] || "http://localhost:8787";
const CLAVE = process.argv[3] || "clave-de-prueba-123";
const ORIGEN = "http://localhost:8090";
const pedir = async (ruta, { body, token, metodo, origen = ORIGEN, ip } = {}) => {
  const headers = { Origin: origen };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  if (ip) headers["CF-Connecting-IP"] = ip;
  const r = await fetch(API + ruta, { method: metodo || (body ? "POST" : "GET"), headers, body: body && JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { r, t, j };
};
const unico = String(Date.now()).slice(-8);

// Catálogo público.
const cat = await pedir("/api/productos.csv");
assert.strictEqual(cat.r.status, 200);
assert.match(cat.t, /^id,categoria,subcategoria,nombre,precio,foto,activo/);
assert.strictEqual(cat.r.headers.get("access-control-allow-origin"), ORIGEN);
assert.strictEqual((await pedir("/api/productos.csv", { origen: "https://otro.com" })).r.headers.get("access-control-allow-origin"), null);
const [, primera] = cat.t.split("\r\n");
const idProd = primera.split(",")[0], precioProd = Number(primera.split(",")[4]);

// Pedido: el precio sale de la base, no del navegador.
const cliente = { nombre: "Prueba", whatsapp: "+598 9" + unico, email: "", entrega: "Retiro", modo: "sena" };
const ped = await pedir("/api/pedidos", { body: { cliente, items: [{ id: idProd, cant: 2, precio: 1 }] } });
assert.strictEqual(ped.r.status, 200, ped.t);
assert.strictEqual(ped.j.total, precioProd * 2);
assert.strictEqual(ped.j.aPagar, Math.ceil(precioProd));
assert.ok(ped.j.numero > 1000);
assert.strictEqual((await pedir("/api/pedidos", { body: { cliente: { ...cliente, web: "x" }, items: [{ id: idProd, cant: 1 }] } })).r.status, 400);
assert.strictEqual((await pedir("/api/pedidos", { body: { cliente, items: [{ id: "no-existe", cant: 1 }] } })).r.status, 400);
assert.strictEqual((await pedir("/api/pedidos", { body: { cliente: { ...cliente, whatsapp: "abc" }, items: [{ id: idProd }] } })).r.status, 400);
// Límite: 5 pedidos por WhatsApp cada 10 minutos (ya van 2 intentos con este número).
const sigue = [];
for (let i = 0; i < 4; i++) sigue.push((await pedir("/api/pedidos", { body: { cliente, items: [{ id: idProd, cant: 1 }] } })).r.status);
assert.deepStrictEqual(sigue, [200, 200, 200, 429]);

// Ingreso al panel.
const ip = "10.0." + (unico % 250) + "." + (unico % 7);
assert.strictEqual((await pedir("/api/login", { body: { usuario: "admin", clave: "mal" }, ip })).r.status, 401);
assert.strictEqual((await pedir("/api/admin/datos")).r.status, 401);
assert.strictEqual((await pedir("/api/admin/datos", { token: "x.y" })).r.status, 401);
const log = await pedir("/api/login", { body: { usuario: "Admin", clave: CLAVE }, ip });
assert.strictEqual(log.r.status, 200, log.t);
const token = log.j.token;
const [datosTok] = token.split(".");
assert.strictEqual((await pedir("/api/admin/datos", { token: datosTok + ".firmafalsa" })).r.status, 401);

// Datos: el pedido de la tienda ya está en ventas, con su cliente.
const todo = (await pedir("/api/admin/datos", { token })).j;
assert.ok(todo.productos.length >= 170 && todo.medios.length >= 4);
const venta = todo.ventas.find((v) => v.numero === String(ped.j.numero));
assert.ok(venta && venta.origen === "web" && venta.items[0].precio === precioProd);
assert.ok(todo.clientes.some((c) => c.id === venta.cliente));
assert.strictEqual(todo.ventas.filter((v) => v.cliente === venta.cliente).length >= 3, true); // mismo WhatsApp, mismo cliente

// Lote: guardar y borrar; la otra pestaña ve solo lo nuevo.
const desde = todo.hasta + 1;
const lote = await pedir("/api/admin/lote", { token, body: { set: [{ col: "gastos", id: "gt" + unico, data: { id: "gt" + unico, concepto: "Filamento", monto: 900, moneda: "UYU" } }], del: [{ col: "gastos", id: "gviejo" }] } });
assert.strictEqual(lote.r.status, 200, lote.t);
const cambios = (await pedir("/api/admin/datos?desde=" + desde, { token })).j;
assert.deepStrictEqual(cambios.gastos.map((g) => g.id).sort(), ["gt" + unico, "gviejo"]);
assert.strictEqual(cambios.gastos.find((g) => g.id === "gviejo")._borrado, true);
assert.strictEqual(cambios.productos.length, 0);
assert.strictEqual((await pedir("/api/admin/lote", { token, body: { set: [{ col: "secreta", id: "1", data: {} }] } })).r.status, 400);
assert.strictEqual((await pedir("/api/admin/lote", { token, body: { set: [{ col: "gastos", id: "../x", data: {} }] } })).r.status, 400);

// Número de venta del panel: sigue la misma serie que la tienda.
const n = (await pedir("/api/admin/numero", { token, body: {} })).j.numero;
assert.ok(n > ped.j.numero);

console.log("api ok");
