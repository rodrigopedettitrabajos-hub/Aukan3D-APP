// Datos del panel de gestión y cálculos (sin DOM), compartidos por admin.js y admin/test.js.
// Sin apiUrl en config.js, todo vive en localStorage de este navegador (demo). Con apiUrl, en el servidor (api/).

const ESTADOS = ["Recibido", "Seña pagada", "En impresión", "Listo para entregar", "Entregado"];
const CLAVE_DB = "aukan_admin_db";
// Día y mes con la hora de este equipo (Uruguay), no en UTC: una venta del 30 a las 22:00 es del 30.
const diaLocal = (d = new Date()) => d.toLocaleDateString("sv"); // "2026-11-27"
const hoy = () => diaLocal();
const mesDe = (fecha) => (fecha.length > 10 ? diaLocal(new Date(fecha)) : fecha).slice(0, 7); // fecha y hora ISO o "AAAA-MM-DD"

const DESCUENTO = "descuento"; // renglón de descuento (código) dentro de los items: el total ya lo resta; no es un producto
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

// --- Costo, ganancia e inventario ---
// Ganancia como % sobre el costo: costo 100 con 50 % -> precio 150. Redondeo hacia arriba (10, 50, 100) para no bajar del %.
const precioConGanancia = (costo, pct, redondeo = 1) => Math.ceil(Math.round(costo * (1 + pct / 100)) / redondeo) * redondeo;
const gananciaPct = (p) => (p.costo > 0 && p.precio > 0 ? Math.round(((p.precio - p.costo) / p.costo) * 100) : null);
function inventario(productos) {
  const t = { unidades: 0, costo: 0, venta: 0, sinCosto: 0 };
  for (const p of productos) {
    const n = p.stock || 0;
    t.unidades += n; t.costo += n * (p.costo || 0); t.venta += n * (p.precio || 0);
    if (n && !p.costo) t.sinCosto++;
  }
  return t;
}
// Ganancia de lo vendido en pesos por producto. shortcut: usa el costo actual del producto, no el que tenía el día de la venta.
function margenes(ventas, productos) {
  const costoDe = new Map(productos.map((p) => [String(p.id), p.costo || 0])), m = new Map();
  for (const v of ventas) if (v.moneda === "UYU") for (const i of v.items) {
    if (i.id === DESCUENTO) continue;
    const x = m.get(i.id) || { id: i.id, nombre: i.nombre, cant: 0, vendido: 0, costo: 0, sinCosto: !costoDe.get(String(i.id)) };
    x.cant += i.cant; x.vendido += i.precio * i.cant; x.costo += (costoDe.get(String(i.id)) || 0) * i.cant;
    m.set(i.id, x);
  }
  const filas = [...m.values()].map((x) => ({ ...x, ganancia: x.sinCosto ? null : x.vendido - x.costo }));
  const conCosto = filas.filter((x) => !x.sinCosto);
  const total = { vendido: suma(conCosto, (x) => x.vendido), costo: suma(conCosto, (x) => x.costo), sinCosto: suma(filas.filter((x) => x.sinCosto), (x) => x.vendido) };
  total.ganancia = total.vendido - total.costo;
  return { filas: filas.sort((a, b) => (b.ganancia ?? -Infinity) - (a.ganancia ?? -Infinity)), total };
}

// Reseñas de los clientes: promedio, cantidad por estrella (5 a 1) y la lista, más nuevas primero.
function resumenResenas(resenas) {
  const lista = resenas.filter((r) => !r._borrado && r.estrellas).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const por = [5, 4, 3, 2, 1].map((n) => [n, lista.filter((r) => r.estrellas === n).length]);
  return { lista, cantidad: lista.length, promedio: lista.length ? Math.round((suma(lista, (r) => r.estrellas) / lista.length) * 10) / 10 : 0, por };
}

// --- Excel de productos: exportar todo y volver a importarlo ---
const COLS_EXCEL = [["id", "ID"], ["nombre", "Nombre"], ["categoria", "Categoría"], ["subcategoria", "Subcategoría"], ["costo", "Costo"],
  ["ganancia", "Ganancia %"], ["precio", "Precio"], ["tamano", "Tamaño"], ["material", "Material"], ["activo", "Visible"]];
const productosAFilas = (productos) => [COLS_EXCEL.map((c) => c[1]), ...productos.map((p) => COLS_EXCEL.map(([k]) =>
  k === "activo" ? (p.activo ? "SI" : "NO") : k === "ganancia" ? gananciaPct(p) ?? "" : ["costo", "precio"].includes(k) ? p[k] || "" : p[k] || ""))];
// Planilla de conteo: la columna Contado se llena a mano y al importarla pasa a ser el stock.
const inventarioAFilas = (productos) => [["ID", "Nombre", "Categoría", "Subcategoría", "Costo", "Precio", "Stock en sistema", "Contado"],
  ...productos.map((p) => [p.id, p.nombre, p.categoria, p.subcategoria || "", p.costo || "", p.precio || "", p.stock || 0, ""])];
// "1.200", "$ 1.200,50" o 1200 -> número; "" -> null; texto que no es número -> NaN.
function numeroCelda(v) {
  if (typeof v === "number") return v;
  let t = String(v ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!String(v ?? "").trim()) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return t ? Number(t) : NaN;
}
// Columnas por nombre (sin importar mayúsculas ni tildes); las que no están en la hoja no se tocan.
// Fila con ID conocido: actualiza ese producto. Sin ID o con uno nuevo: producto nuevo. Nunca borra.
// modo "precios" (Productos y precios) no toca el stock; modo "stock" (planilla de stock) solo toca el stock y no crea productos.
function filasAProductos(filas, productos, modo = "precios") {
  const nombres = { id: "id", nombre: "nombre", categoria: "categoria", subcategoria: "subcategoria", costo: "costo", "ganancia %": "ganancia", ganancia: "ganancia",
    precio: "precio", stock: "stock", contado: "contado", tamano: "tamano", material: "material", visible: "activo", activo: "activo" };
  const [cab = [], ...resto] = filas, col = {};
  cab.forEach((h, i) => { const k = nombres[normalizar(String(h)).trim()]; if (k && !(k in col)) col[k] = i; });
  if (modo === "precios") { delete col.stock; delete col.contado; }
  else for (const k of Object.keys(col)) if (!["id", "stock", "contado"].includes(k) || (k === "stock" && "contado" in col)) delete col[k];
  if (modo === "stock" && !("id" in col && ("stock" in col || "contado" in col))) return { cambios: [], nuevos: [], errores: ["La hoja tiene que tener las columnas ID y Contado (o Stock)."], iguales: 0 };
  if (!("id" in col) && !("nombre" in col)) return { cambios: [], nuevos: [], errores: ["La hoja no tiene columna ID ni Nombre."], iguales: 0 };
  const porId = new Map(productos.filter((p) => !p._borrado).map((p) => [String(p.id), p]));
  let proximo = Math.max(0, ...productos.map((p) => +p.id || 0)) + 1;
  const cambios = [], nuevos = [], errores = [];
  let iguales = 0;
  resto.forEach((r, i) => {
    const fila = i + 2, celda = (k) => (k in col ? r[col[k]] : undefined), texto = (k) => String(celda(k) ?? "").trim();
    if (!r.some((x) => String(x ?? "").trim())) return;
    const id = texto("id"), actual = id && porId.get(id), d = {};
    if (id && !/^[\w.-]{1,60}$/.test(id)) return errores.push(`Fila ${fila}: el ID "${id}" no sirve (solo letras, números, - y _).`);
    for (const k of ["nombre", "categoria", "subcategoria", "tamano", "material"]) if (k in col) d[k] = texto(k).slice(0, k === "nombre" ? 80 : 40);
    for (const k of ["costo", "precio", "stock", "contado", "ganancia"]) {
      if (!(k in col)) continue;
      const n = numeroCelda(celda(k));
      if (Number.isNaN(n) || n < 0) return errores.push(`Fila ${fila}: "${celda(k)}" no es un número válido en ${{ costo: "Costo", precio: "Precio", stock: "Stock", contado: "Contado", ganancia: "Ganancia %" }[k]}.`);
      d[k] = n;
    }
    if (errores.length && errores[errores.length - 1].startsWith(`Fila ${fila}:`)) return;
    if ("activo" in col && texto("activo")) d.activo = !/^(no|false|falso|0|oculto)$/i.test(texto("activo"));
    // Precio vacío con costo y ganancia: se calcula. Contado (planilla de inventario) reemplaza al stock.
    if (d.precio == null && d.ganancia != null && (d.costo ?? actual?.costo) > 0) d.precio = precioConGanancia(d.costo ?? actual.costo, d.ganancia);
    if (d.contado != null) d.stock = d.contado;
    delete d.ganancia; delete d.contado;
    for (const k of ["costo", "precio", "stock"]) if (k in d) d[k] = Math.round(d[k] || 0);
    if (actual) {
      const cambia = Object.keys(d).filter((k) => (d[k] ?? "") !== (k === "activo" ? !!actual.activo : actual[k] ?? (["costo", "precio", "stock"].includes(k) ? 0 : "")));
      if (!cambia.length) return iguales++;
      if ("nombre" in d && !d.nombre) return errores.push(`Fila ${fila}: falta el nombre.`);
      if ("categoria" in d && !d.categoria) return errores.push(`Fila ${fila}: falta la categoría.`);
      cambios.push({ producto: actual, datos: Object.fromEntries(cambia.map((k) => [k, d[k]])) });
    } else {
      if (modo === "stock") return d.stock == null ? undefined : errores.push(`Fila ${fila}: no hay ningún producto con el ID "${id}".`);
      if (!d.nombre || !d.categoria) return errores.push(`Fila ${fila}: un producto nuevo necesita nombre y categoría.`);
      const nuevoId = id || String(proximo++);
      if (nuevos.some((p) => p.id === nuevoId)) return errores.push(`Fila ${fila}: el ID ${nuevoId} está repetido.`);
      nuevos.push({ id: nuevoId, nombre: d.nombre, categoria: d.categoria, subcategoria: d.subcategoria || "", tamano: d.tamano || "", material: d.material || "",
        costo: d.costo || 0, precio: d.precio || 0, stock: d.stock || 0, activo: d.activo ?? true, foto: "" });
    }
  });
  return { cambios, nuevos, errores, iguales };
}

// Resumen de un mes ("AAAA-MM"): vendido, cobrado y gastado por moneda.
const diaDe = (fecha) => (fecha.length > 10 ? diaLocal(new Date(fecha)) : fecha);
const resumenMes = (db, mes) => resumenRango(db, mes + "-01", mes + "-31");
// Período de días "AAAA-MM-DD", los dos incluidos.
function resumenRango(db, desde, hasta) {
  const en = (f) => { const d = diaDe(f); return d >= desde && d <= hasta; };
  const ventas = db.ventas.filter((v) => en(v.fecha));
  const pagos = db.ventas.flatMap((v) => v.pagos.filter((p) => en(p.fecha)).map((p) => ({ ...p, moneda: v.moneda })));
  const gastos = db.gastos.filter((g) => en(g.fecha));
  const vendido = porMoneda(ventas, totalVenta), cobrados = porMoneda(pagos, (p) => p.monto), gastado = porMoneda(gastos, (g) => g.monto);
  return { ventas, pagos, gastos, vendido, cobrado: cobrados, gastado,
    resultado: { UYU: cobrados.UYU - gastado.UYU, USD: cobrados.USD - gastado.USD } };
}

// Total en pesos de cada día (o mes, con largo 7) del período, incluidos los que no tuvieron ventas.
function serieVentas(ventas, desde, hasta, largo = 10) {
  const serie = new Map();
  for (let d = new Date(desde + "T12:00"); diaLocal(d) <= hasta; d.setDate(d.getDate() + 1)) serie.set(diaLocal(d).slice(0, largo), 0);
  for (const v of ventas) if (v.moneda === "UYU") { const k = diaDe(v.fecha).slice(0, largo); if (serie.has(k)) serie.set(k, serie.get(k) + totalVenta(v)); }
  return [...serie];
}
// Productos más vendidos por cantidad (todas las monedas); el importe es solo en pesos.
function masVendidos(ventas, n = 10) {
  const m = new Map();
  for (const v of ventas) for (const i of v.items) {
    if (i.id === DESCUENTO) continue;
    const x = m.get(i.id) || { id: i.id, nombre: i.nombre, cant: 0, pesos: 0 };
    x.cant += i.cant; if (v.moneda === "UYU") x.pesos += i.precio * i.cant;
    m.set(i.id, x);
  }
  return [...m.values()].sort((a, b) => b.cant - a.cant || b.pesos - a.pesos).slice(0, n);
}

// Comisión: % sobre lo vendido en el mes por cada vendedor, con el % guardado en cada venta (los pedidos de la tienda no tienen vendedor).
function comisiones(db, mes) {
  return db.usuarios.map((u) => {
    const ventas = db.ventas.filter((v) => v.vendedor === u.id && mesDe(v.fecha) === mes);
    const comision = porMoneda(ventas, (v) => totalVenta(v) * (v.comision ?? u.comision) / 100); // el % que regía al vender
    return { ...u, porcentaje: u.comision, cantidad: ventas.length, vendido: porMoneda(ventas, totalVenta),
      comision: { UYU: Math.round(comision.UYU), USD: Math.round(comision.USD) } };
  });
}

// Puente de la demo: los pedidos que la tienda guardó en este navegador entran como ventas web.
// shortcut: solo ve pedidos de este navegador; con la base de datos llegan todos desde el servidor.
function importarPedidosWeb(db, pedidos) {
  const ya = new Set(db.ventas.map((v) => String(v.numero)));
  const nuevos = pedidos.filter((p) => p?.numero && Array.isArray(p.items) && p.items.length && !ya.has(String(p.numero)));
  for (const p of nuevos.reverse()) { // del más viejo al más nuevo, para que el más nuevo quede primero
    const c = p.cliente || {}, tel = String(c.whatsapp || "").replace(/\D/g, "");
    let cli = tel && db.clientes.find((x) => String(x.whatsapp).replace(/\D/g, "") === tel);
    if (!cli) {
      cli = { id: "c" + String(p.numero).toLowerCase(), nombre: String(c.nombre || "Cliente de la tienda").slice(0, 80),
        whatsapp: String(c.whatsapp || "").slice(0, 20), email: String(c.email || "").slice(0, 120), zona: String(p.direccion || "").slice(0, 80) };
      db.clientes.push(cli);
    }
    db.ventas.unshift({ numero: String(p.numero), fecha: p.fecha || new Date().toISOString(), origen: "web", cliente: cli.id, vendedor: "",
      moneda: "UYU", pagos: [], estado: 0, sena: p.sena !== false, entrega: String(p.entrega || "Retiro coordinado"), nota: "",
      items: p.items.map((i) => ({ id: String(i.id), nombre: String(i.nombre).slice(0, 120), precio: Math.max(Math.round(+i.precio || 0), 0), cant: Math.min(Math.max(Math.round(+i.cant || 1), 1), 99) })) });
  }
  return nuevos.length;
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
  const db = { version: 1, ultimo: 1040, productos, clientes, usuarios, medios, ventas: [], gastos: [], cajas: [] };
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

// --- Modo feria: caja ---
// Caja: { id, abierta, cerrada, fondo, vendedor, movimientos: [{ fecha, tipo: "retiro" | "ingreso", monto, nota }], contado }.
// Las ventas de la feria guardan caja: <id>. En pesos; el efectivo es el medio que se llama "Efectivo".
const esEfectivo = (db, medioId) => /efectivo/i.test(db.medios.find((m) => m.id === medioId)?.nombre || "");
function resumenCaja(db, caja) {
  const ventas = db.ventas.filter((v) => v.caja === caja.id);
  const porMedio = {};
  let efectivo = 0;
  for (const v of ventas) for (const p of v.pagos) {
    porMedio[p.medio] = (porMedio[p.medio] || 0) + p.monto;
    if (esEfectivo(db, p.medio)) efectivo += p.monto;
  }
  const mov = (t) => suma(caja.movimientos.filter((m) => m.tipo === t), (m) => m.monto);
  const esperado = caja.fondo + efectivo + mov("ingreso") - mov("retiro");
  return { ventas, total: suma(ventas, totalVenta), porMedio, efectivo, retiros: mov("retiro"), ingresos: mov("ingreso"), esperado,
    diferencia: caja.contado == null ? null : caja.contado - esperado };
}
const cajaAbierta = (db) => db.cajas.find((c) => !c.cerrada) || null;

// --- Sincronización con el servidor (api/) ---
const COLECCIONES = ["productos", "clientes", "ventas", "gastos", "medios", "usuarios", "cajas", "mensajes", "resenas", "cupones"];
const idDoc = (col, d) => String(col === "ventas" ? d.numero : d.id);
const dbVacia = () => ({ version: 1, ultimo: 0, ...Object.fromEntries(COLECCIONES.map((c) => [c, []])) });
// Lo cambiado desde el último envío. enviado: Map "col id" -> JSON tal como lo tiene el servidor.
function cambiosDb(db, enviado) {
  const set = [], del = [], vistos = new Set();
  for (const col of COLECCIONES) for (const d of db[col] || []) {
    const id = idDoc(col, d), k = col + " " + id, t = JSON.stringify(d);
    vistos.add(k);
    if (enviado.get(k) !== t) set.push({ col, id, data: d, t });
  }
  for (const k of enviado.keys()) if (!vistos.has(k)) { const [col, id] = k.split(" "); del.push({ col, id }); }
  return { set, del };
}
function marcarEnviado(enviado, { set, del }) {
  for (const x of set) enviado.set(x.col + " " + x.id, x.t);
  for (const x of del) enviado.delete(x.col + " " + x.id);
}
// Lo que llega del servidor (otro dispositivo o la tienda) reemplaza por id; lo borrado se quita.
// Lo que este navegador cambió y todavía no mandó se respeta. Devuelve cuántos pedidos web nuevos llegaron.
function aplicarServidor(db, r, enviado) {
  let web = 0;
  for (const col of COLECCIONES) for (const d of r[col] || []) {
    const id = idDoc(col, d), k = col + " " + id, lista = (db[col] ||= []);
    const i = lista.findIndex((x) => idDoc(col, x) === id);
    if (i >= 0 && JSON.stringify(lista[i]) !== enviado.get(k)) continue; // cambio local sin mandar
    if (d._borrado) { if (i >= 0) lista.splice(i, 1); enviado.delete(k); continue; }
    if (i >= 0) lista[i] = d; else { lista.push(d); if (col === "ventas" && d.origen === "web") web++; }
    enviado.set(k, JSON.stringify(d));
  }
  db.ventas.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return web;
}

// Mensajes de WhatsApp al cambiar el estado (pantalla Mensajes). Si no se editaron, valen estos.
// Los datos van como {clave} en el texto; en la pantalla se ven como etiquetas con su nombre.
const DATOS_MENSAJE = [["nombre", "Nombre del cliente"], ["items", "Lo que pidió"], ["entrega", "Entrega"], ["total", "Total"], ["pagado", "Lo que pagó"],
  ["saldo", "Lo que debe"], ["resta", "Aviso de lo que debe"], ["numero", "N° de pedido"], ["negocio", "Nombre del negocio"], ["direccion", "Dirección"],
  ["horario", "Horario"], ["redes", "Redes"], ["resena", "Link para la reseña"]];
const NEGOCIO_BASE = { id: "negocio", negocio: "Aukan3D", direccion: "", horario: "", redes: "" }; // datos del negocio para los mensajes
const MENSAJES_BASE = [
  { id: "sena", estado: 1, nombre: "Seña recibida", texto: "¡Hola, {nombre}! Recibimos la seña de tu pedido N° {numero}. ¡Quedó confirmado! {resta}" },
  { id: "pagado", estado: 1, nombre: "Pago total recibido", texto: "¡Hola, {nombre}! Recibimos el pago de tu pedido N° {numero}. ¡Quedó confirmado!" },
  { id: "impresion", estado: 2, nombre: "En impresión", texto: "¡Hola, {nombre}! Tu pedido N° {numero} entró en impresión. Te avisamos cuando esté listo." },
  { id: "listo", estado: 3, nombre: "Listo para entregar", texto: "¡Hola, {nombre}! ¡Tu pedido N° {numero} está listo para entregar! {resta} ¿Coordinamos la entrega?" },
  { id: "entregado", estado: 4, nombre: "Entregado", texto: "¡Hola, {nombre}! Entregamos tu pedido N° {numero}. ¡Gracias por comprar en {negocio}!\nSi querés, contanos qué te pareció con estrellas: {resena}" },
];
const claveMensaje = (v) => (v.estado === 1 ? (!v.sena || !saldo(v) ? "pagado" : "sena") : MENSAJES_BASE.find((m) => m.estado === v.estado && m.estado !== 1)?.id || "");
// negocio: { negocio, direccion, horario, redes }. Una línea que solo tenía datos vacíos (ej. "Aviso de lo que debe" sin deuda) se saca.
function armarMensaje(texto, v, nombre, plata, negocio = NEGOCIO_BASE) {
  const resta = saldo(v) ? `Queda un saldo de ${plata(saldo(v), v.moneda)}.` : "";
  const vars = { nombre, numero: v.numero, total: plata(totalVenta(v), v.moneda), saldo: plata(saldo(v), v.moneda), pagado: plata(cobrado(v), v.moneda), resta,
    items: v.items.map((i) => `${i.cant} x ${i.nombre}`).join(", "), entrega: v.entrega || "",
    negocio: negocio.negocio || "Aukan3D", direccion: negocio.direccion || "", horario: negocio.horario || "", redes: negocio.redes || "", resena: negocio.resena || "" };
  return String(texto).split("\n").map((linea) => {
    const r = linea.replace(/\{(\w+)\}/g, (x, k) => (k in vars ? vars[k] : x)).replace(/[ \t]{2,}/g, " ").replace(/ +([.,!?])/g, "$1").trim();
    return /\{\w+\}/.test(linea) && !/[\p{L}\p{N}]/u.test(r) ? null : r; // quedó sin letras ni números: la línea solo tenía datos vacíos
  }).filter((x) => x !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
// "" si ese estado no tiene mensaje o está desactivado. extra: { resena: link a la tienda }.
function mensajeDe(db, v, nombre, plata, extra = {}) {
  const id = claveMensaje(v), base = MENSAJES_BASE.find((m) => m.id === id);
  if (!base) return "";
  const m = { ...base, activo: true, ...(db.mensajes || []).find((x) => x.id === id) };
  return m.activo ? armarMensaje(m.texto, v, nombre, plata, { ...NEGOCIO_BASE, ...(db.mensajes || []).find((x) => x.id === "negocio"), ...extra }) : "";
}

if (typeof module !== "undefined") module.exports = { ESTADOS, totalVenta, cobrado, saldo, porMoneda, catalogoDesdeCsv, precioConGanancia, gananciaPct, inventario, margenes, resumenResenas, productosAFilas, inventarioAFilas, numeroCelda, filasAProductos,
  resumenMes, resumenRango, serieVentas, masVendidos, comisiones, registrarPago, datosEjemplo, nuevoNumero, mesDe, suma, hoy, importarPedidosWeb,
  dbVacia, cambiosDb, marcarEnviado, aplicarServidor, resumenCaja, cajaAbierta, esEfectivo, MENSAJES_BASE, NEGOCIO_BASE, DATOS_MENSAJE, claveMensaje, armarMensaje, mensajeDe };
