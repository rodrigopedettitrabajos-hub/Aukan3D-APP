// node test.js
const assert = require("assert");
const fs = require("fs");
// localStorage falso para probar la cuenta (vista previa) sin navegador.
const almacen = {};
global.localStorage = { getItem: (k) => almacen[k] ?? null, setItem: (k, v) => { almacen[k] = String(v); }, removeItem: (k) => { delete almacen[k]; } };
const { textosEnvio, parseCsv, productosDesdeCsv, resumenPedido, montoSena, normalizar,
  guardarPerfil, leerPedidos, guardarPedido, olvidarCuenta } = require("./catalogo.js");

assert.deepStrictEqual(parseCsv('a,b\r\n"x, ""y""",2\n'), [["a", "b"], ['x, "y"', "2"]]);

const ps = productosDesdeCsv("id,categoria,nombre,precio,foto,activo\n1,Llaveros,Gameboy,$80,javascript:x,SI\n2,Llaveros,Oculto,10,,NO\n");
assert.strictEqual(ps.length, 1);
assert.strictEqual(ps[0].precio, 80);
assert.strictEqual(ps[0].foto, ""); // solo se aceptan fotos https o archivos locales
assert.strictEqual(productosDesdeCsv("id,nombre,precio,foto\n1,A,1,fotos/a-1.webp\n")[0].foto, "fotos/a-1.webp");
assert.strictEqual(productosDesdeCsv("id,nombre,precio,foto\n1,A,1,../x.png\n")[0].foto, "");

const real = productosDesdeCsv(fs.readFileSync(__dirname + "/productos.csv", "utf8"));
assert.ok(real.length > 150 && real.every((p) => p.precio > 0 || p.categoria === "Ideas personalizadas"));
const multi = productosDesdeCsv("id,nombre,precio,foto\n1,A,10,fotos/a.webp| fotos/b.webp |javascript:x\n");
assert.deepStrictEqual([multi[0].foto, multi[0].fotos], ["fotos/a.webp", ["fotos/a.webp", "fotos/b.webp"]]);

const r = resumenPedido([{ nombre: "Kirby", precio: 400, cant: 2 }], { nombre: "Ana", entrega: "Retiro coordinado" });
assert.ok(r.includes("2 x Kirby") && r.includes("Total: $800") && r.includes("seña del 50 % ($400)"));
assert.strictEqual(montoSena(1250), 625); assert.strictEqual(montoSena(1251), 626);
assert.ok(resumenPedido([{ nombre: "Kirby", precio: 400, cant: 1 }], { nombre: "Ana", entrega: "x", modo: "total" }).includes("Pago: todo ($400)"));
// productos.js tiene que ser copia exacta de productos.csv
const ctx = { window: {} };
require("vm").runInNewContext(fs.readFileSync(__dirname + "/productos.js", "utf8"), ctx);
assert.strictEqual(ctx.window.PRODUCTOS_CSV, fs.readFileSync(__dirname + "/productos.csv", "utf8"), "Regenerar productos.js desde productos.csv");
// Dos cuentas en el mismo dispositivo: cada una ve solo sus pedidos.
guardarPerfil({ nombre: "Ana", email: "ana@x.com", activo: true });
const pa = guardarPedido({ total: 400, items: [{ id: "1", nombre: "Kirby", precio: 400, cant: 1 }], direccion: "Av. Italia 1, Montevideo" });
assert.ok(pa.numero.startsWith("W") && pa.guardado && leerPedidos().length === 1);
guardarPerfil({ nombre: "Ana", email: "ana@x.com", activo: false });
assert.strictEqual(guardarPedido({ total: 1, items: [] }).guardado, undefined); // sin sesión no se guarda
guardarPerfil({ nombre: "Juan", email: "juan@x.com", activo: true });
assert.deepStrictEqual(leerPedidos(), []);
assert.strictEqual(leerPedidos("ana@x.com")[0].direccion, "Av. Italia 1, Montevideo"); // la dirección viaja con el pedido
guardarPerfil({ nombre: "Ana", email: "ana@x.com", activo: true });
olvidarCuenta();
assert.deepStrictEqual([leerPedidos("ana@x.com"), almacen.aukan_perfil], [[], undefined]);
assert.strictEqual(normalizar("Pokémon PIKACHÚ"), "pokemon pikachu");
assert.ok(resumenPedido([{ nombre: "A", precio: 1, cant: 1 }], { nombre: "Ana", entrega: "Envío por agencia", envio: "Calle 1, Salto" }).includes("Entrega: Envío por agencia (Calle 1, Salto)"));
console.log("ok");
// Textos de envío: sin datos, los de siempre; con datos, los que carga Aukan3D.
assert.ok(textosEnvio().faq.includes("puntos de encuentro") && textosEnvio().info === "");
const te = textosEnvio({ agencias: "DAC o UES", costo: "Lo pagás al retirar en la agencia", plazo: "1 a 3 días hábiles", retiro: "Tres Cruces" });
assert.strictEqual(te.info, "Enviamos por DAC o UES. Lo pagás al retirar en la agencia. Llega en 1 a 3 días hábiles.");
assert.ok(te.faq.startsWith("Sí. En Montevideo coordinamos el retiro: Tres Cruces.") && te.entrega.startsWith("Retiro coordinado: Tres Cruces."));
