// node test.js
const assert = require("assert");
const fs = require("fs");
const { parseCsv, productosDesdeCsv, resumenPedido } = require("./catalogo.js");

assert.deepStrictEqual(parseCsv('a,b\r\n"x, ""y""",2\n'), [["a", "b"], ['x, "y"', "2"]]);

const ps = productosDesdeCsv("id,categoria,nombre,precio,foto,activo\n1,Llaveros,Gameboy,$80,javascript:x,SI\n2,Llaveros,Oculto,10,,NO\n");
assert.strictEqual(ps.length, 1);
assert.strictEqual(ps[0].precio, 80);
assert.strictEqual(ps[0].foto, ""); // solo se aceptan fotos https o archivos locales
assert.strictEqual(productosDesdeCsv("id,nombre,precio,foto\n1,A,1,fotos/a-1.webp\n")[0].foto, "fotos/a-1.webp");
assert.strictEqual(productosDesdeCsv("id,nombre,precio,foto\n1,A,1,../x.png\n")[0].foto, "");

const real = productosDesdeCsv(fs.readFileSync(__dirname + "/productos.csv", "utf8"));
assert.ok(real.length > 150 && real.every((p) => p.precio > 0));

const r = resumenPedido([{ nombre: "Kirby", precio: 400, cant: 2 }], { nombre: "Ana", entrega: "Retiro coordinado" });
assert.ok(r.includes("2 x Kirby") && r.includes("Total: $800"));
console.log("ok");
