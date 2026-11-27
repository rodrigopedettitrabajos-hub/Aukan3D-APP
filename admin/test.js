// node admin/test.js
process.env.TZ = "America/Montevideo"; // las fechas se cuentan con la hora de Uruguay
const assert = require("assert");
const fs = require("fs");
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.assign(global, require("../catalogo.js")); // datos.js usa parseCsv como global, igual que en el navegador
const d = require("./datos.js");

const cat = d.catalogoDesdeCsv(fs.readFileSync(__dirname + "/../productos.csv", "utf8"));
assert.ok(cat.length >= 170);
// Ida y vuelta al CSV sin perder nada (comas y comillas incluidas).
const raro = [{ ...cat[0], nombre: 'Figura "XL", grande', activo: false, stock: 3 }];
const vuelta = d.catalogoDesdeCsv(d.catalogoACsv(raro))[0];
assert.strictEqual(vuelta.nombre, 'Figura "XL", grande');
assert.strictEqual(vuelta.activo, false);

const v = { moneda: "UYU", estado: 0, items: [{ precio: 500, cant: 2 }, { precio: 301, cant: 1 }], pagos: [] };
assert.strictEqual(d.totalVenta(v), 1301);
d.registrarPago(v, 651, "m1");
assert.strictEqual(d.saldo(v), 650);
assert.strictEqual(v.estado, 1); // la seña lo pasa a "Seña pagada"
assert.throws(() => d.registrarPago(v, 651, "m1")); // no se puede pagar de más
assert.throws(() => d.registrarPago(v, 0, "m1"));

const db = d.datosEjemplo(cat, Date.parse("2026-11-27T15:00:00Z"));
assert.deepStrictEqual(db, d.datosEjemplo(cat, Date.parse("2026-11-27T15:00:00Z"))); // siempre los mismos ejemplos
assert.ok(db.ventas.length > 20 && db.ventas.every((x) => d.cobrado(x) <= d.totalVenta(x)));
const r = d.resumenMes(db, "2026-11");
assert.ok(r.vendido.UYU > 0 && r.cobrado.UYU > 0 && r.gastado.UYU > 0);
assert.strictEqual(r.resultado.UYU, r.cobrado.UYU - r.gastado.UYU);
// Reportes por período: el año suma lo mismo que sus meses; la serie diaria cubre todo el mes.
const anio = d.resumenRango(db, "2026-01-01", "2026-12-31");
assert.ok(anio.vendido.UYU >= r.vendido.UYU);
const serie = d.serieVentas(r.ventas, "2026-11-01", "2026-11-30");
assert.strictEqual(serie.length, 30);
assert.strictEqual(d.suma(serie, (x) => x[1]), r.vendido.UYU);
assert.deepStrictEqual(d.serieVentas(anio.ventas, "2026-01-01", "2026-12-31", 7).map((x) => x[0]).slice(0, 2), ["2026-01", "2026-02"]);
const top = d.masVendidos(r.ventas, 3);
assert.ok(top.length === 3 && top[0].cant >= top[1].cant);

const com = d.comisiones(db, "2026-11");
const rom = com.find((u) => u.nombre === "Romina");
assert.strictEqual(rom.comision.UYU, Math.round(rom.vendido.UYU * 0.1));
assert.strictEqual(rom.porcentaje, 10); // el % del usuario sigue a mano para la tabla
assert.ok(com.every((u) => db.ventas.filter((x) => x.origen === "web").every((x) => x.vendedor !== u.id))); // la web no comisiona
// El mes se cuenta en hora de Uruguay: el 30/11 a las 22:00 (01:00 UTC del 1/12) es de noviembre.
assert.strictEqual(d.mesDe("2026-12-01T01:00:00.000Z"), "2026-11");
assert.strictEqual(d.mesDe("2026-12-01T03:30:00.000Z"), "2026-12");
assert.strictEqual(d.mesDe("2026-11-30"), "2026-11");
// La comisión usa el % que regía al vender, no el actual.
const db2 = { usuarios: [{ id: "u", nombre: "R", comision: 12 }], ventas: [
  { vendedor: "u", fecha: "2026-11-10T15:00:00.000Z", moneda: "UYU", comision: 10, items: [{ precio: 1000, cant: 1 }], pagos: [] },
  { vendedor: "u", fecha: "2026-11-11T15:00:00.000Z", moneda: "UYU", items: [{ precio: 1000, cant: 1 }], pagos: [] }] };
assert.strictEqual(d.comisiones(db2, "2026-11")[0].comision.UYU, 100 + 120); // la vieja sin % guardado usa el actual
// Puente de la demo: un pedido de la tienda entra una sola vez, con cliente nuevo y precios saneados.
const db3 = { ventas: [], clientes: [] };
const ped = { numero: "WABC12", fecha: "2026-11-27T20:00:00.000Z", total: 800, sena: true, entrega: "Retiro coordinado",
  cliente: { nombre: "Ana", whatsapp: "099 111 222" }, items: [{ id: "4", nombre: "PIKACHU", precio: "400", cant: 2 }] };
assert.strictEqual(d.importarPedidosWeb(db3, [ped]), 1);
assert.strictEqual(d.importarPedidosWeb(db3, [ped]), 0);
assert.strictEqual(d.totalVenta(db3.ventas[0]), 800);
assert.strictEqual(db3.clientes[0].nombre, "Ana");
assert.strictEqual(d.importarPedidosWeb(db3, [{ ...ped, numero: "W2" }]), 1);
assert.strictEqual(db3.clientes.length, 1); // mismo WhatsApp, mismo cliente

// Sincronización: solo se manda lo cambiado; lo del servidor no pisa cambios locales sin mandar.
const enviado = new Map(), local = d.dbVacia();
d.aplicarServidor(local, { ventas: [{ numero: "1001", fecha: "2026-11-01T10:00:00Z", origen: "web", items: [], pagos: [] }],
  gastos: [{ id: "g1", concepto: "Luz", monto: 10 }] }, enviado);
assert.deepStrictEqual(d.cambiosDb(local, enviado), { set: [], del: [] });
local.gastos[0].monto = 20;
local.clientes.push({ id: "c9", nombre: "Ana" });
local.ventas.splice(0, 1);
let cam = d.cambiosDb(local, enviado);
assert.deepStrictEqual(cam.set.map((x) => x.col + x.id), ["clientesc9", "gastosg1"]);
assert.deepStrictEqual(cam.del, [{ col: "ventas", id: "1001" }]);
assert.strictEqual(d.aplicarServidor(local, { gastos: [{ id: "g1", concepto: "Luz", monto: 10 }] }, enviado), 0);
assert.strictEqual(local.gastos[0].monto, 20); // el cambio local sin mandar se respeta
d.marcarEnviado(enviado, cam);
assert.deepStrictEqual(d.cambiosDb(local, enviado), { set: [], del: [] });
assert.strictEqual(d.aplicarServidor(local, { ventas: [{ numero: "1002", fecha: "2026-11-02T10:00:00Z", origen: "web", items: [], pagos: [] }],
  gastos: [{ _borrado: true, id: "g1" }] }, enviado), 1);
assert.strictEqual(local.gastos.length, 0);
assert.strictEqual(local.ventas[0].numero, "1002");

// Caja de la feria: fondo + efectivo + ingresos - retiros; la diferencia contra lo contado.
const dbF = d.datosEjemplo(cat);
const caja = { id: "k1", abierta: "2026-11-27T13:00:00Z", cerrada: null, fondo: 1000, vendedor: "u2", movimientos: [{ tipo: "retiro", monto: 300 }, { tipo: "ingreso", monto: 50 }], contado: null };
dbF.cajas.push(caja);
assert.strictEqual(d.cajaAbierta(dbF), caja);
dbF.ventas.push({ numero: "F1", caja: "k1", moneda: "UYU", items: [{ precio: 800, cant: 1 }], pagos: [{ medio: "m1", monto: 800 }] },
  { numero: "F2", caja: "k1", moneda: "UYU", items: [{ precio: 500, cant: 2 }], pagos: [{ medio: "m3", monto: 1000 }] });
let rc = d.resumenCaja(dbF, caja);
assert.deepStrictEqual([rc.total, rc.efectivo, rc.esperado, rc.porMedio.m3, rc.diferencia], [1800, 800, 1550, 1000, null]);
caja.contado = 1500; caja.cerrada = "2026-11-27T20:00:00Z";
assert.strictEqual(d.resumenCaja(dbF, caja).diferencia, -50);
assert.strictEqual(d.cajaAbierta(dbF), null);
console.log("admin: ok");
