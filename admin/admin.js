// Panel de gestión Aukan3D (vista previa con datos de ejemplo). Datos y cálculos: datos.js.
const $ = (s) => document.querySelector(s);
function el(tag, { dataset, ...props } = {}, ...hijos) {
  const e = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(e.dataset, dataset);
  e.append(...hijos.filter((h) => h !== "" && h != null));
  return e;
}
const plata = (n, moneda = "UYU") => (moneda === "USD" ? "USD " : "$ ") + Math.round(n).toLocaleString("es-UY");
const dosMonedas = (r) => plata(r.UYU) + (r.USD ? ` · ${plata(r.USD, "USD")}` : "");
const fecha = (iso) => new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
const mesActual = () => hoy().slice(0, 7);
const nombreMes = (m) => new Date(m + "-15").toLocaleDateString("es-UY", { month: "long", year: "numeric" });
const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso)) / 864e5);
// La primera foto de la lista "a|b"; las de la tienda están un nivel arriba. Las subidas acá son data:image/webp.
function foto(f) {
  const x = (f || "").split("|")[0].trim();
  if (x.startsWith("data:image/webp")) return x;
  const ok = fotoSegura(x);
  return !ok || ok.startsWith("https:") ? ok : "../" + ok;
}

// --- Ingreso (muestra) ---
// shortcut: usuario y clave fijos (admin / admin) y comparados en el navegador, solo para mostrar;
// con la base de datos va un ingreso real en el servidor (Cloudflare Access o usuarios con contraseña cifrada).
const SESION = "aukan_admin_ok";
const conSesion = () => { try { return sessionStorage.getItem(SESION) === "1"; } catch { return false; } };
function mostrarApp() {
  const ok = conSesion();
  $("#login").hidden = ok;
  $(".app").hidden = !ok;
  if (ok) mostrarVista(); else $("#f-login").usuario.focus();
}
$("#f-login").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.usuario.value.trim().toLowerCase() === "admin" && f.clave.value === "admin") {
    try { sessionStorage.setItem(SESION, "1"); } catch { /* sin almacenamiento */ }
    f.reset();
    $("#login-error").textContent = "";
    return mostrarApp();
  }
  $("#login-error").textContent = "Usuario o contraseña incorrectos.";
  f.clave.select();
});
for (const b of document.querySelectorAll("[data-salir]")) b.addEventListener("click", () => { try { sessionStorage.removeItem(SESION); } catch { /* idem */ } mostrarApp(); });

// --- Datos ---
let db = leerJson(CLAVE_DB, null);
if (!db?.version) db = datosEjemplo(catalogoDesdeCsv(window.PRODUCTOS_CSV));
function guardar() {
  try { localStorage.setItem(CLAVE_DB, JSON.stringify(db)); }
  catch { avisar("No se pudo guardar: el navegador no tiene más lugar. Probá con fotos más livianas."); }
}
// Pedidos hechos en la tienda desde este navegador (puente de la demo, ver importarPedidosWeb).
function traerPedidosWeb() {
  const n = importarPedidosWeb(db, leerJson("aukan_pedidos_panel", []));
  if (n) avisar(n === 1 ? "Llegó 1 pedido nuevo de la tienda." : `Llegaron ${n} pedidos nuevos de la tienda.`);
  return n;
}
guardar();
addEventListener("storage", (e) => { if (e.key === "aukan_pedidos_panel" && conSesion() && traerPedidosWeb()) { guardar(); repintar(); } });
const cliente = (id) => db.clientes.find((c) => c.id === id) || { nombre: "Sin cliente", whatsapp: "" };
const usuario = (id) => db.usuarios.find((u) => u.id === id);
const medio = (id) => db.medios.find((m) => m.id === id)?.nombre || "—";
const venta = (n) => db.ventas.find((v) => v.numero === n);
const waDe = (tel) => "598" + String(tel).replace(/\D/g, "").replace(/^0/, "");

let avisoT;
// Con una ventana abierta, el resto de la página no se puede tocar: el aviso se mete en esa ventana
// para que su "Deshacer" funcione.
function mostrarAviso(si) {
  const a = $("#aviso");
  if (si) ([...document.querySelectorAll("dialog[open]")].pop() || document.body).append(a);
  a.hidden = !si;
}
function avisar(t, deshacer) {
  $("#aviso").replaceChildren(t, deshacer ? el("button", { type: "button", className: "link", textContent: "Deshacer", onclick: () => { deshacer(); guardar(); repintar(); mostrarAviso(false); } }) : "");
  mostrarAviso(true);
  clearTimeout(avisoT);
  avisoT = setTimeout(() => mostrarAviso(false), deshacer ? 6000 : 3500);
}

// --- Navegación ---
const VISTAS = { panel: "Panel principal", ventas: "Ventas y pedidos", pendientes: "Cuentas pendientes", clientes: "Clientes",
  productos: "Productos y stock", medios: "Medios de pago", usuarios: "Usuarios y comisiones", reportes: "Reportes y gastos" };
const PINTAR = {};
function mostrarVista() {
  const v = location.hash.slice(1) in VISTAS ? location.hash.slice(1) : "panel";
  for (const s of document.querySelectorAll(".vista")) s.hidden = s.id !== "v-" + v;
  for (const a of document.querySelectorAll(".nav a")) a.ariaCurrent = a.hash === "#" + v ? "page" : null;
  $("#crumb").textContent = VISTAS[v];
  document.title = `${VISTAS[v]} · Aukan3D Gestión`;
  PINTAR[v]();
}
addEventListener("hashchange", () => { mostrarVista(); scrollTo(0, 0); });
const repintar = () => PINTAR[location.hash.slice(1) in VISTAS ? location.hash.slice(1) : "panel"]();

// --- Piezas comunes ---
const pastilla = (v) => el("span", { className: `pill e${v.estado}`, textContent: v.estado === 1 && !v.sena ? "Pagado" : ESTADOS[v.estado] });
const kpi = (titulo, valor, pista, tono = "") => el("div", { className: "kpi" },
  el("p", { textContent: titulo }), el("strong", { className: tono, textContent: valor }), pista ? el("small", { textContent: pista }) : "");
function barras(filas) { // filas: [[etiqueta, valor, texto]]
  const max = Math.max(1, ...filas.map((f) => f[1]));
  return filas.length ? el("div", { className: "barras" }, ...filas.map(([t, n, txt]) => el("div", { className: "barra" },
    el("span", { textContent: t, title: t }), el("i", { ariaHidden: "true" }, n ? el("b", { style: `width:${(n / max) * 100}%` }) : ""), el("span", { className: "num", textContent: txt }))))
    : el("p", { className: "vacio", textContent: "Sin datos este mes." });
}
function tabla(cabeza, filas, vacio, clase = "") {
  if (!filas.length) return el("p", { className: "vacio caja", textContent: vacio });
  return el("div", { className: "tabla-caja" }, el("table", { className: "tabla " + clase },
    el("thead", {}, el("tr", {}, ...cabeza.map((c) => el("th", { textContent: c.replace(/^#/, ""), className: c.startsWith("#") ? "num" : "" })))),
    el("tbody", {}, ...filas)));
}
const td = (t, cls = "") => el("td", { className: cls }, t);
function filaVenta(v, extra = []) {
  const tr = el("tr", { className: "clic", tabIndex: 0, ariaLabel: `Abrir pedido ${v.numero}` },
    td(el("span", {}, el("b", { textContent: `N° ${v.numero}` }), el("small", { textContent: v.origen === "web" ? "Tienda web" : "En persona" }))),
    td(fecha(v.fecha)), td(cliente(v.cliente).nombre),
    td(el("span", {}, plata(totalVenta(v), v.moneda), saldo(v) ? el("small", { className: "saldo-mini ambar", textContent: `Saldo ${plata(saldo(v), v.moneda)}` }) : ""), "num"),
    td(saldo(v) ? plata(saldo(v), v.moneda) : "—", "num" + (saldo(v) ? " ambar" : "")), td(pastilla(v)), ...extra);
  tr.addEventListener("click", (e) => { if (!e.target.closest("button, a")) abrirDetalle(v.numero); });
  tr.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === tr) abrirDetalle(v.numero); });
  return tr;
}
const CAB_VENTAS = ["Pedido", "Fecha", "Cliente", "#Total", "#Saldo", "Estado"];

// --- Panel principal ---
PINTAR.panel = () => {
  const r = resumenMes(db, mesActual());
  const pendiente = porMoneda(db.ventas, saldo);
  const curso = db.ventas.filter((v) => v.estado < 4);
  $("#panel-sub").textContent = `Resumen de ${nombreMes(mesActual())}.`;
  $("#kpis").replaceChildren(
    kpi("Vendido este mes", plata(r.vendido.UYU), `${r.ventas.length} ventas${r.vendido.USD ? ` · ${plata(r.vendido.USD, "USD")}` : ""}`),
    kpi("Cobrado este mes", plata(r.cobrado.UYU), r.cobrado.USD ? plata(r.cobrado.USD, "USD") : "Pesos", "verde"),
    kpi("Pendiente de cobro", plata(pendiente.UYU), `${db.ventas.filter(saldo).length} ventas con saldo`, "ambar"),
    kpi("Pedidos en curso", String(curso.length), `${curso.filter((v) => v.estado === 3).length} listos para entregar`));
  $("#embudo").replaceChildren(barras(ESTADOS.slice(0, 4).map((e, i) => { const n = curso.filter((v) => v.estado === i).length; return [e, n, String(n)]; })));
  const unidades = {};
  for (const v of r.ventas) for (const i of v.items) unidades[i.nombre] = (unidades[i.nombre] || 0) + i.cant;
  $("#top").replaceChildren(barras(Object.entries(unidades).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => [n, c, String(c)])));
  $("#ultimas").replaceChildren(tabla(CAB_VENTAS, db.ventas.slice(0, 6).map((v) => filaVenta(v)), "Todavía no hay ventas.", "t-ventas"));
};

// --- Ventas ---
$("#ventas-estado").append(...ESTADOS.map((e, i) => el("option", { value: i, textContent: e })), el("option", { value: "saldo", textContent: "Con saldo pendiente" }));
for (const id of ["#ventas-q", "#ventas-estado", "#ventas-origen"]) $(id).addEventListener("input", () => PINTAR.ventas());
PINTAR.ventas = () => {
  const q = normalizar($("#ventas-q").value.trim()), est = $("#ventas-estado").value, org = $("#ventas-origen").value;
  const lista = db.ventas.filter((v) => (!org || v.origen === org)
    && (est === "" || (est === "saldo" ? saldo(v) > 0 : v.estado === +est))
    && (!q || normalizar([v.numero, cliente(v.cliente).nombre, ...v.items.map((i) => i.nombre)].join(" ")).includes(q)));
  $("#ventas-lista").replaceChildren(tabla(CAB_VENTAS, lista.map((v) => filaVenta(v)), "No hay ventas con esos filtros.", "t-ventas"));
};

// Detalle de una venta: estado, pagos, WhatsApp.
function abrirDetalle(numero) {
  const v = venta(numero), c = cliente(v.cliente), d = $("#d-detalle");
  $("#d-detalle-t").textContent = `Pedido N° ${v.numero}`;
  const pasos = el("ol", { className: "pasos" }, ...ESTADOS.map((e, i) => el("li", {},
    el("button", { type: "button", className: i < v.estado ? "hecho" : i === v.estado ? "actual" : "", ariaCurrent: i === v.estado ? "step" : null,
      textContent: i === 1 && !v.sena ? "Pagado" : e, onclick: () => cambiarEstado(v, i) }))));
  const msg = `Hola ${c.nombre.split(" ")[0]}! Te escribimos de Aukan3D por tu pedido N° ${v.numero}: ${ESTADOS[v.estado].toLowerCase()}.`
    + (saldo(v) ? ` Saldo a pagar: ${plata(saldo(v), v.moneda)}.` : "");
  $("#detalle-cuerpo").replaceChildren(
    el("p", { className: "sub", textContent: `${fecha(v.fecha)} · ${v.origen === "web" ? "Tienda web" : "En persona"}${usuario(v.vendedor) ? ` · Vendió ${usuario(v.vendedor).nombre}` : ""} · ${v.entrega}` }),
    el("h3", { textContent: "Estado" }), el("p", { className: "sub chico", textContent: "Tocá un paso para cambiarlo." }), pasos,
    el("div", { className: "detalle-grid" },
      el("div", {}, el("h3", { textContent: "Cliente" }), el("p", { textContent: c.nombre }),
        c.whatsapp ? el("p", { className: "sub", textContent: `WhatsApp ${c.whatsapp}` }) : "", c.zona ? el("p", { className: "sub", textContent: c.zona }) : "",
        c.whatsapp ? el("a", { className: "btn sec chico", href: `https://wa.me/${waDe(c.whatsapp)}?text=${encodeURIComponent(msg)}`, target: "_blank", rel: "noopener", textContent: "Escribirle por WhatsApp" }) : ""),
      el("div", {}, el("h3", { textContent: "Pagos" }),
        ...(v.pagos.length ? v.pagos.map((p) => el("p", { className: "linea", textContent: `${fecha(p.fecha)} · ${medio(p.medio)}` }, el("b", { textContent: plata(p.monto, v.moneda) })))
          : [el("p", { className: "sub", textContent: "Todavía no pagó nada." })]),
        el("p", { className: "linea total-linea", textContent: "Saldo" }, el("b", { className: saldo(v) ? "ambar" : "verde", textContent: saldo(v) ? plata(saldo(v), v.moneda) : "Pagado" })),
        saldo(v) ? el("button", { type: "button", className: "btn chico", textContent: "Registrar pago", onclick: () => abrirPago(numero) }) : "")),
    el("h3", { textContent: "Productos" }),
    el("table", { className: "tabla" }, el("tbody", {}, ...v.items.map((i) => el("tr", {}, td(`${i.cant} x ${i.nombre}`), td(plata(i.precio * i.cant, v.moneda), "num")))),
      el("tfoot", {}, el("tr", {}, td("Total"), td(plata(totalVenta(v), v.moneda), "num")))),
    v.nota ? el("p", { className: "nota", textContent: `Nota: ${v.nota}` }) : "");
  if (!d.open) d.showModal();
}

function cambiarEstado(v, i) {
  const antes = v.estado;
  if (i === antes) return;
  v.estado = i; guardar(); repintar(); abrirDetalle(v.numero);
  avisar(`Pedido N° ${v.numero}: pasó a ${ESTADOS[i]}.`, () => { v.estado = antes; if ($("#d-detalle").open) abrirDetalle(v.numero); });
}

// Registrar un pago sobre el saldo.
let pagoDe = null;
const opcionesMedios = (sel) => sel.replaceChildren(...db.medios.map((m) => el("option", { value: m.id, textContent: m.nombre })));
function abrirPago(numero) {
  pagoDe = venta(numero);
  const f = $("#f-pago");
  f.reset();
  opcionesMedios(f.medio);
  f.monto.max = saldo(pagoDe);
  f.monto.value = saldo(pagoDe);
  $("#pago-saldo").textContent = `Pedido N° ${numero} · saldo ${plata(saldo(pagoDe), pagoDe.moneda)}`;
  $("#pago-error").textContent = "";
  $("#d-pago").showModal();
}
$("#f-pago").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  try { registrarPago(pagoDe, e.target.monto.value, e.target.medio.value); }
  catch { e.preventDefault(); $("#pago-error").textContent = `Poné un monto entre 1 y ${saldo(pagoDe)}.`; return; }
  guardar(); repintar();
  if ($("#d-detalle").open) abrirDetalle(pagoDe.numero);
  avisar("Pago registrado.");
});

// Nueva venta (en persona o en una feria).
const fv = $("#f-venta");
let itemsVenta = null; // null = no hay venta a medio cargar; queda como borrador si se cierra sin guardar
// Cada opción lleva el N° del producto: hay nombres repetidos (dos "ANGEL" de crochet a distinto precio).
const opcionProducto = (p) => `${p.nombre} · ${p.categoria} · N° ${p.id}`;
function productoPorNombre(t) {
  const id = t.match(/· N° (\S+)$/)?.[1];
  if (id) return db.productos.find((p) => p.id === id);
  const iguales = db.productos.filter((p) => p.nombre.toLowerCase() === t.trim().toLowerCase());
  return iguales.length === 1 ? iguales[0] : null; // nombre escrito a mano: solo si no hay dudas
}
function pintarItemsVenta() {
  const usd = fv.moneda.value === "USD";
  $("#venta-items").replaceChildren(...itemsVenta.map((it, n) => el("tr", {}, td(it.nombre),
    td(el("input", { type: "number", min: 1, max: 99, value: it.cant, className: "mini", ariaLabel: `Cantidad de ${it.nombre}`, oninput: (e) => { it.cant = Math.min(Math.max(+e.target.value || 1, 1), 99); total(); } }), "num"),
    td(el("input", { type: "number", min: 0, value: it.precio, className: "mini", ariaLabel: `Precio de ${it.nombre}`, step: 1, oninput: (e) => { it.precio = Math.max(Math.round(+e.target.value || 0), 0); total(); },
      onchange: (e) => (e.target.value = it.precio) }), "num"),
    td("", "num sub-item"),
    td(el("button", { type: "button", className: "x", ariaLabel: `Quitar ${it.nombre}`, textContent: "×", onclick: () => { itemsVenta.splice(n, 1); pintarItemsVenta(); } })))));
  function total() {
    [...$("#venta-items").rows].forEach((r, i) => (r.querySelector(".sub-item").textContent = plata(itemsVenta[i].precio * itemsVenta[i].cant, usd ? "USD" : "UYU")));
    $("#venta-total").textContent = plata(itemsVenta.reduce((s, i) => s + i.precio * i.cant, 0), usd ? "USD" : "UYU");
  }
  total();
}
function abrirVenta() {
  const borrador = itemsVenta ? { cliente: fv.cliente.value, vendedor: fv.vendedor.value, medio: fv.medio.value } : null;
  if (!borrador) { fv.reset(); itemsVenta = []; }
  fv.cliente.replaceChildren(el("option", { value: "", textContent: "Elegí un cliente" }), el("option", { value: "nuevo", textContent: "+ Cliente nuevo…" }),
    ...[...db.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => el("option", { value: c.id, textContent: c.nombre })));
  fv.vendedor.replaceChildren(...db.usuarios.map((u) => el("option", { value: u.id, textContent: u.nombre })));
  opcionesMedios(fv.medio);
  if (borrador) for (const k in borrador) if ([...fv[k].options].some((o) => o.value === borrador[k])) fv[k].value = borrador[k];
  $("#lista-productos").replaceChildren(...db.productos.map((p) => el("option", { value: opcionProducto(p) })));
  $("#venta-error").textContent = $("#venta-item-error").textContent = "";
  pintarItemsVenta();
  $("#d-venta").showModal();
}
for (const b of document.querySelectorAll("[data-nueva-venta]")) b.addEventListener("click", abrirVenta);
function agregarItem() {
  const p = productoPorNombre(fv.buscar.value);
  if (!p) { $("#venta-item-error").textContent = fv.buscar.value.trim() ? "Elegí el producto de la lista (hay nombres repetidos, como ANGEL o PIKACHU)." : ""; return; }
  const ya = itemsVenta.find((i) => i.id === p.id);
  if (ya) ya.cant = Math.min(ya.cant + 1, 99);
  else itemsVenta.push({ id: p.id, nombre: p.nombre, cant: 1, precio: fv.moneda.value === "USD" ? 0 : p.precio });
  fv.buscar.value = "";
  $("#venta-item-error").textContent = p.precio ? "" : `${p.nombre} no tiene precio en el catálogo: ponelo a mano.`;
  pintarItemsVenta();
  fv.buscar.focus();
}
$("#agregar-item").addEventListener("click", agregarItem);
fv.buscar.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); agregarItem(); } });
// Los precios del catálogo son en pesos: en dólares se ponen a mano.
fv.moneda.addEventListener("change", () => {
  const usd = fv.moneda.value === "USD";
  for (const it of itemsVenta) it.precio = usd ? 0 : db.productos.find((p) => p.id === it.id)?.precio || 0;
  $("#venta-item-error").textContent = usd && itemsVenta.length ? "Poné los precios en dólares." : "";
  pintarItemsVenta();
});
fv.cliente.addEventListener("change", () => { if (fv.cliente.value === "nuevo") { fv.cliente.value = ""; abrirCliente(null, (c) => { abrirVentaCliente(c); }); } });
function abrirVentaCliente(c) { fv.cliente.append(el("option", { value: c.id, textContent: c.nombre })); fv.cliente.value = c.id; }
for (const b of document.querySelectorAll("[data-pago]")) b.addEventListener("click", () => {
  const t = itemsVenta.reduce((s, i) => s + i.precio * i.cant, 0);
  fv.pago.value = Math.ceil((t * b.dataset.pago) / 100) || "";
});
fv.addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const error = (t) => { e.preventDefault(); $("#venta-error").textContent = t; };
  if (!fv.cliente.value) return error("Elegí el cliente.");
  if (!itemsVenta.length) return error("Agregá al menos un producto.");
  if (itemsVenta.some((i) => !(i.precio > 0))) return error("Hay productos sin precio.");
  const v = { numero: nuevoNumero(db), fecha: new Date().toISOString(), origen: "local", cliente: fv.cliente.value, vendedor: fv.vendedor.value,
    moneda: fv.moneda.value, items: itemsVenta.map((i) => ({ ...i })), pagos: [], estado: 0, sena: true, entrega: fv.entrega.value, nota: fv.nota.value.trim(),
    comision: usuario(fv.vendedor.value)?.comision ?? 0 };
  const pago = Math.round(+fv.pago.value || 0);
  if (pago < 0 || pago > totalVenta(v)) { db.ultimo--; return error(`El pago tiene que ser entre 0 y ${plata(totalVenta(v), v.moneda)}.`); }
  if (pago) { registrarPago(v, pago, fv.medio.value); v.sena = pago < totalVenta(v); }
  // Lo que había listo en stock se descuenta; lo demás se imprime a pedido.
  for (const i of v.items) { const p = db.productos.find((x) => x.id === i.id); if (p) p.stock = Math.max((p.stock || 0) - i.cant, 0); }
  db.ventas.unshift(v);
  itemsVenta = null;
  guardar(); repintar();
  avisar(`Venta N° ${v.numero} guardada.`);
});

// --- Cuentas pendientes ---
PINTAR.pendientes = () => {
  const lista = db.ventas.filter(saldo).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const total = porMoneda(lista, saldo), viejas = lista.filter((v) => diasDesde(v.fecha) > 15);
  $("#kpis-deuda").replaceChildren(
    kpi("Por cobrar", plata(total.UYU), total.USD ? plata(total.USD, "USD") : `${lista.length} ventas`, "ambar"),
    kpi("Hace más de 15 días", String(viejas.length), viejas.length ? plata(porMoneda(viejas, saldo).UYU) : "Nada atrasado"),
    kpi("Listos sin pagar", String(lista.filter((v) => v.estado >= 3).length), "Cobrar al entregar"));
  $("#pendientes-lista").replaceChildren(tabla([...CAB_VENTAS, "Hace", ""], lista.map((v) => {
    const c = cliente(v.cliente);
    const msg = `Hola ${c.nombre.split(" ")[0]}! Te recordamos que del pedido N° ${v.numero} de Aukan3D queda un saldo de ${plata(saldo(v), v.moneda)}. ¡Gracias!`;
    return filaVenta(v, [td(`${diasDesde(v.fecha)} días`, diasDesde(v.fecha) > 15 ? "ambar" : ""), td(el("span", { className: "acciones" },
      el("button", { type: "button", className: "btn chico", textContent: "Cobrar", onclick: () => abrirPago(v.numero) }),
      c.whatsapp ? el("a", { className: "btn sec chico", href: `https://wa.me/${waDe(c.whatsapp)}?text=${encodeURIComponent(msg)}`, target: "_blank", rel: "noopener", textContent: "Recordar", ariaLabel: `Recordarle a ${c.nombre} por WhatsApp` }) : ""))]);
  }), "No hay nada pendiente de cobro.", "t-ventas"));
};

// --- Clientes ---
$("#clientes-q").addEventListener("input", () => PINTAR.clientes());
PINTAR.clientes = () => {
  const q = normalizar($("#clientes-q").value.trim());
  const lista = db.clientes.filter((c) => !q || normalizar([c.nombre, c.whatsapp, c.zona, c.email].join(" ")).includes(q))
    .map((c) => ({ c, ventas: db.ventas.filter((v) => v.cliente === c.id) }))
    .sort((a, b) => (b.ventas[0]?.fecha || "").localeCompare(a.ventas[0]?.fecha || ""));
  $("#clientes-lista").replaceChildren(tabla(["Cliente", "WhatsApp", "Zona", "#Compras", "#Total comprado", "#Saldo", "Última compra", ""], lista.map(({ c, ventas }) => el("tr", {},
    td(el("b", { textContent: c.nombre })), td(c.whatsapp || "—"), td(c.zona || "—"), td(String(ventas.length), "num"),
    td(dosMonedas(porMoneda(ventas, totalVenta)), "num"),
    td(suma(ventas, saldo) ? dosMonedas(porMoneda(ventas, saldo)) : "—", "num" + (suma(ventas, saldo) ? " ambar" : "")),
    td(ventas[0] ? fecha(ventas[0].fecha) : "—"),
    td(el("span", { className: "acciones" },
      el("button", { type: "button", className: "btn sec chico", textContent: "Editar", onclick: () => abrirCliente(c) }),
      ventas.length ? el("button", { type: "button", className: "btn sec chico", textContent: "Pedidos", onclick: () => { $("#ventas-q").value = c.nombre; location.hash = "#ventas"; } }) : ""))))
  , "No hay clientes con esa búsqueda."));
};
let clienteEdit = null, alGuardarCliente = null;
function abrirCliente(c, despues = null) {
  clienteEdit = c; alGuardarCliente = despues;
  const f = $("#f-cliente");
  f.reset();
  for (const k of ["nombre", "whatsapp", "email", "zona"]) f[k].value = c?.[k] || "";
  $("#d-cliente-t").textContent = c ? "Editar cliente" : "Nuevo cliente";
  $("#cliente-error").textContent = "";
  $("#d-cliente").showModal();
}
$("#nuevo-cliente").addEventListener("click", () => abrirCliente(null));
$("#f-cliente").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const d = Object.fromEntries(new FormData(e.target));
  for (const k in d) d[k] = d[k].trim();
  const error = (t) => { e.preventDefault(); $("#cliente-error").textContent = t; };
  if (!d.nombre) return error("Poné el nombre.");
  if (d.whatsapp && !/^\+?[0-9 ]{8,20}$/.test(d.whatsapp)) return error("El WhatsApp tiene que tener solo números (ej. 099 123 456).");
  if (d.email && !e.target.email.checkValidity()) return error("Revisá el correo.");
  const c = clienteEdit || { id: "c" + Date.now().toString(36) };
  Object.assign(c, d);
  if (!clienteEdit) db.clientes.push(c);
  guardar(); repintar();
  alGuardarCliente?.(c);
  avisar("Cliente guardado.");
});

// --- Productos y stock ---
const cats = () => [...new Set(db.productos.map((p) => p.categoria))].sort();
$("#prod-cat").append(...cats().map((c) => el("option", { textContent: c })));
for (const id of ["#prod-q", "#prod-cat", "#prod-stock"]) $(id).addEventListener("input", () => PINTAR.productos());
PINTAR.productos = () => {
  const q = normalizar($("#prod-q").value.trim()), cat = $("#prod-cat").value, st = $("#prod-stock").value;
  const lista = db.productos.filter((p) => (!cat || p.categoria === cat) && (!q || normalizar(`${p.nombre} ${p.subcategoria}`).includes(q))
    && (st === "" || (st === "sin" ? !p.stock : st === "con" ? p.stock > 0 : !p.activo)));
  const mostrar = lista.slice(0, 60); // shortcut: muestra 60 por vez; paginar si el catálogo pasa de unos cientos
  $("#prod-lista").replaceChildren(tabla(["", "Producto", "Categoría", "#Precio", "#Stock listo", "Tienda", ""], mostrar.map((p) => el("tr", {},
    td(p.foto ? el("img", { src: foto(p.foto), alt: "", width: 44, height: 44, loading: "lazy", className: "mini-foto" }) : el("span", { className: "mini-foto vacia", textContent: "3D" })),
    td(el("span", {}, el("b", { textContent: p.nombre }), p.subcategoria ? el("small", { textContent: p.subcategoria }) : "")), td(p.categoria),
    td(p.precio ? plata(p.precio) : "Consultar", "num"),
    td(el("span", { className: "stock" },
      el("button", { type: "button", className: "paso", textContent: "−", ariaLabel: `Restar stock de ${p.nombre}`, disabled: !p.stock, onclick: () => { p.stock--; guardar(); PINTAR.productos(); } }),
      el("b", { textContent: p.stock || 0 }),
      el("button", { type: "button", className: "paso", textContent: "+", ariaLabel: `Sumar stock de ${p.nombre}`, onclick: () => { p.stock = (p.stock || 0) + 1; guardar(); PINTAR.productos(); } })), "num"),
    td(el("span", { className: "pill " + (p.activo ? "e4" : "e0"), textContent: p.activo ? "Visible" : "Oculto" })),
    td(el("button", { type: "button", className: "btn sec chico", textContent: "Editar", onclick: () => abrirProducto(p) })))),
  "No hay productos con esos filtros."), lista.length > mostrar.length ? el("p", { className: "sub", textContent: `Se muestran 60 de ${lista.length}. Buscá para encontrar el resto.` }) : "");
};
let productoEdit = null, fotoNueva = null;
const fp = $("#f-producto");
function abrirProducto(p) {
  productoEdit = p; fotoNueva = null;
  fp.reset();
  for (const k of ["nombre", "categoria", "subcategoria", "tamano", "material"]) fp[k].value = p?.[k] || "";
  fp.precio.value = p?.precio || ""; fp.stock.value = p?.stock || "";
  fp.activo.checked = p ? p.activo : true;
  $("#lista-cats").replaceChildren(...cats().map((c) => el("option", { value: c })));
  $("#foto-prev").hidden = !p?.foto; $("#foto-vacia").hidden = !!p?.foto;
  if (p?.foto) $("#foto-prev").src = foto(p.foto);
  $("#foto-estado").textContent = "Se ajusta a 600 × 600 px en WebP liviano, sin recortar.";
  $("#d-producto-t").textContent = p ? "Editar producto" : "Nuevo producto";
  $("#producto-error").textContent = "";
  $("#d-producto").showModal();
}
$("#nuevo-producto").addEventListener("click", () => abrirProducto(null));
// Del prototipo de Rodrigo: 600 × 600, fondo blanco, sin recortar, WebP de hasta ~140 KB.
async function optimizarFoto(file, lado = 600, maxKb = 140) {
  const bmp = await createImageBitmap(file);
  const c = Object.assign(document.createElement("canvas"), { width: lado, height: lado }), ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, lado, lado);
  const k = Math.min((lado - 40) / bmp.width, (lado - 40) / bmp.height), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  ctx.drawImage(bmp, (lado - w) / 2, (lado - h) / 2, w, h);
  bmp.close?.();
  let q = 0.82, url = c.toDataURL("image/webp", q);
  while (url.length * 0.75 > maxKb * 1024 && q > 0.48) url = c.toDataURL("image/webp", (q -= 0.08));
  if (!url.startsWith("data:image/webp")) throw new Error("webp"); // Safari viejo no genera WebP
  return url;
}
$("#foto-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("#foto-estado").textContent = "Optimizando…";
  try {
    fotoNueva = await optimizarFoto(file);
    $("#foto-prev").src = fotoNueva; $("#foto-prev").hidden = false; $("#foto-vacia").hidden = true;
    $("#foto-estado").textContent = `Lista: 600 × 600 px, ${Math.round((fotoNueva.length * 0.75) / 1024)} KB (original ${Math.round(file.size / 1024)} KB).`;
  } catch {
    fotoNueva = null;
    $("#foto-estado").textContent = "No pudimos procesar esa imagen. Probá con JPG, PNG o WebP.";
  }
});
const slug = (t) => normalizar(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
fp.addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const d = Object.fromEntries(new FormData(fp));
  const error = (t) => { e.preventDefault(); $("#producto-error").textContent = t; };
  if (!d.nombre.trim() || !d.categoria.trim()) return error("Poné nombre y categoría.");
  const p = productoEdit || { id: String(Math.max(0, ...db.productos.map((x) => +x.id || 0)) + 1), foto: "" };
  Object.assign(p, { nombre: d.nombre.trim(), categoria: d.categoria.trim(), subcategoria: d.subcategoria.trim(), tamano: d.tamano.trim(), material: d.material.trim(),
    precio: Math.max(Math.round(+d.precio || 0), 0), stock: Math.max(Math.round(+d.stock || 0), 0), activo: fp.activo.checked });
  if (fotoNueva) {
    // La foto nueva se baja con el nombre que usa el CSV: subirla a fotos/ del sitio.
    const nombre = `${p.id}-${slug(p.nombre)}.webp`;
    el("a", { href: fotoNueva, download: nombre }).click();
    p.foto = fotoNueva; p.fotoArchivo = "fotos/" + nombre;
  }
  if (!productoEdit) db.productos.push(p);
  guardar(); repintar();
  avisar(fotoNueva ? "Producto guardado. La foto se descargó para subirla a la carpeta fotos." : "Producto guardado.");
});
$("#bajar-csv").addEventListener("click", () => {
  const csv = catalogoACsv(db.productos.map((p) => ({ ...p, foto: p.fotoArchivo || p.foto })));
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  el("a", { href: url, download: `productos-aukan3d-${hoy()}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  avisar("CSV descargado. En la planilla: Archivo > Importar > Reemplazar hoja.");
});

// --- Medios de pago ---
PINTAR.medios = () => {
  const usos = (id) => db.ventas.filter((v) => v.pagos.some((p) => p.medio === id)).length;
  $("#medios-lista").replaceChildren(...db.medios.map((m) => el("article", { className: "caja medio" },
    m.qr ? el("img", { src: m.qr, alt: `QR de ${m.nombre}`, width: 96, height: 96 }) : el("span", { className: "qr-vacio", textContent: "Sin QR" }),
    el("div", {}, el("h2", { textContent: m.nombre }), m.detalle ? el("p", { className: "sub", textContent: m.detalle }) : "",
      el("p", { className: "sub chico", textContent: `Usado en ${usos(m.id)} ventas` }),
      el("span", { className: "acciones" },
        el("button", { type: "button", className: "btn sec chico", textContent: "Editar", onclick: () => abrirMedio(m) }),
        usos(m.id) ? "" : el("button", { type: "button", className: "btn sec chico peligro", textContent: "Quitar", onclick: () => { db.medios = db.medios.filter((x) => x !== m); guardar(); PINTAR.medios(); avisar(`Quitamos ${m.nombre}.`); } }))))));
};
let medioEdit = null;
function abrirMedio(m) {
  medioEdit = m;
  const f = $("#f-medio");
  f.reset(); f.nombre.value = m?.nombre || ""; f.detalle.value = m?.detalle || "";
  $("#d-medio-t").textContent = m ? "Editar medio de pago" : "Nuevo medio de pago";
  $("#medio-error").textContent = "";
  $("#d-medio").showModal();
}
$("#nuevo-medio").addEventListener("click", () => abrirMedio(null));
$("#f-medio").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "ok") return;
  e.preventDefault(); // espera la imagen del QR antes de cerrar
  const f = e.target;
  if (!f.nombre.value.trim()) { $("#medio-error").textContent = "Poné un nombre."; return; }
  let qr = medioEdit?.qr || "";
  if (f.qr.files[0]) {
    try { qr = await optimizarFoto(f.qr.files[0], 360, 60); }
    catch { $("#medio-error").textContent = "No pudimos leer esa imagen del QR."; return; }
  }
  const m = medioEdit || { id: "m" + Date.now().toString(36) };
  Object.assign(m, { nombre: f.nombre.value.trim(), detalle: f.detalle.value.trim(), qr });
  if (!medioEdit) db.medios.push(m);
  guardar(); PINTAR.medios();
  $("#d-medio").close();
  avisar("Medio de pago guardado.");
});

// --- Usuarios y comisiones ---
$("#usuarios-mes").value = $("#reportes-mes").value = mesActual();
$("#usuarios-mes").addEventListener("input", () => PINTAR.usuarios());
PINTAR.usuarios = () => {
  const mes = $("#usuarios-mes").value || mesActual();
  const lista = comisiones(db, mes);
  const total = suma(lista, (u) => u.comision.UYU);
  $("#usuarios-lista").replaceChildren(tabla(["Usuario", "Rol", "#Comisión", "#Ventas", "#Vendido", "#A liquidar", ""], lista.map((u) => el("tr", {},
    td(el("b", { textContent: u.nombre })), td(u.rol), td(`${u.comision}%`, "num"), td(String(u.cantidad), "num"),
    td(dosMonedas(u.vendido), "num"), td(dosMonedas(u.comision), "num verde"),
    td(el("button", { type: "button", className: "btn sec chico", textContent: "Editar", onclick: () => abrirUsuario(db.usuarios.find((x) => x.id === u.id)) })))),
  "Todavía no hay usuarios."),
  el("p", { className: "sub", textContent: `Comisiones de ${nombreMes(mes)}: ${plata(total)}. Se calculan sobre lo vendido; los pedidos de la tienda web no llevan comisión.` }));
};
let usuarioEdit = null;
function abrirUsuario(u) {
  usuarioEdit = u;
  const f = $("#f-usuario");
  f.reset(); f.nombre.value = u?.nombre || ""; f.rol.value = u?.rol || "Vendedor"; f.comision.value = u?.comision ?? 10;
  $("#d-usuario-t").textContent = u ? "Editar usuario" : "Nuevo usuario";
  $("#usuario-error").textContent = "";
  $("#d-usuario").showModal();
}
$("#nuevo-usuario").addEventListener("click", () => abrirUsuario(null));
$("#f-usuario").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const f = e.target, com = +f.comision.value;
  if (!f.nombre.value.trim()) { e.preventDefault(); $("#usuario-error").textContent = "Poné el nombre."; return; }
  if (!(com >= 0 && com <= 100)) { e.preventDefault(); $("#usuario-error").textContent = "La comisión va de 0 a 100."; return; }
  const u = usuarioEdit || { id: "u" + Date.now().toString(36) };
  Object.assign(u, { nombre: f.nombre.value.trim(), rol: f.rol.value, comision: com });
  if (!usuarioEdit) db.usuarios.push(u);
  guardar(); PINTAR.usuarios();
  avisar("Usuario guardado.");
});

// --- Reportes y gastos ---
$("#reportes-mes").addEventListener("input", () => PINTAR.reportes());
PINTAR.reportes = () => {
  const mes = $("#reportes-mes").value || mesActual(), r = resumenMes(db, mes);
  const usd = r.cobrado.USD || r.gastado.USD;
  $("#kpis-reporte").replaceChildren(
    kpi("Vendido", plata(r.vendido.UYU), r.vendido.USD ? plata(r.vendido.USD, "USD") : `${r.ventas.length} ventas`),
    kpi("Cobrado", plata(r.cobrado.UYU), r.cobrado.USD ? plata(r.cobrado.USD, "USD") : "Pesos", "verde"),
    kpi("Gastos", plata(r.gastado.UYU), r.gastado.USD ? plata(r.gastado.USD, "USD") : `${r.gastos.length} gastos`, "rojo"),
    kpi("Resultado", plata(r.resultado.UYU), usd ? `${plata(r.resultado.USD, "USD")} en dólares` : "Cobrado menos gastos", r.resultado.UYU >= 0 ? "verde" : "rojo"));
  const porCat = {};
  for (const v of r.ventas.filter((v) => v.moneda === "UYU")) for (const i of v.items) {
    const c = db.productos.find((p) => p.id === i.id)?.categoria || "Otros";
    porCat[c] = (porCat[c] || 0) + i.precio * i.cant;
  }
  $("#por-cat").replaceChildren(barras(Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, n, plata(n)])));
  const porMedio = {};
  for (const p of r.pagos.filter((p) => p.moneda === "UYU")) porMedio[medio(p.medio)] = (porMedio[medio(p.medio)] || 0) + p.monto;
  $("#por-medio").replaceChildren(barras(Object.entries(porMedio).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, n, plata(n)])));
  $("#gastos-lista").replaceChildren(tabla(["Fecha", "Concepto", "#Monto", ""], [...r.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((g) => el("tr", {},
    td(fecha(g.fecha + "T12:00")), td(g.concepto), td(plata(g.monto, g.moneda), "num"),
    td(el("button", { type: "button", className: "btn sec chico peligro", textContent: "Borrar", ariaLabel: `Borrar gasto ${g.concepto}`, onclick: () => borrarGasto(g) })))),
  "No hay gastos cargados este mes."));
};
function borrarGasto(g) {
  const i = db.gastos.indexOf(g);
  db.gastos.splice(i, 1); guardar(); PINTAR.reportes();
  avisar(`Borramos "${g.concepto}".`, () => db.gastos.splice(i, 0, g));
}
$("#nuevo-gasto").addEventListener("click", () => { const f = $("#f-gasto"); f.reset(); f.fecha.value = hoy(); $("#gasto-error").textContent = ""; $("#d-gasto").showModal(); });
$("#f-gasto").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const f = e.target, monto = Math.round(+f.monto.value);
  if (!f.concepto.value.trim() || !f.fecha.value || !(monto > 0)) { e.preventDefault(); $("#gasto-error").textContent = "Completá concepto, fecha y un monto mayor a 0."; return; }
  db.gastos.push({ id: "g" + Date.now().toString(36), concepto: f.concepto.value.trim(), fecha: f.fecha.value, monto, moneda: f.moneda.value });
  guardar(); PINTAR.reportes();
  avisar("Gasto registrado.");
});

$("#reiniciar").addEventListener("click", () => {
  db = datosEjemplo(catalogoDesdeCsv(window.PRODUCTOS_CSV));
  guardar(); repintar();
  avisar("Volvimos a los datos de ejemplo.");
});

if (traerPedidosWeb()) guardar();
mostrarApp();
