// Datos del panel de gestión y cálculos (sin DOM), compartidos por admin.js y admin/test.js.
// shortcut: todo vive en localStorage de este navegador; pasar a la base de datos (Cloudflare D1) cuando se conecte.

const ESTADOS = ["Recibido", "Seña pagada", "En impresión", "Listo para entregar", "Entregado"];
const CLAVE_DB = "aukan_admin_db";
// Día y mes con la hora de este equipo (Uruguay), no en UTC: una venta del 30 a las 22:00 es del 30.
const diaLocal = (d = new Date()) => d.toLocaleDateString("sv"); // "2026-11-27"
const hoy = () => diaLocal();
const mesDe = (fecha) => (fecha.length > 10 ? diaLocal(new Date(fecha)) : fecha).slice(0, 7); // fecha y hora ISO o "AAAA-MM-DD"

const totalVenta = (v) => v.items.reduce((s, i) => s + i.precio * i.cant, 0);
const cobrado = (v) => v.pagos.reduce((s, p) => s + p.monto, 0);
const saldo = (v) => Math.max(totalVenta(v) - cobrado(v), 0);
const suma = (lista, f) => lista.reduce((s, x) => s + f(x), 0);
const porMoneda = (lista, f, monedaDe = (x) => x.moneda) => {
  const r = { UYU: 0, USD: 0 };
  for (const x of lista) r[monedaDe(x)] += f(x);
  return r;
};

// Catálogo de la tienda (mismas columnas que la planilla), incluidos los ocultos.
function catalogoDesdeCsv(text) {
  const [head, ...rows] = parseCsv(text);
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (r, k) => (r[h.indexOf(k)] || "").trim();
  return rows.map((r) => ({
    id: col(r, "id"), categoria: col(r, "categoria") || "Otros", subcategoria: col(r, "subcategoria"), nombre: col(r, "nombre"),
    precio: Number(col(r, "precio").replace(/[^\d]/g, "")) || 0, foto: col(r, "foto"),
    activo: !/^(no|false|0)$/i.test(col(r, "activo")), tamano: col(r, "tamano"), material: col(r, "material"), stock: 0,
  })).filter((p) => p.id && p.nombre);
}

// Vuelta a CSV para pegar en la planilla "Productos" (Archivo > Importar > Reemplazar hoja).
function catalogoACsv(productos) {
  const campo = (v) => { const t = String(v ?? ""); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const cols = ["id", "categoria", "subcategoria", "nombre", "precio", "foto", "activo", "tamano", "material", "stock"];
  return [cols.join(","), ...productos.map((p) => cols.map((c) =>
    campo(c === "activo" ? (p.activo ? "SI" : "NO") : c === "precio" ? p.precio || "" : p[c])).join(","))].join("\r\n");
}

// Resumen de un mes ("AAAA-MM"): vendido, cobrado y gastado por moneda.
function resumenMes(db, mes) {
  const ventas = db.ventas.filter((v) => mesDe(v.fecha) === mes);
  const pagos = db.ventas.flatMap((v) => v.pagos.filter((p) => mesDe(p.fecha) === mes).map((p) => ({ ...p, moneda: v.moneda })));
  const gastos = db.gastos.filter((g) => mesDe(g.fecha) === mes);
  const vendido = porMoneda(ventas, totalVenta), cobrados = porMoneda(pagos, (p) => p.monto), gastado = porMoneda(gastos, (g) => g.monto);
  return { ventas, pagos, gastos, vendido, cobrado: cobrados, gastado,
    resultado: { UYU: cobrados.UYU - gastado.UYU, USD: cobrados.USD - gastado.USD } };
}

// Comisión: % sobre lo vendido en el mes por cada vendedor, con el % guardado en cada venta (los pedidos de la tienda no tienen vendedor).
function comisiones(db, mes) {
  return db.usuarios.map((u) => {
    const ventas = db.ventas.filter((v) => v.vendedor === u.id && mesDe(v.fecha) === mes);
    const comision = porMoneda(ventas, (v) => totalVenta(v) * (v.comision ?? u.comision) / 100); // el % que regía al vender
    return { ...u, cantidad: ventas.length, vendido: porMoneda(ventas, totalVenta),
      comision: { UYU: Math.round(comision.UYU), USD: Math.round(comision.USD) } };
  });
}

function nuevoNumero(db) { db.ultimo = (db.ultimo || 0) + 1; return db.ultimo; }

function registrarPago(v, monto, medio, fecha = new Date().toISOString()) {
  const m = Math.round(Number(monto));
  if (!(m > 0) || m > saldo(v)) throw new Error("monto");
  v.pagos.push({ fecha, medio, monto: m });
  if (v.estado === 0) v.estado = 1; // con la seña (o el pago) pasa a "Seña pagada"
}

// Datos de ejemplo, con fechas relativas a hoy para que la muestra siempre se vea al día.
function datosEjemplo(catalogo, ahora = Date.now()) {
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const elegir = (l) => l[Math.floor(azar() * l.length)];
  const dias = (d) => new Date(ahora - d * 864e5 - Math.floor(azar() * 8) * 36e5).toISOString();
  const productos = catalogo.map((p) => ({ ...p, stock: azar() < 0.2 ? 1 + Math.floor(azar() * 4) : 0 }));
  const conPrecio = productos.filter((p) => p.precio > 0);
  const clientes = [
    ["Camila Rodríguez", "099 412 335", "Pocitos, Montevideo"], ["Martín Silva", "098 220 914", "Cordón, Montevideo"],
    ["Lucía Pereira", "091 773 020", "Ciudad de la Costa"], ["Diego Méndez", "094 118 562", "Malvín, Montevideo"],
    ["Sofía Fernández", "099 905 447", "Las Piedras"], ["Joaquín Castro", "092 361 208", "Paysandú"],
    ["Valentina López", "097 540 119", "Punta Carretas, Montevideo"], ["Mateo González", "095 287 643", "Maldonado"],
    ["Florencia Díaz", "093 664 870", "Prado, Montevideo"], ["Agustín Suárez", "096 812 455", "Colonia"],
  ].map(([nombre, whatsapp, zona], i) => ({ id: "c" + (i + 1), nombre, whatsapp, email: "", zona }));
  const usuarios = [
    { id: "u1", nombre: "Administrador", rol: "Administrador", comision: 0 },
    { id: "u2", nombre: "Romina", rol: "Vendedor", comision: 10 },
    { id: "u3", nombre: "Federico", rol: "Vendedor", comision: 10 },
  ];
  const medios = [
    { id: "m1", nombre: "Efectivo", detalle: "" }, { id: "m2", nombre: "Transferencia BROU", detalle: "Caja de ahorro en pesos" },
    { id: "m3", nombre: "Mercado Pago", detalle: "Link o QR de la tienda" }, { id: "m4", nombre: "Tarjeta (POS)", detalle: "" },
  ];
  const db = { version: 1, ultimo: 1040, productos, clientes, usuarios, medios, ventas: [], gastos: [] };
  for (let i = 0; i < 34; i++) {
    const d = Math.floor(i * 1.9 + azar() * 2), web = azar() < 0.55, fecha = dias(d);
    const items = Array.from({ length: 1 + Math.floor(azar() * 3) }, () => { const p = elegir(conPrecio); return { id: p.id, nombre: p.nombre, precio: p.precio, cant: 1 + Math.floor(azar() * 2) }; });
    const usd = !web && azar() < 0.12;
    if (usd) for (const it of items) it.precio = Math.max(5, Math.round(it.precio / 42));
    const v = { numero: 0, fecha, origen: web ? "web" : "local", cliente: elegir(clientes).id,
      vendedor: web ? "" : elegir(["u2", "u3", "u1"]), moneda: usd ? "USD" : "UYU", items, pagos: [], estado: 0, sena: true,
      entrega: web ? elegir(["Retiro coordinado", "Envío por agencia"]) : "En la feria", nota: "" };
    const total = totalVenta(v);
    // Las más viejas ya se entregaron y pagaron; las nuevas van avanzando.
    const estado = d > 24 ? 4 : d > 14 ? elegir([3, 4]) : d > 5 ? elegir([1, 2, 3]) : elegir([0, 1, 2]);
    if (estado >= 1) registrarPago(v, web ? Math.ceil(total / 2) : total, web ? "m3" : elegir(["m1", "m2", "m4"]), fecha);
    if (estado === 4 && saldo(v) && azar() < 0.8) registrarPago(v, saldo(v), elegir(["m1", "m2"]), dias(Math.max(d - 3, 0)));
    v.estado = estado;
    v.comision = usuarios.find((u) => u.id === v.vendedor)?.comision ?? 0;
    db.ventas.push(v);
  }
  const gastos = [["Filamento PLA", 2400], ["Hilo para crochet", 1350], ["Luz", 1900], ["Envíos", 620], ["Stand en feria", 1500], ["Filamento PETG", 1800]];
  for (const back of [0, 30]) gastos.forEach(([concepto, monto], i) => db.gastos.push({ id: "g" + back + i, concepto, monto, moneda: "UYU", fecha: diaLocal(new Date(dias(back + i * 4))) }));
  db.gastos.push({ id: "gusd", concepto: "Repuestos impresora", monto: 38, moneda: "USD", fecha: diaLocal(new Date(dias(9))) });
  db.ventas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const v of db.ventas) v.numero = nuevoNumero(db); // números en orden de fecha
  db.ventas.reverse(); // la más nueva primero
  return db;
}

if (typeof module !== "undefined") module.exports = { ESTADOS, totalVenta, cobrado, saldo, porMoneda, catalogoDesdeCsv, catalogoACsv,
  resumenMes, comisiones, registrarPago, datosEjemplo, nuevoNumero, mesDe, suma, hoy };
