// Pegar en la Google Sheet: Extensiones > Apps Script. Implementar > Nueva implementación >
// Aplicación web, "Ejecutar como: yo", "Acceso: cualquier persona". Copiar la URL a config.js (pedidosUrl).
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
    const detalle = body.items.map((i) => {
      const p = catalogo[String(i.id)];
      const cant = Math.min(Math.max(parseInt(i.cant, 10) || 0, 1), 99);
      if (!p) throw new Error("producto");
      total += p.precio * cant;
      return cant + " x " + p.nombre + " ($" + p.precio + ")";
    }).join("\n");

    const pedidos = hoja("Pedidos");
    if (pedidos.getLastRow() === 0) pedidos.appendRow(["fecha", "nombre", "whatsapp", "email", "entrega", "comentario", "detalle", "total", "estado"]);
    pedidos.appendRow([new Date(), nombre, whatsapp, limpio(c.email, 120), limpio(c.entrega, 40),
      limpio(c.comentario, 500), detalle, total, "NUEVO"].map(seguro));
    return json({ ok: true, total: total });
  } catch (err) {
    return json({ ok: false, error: "invalido" });
  } finally {
    lock.releaseLock();
  }
}

function hoja(n) { return SpreadsheetApp.getActive().getSheetByName(n) || SpreadsheetApp.getActive().insertSheet(n); }
function limpio(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
// Evita que un texto del cliente se ejecute como fórmula en la planilla.
function seguro(v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
