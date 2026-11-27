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
const com = d.comisiones(db, "2026-11");
const rom = com.find((u) => u.nombre === "Romina");
assert.strictEqual(rom.comision.UYU, Math.round(rom.vendido.UYU * 0.1));
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
console.log("admin: ok");
