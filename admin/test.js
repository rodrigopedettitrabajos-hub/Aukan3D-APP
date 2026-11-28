// node admin/test.js
process.env.TZ = "America/Montevideo"; // las fechas se cuentan con la hora de Uruguay
const assert = require("assert");
const fs = require("fs");
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.assign(global, require("../catalogo.js")); // datos.js usa parseCsv como global, igual que en el navegador
const d = require("./datos.js");

const cat = d.catalogoDesdeCsv(fs.readFileSync(__dirname + "/../productos.csv", "utf8"));
assert.ok(cat.length >= 170);
// Costo, ganancia y Excel de productos.
assert.strictEqual(d.precioConGanancia(100, 50), 150);
assert.strictEqual(d.precioConGanancia(333, 50, 50), 500); // 499.5 -> 500 hacia arriba
assert.strictEqual(d.gananciaPct({ costo: 200, precio: 300 }), 50);
assert.strictEqual(d.gananciaPct({ costo: 0, precio: 300 }), null);
assert.strictEqual(d.numeroCelda("$ 1.200"), 1200);
assert.strictEqual(d.numeroCelda("1.200,50"), 1200.5);
assert.strictEqual(d.numeroCelda(""), null);
assert.ok(Number.isNaN(d.numeroCelda("mucho")));
const prods = [{ id: "1", nombre: "Gato", categoria: "Figuras", subcategoria: "", tamano: "", material: "PLA", costo: 100, precio: 300, stock: 2, activo: true, foto: "a.webp" },
  { id: "2", nombre: "Perro", categoria: "Figuras", precio: 0, stock: 0, activo: false }];
const hoja = d.productosAFilas(prods);
assert.deepStrictEqual(hoja[1].slice(4, 7), [100, 200, 300]); // costo, ganancia %, precio (sin stock)
assert.strictEqual(hoja[2][9], "NO");
assert.deepStrictEqual(d.filasAProductos(hoja, prods), { cambios: [], nuevos: [], errores: [], iguales: 2 }); // ida y vuelta sin cambios
const imp = d.filasAProductos([["id", "COSTO", "ganancia %", "Precio", "Contado"], ["2", "50", "100", "", "4"], ["", "", "", "", ""], ["1", "x"], ["9z!", "1"]], prods);
assert.deepStrictEqual(imp.cambios, [{ producto: prods[1], datos: { costo: 50, precio: 100 } }]); // Productos y precios no toca el stock
// Planilla de stock: solo el stock, por ID; precios y productos nuevos se ignoran.
const st = d.filasAProductos([...d.inventarioAFilas(prods).map((f, i) => (i === 1 ? [...f.slice(0, 5), 999, f[6], 7] : f)), ["77", "Nuevo", "X", "", "", "", "", "3"]], prods, "stock");
assert.deepStrictEqual(st.cambios, [{ producto: prods[0], datos: { stock: 7 } }]);
assert.deepStrictEqual([st.nuevos.length, st.errores.length], [0, 1]);
assert.strictEqual(d.filasAProductos([["ID", "Precio"], ["1", "5"]], prods, "stock").errores.length, 1);
assert.strictEqual(imp.errores.length, 2);
const alta = d.filasAProductos([["Nombre", "Categoría", "Precio"], ["Dragón", "Figuras", "1.500"], ["Sin cat", "", ""]], prods);
assert.deepStrictEqual(alta.nuevos.map((p) => [p.id, p.precio, p.activo]), [["3", 1500, true]]);
assert.strictEqual(alta.errores.length, 1);
assert.deepStrictEqual(d.inventario(prods), { unidades: 2, costo: 200, venta: 600, sinCosto: 0 });
const mg = d.margenes([{ moneda: "UYU", items: [{ id: "1", nombre: "Gato", precio: 300, cant: 2 }, { id: "2", nombre: "Perro", precio: 90, cant: 1 }] },
  { moneda: "USD", items: [{ id: "1", precio: 10, cant: 1 }] }], prods);
assert.deepStrictEqual(mg.total, { vendido: 600, costo: 200, sinCosto: 90, ganancia: 400 });
assert.strictEqual(mg.filas[0].ganancia, 400);
assert.strictEqual(mg.filas[1].ganancia, null);

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
// Mensajes de WhatsApp por estado: originales, editados, desactivados y la frase del saldo.
const pl = (n) => "$ " + n;
const vm1 = { numero: "7", estado: 1, sena: true, moneda: "UYU", items: [{ precio: 1000, cant: 1 }], pagos: [{ monto: 500 }] };
assert.strictEqual(d.claveMensaje(vm1), "sena");
assert.strictEqual(d.mensajeDe({ mensajes: [] }, vm1, "Ana", pl), "¡Hola, Ana! Recibimos la seña de tu pedido N° 7. ¡Quedó confirmado! Queda un saldo de $ 500.");
assert.strictEqual(d.claveMensaje({ ...vm1, pagos: [{ monto: 1000 }] }), "pagado");
const vm3 = { ...vm1, estado: 3, pagos: [{ monto: 1000 }] };
assert.strictEqual(d.mensajeDe({ mensajes: [] }, vm3, "Ana", pl), "¡Hola, Ana! ¡Tu pedido N° 7 está listo para entregar! ¿Coordinamos la entrega?"); // sin saldo: sin frase
assert.strictEqual(d.mensajeDe({ mensajes: [{ id: "listo", texto: "{nombre}: listo el {numero}, total {total}. {resta} {otra}", activo: true }] }, vm3, "Ana", pl), "Ana: listo el 7, total $ 1000. {otra}");
assert.strictEqual(d.mensajeDe({ mensajes: [{ id: "listo", texto: "x", activo: false }] }, vm3, "Ana", pl), "");
assert.strictEqual(d.mensajeDe({}, { ...vm1, estado: 0 }, "Ana", pl), "");
// Varias líneas: una línea que solo tenía datos vacíos se saca; datos del negocio y lo que pidió.
const vi = { ...vm3, entrega: "", items: [{ nombre: "Kirby", precio: 600, cant: 2 }] };
assert.strictEqual(d.armarMensaje("¡Hola {nombre}! Gracias por comprar en {negocio}:\n🗒 {items}\n💲 Total: {total} · Pagaste: {pagado}\n{resta}\n📅 {entrega}\n{direccion}", vi, "Ana", pl, { negocio: "Aukan3D", direccion: "Av. Italia 1" }),
  "¡Hola Ana! Gracias por comprar en Aukan3D:\n🗒 2 x Kirby\n💲 Total: $ 1200 · Pagaste: $ 1000\nQueda un saldo de $ 200.\nAv. Italia 1");

// Reseñas y link en el mensaje de entregado.
const rr = d.resumenResenas([{ estrellas: 5, fecha: "2026-11-02" }, { estrellas: 4, fecha: "2026-11-03" }, { _borrado: true, id: "x" }]);
assert.deepStrictEqual([rr.cantidad, rr.promedio, rr.por[0], rr.lista[0].estrellas], [2, 4.5, [5, 1], 4]);
assert.ok(d.mensajeDe({ mensajes: [] }, { ...vi, estado: 4 }, "Ana", pl, { resena: "https://t/#historial" }).endsWith("estrellas: https://t/#historial"));

// Excel: lo que se escribe se vuelve a leer igual.
const x = require("./excel.js");
(async () => {
  const filas = [["ID", "Nombre", "Precio"], ["1", 'Gato <"XL"> & ñ', 300], ["2", "", 0]];
  const leido = await x.leerXlsx(await x.crearXlsx(filas, { hoja: "Productos" }).arrayBuffer());
  assert.deepStrictEqual(leido, [["ID", "Nombre", "Precio"], ["1", 'Gato <"XL"> & ñ', 300], ["2", "", 0]]);
  // Cierre de caja para compartir: medios, lo más vendido, efectivo y diferencia.
  {
    const dbC = { medios: [{ id: "ef", nombre: "Efectivo" }, { id: "mp", nombre: "Mercado Pago" }], cajas: [], ventas: [
      { caja: "k1", moneda: "UYU", items: [{ id: "1", nombre: "Pikachu", precio: 400, cant: 2 }], pagos: [{ medio: "ef", monto: 800 }] },
      { caja: "k1", moneda: "UYU", items: [{ id: "2", nombre: "Llavero", precio: 100, cant: 3 }, { id: "descuento", nombre: "Descuento X", precio: -30, cant: 1 }], pagos: [{ medio: "mp", monto: 270 }] },
      { caja: "otra", moneda: "UYU", items: [{ id: "1", nombre: "Pikachu", precio: 400, cant: 9 }], pagos: [] }] };
    const caja = { id: "k1", abierta: "2026-11-28T17:00:00Z", cerrada: "2026-11-28T23:00:00Z", fondo: 1000, movimientos: [{ tipo: "retiro", monto: 300 }], contado: 1450 };
    const t = d.textoCierre(dbC, caja, (n) => "$ " + n, "Rodrigo");
    for (const x of ["*Ventas:* 2 · $ 1070", "• Efectivo: $ 800", "• Mercado Pago: $ 270", "• 3 × Llavero", "• 2 × Pikachu", "• Retiros: − $ 300", "• Tendría que haber: $ 1500", "*Diferencia:* faltan $ 50", "Vendió: Rodrigo"])
      assert.ok(t.includes(x), x + "\n" + t);
    assert.ok(!t.includes("Descuento X"));
  }
  // Stock bajo: solo con mínimo cargado y menos stock que el mínimo.
  assert.deepStrictEqual([{ minimo: 3, stock: 1 }, { minimo: 3, stock: 3 }, { minimo: 0, stock: 0 }, { minimo: 2 }, { minimo: 2, _borrado: true }].map(d.bajoMinimo), [true, false, false, true, false]);
  console.log("admin: ok");
})();
