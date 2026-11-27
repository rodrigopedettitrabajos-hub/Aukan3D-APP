// Prueba Code.gs con stubs de Apps Script: node apps-script/test.js
const fs = require("fs"), assert = require("assert");
const rows = { Productos: [["id","categoria","subcategoria","nombre","precio","foto","activo"], ["1","Figuras","","Charizard",1600,"",""], ["2","Llaveros","","=HACK",200,"",""]], Pedidos: [] };
let props = {}, fetched = [];
const sheet = (n) => ({ getDataRange: () => ({ getValues: () => rows[n].map((r) => r.slice()) }), getLastRow: () => rows[n].length, appendRow: (r) => rows[n].push(r) });
const ctx = {
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { getActive: () => ({ getSheetByName: sheet, insertSheet: sheet }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
  UrlFetchApp: { fetch: (url, o) => { fetched.push({ url, o }); return { getResponseCode: () => 201, getContentText: () => JSON.stringify({ init_point: "https://www.mercadopago.com.uy/checkout/v1/redirect?pref_id=X", sandbox_init_point: "https://sandbox.mercadopago.com.uy/checkout/v1/redirect?pref_id=X" }) }; } },
  ContentService: { MimeType: { JSON: 1 }, createTextOutput: (t) => ({ t, setMimeType() { return JSON.parse(t); } }) },
  console,
};
const f = new Function(...Object.keys(ctx), fs.readFileSync(require("path").join(__dirname, "Code.gs"), "utf8") + "; return doPost;");
const doPost = f(...Object.values(ctx));
const post = (b) => doPost({ postData: { contents: JSON.stringify(b) } });
const cli = { nombre: "Ana", whatsapp: "099123456", email: "ana@x.com" };
let r = post({ cliente: { ...cli, modo: "total" }, items: [{ id: "1", cant: 2 }] });
assert.deepStrictEqual([r.ok, r.total, r.pago, fetched.length], [true, 3200, "", 0]); // sin token: sin link
props.MP_ACCESS_TOKEN = "TEST-123";
r = post({ cliente: { ...cli, modo: "total" }, items: [{ id: "1", cant: 2, precio: 1 }, { id: "2", cant: 1 }] });
assert.strictEqual(r.total, 3400); assert.ok(r.pago.startsWith("https://sandbox."));
const body = JSON.parse(fetched[0].o.payload);
assert.deepStrictEqual(body.items[0], { title: "Charizard", quantity: 2, unit_price: 1600, currency_id: "UYU" });
assert.strictEqual(body.external_reference, "AUKAN-2"); assert.strictEqual(body.payer.email, "ana@x.com");
assert.strictEqual(fetched[0].o.headers.Authorization, "Bearer TEST-123");
props.MP_ACCESS_TOKEN = "APP_USR-1"; r = post({ cliente: cli, items: [{ id: "1", cant: 1 }, { id: "2", cant: 1 }] });
// Sin modo (o "sena"): cobra la seña del 50% redondeada hacia arriba, en una sola línea.
assert.deepStrictEqual([r.total, r.aPagar, r.sena], [1800, 900, true]);
assert.deepStrictEqual(JSON.parse(fetched[1].o.payload).items, [{ title: "Seña 50% pedido AUKAN-3", quantity: 1, unit_price: 900, currency_id: "UYU" }]);
r = post({ cliente: { ...cli, modo: "sena" }, items: [{ id: "2", cant: 1 }, { id: "1", cant: 1 }, { id: "2", cant: 0 }] });
assert.strictEqual(r.total, 2000); assert.strictEqual(r.aPagar, 1000);
r = post({ cliente: cli, items: [{ id: "2", cant: 1 }, { id: "1", cant: 1 }, { id: "1", cant: 1 }, { id: "2", cant: 1 }, { id: "2", cant: 1 }] });
assert.strictEqual(r.aPagar, Math.ceil(r.total / 2));
assert.ok(r.pago.startsWith("https://www.")); assert.strictEqual(rows.Pedidos.length, 6);
assert.strictEqual(post({ cliente: cli, items: [{ id: "99", cant: 1 }] }).ok, false);
console.log("gs ok", rows.Pedidos[0].length, rows.Pedidos[2][6]);
