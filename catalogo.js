// Lógica pura (sin DOM), compartida por la app y por test.js.

// Parser CSV mínimo: comillas, comas y saltos de línea dentro de comillas (formato de Google Sheets).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Solo https o un archivo dentro de la app (ej. fotos/charizard.webp). Nada de javascript:, data:, etc.
function fotoSegura(f) {
  return /^https:\/\/\S+$/.test(f) || /^[\w-]+(\/[\w-]+)*\.(webp|jpe?g|png)$/i.test(f) ? f : "";
}

function productosDesdeCsv(text) {
  const [head, ...rows] = parseCsv(text);
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (r, k) => (r[h.indexOf(k)] || "").trim();
  return rows
    .map((r) => ({
      id: col(r, "id"),
      categoria: col(r, "categoria") || "Otros",
      subcategoria: col(r, "subcategoria"),
      nombre: col(r, "nombre"),
      precio: Number(col(r, "precio").replace(/[^\d]/g, "")) || 0,
      foto: fotoSegura(col(r, "foto")),
      activo: !/^(no|false|0)$/i.test(col(r, "activo")),
    }))
    .filter((p) => p.id && p.nombre && p.activo);
}

// Igual que en apps-script/Code.gs: la seña es el 50% redondeado hacia arriba.
const montoSena = (total) => Math.ceil(total / 2);

function resumenPedido(items, cliente) {
  const total = items.reduce((s, i) => s + i.precio * i.cant, 0);
  const lineas = items.map((i) => `• ${i.cant} x ${i.nombre} ($${i.precio})`);
  return [
    "Hola Aukan3D! Quiero hacer este pedido:",
    ...lineas,
    `Total: $${total}`,
    `Nombre: ${cliente.nombre}`,
    `Entrega: ${cliente.entrega}`,
    cliente.modo === "total" ? `Pago: todo ($${total})` : `Pago: seña del 50% ($${montoSena(total)})`,
    cliente.comentario ? `Comentario: ${cliente.comentario}` : "",
  ].filter(Boolean).join("\n");
}

if (typeof module !== "undefined") module.exports = { parseCsv, productosDesdeCsv, resumenPedido, montoSena };
