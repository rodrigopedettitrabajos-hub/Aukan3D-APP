// Prueba el servidor contra la base local. Antes: npm run dev (en otra terminal) con .dev.vars de prueba.
// Uso: node test.mjs [url] [contraseña]
import assert from "node:assert";
import http from "node:http";

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
const deB64 = (t) => Uint8Array.from(Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64"));

// Catálogo público.
const cat = await pedir("/api/productos.csv");
assert.strictEqual(cat.r.status, 200);
assert.match(cat.t, /^id,categoria,subcategoria,nombre,precio,foto,activo/);
assert.strictEqual(cat.r.headers.get("access-control-allow-origin"), ORIGEN);
assert.strictEqual((await pedir("/api/productos.csv", { origen: "https://otro.com" })).r.headers.get("access-control-allow-origin"), null);
const cors = async (o) => (await pedir("/api/productos.csv", { origen: o })).r.headers.get("access-control-allow-origin");
assert.strictEqual(await cors("https://abc123.aukan3d.pages.dev"), "https://abc123.aukan3d.pages.dev"); // vista previa de Pages
assert.strictEqual(await cors("https://aukan3d.pages.dev"), "https://aukan3d.pages.dev");
assert.strictEqual(await cors("https://otroaukan3d.pages.dev"), null);
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

// Estado para "Mis pedidos": solo con el WhatsApp del pedido.
const est = (wa) => pedir("/api/pedidos/estado", { body: { pedidos: [{ numero: String(ped.j.numero), whatsapp: wa }] }, ip: "10.8.0." + (unico % 250) });
assert.deepStrictEqual((await est(cliente.whatsapp)).j.estados, { [ped.j.numero]: 0 });
assert.deepStrictEqual((await est(cliente.whatsapp)).j.pagos, { [ped.j.numero]: [] });
assert.deepStrictEqual((await est("+598 91111111")).j.estados, {});

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
const lote = await pedir("/api/admin/lote", { token, body: { set: [{ col: "gastos", id: "gt" + unico, data: { id: "gt" + unico, concepto: "Filamento", monto: 900, moneda: "UYU", fecha: "2026-11-27" } }], del: [{ col: "gastos", id: "gviejo" }] } });
assert.strictEqual(lote.r.status, 200, lote.t);
const cambios = (await pedir("/api/admin/datos?desde=" + desde, { token })).j;
assert.deepStrictEqual(cambios.gastos.map((g) => g.id).sort(), ["gt" + unico, "gviejo"]);
assert.strictEqual(cambios.gastos.find((g) => g.id === "gviejo")._borrado, true);
assert.strictEqual(cambios.productos.length, 0);
// Lote grande (más de 100 ventas): las consultas por id van de a partes (D1 acepta hasta 100 valores).
const muchas = Array.from({ length: 150 }, (_, i) => ({ col: "ventas", id: `tz${unico}-${i}`, data: { numero: `tz${unico}-${i}`, estado: 4, items: [], pagos: [], fecha: "2026-01-01" } }));
assert.ok((await pedir("/api/admin/lote", { token, body: { set: muchas } })).j.ok);
assert.ok((await pedir("/api/admin/lote", { token, body: { set: muchas.map((x) => ({ ...x, data: { ...x.data, estado: 3 } })) } })).j.ok);
assert.ok((await pedir("/api/admin/lote", { token, body: { del: muchas.map(({ col, id }) => ({ col, id })) } })).j.ok);
assert.strictEqual((await pedir("/api/admin/lote", { token, body: { set: [{ col: "secreta", id: "1", data: {} }] } })).r.status, 400);
assert.strictEqual((await pedir("/api/admin/lote", { token, body: { set: [{ col: "gastos", id: "../x", data: {} }] } })).r.status, 400);

// Número de venta del panel: sigue la misma serie que la tienda.
const n = (await pedir("/api/admin/numero", { token, body: {} })).j.numero;
assert.ok(n > ped.j.numero);

// Base de pruebas: solo el usuario dev; lo de pruebas no aparece en la real.
const ipDev = "10.9." + (unico % 250) + ".1";
const dev = (await pedir("/api/login", { body: { usuario: "dev", clave: process.argv[4] || "dev-de-prueba-123" }, ip: ipDev })).j;
assert.strictEqual(dev.usuario, "dev");
assert.strictEqual(log.j.usuario, "admin");
assert.strictEqual((await pedir("/api/admin/datos?e=pruebas", { token })).r.status, 403); // admin no entra a pruebas
assert.strictEqual((await pedir("/api/login", { body: { usuario: "dev", clave: CLAVE }, ip: ipDev })).r.status, 401);
const pedPrueba = await pedir("/api/pedidos?e=pruebas", { body: { cliente: { ...cliente, whatsapp: "+598 98" + unico.slice(-6) }, items: [{ id: idProd, cant: 1 }] } });
assert.strictEqual(pedPrueba.r.status, 200, pedPrueba.t);
const enPruebas = (await pedir("/api/admin/datos?e=pruebas", { token: dev.token })).j;
assert.ok(enPruebas.ventas.some((v) => v.numero === String(pedPrueba.j.numero) && v.cliente));
assert.ok(enPruebas.productos.length >= 170);
const enReal = (await pedir("/api/admin/datos", { token: dev.token })).j; // dev también ve producción
assert.ok(!enReal.clientes.some((c) => c.whatsapp === "+598 98" + unico.slice(-6)));

// Uso de las bases: solo dev.
assert.strictEqual((await pedir("/api/admin/estado", { token })).r.status, 403);
const uso = (await pedir("/api/admin/estado", { token: dev.token })).j;
assert.ok(uso.ok && uso.limite > 0 && uso.real.colecciones.some((c) => c.col === "productos" && c.n >= 170) && uso.pruebas);
assert.ok(uso.real.tamano === null || uso.real.tamano > 0);

// Mercado Pago contra un Mercado Pago de mentira (en .dev.vars: MP_API=http://localhost:8799).
const BUENA = "TEST-1234567890-buena-abcdefghijklmnop-9876";
const mock = http.createServer((q, s) => {
  const ok = q.headers.authorization === "Bearer " + BUENA, enviar = (st, o) => { s.writeHead(st, { "Content-Type": "application/json" }); s.end(JSON.stringify(o)); };
  if (!ok) return enviar(401, { message: "invalid_token" });
  if (q.url === "/users/me") return enviar(200, { id: 123, nickname: "AUKAN3D", email: "x@y.uy", site_id: "MLU", tags: ["test_user"] });
  if (q.url.startsWith("/v1/payments/search")) return enviar(200, { results: [
    { id: 991, date_created: "2026-11-28T10:00:00Z", status: "approved", status_detail: "accredited", transaction_amount: 950, currency_id: "UYU", external_reference: "AUKAN-1001", payment_method_id: "visa" },
    { id: 992, date_created: "2026-11-28T09:00:00Z", status: "rejected", status_detail: "cc_rejected_other_reason", transaction_amount: 500, currency_id: "UYU", external_reference: "AUKAN-1002", payment_method_id: "master" }] });
  if (q.url === "/v1/payments/555") return enviar(200, { id: 555, status: "approved", external_reference: "AUKAN-" + numMp, transaction_amount: montoMp, currency_id: "UYU", date_approved: "2026-11-28T10:00:00Z" });
  if (q.url === "/v1/payments/556") return enviar(200, { id: 556, status: "rejected", external_reference: "AUKAN-" + numMp, transaction_amount: montoMp, currency_id: "UYU" });
  if (q.url === "/v1/payments/557") return enviar(200, { id: 557, status: "approved", external_reference: "AUKAN-P-" + numMp, transaction_amount: montoMp, currency_id: "UYU" });
  if (q.url === "/checkout/preferences") { let t = ""; q.on("data", (c) => { t += c; }); q.on("end", () => { refs.push(JSON.parse(t).external_reference); enviar(201, { init_point: "https://www.mercadopago.com.uy/checkout/v1/redirect?pref_id=1", sandbox_init_point: "https://sandbox.mercadopago.com.uy/checkout/v1/redirect?pref_id=1" }); }); return; }
  enviar(404, {});
}).listen(8799);
let numMp = "0", montoMp = 0;
const refs = [];
const mp = (body, tok = token, e = "") => pedir("/api/admin/mp" + e, { token: tok, body });
assert.strictEqual((await pedir("/api/admin/mp")).r.status, 401); // sin sesión
assert.strictEqual((await mp({ token: "" })).j.configurado, false);
assert.strictEqual((await mp({ token: "cualquier cosa" })).j.error, "formato");
assert.strictEqual((await mp({ token: "TEST-1234567890-mala-abcdefghijklmnop" })).j.error, "rechazado");
const conMp = await mp({ token: BUENA });
assert.ok(conMp.j.configurado && conMp.j.conectado && conMp.j.modo === "prueba" && conMp.j.final === "9876" && conMp.j.cuenta.nombre === "AUKAN3D", conMp.t);
assert.ok(conMp.j.pagos.length === 2 && conMp.j.pagos[0].referencia === "AUKAN-1001" && conMp.j.pagos[0].estado === "approved");
assert.ok(!conMp.t.includes(BUENA) && !(await pedir("/api/admin/datos", { token })).t.includes(BUENA)); // la credencial nunca vuelve
const devMp = (await pedir("/api/admin/mp?e=pruebas", { token: dev.token })).j; // dev en pruebas ve la misma cuenta
assert.ok(devMp.configurado && devMp.final === "9876");
const conLink = (await pedir("/api/pedidos", { body: { cliente: { nombre: "Mp Test", whatsapp: "+598 97" + unico.slice(-6), modo: "sena" }, items: [{ id: idProd, cant: 1 }] } })).j;
assert.ok(conLink.ok && conLink.pago.startsWith("https://sandbox.mercadopago.com.uy/"), JSON.stringify(conLink));
// Con link de pago el pedido espera: el panel no lo ve hasta que Mercado Pago confirma.
numMp = String(conLink.numero); montoMp = conLink.aPagar;
assert.ok(!(await pedir("/api/admin/datos", { token })).j.ventas.some((v) => v.numero === numMp));
// QR del panel: link por la seña; el monto no puede pasar el saldo.
const cobro = (await pedir("/api/admin/mp/cobro", { token, body: { numero: numMp, monto: montoMp, sena: true } })).j;
assert.ok(cobro.ok && cobro.link.startsWith("https://sandbox.mercadopago.com.uy/"), JSON.stringify(cobro));
assert.strictEqual((await pedir("/api/admin/mp/cobro", { token, body: { numero: numMp, monto: conLink.total + 1 } })).j.error, "monto");
assert.strictEqual((await pedir("/api/admin/mp/cobro", { token, body: { numero: "999999", monto: 10 } })).r.status, 404);
assert.strictEqual((await pedir("/api/admin/mp/cobro", { body: { numero: numMp, monto: 10 } })).r.status, 401);
// Aviso de Mercado Pago: se verifica el pago contra Mercado Pago y se anota una sola vez.
const aviso = (id, ip = "10.9.9." + unico.slice(-2)) => pedir("/api/mp/aviso", { body: { type: "payment", data: { id } }, ip });
assert.strictEqual((await aviso("556")).j.estado, "rejected");
assert.ok(!(await aviso("557")).j.registrado); // un pago de la base de pruebas no se anota en la real
const prefPr = (await pedir("/api/pedidos?e=pruebas", { body: { cliente: { nombre: "Mp Pr", whatsapp: "+598 96" + unico.slice(-6), modo: "sena" }, items: [{ id: idProd, cant: 1 }] }, ip: "10.6.6.6" })).j;
assert.ok(prefPr.ok && refs.includes("AUKAN-P-" + prefPr.numero) && refs.includes("AUKAN-" + numMp), JSON.stringify(refs));
assert.strictEqual((await aviso("555")).j.registrado, true);
assert.strictEqual((await aviso("555")).j.registrado, false); // repetido: no duplica
assert.ok((await aviso("123")).j.ignorado); // Mercado Pago no lo conoce
assert.ok((await pedir("/api/mp/aviso", { body: { type: "merchant_order", data: { id: "1" } } })).j.ignorado);
const vMp = (await pedir("/api/admin/datos", { token })).j.ventas.find((v) => v.numero === numMp);
assert.ok(vMp && !vMp.espera && vMp.estado === 1 && vMp.pagos.length === 1 && vMp.pagos[0].mp === "555" && vMp.pagos[0].monto === montoMp, JSON.stringify(vMp));
// El cliente ve el pago con su N° de operación (sin el medio interno).
const estMp = (await pedir("/api/pedidos/estado", { body: { pedidos: [{ numero: numMp, whatsapp: "+598 97" + unico.slice(-6) }] }, ip: "10.8.1." + (unico % 250) })).j;
assert.ok(estMp.estados[numMp] === 1 && estMp.pagos[numMp].length === 1 && estMp.pagos[numMp][0].mp === "555" && estMp.pagos[numMp][0].monto === montoMp && !("medio" in estMp.pagos[numMp][0]), JSON.stringify(estMp));
assert.strictEqual((await mp({ token: "" })).j.configurado, false);
mock.close();

// Accesos: cuentas creadas desde el panel, con permisos y base.
const cu = (body, tok = token, ruta = "/api/admin/cuentas") => pedir(ruta, { token: tok, body });
const usu = "probador" + unico.slice(-5);
const PROBADOR = ["ventas", "feria", "pendientes", "clientes", "productos", "reportes", "usuarios", "medios"];
assert.strictEqual((await cu({ nueva: true, usuario: "dev", nombre: "x" })).j.error, "reservado");
assert.strictEqual((await cu({ nueva: true, usuario: "a b", nombre: "x" })).j.error, "usuario");
const alta = (await cu({ nueva: true, usuario: usu, nombre: "Probador Uno", email: "uno@correo.uy", entorno: "pruebas", permisos: [...PROBADOR, "base"] })).j;
assert.ok(alta.ok && alta.clave.length === 12 && !alta.cuenta.hash, JSON.stringify(alta));
assert.ok(!alta.cuenta.permisos.includes("base")); // el admin no tiene "base": no puede darlo
assert.strictEqual((await cu({ nueva: true, usuario: usu, nombre: "Otra" })).j.error, "existe");
const lista = (await pedir("/api/admin/cuentas", { token })).j;
assert.ok(lista.cuentas.some((c) => c.usuario === usu) && !lista.t?.includes("pbkdf2") && !JSON.stringify(lista).includes("pbkdf2"));
const ipP = "10.7." + (unico % 250) + ".1";
const lp = (await pedir("/api/login", { body: { usuario: usu, clave: alta.clave }, ip: ipP })).j;
assert.ok(lp.ok && lp.cambiarClave && lp.pruebas && !lp.real && lp.permisos.length === PROBADOR.length, JSON.stringify(lp));
// Solo pruebas: la base real le dice que no; en pruebas entra, sin Mercado Pago, base ni accesos.
assert.strictEqual((await pedir("/api/admin/datos", { token: lp.token })).j.error, "entorno");
assert.strictEqual((await pedir("/api/admin/datos?e=pruebas", { token: lp.token })).r.status, 200);
for (const r of ["/api/admin/mp?e=pruebas", "/api/admin/estado?e=pruebas", "/api/admin/cuentas?e=pruebas"]) assert.strictEqual((await pedir(r, { token: lp.token })).j.error, "permiso", r);
// Cambio de clave propio.
assert.strictEqual((await cu({ actual: "mala", nueva: "nueva-clave-123" }, lp.token, "/api/admin/mi-clave?e=pruebas")).j.error, "actual");
assert.strictEqual((await cu({ actual: alta.clave, nueva: "corta" }, lp.token, "/api/admin/mi-clave?e=pruebas")).j.error, "corta");
assert.ok((await cu({ actual: alta.clave, nueva: "nueva-clave-123" }, lp.token, "/api/admin/mi-clave?e=pruebas")).j.ok);
const lp2 = (await pedir("/api/login", { body: { usuario: usu, clave: "nueva-clave-123" }, ip: ipP })).j;
assert.ok(lp2.ok && !lp2.cambiarClave);
// Sin permiso de Medios no escribe medios; con Ventas sí escribe ventas.
await cu({ usuario: usu, nombre: "Probador Uno", entorno: "pruebas", permisos: ["ventas"] });
assert.strictEqual((await pedir("/api/admin/lote?e=pruebas", { token: lp2.token, body: { set: [{ col: "medios", id: "zz", data: { id: "zz" } }] } })).j.error, "permiso");
// Reinicio de clave y desactivar: la sesión abierta deja de valer al instante.
const re = (await cu({ usuario: usu }, token, "/api/admin/cuentas/clave")).j;
assert.ok(re.ok && re.clave.length === 12);
assert.strictEqual((await pedir("/api/login", { body: { usuario: usu, clave: "nueva-clave-123" }, ip: ipP })).r.status, 401);
await cu({ usuario: usu, nombre: "Probador Uno", entorno: "pruebas", permisos: PROBADOR, activo: false });
assert.strictEqual((await pedir("/api/admin/datos?e=pruebas", { token: lp2.token })).r.status, 401);
assert.strictEqual((await pedir("/api/login", { body: { usuario: usu, clave: re.clave }, ip: ipP })).r.status, 401);

// Accesos con límites: una cuenta de pruebas con Accesos no da la base real ni maneja cuentas que la superan.
const usA = "acc" + unico.slice(-5), altaA = (await cu({ nueva: true, usuario: usA, nombre: "Con accesos", entorno: "pruebas", permisos: ["ventas", "accesos"] })).j;
const la = (await pedir("/api/login", { body: { usuario: usA, clave: altaA.clave }, ip: ipP })).j;
assert.strictEqual((await cu({ nueva: true, usuario: "esc" + unico.slice(-5), nombre: "X", entorno: "ambos", permisos: ["ventas"] }, la.token, "/api/admin/cuentas?e=pruebas")).r.status, 403);
assert.strictEqual((await cu({ nueva: true, usuario: "esc" + unico.slice(-5), nombre: "X", entorno: "real", permisos: ["ventas"] }, la.token, "/api/admin/cuentas?e=pruebas")).r.status, 403);
const hija = (await cu({ nueva: true, usuario: "hij" + unico.slice(-5), nombre: "Hija", entorno: "pruebas", permisos: ["ventas"] }, la.token, "/api/admin/cuentas?e=pruebas")).j;
assert.ok(hija.ok, JSON.stringify(hija));
assert.strictEqual((await cu({ usuario: usu }, la.token, "/api/admin/cuentas/clave?e=pruebas")).r.status, 403); // el probador tiene más permisos
assert.strictEqual((await cu({ usuario: usA, nombre: "Con accesos", entorno: "ambos", permisos: ["ventas", "accesos"] }, la.token, "/api/admin/cuentas?e=pruebas")).r.status, 403);
// Borrar: solo desactivadas.
assert.strictEqual((await cu({ usuario: "hij" + unico.slice(-5) }, token, "/api/admin/cuentas/borrar")).j.error, "activa");
await cu({ usuario: "hij" + unico.slice(-5), nombre: "Hija", entorno: "pruebas", permisos: ["ventas"], activo: false });
assert.ok((await cu({ usuario: "hij" + unico.slice(-5) }, token, "/api/admin/cuentas/borrar")).j.ok);
assert.ok(!(await pedir("/api/admin/cuentas", { token })).j.cuentas.some((c) => c.usuario === "hij" + unico.slice(-5)));
// Lectura según permisos: sin Ventas/Clientes/Reportes, clientes sin datos de contacto y sin gastos.
const usF = "fer" + unico.slice(-5), altaF = (await cu({ nueva: true, usuario: usF, nombre: "Feria", entorno: "real", permisos: ["feria"] })).j;
const lf = (await pedir("/api/login", { body: { usuario: usF, clave: altaF.clave }, ip: ipP })).j;
const df = (await pedir("/api/admin/datos", { token: lf.token })).j;
assert.ok(df.clientes.length > 0 && df.clientes.every((c) => !c.whatsapp && !c.email) && df.gastos.length === 0, JSON.stringify(df.clientes[0]));
assert.ok((await pedir("/api/admin/datos", { token })).j.clientes.some((c) => c.whatsapp));
// Costo de productos: la feria no lo ve, y al mover stock no lo borra. La tienda no lo publica.
const pid = "c" + unico;
await pedir("/api/admin/lote", { token, body: { set: [{ col: "productos", id: pid, data: { id: pid, nombre: "Costo test", categoria: "X", precio: 300, costo: 120, stock: 1, activo: false } }] } });
const pf = (await pedir("/api/admin/datos", { token: lf.token })).j.productos.find((p) => p.id === pid);
assert.ok(pf && !("costo" in pf), JSON.stringify(pf));
assert.ok((await pedir("/api/admin/lote", { token: lf.token, body: { set: [{ col: "productos", id: pid, data: { ...pf, stock: 0, costo: 1 } }] } })).j.ok);
const pa = (await pedir("/api/admin/datos", { token })).j.productos.find((p) => p.id === pid);
assert.ok(pa.costo === 120 && pa.stock === 0, JSON.stringify(pa));
assert.ok(!(await (await fetch(API + "/api/productos.csv")).text()).split("\n")[0].includes("costo"));
// Mensajes de WhatsApp: los guarda quien tiene el permiso.
assert.ok((await pedir("/api/admin/lote", { token, body: { set: [{ col: "mensajes", id: "listo", data: { id: "listo", texto: "Listo {nombre}", activo: true } }] } })).j.ok);
assert.ok((await pedir("/api/admin/datos", { token })).j.mensajes.some((m) => m.id === "listo"));
assert.strictEqual((await pedir("/api/admin/lote", { token: lf.token, body: { set: [{ col: "mensajes", id: "listo", data: { id: "listo", texto: "x" } }] } })).j.error, "permiso");
// Datos públicos para la tienda: solo los campos de envío y negocio.
await pedir("/api/admin/lote", { token, body: { set: [{ col: "mensajes", id: "negocio", data: { id: "negocio", agencias: "DAC", costo: "Lo pagás al retirar", secreto: "no" } }] } });
const ti = (await pedir("/api/tienda")).j;
assert.ok(ti.ok && ti.agencias === "DAC" && ti.costo === "Lo pagás al retirar" && !("secreto" in ti), JSON.stringify(ti));

// Avisos push: alta con el WhatsApp del pedido, y al avanzar el estado el servidor llama al servicio de push con VAPID.
const recibidos = [];
const servicioPush = http.createServer((q, r) => { recibidos.push({ url: q.url, auth: q.headers.authorization || "" }); r.writeHead(201); r.end(); }).listen(8799);
const { clave: vapid } = (await pedir("/api/push/clave")).j;
assert.ok(vapid && deB64(vapid).length === 65, vapid);
const ep = "http://localhost:8799/push/" + unico;
const altaP = (endpoint, wa) => pedir("/api/push/alta", { body: { endpoint, pedidos: [{ numero: String(ped.j.numero), whatsapp: wa }] }, ip: "10.6.0." + (unico % 250) });
assert.strictEqual((await altaP("https://evil.example.com/x", cliente.whatsapp)).j.error, "endpoint");
assert.deepStrictEqual((await altaP(ep, "+598 91111111")).j.pedidos, []);
assert.deepStrictEqual((await altaP(ep, cliente.whatsapp)).j.pedidos, [String(ped.j.numero)]);
const vPush = (await pedir("/api/admin/datos", { token })).j.ventas.find((v) => String(v.numero) === String(ped.j.numero));
assert.ok((await pedir("/api/admin/lote", { token, body: { set: [{ col: "ventas", id: String(vPush.numero), data: { ...vPush, estado: 2 } }] } })).j.ok);
for (let i = 0; i < 20 && !recibidos.length; i++) await new Promise((r) => setTimeout(r, 100));
assert.strictEqual(recibidos.length, 1, "push enviado");
const [, jwt, k] = recibidos[0].auth.match(/^vapid t=([^,]+), k=(.+)$/) || [];
assert.strictEqual(k, vapid);
const [h, c, f] = jwt.split(".");
const pub = await crypto.subtle.importKey("raw", deB64(vapid), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, deB64(f), new TextEncoder().encode(h + "." + c)), "firma VAPID");
assert.strictEqual(JSON.parse(new TextDecoder().decode(deB64(c))).aud, "http://localhost:8799");
const ult = (await pedir("/api/push/ultimo", { body: { endpoint: ep } })).j.aviso;
assert.ok(ult && ult.numero === String(ped.j.numero) && /impresión/.test(ult.texto), JSON.stringify(ult));
assert.strictEqual((await pedir("/api/push/ultimo", { body: { endpoint: ep + "x" } })).j.aviso, null);
servicioPush.close();

// Reseñas: solo de pedidos entregados, con el WhatsApp del pedido; llegan al panel.
const resena = (x) => pedir("/api/resenas", { body: { numero: String(ped.j.numero), whatsapp: cliente.whatsapp, estrellas: 5, comentario: "Excelente " + unico, ...x }, ip: "10.7.0." + (unico % 250) });
assert.strictEqual((await resena()).j.error, "sin-entregar");
assert.ok((await pedir("/api/admin/lote", { token, body: { set: [{ col: "ventas", id: String(vPush.numero), data: { ...vPush, estado: 4 } }] } })).j.ok);
assert.strictEqual((await resena({ estrellas: 6 })).j.error, "estrellas");
assert.strictEqual((await resena({ whatsapp: "+598 91111111" })).j.error, "pedido");
assert.ok((await resena({ estrellas: 4 })).j.ok);
assert.ok((await resena()).j.ok); // la vuelve a mandar: se reemplaza
const rs = (await pedir("/api/admin/datos", { token })).j.resenas.filter((r) => r.id === String(ped.j.numero));
assert.ok(rs.length === 1 && rs[0].estrellas === 5 && rs[0].comentario === "Excelente " + unico, JSON.stringify(rs));
// En la tienda: estrellas, comentario, nombre de pila y productos; sin WhatsApp ni número de pedido. Las ocultas no salen.
const enTienda = () => pedir("/api/tienda").then((x) => x.j.resenas);
const mia = (await enTienda()).find((r) => r.comentario === "Excelente " + unico);
assert.ok(mia && mia.estrellas === 5 && mia.productos.length && !("numero" in mia) && !("cliente" in mia) && !("whatsapp" in mia) && !/\s/.test(mia.nombre), JSON.stringify(mia));
assert.ok((await pedir("/api/admin/lote", { token, body: { set: [{ col: "resenas", id: rs[0].id, data: { ...rs[0], oculta: true } }] } })).j.ok);
assert.ok(!(await enTienda()).some((r) => r.comentario === "Excelente " + unico));

// Códigos de descuento: el servidor los valida, descuenta en un renglón "descuento" y cuenta los usos por las ventas.
const cod = "T" + unico, cupon = (data) => pedir("/api/admin/lote", { token, body: { set: [{ col: "cupones", id: data.id, data }] } });
assert.ok((await cupon({ id: cod, tipo: "%", valor: 10, vence: "", max: 1, activo: true })).j.ok);
assert.ok((await cupon({ id: "V" + unico, tipo: "$", valor: 50, vence: "2020-01-01", max: 0, activo: true })).j.ok);
const consulta = (c) => pedir("/api/cupon?c=" + c, { ip: "10.6.0." + (unico % 250) }).then((x) => x.j);
assert.deepStrictEqual(await consulta(cod.toLowerCase()), { ok: true, codigo: cod, tipo: "%", valor: 10 });
assert.strictEqual((await consulta("NOEXISTE" + unico)).error, "no-existe");
assert.strictEqual((await consulta("V" + unico)).error, "vencido");
const cliCupon = { ...cliente, whatsapp: "+598 8" + unico, modo: "total" };
const conCupon = await pedir("/api/pedidos", { body: { cliente: cliCupon, items: [{ id: idProd, cant: 2 }], cupon: cod }, ip: "10.5.0." + (unico % 250) });
const bruto = precioProd * 2, desc = Math.round(bruto / 10);
assert.ok(conCupon.j.ok && conCupon.j.total === bruto - desc && conCupon.j.descuento === desc, conCupon.t);
const vCupon = (await pedir("/api/admin/datos", { token })).j.ventas.find((v) => v.numero === String(conCupon.j.numero));
assert.ok(vCupon.cupon === cod && vCupon.items.at(-1).id === "descuento" && vCupon.items.at(-1).precio === -desc, JSON.stringify(vCupon));
const otra = await pedir("/api/pedidos", { body: { cliente: cliCupon, items: [{ id: idProd, cant: 1 }], cupon: cod }, ip: "10.5.0." + (unico % 250) });
assert.ok(otra.r.status === 400 && otra.j.error === "cupon" && otra.j.motivo === "agotado", otra.t);

console.log("api ok");
