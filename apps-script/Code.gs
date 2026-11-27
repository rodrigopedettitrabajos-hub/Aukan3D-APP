// Pegar en la Google Sheet: Extensiones > Apps Script. Implementar > Nueva implementación >
// Aplicación web, "Ejecutar como: yo", "Acceso: cualquier persona". Copiar la URL a config.js (pedidosUrl).
// Mercado Pago: Configuración del proyecto > Propiedades del script > MP_ACCESS_TOKEN = el Access Token
// (de prueba "TEST-..." mientras se prueba). Sin esa propiedad, el pedido se guarda igual pero sin link de pago.
// La planilla necesita las pestañas "Productos" (id, categoria, subcategoria, nombre, precio, foto, activo) y "Pedidos".

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    const c = body.cliente || {};
    const nombre = limpio(c.nombre, 80), whatsapp = limpio(c.whatsapp, 20);
    if (!nombre || !/^\+?[0-9 ]{8,20}$/.test(whatsapp)) return json({ ok: false, error: "datos" });
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) return json({ ok: false, error: "items" });

    // Precios desde la planilla, nunca desde el navegador.
    const filas = hoja("Productos").getDataRange().getValues();
    const h = filas.shift().map(String).map((x) => x.trim().toLowerCase());
    const catalogo = {};
    filas.forEach((r) => { catalogo[String(r[h.indexOf("id")])] = { nombre: r[h.indexOf("nombre")], precio: Number(r[h.indexOf("precio")]) }; });

    let total = 0;
    const lineas = body.items.map((i) => {
      const p = catalogo[String(i.id)];
      const cant = Math.min(Math.max(parseInt(i.cant, 10) || 0, 1), 99);
      if (!p || !(p.precio > 0)) throw new Error("producto");
      total += p.precio * cant;
      return { title: String(p.nombre).slice(0, 120), quantity: cant, unit_price: p.precio, currency_id: "UYU" };
    });
    const detalle = lineas.map((l) => l.quantity + " x " + l.title + " ($" + l.unit_price + ")").join("\n");

    // Seña del 50% (redondeada hacia arriba) o el total; el monto se calcula acá, nunca en el navegador.
    const sena = c.modo !== "total";
    const aPagar = sena ? Math.ceil(total / 2) : total;

    const pedidos = hoja("Pedidos");
    if (pedidos.getLastRow() === 0) pedidos.appendRow(["fecha", "nombre", "whatsapp", "email", "entrega", "comentario", "detalle", "total", "estado", "pago", "modo", "a pagar"]);
    const numero = pedidos.getLastRow(); // número de pedido = fila de datos
    const referencia = "AUKAN-" + numero;
    const cobro = sena ? [{ title: "Seña 50% pedido " + referencia, quantity: 1, unit_price: aPagar, currency_id: "UYU" }] : lineas;
    const pago = linkPago(cobro, referencia, limpio(c.email, 120));
    pedidos.appendRow([new Date(), nombre, whatsapp, limpio(c.email, 120), limpio(c.entrega, 40),
      limpio(c.comentario, 500), detalle, total, "NUEVO", pago, sena ? "Seña 50%" : "Total", aPagar].map(seguro));
    return json({ ok: true, total: total, aPagar: aPagar, sena: sena, numero: numero, pago: pago });
  } catch (err) {
    return json({ ok: false, error: "invalido" });
  } finally {
    lock.releaseLock();
  }
}

// Crea el cobro en Mercado Pago (Checkout Pro) con los precios de la planilla. Devuelve el link o "" si falla.
function linkPago(items, referencia, email) {
  const token = PropertiesService.getScriptProperties().getProperty("MP_ACCESS_TOKEN");
  if (!token) return "";
  const pref = { items: items, external_reference: referencia };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) pref.payer = { email: email };
  const res = UrlFetchApp.fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + token, "X-Idempotency-Key": referencia },
    payload: JSON.stringify(pref),
  });
  if (res.getResponseCode() >= 300) { console.error("Mercado Pago", res.getResponseCode(), res.getContentText()); return ""; }
  const r = JSON.parse(res.getContentText());
  // Con credenciales de prueba el link que sirve es el de sandbox.
  return /^TEST-/.test(token) ? r.sandbox_init_point : r.init_point;
}

function hoja(n) { return SpreadsheetApp.getActive().getSheetByName(n) || SpreadsheetApp.getActive().insertSheet(n); }
function limpio(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
// Evita que un texto del cliente se ejecute como fórmula en la planilla.
function seguro(v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
