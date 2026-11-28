// Panel de gestión Aukan3D. Datos y cálculos: datos.js.
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
const plural = (n, palabra, varias = palabra + "s") => `${n} ${n === 1 ? palabra : varias}`; // "1 venta", "3 ventas"
const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso)) / 864e5);
// La primera foto de la lista "a|b"; las de la tienda están un nivel arriba. Las subidas acá son data:image/webp.
function foto(f) {
  const x = (f || "").split("|")[0].trim();
  if (x.startsWith("data:image/webp")) return x;
  const ok = fotoSegura(x);
  return !ok || ok.startsWith("https:") ? ok : "../" + ok;
}

// --- Ingreso ---
// Con apiUrl (config.js) el usuario y la contraseña se validan en el servidor, que da un token de 12 h.
// Sin apiUrl es la demo: admin / admin comparado en el navegador, con datos de ejemplo.
const API = String(window.AUKAN_CONFIG?.apiUrl || "").replace(/\/+$/, "");
const SESION = API ? "aukan_admin_token" : "aukan_admin_ok";
// Modo pruebas (solo usuario dev): las llamadas llevan ?e=pruebas y el servidor usa la base de pruebas.
// Queda guardado en este navegador; la tienda abierta acá también manda sus pedidos a pruebas.
const ENTORNO = "aukan_entorno", USUARIO = "aukan_admin_usuario";
const leerLocal = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const PRUEBAS = !!API && leerLocal(ENTORNO) === "pruebas";
const conEntorno = (ruta) => (PRUEBAS ? ruta + (ruta.includes("?") ? "&" : "?") + "e=pruebas" : ruta);
function cambiarEntorno(pruebas) {
  try { if (pruebas) localStorage.setItem(ENTORNO, "pruebas"); else localStorage.removeItem(ENTORNO); } catch { /* sin almacenamiento */ }
  location.reload();
}
const leerSesion = () => { try { return sessionStorage.getItem(SESION) || ""; } catch { return ""; } };
const conSesion = () => (API ? !!leerSesion() : leerSesion() === "1");
function cerrarSesion(motivo = "") {
  try { sessionStorage.removeItem(SESION); sessionStorage.removeItem(USUARIO); } catch { /* sin almacenamiento */ }
  if (API) { db = dbVacia(); enviado.clear(); hasta = 0; }
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
  $("#login-error").textContent = motivo;
  mostrarApp();
}
function mostrarApp() {
  const ok = conSesion();
  let dev = false;
  try { dev = API && sessionStorage.getItem(USUARIO) === "dev"; } catch { /* sin almacenamiento */ }
  for (const b of document.querySelectorAll("[data-entorno], [data-solo-dev]")) b.hidden = !dev;
  for (const b of document.querySelectorAll("[data-solo-servidor]")) b.hidden = !API;
  $(".user-nombre b").textContent = dev ? "Dev" : "Administrador";
  $(".user .avatar").textContent = dev ? "D" : "A";
  $("#login").hidden = ok;
  $(".app").hidden = !ok;
  if (ok) mostrarVista(); else $("#f-login").usuario.focus();
}
$("#f-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (API) {
    const boton = f.querySelector("button");
    boton.disabled = true;
    $("#login-error").textContent = "";
    try {
      const res = await fetch(API + conEntorno("/api/login"), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: f.usuario.value.trim(), clave: f.clave.value }) });
      const r = await res.json();
      if (!r.ok) {
        $("#login-error").textContent = r.error === "limite" ? "Demasiados intentos. Probá de nuevo en 15 minutos." : "Usuario o contraseña incorrectos.";
        f.clave.select();
        return;
      }
      try { sessionStorage.setItem(SESION, r.token); sessionStorage.setItem(USUARIO, r.usuario || ""); } catch { /* sin almacenamiento */ }
      if (PRUEBAS && r.usuario !== "dev") return cambiarEntorno(false); // pruebas es solo para dev
      f.reset();
      await traerServidor();
      mostrarApp();
    } catch (err) {
      console.error(err);
      if (conSesion()) cerrarSesion("No pudimos traer los datos. Revisá la conexión y probá de nuevo.");
      else $("#login-error").textContent = "No pudimos conectar con el servidor. Revisá la conexión.";
    } finally { boton.disabled = false; }
    return;
  }
  if (f.usuario.value.trim().toLowerCase() === "admin" && f.clave.value === "admin") {
    try { sessionStorage.setItem(SESION, "1"); } catch { /* sin almacenamiento */ }
    f.reset();
    $("#login-error").textContent = "";
    return mostrarApp();
  }
  $("#login-error").textContent = "Usuario o contraseña incorrectos.";
  f.clave.select();
});
for (const b of document.querySelectorAll("[data-salir]")) b.addEventListener("click", () => cerrarSesion());

// --- Datos ---
let db = API ? dbVacia() : leerJson(CLAVE_DB, null);
if (!db?.version) db = datosEjemplo(catalogoDesdeCsv(window.PRODUCTOS_CSV));
db.cajas ||= []; // datos guardados antes del modo feria
function avisoPedidos(n) {
  if (n) notificar(n === 1 ? "Llegó 1 pedido nuevo de la tienda." : `Llegaron ${n} pedidos nuevos de la tienda.`);
}
function notificar(t, tag = "pedidos") {
  avisar(t);
  // En otra pestaña o ventana: aviso del navegador, si se dio permiso desde la campana.
  try { if (document.hidden && Notification.permission === "granted") new Notification("Aukan3D", { body: t, icon: "../logo.webp", tag }); } catch { /* sin notificaciones */ }
}
// Pagos que anotó el servidor cuando Mercado Pago avisó (los que anota este panel ya estaban antes de traer).
const pagosMp = () => new Set(db.ventas.flatMap((v) => v.pagos.filter((p) => p.mp).map((p) => p.mp)));
function avisoPagosMp(antes) {
  for (const v of db.ventas) for (const p of v.pagos) if (p.mp && !antes.has(p.mp))
    notificar(`Pedido N° ${v.numero}: Mercado Pago confirmó el pago de ${plata(p.monto, v.moneda)}.`, "pago-" + p.mp);
}

// Servidor: cada guardar() manda solo lo cambiado; cada 20 s se trae lo nuevo (pedidos web, otros dispositivos).
// shortcut: si dos dispositivos editan lo mismo a la vez, queda el último que guardó.
const enviado = new Map();
let hasta = 0, enviando = null, otraVez = false;
async function llamar(ruta, body) {
  const res = await fetch(API + conEntorno(ruta), { method: body ? "POST" : "GET", body: body && JSON.stringify(body),
    headers: { Authorization: "Bearer " + leerSesion(), ...(body ? { "Content-Type": "application/json" } : {}) } });
  if (res.status === 401) { cerrarSesion("La sesión venció. Volvé a ingresar."); throw new Error("sesion"); }
  if (res.status === 403) { cambiarEntorno(false); throw new Error("sesion"); }
  const r = await res.json();
  if (!r.ok) throw new Error(r.error);
  return r;
}
async function traerServidor() {
  const r = await llamar("/api/admin/datos?desde=" + hasta);
  const primera = !hasta, antes = pagosMp();
  const n = aplicarServidor(db, r, enviado);
  hasta = r.hasta;
  if (!primera) { avisoPedidos(n); avisoPagosMp(antes); } // el pago va último: si llegan juntos, es el aviso que queda a la vista
  return primera ? 0 : n;
}
function sincronizar() {
  if (enviando) { otraVez = true; return enviando; }
  const cam = cambiosDb(db, enviado);
  if (!cam.set.length && !cam.del.length) return Promise.resolve();
  enviando = llamar("/api/admin/lote", { set: cam.set.map(({ col, id, data }) => ({ col, id, data })), del: cam.del })
    .then(() => marcarEnviado(enviado, cam))
    .catch((e) => { if (e.message !== "sesion") avisar("No se pudo guardar en el servidor. Reintentamos en unos segundos."); })
    .finally(() => { enviando = null; if (otraVez) { otraVez = false; sincronizar(); } });
  return enviando;
}
async function actualizar() {
  if (!API || !conSesion()) return; // también en segundo plano, para avisar pedidos nuevos
  await sincronizar();
  if (document.querySelector("dialog[open]")) return; // no cambiar datos debajo de un formulario abierto
  try { await traerServidor(); repintar(); } catch { /* reintenta en la próxima vuelta */ }
}
setInterval(actualizar, 20000);
addEventListener("visibilitychange", actualizar); // al volver a la pestaña, sin esperar los 20 s

function guardar() {
  if (API) return void sincronizar();
  try { localStorage.setItem(CLAVE_DB, JSON.stringify(db)); }
  catch { avisar("No se pudo guardar: el navegador no tiene más lugar. Probá con fotos más livianas."); }
}
// Demo: pedidos hechos en la tienda desde este navegador (ver importarPedidosWeb). Con servidor llegan solos.
function traerPedidosWeb() {
  if (API) return 0;
  const n = importarPedidosWeb(db, leerJson("aukan_pedidos_panel", []));
  avisoPedidos(n);
  return n;
}
if (!API) guardar();
addEventListener("storage", (e) => { if (e.key === "aukan_pedidos_panel" && conSesion() && traerPedidosWeb()) { guardar(); repintar(); } });
// Número de venta: con servidor se reserva al abrir el formulario (la serie es la misma que la de la tienda).
let reservado = null;
const reservarNumero = () => { if (API && reservado == null) llamar("/api/admin/numero", {}).then((r) => { reservado = String(r.numero); }).catch(() => {}); };
function numeroVenta() {
  if (!API) return nuevoNumero(db);
  const n = reservado;
  reservado = null;
  reservarNumero();
  return n;
}
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
const VISTAS = { panel: "Panel principal", ventas: "Ventas y pedidos", feria: "Modo feria", pendientes: "Cuentas pendientes", clientes: "Clientes",
  productos: "Productos y stock", medios: "Medios de pago", usuarios: "Usuarios y comisiones", reportes: "Reportes y gastos", base: "Base de datos", mp: "Mercado Pago" };
const PINTAR = {};
function esDev() { try { return !!API && sessionStorage.getItem(USUARIO) === "dev"; } catch { return false; } }
function mostrarVista() {
  let v = location.hash.slice(1) in VISTAS ? location.hash.slice(1) : "panel";
  if ((v === "base" && !esDev()) || (v === "mp" && !API)) v = "panel";
  for (const s of document.querySelectorAll(".vista")) s.hidden = s.id !== "v-" + v;
  for (const a of document.querySelectorAll(".nav a")) a.ariaCurrent = a.hash === "#" + v ? "page" : null;
  $("#crumb").textContent = VISTAS[v];
  document.title = `${VISTAS[v]} · Aukan3D Gestión`;
  PINTAR[v]();
  pintarCampana();
}
addEventListener("hashchange", () => { mostrarVista(); scrollTo(0, 0); });
const repintar = () => { const v = location.hash.slice(1); if (v !== "base" && v !== "mp") PINTAR[v in VISTAS ? v : "panel"](); pintarCampana(); };

// --- Campana: pedidos de la tienda en "Recibido" que todavía no se abrieron en este navegador ---
const VISTOS = PRUEBAS ? "aukan_vistos_pruebas" : "aukan_vistos"; // los números se repiten entre la base real y la de pruebas
const vistos = new Set(leerJson(VISTOS, []).map(String));
// Recibido o ya pagado: con Mercado Pago el pedido llega al panel recién cuando se acredita (en Seña pagada o Pagado).
const llegoPagado = (v) => v.estado === 1 && v.pagos.length && v.pagos.every((p) => p.mp);
const nuevos = () => db.ventas.filter((v) => v.origen === "web" && (v.estado === 0 || llegoPagado(v)) && !vistos.has(String(v.numero)));
function marcarVistos(numeros) {
  for (const n of numeros) vistos.add(String(n));
  try { localStorage.setItem(VISTOS, JSON.stringify([...vistos].slice(-500))); } catch { /* sin almacenamiento */ }
  pintarCampana();
}
function pintarCampana() {
  const lista = nuevos(), n = lista.length;
  for (const b of document.querySelectorAll("[data-campana]")) {
    const i = b.querySelector(".campana-n");
    i.hidden = !n; i.textContent = n > 99 ? "99+" : String(n);
    b.ariaLabel = n ? `Pedidos nuevos: ${n}` : "Pedidos nuevos: ninguno";
  }
  document.title = (n ? `(${n}) ` : "") + document.title.replace(/^\(\d+\+?\) /, "");
  if ($("#notis").hidden) return;
  $("#notis-todo").hidden = !n;
  $("#notis-lista").replaceChildren(...lista.slice(0, 20).map((v) => el("button", { type: "button", className: "noti",
    onclick: () => { mostrarNotis(false); abrirDetalle(v.numero); } },
    el("b", { textContent: `N° ${v.numero} · ${cliente(v.cliente).nombre}` }), el("b", { textContent: plata(totalVenta(v), v.moneda) }),
    el("small", { textContent: `${new Date(v.fecha).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${v.items.map((i) => `${i.cant}× ${i.nombre}`).join(", ")}` }))),
  n ? "" : el("p", { className: "vacio", textContent: "No hay pedidos nuevos. Cuando llegue uno de la tienda, aparece acá." }));
  let permiso = "denied";
  try { permiso = Notification.permission; } catch { /* sin notificaciones */ }
  $("#notis-permiso").hidden = permiso !== "default";
}
function mostrarNotis(si) {
  $("#notis").hidden = !si;
  for (const b of document.querySelectorAll("[data-campana]")) b.ariaExpanded = String(si);
  if (si) pintarCampana();
}
for (const b of document.querySelectorAll("[data-campana]")) b.addEventListener("click", (e) => { e.stopPropagation(); mostrarNotis($("#notis").hidden); });
document.addEventListener("click", (e) => { if (!$("#notis").hidden && !e.target.closest("#notis")) mostrarNotis(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#notis").hidden) mostrarNotis(false); });
$("#notis-todo").addEventListener("click", () => marcarVistos(nuevos().map((v) => v.numero)));
$("#notis-permiso").addEventListener("click", async () => { try { await Notification.requestPermission(); } catch { /* sin notificaciones */ } pintarCampana(); });

// --- Piezas comunes ---
// "Pagado" en vez de "Seña pagada" si se pagó todo de una o si ya no queda saldo.
const pagadoTodo = (v) => !v.sena || !saldo(v);
const nombreEstado = (v) => (v.estado === 1 && pagadoTodo(v) ? "Pagado" : ESTADOS[v.estado]);
const pastilla = (v) => el("span", { className: `pill e${v.estado}`, textContent: nombreEstado(v) });
const kpi = (titulo, valor, pista, tono = "") => el("div", { className: "kpi" },
  el("p", { textContent: titulo }), el("strong", { className: tono, textContent: valor }), pista ? el("small", { textContent: pista }) : "");
function barras(filas) { // filas: [[etiqueta, valor, texto]]
  const max = Math.max(1, ...filas.map((f) => f[1]));
  return filas.length ? el("div", { className: "barras" }, ...filas.map(([t, n, txt]) => el("div", { className: "barra" },
    el("span", { textContent: t, title: t }), el("i", { ariaHidden: "true" }, n ? el("b", { style: `width:${(n / max) * 100}%` }) : ""), el("span", { className: "num", textContent: txt }))))
    : el("p", { className: "vacio", textContent: "Sin datos en este período." });
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
    td(el("span", {}, el("b", { textContent: `N° ${v.numero}` }), el("small", { textContent: ORIGEN[v.origen] || "En persona" }))),
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
    kpi("Vendido este mes", plata(r.vendido.UYU), `${plural(r.ventas.length, "venta")}${r.vendido.USD ? ` · ${plata(r.vendido.USD, "USD")}` : ""}`),
    kpi("Cobrado este mes", plata(r.cobrado.UYU), r.cobrado.USD ? plata(r.cobrado.USD, "USD") : "Pesos", "verde"),
    kpi("Pendiente de cobro", plata(pendiente.UYU), `${plural(db.ventas.filter(saldo).length, "venta")} con saldo`, "ambar"),
    kpi("Pedidos en curso", String(curso.length), plural(curso.filter((v) => v.estado === 3).length, "listo", "listos") + " para entregar"));
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
  const boton = (v, formato, texto, nombre) => el("button", { type: "button", className: "btn sec chico", textContent: texto, ariaLabel: `Imprimir pedido ${v.numero} en ${nombre}`, onclick: () => imprimirPedido(v.numero, formato) });
  const imp = (v) => td(el("span", { className: "imp-formatos" }, boton(v, "a4", "A4", "A4"), boton(v, "80", "80 mm", "ticket de 80 mm")), "num");
  $("#ventas-lista").replaceChildren(tabla([...CAB_VENTAS, "#Imprimir"], lista.map((v) => filaVenta(v, [imp(v)])), "No hay ventas con esos filtros.", "t-ventas"));
};

// Hoja del pedido para imprimir (o guardar como PDF), en A4 o en ticket de 80 mm. Se arma en #imprimir y el CSS de
// impresión oculta todo lo demás; el tamaño de hoja sale de la clase (página con nombre en admin.css).
const FORMATO = "aukan_formato_imp";
function imprimirPedido(numero, formato = leerLocal(FORMATO) || "a4", extra = {}) {
  try { localStorage.setItem(FORMATO, formato); } catch { /* sin almacenamiento */ }
  const v = venta(numero), c = cliente(v.cliente), ticket = formato === "80";
  const linea = (t, b) => el("p", { className: "linea", textContent: t }, el("b", { textContent: b }));
  const hora = new Date(v.fecha).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  $("#imprimir").className = ticket ? "ticket80" : "";
  $("#imprimir").replaceChildren(
    el("header", {}, el("img", { src: "../logo.webp", alt: "" }), el("div", {}, el("h1", { textContent: ticket ? "AUKAN3D" : `Pedido N° ${v.numero}` }),
      el("p", { textContent: ticket ? `Venta N° ${v.numero} · ${hora}` : `${fecha(v.fecha)} · ${ORIGEN[v.origen] || "En persona"} · ${ESTADOS[v.estado]}` }))),
    v.origen === "feria" && ticket ? "" : el("div", { className: "bloque" }, el("h2", { textContent: "Cliente" }), el("p", { textContent: c.nombre || "—" }),
      c.whatsapp ? el("p", { textContent: `WhatsApp ${c.whatsapp}` }) : "", v.entrega ? el("p", { textContent: `Entrega: ${v.entrega}` }) : ""),
    el("h2", { textContent: "Productos" }),
    el("table", {}, el("tbody", {}, ...v.items.map((i) => el("tr", {},
      td(`${i.cant} x ${i.nombre}`), td(plata(i.precio * i.cant, v.moneda), "num"))))),
    linea("Total", plata(totalVenta(v), v.moneda)),
    ...v.pagos.map((p) => linea(`Pago ${medio(p.medio)}`, plata(p.monto, v.moneda))),
    extra.recibido ? linea("Recibido", plata(extra.recibido, v.moneda)) : "", extra.recibido > totalVenta(v) ? linea("Vuelto", plata(extra.recibido - totalVenta(v), v.moneda)) : "",
    linea("Saldo", saldo(v) ? plata(saldo(v), v.moneda) : "Pagado"),
    v.nota ? el("p", { className: "nota", textContent: `Nota: ${v.nota}` }) : "",
    el("p", { className: "pie-imp", textContent: ticket ? "¡Gracias por tu compra! · Instagram @aukan3d" : "Aukan3D · Montevideo, Uruguay · Este comprobante no es una factura." }));
  if (ticket) altoTicket();
  print();
}
// El rollo de 80 mm no tiene alto fijo: medimos el ticket y ajustamos la hoja para que no salga papel en blanco.
// Hoja de estilos construida por JS (no es un <style> en línea, así que la CSP lo permite).
const hojaTicket = typeof CSSStyleSheet === "function" && document.adoptedStyleSheets ? new CSSStyleSheet() : null;
if (hojaTicket) document.adoptedStyleSheets = [...document.adoptedStyleSheets, hojaTicket];
function altoTicket() {
  if (!hojaTicket) return;
  const caja = $("#imprimir"); caja.classList.add("midiendo", "ticket80");
  const mm = Math.ceil(caja.getBoundingClientRect().height * 25.4 / 96) + 10;
  caja.classList.remove("midiendo");
  hojaTicket.replaceSync(`@page ticket { size: 80mm ${Math.max(mm, 60)}mm; margin: 3mm; }`);
}
// Botones "A4" y "80 mm" (detalle del pedido y última venta de feria).
const botonesImp = (numero, extra) => el("span", { className: "imp-formatos" },
  el("button", { type: "button", className: "btn sec chico", textContent: "Imprimir A4", onclick: () => imprimirPedido(numero, "a4", extra) }),
  el("button", { type: "button", className: "btn sec chico", textContent: "Ticket 80 mm", onclick: () => imprimirPedido(numero, "80", extra) }));

// Detalle de una venta: estado, pagos, WhatsApp.
function abrirDetalle(numero) {
  const v = venta(numero), c = cliente(v.cliente), d = $("#d-detalle");
  if (!vistos.has(String(v.numero))) marcarVistos([v.numero]);
  $("#d-detalle-t").textContent = `Pedido N° ${v.numero}`;
  $("#detalle-imp").replaceChildren(botonesImp(v.numero));
  const pasos = el("ol", { className: "pasos" }, ...ESTADOS.map((e, i) => el("li", {},
    el("button", { type: "button", className: i < v.estado ? "hecho" : i === v.estado ? "actual" : "", ariaCurrent: i === v.estado ? "step" : null,
      textContent: i === 1 && pagadoTodo(v) ? "Pagado" : e, onclick: () => cambiarEstado(v, i) }))));
  const msg = `¡Hola, ${c.nombre.split(" ")[0]}! Te escribimos de Aukan3D por tu pedido N° ${v.numero}: ${ESTADOS[v.estado].toLowerCase()}.`
    + (saldo(v) ? ` Saldo a pagar: ${plata(saldo(v), v.moneda)}.` : "");
  $("#detalle-cuerpo").replaceChildren(
    el("p", { className: "sub", textContent: `${fecha(v.fecha)} · ${ORIGEN[v.origen] || "En persona"}${usuario(v.vendedor) ? ` · Vendió ${usuario(v.vendedor).nombre}` : ""} · ${v.entrega}` }),
    el("h3", { textContent: "Estado" }), el("p", { className: "sub chico", textContent: "Tocá un paso para cambiarlo." }), pasos,
    el("div", { className: "detalle-grid" },
      el("div", {}, el("h3", { textContent: "Cliente" }), el("p", { textContent: c.nombre }),
        c.whatsapp ? el("p", { className: "sub", textContent: `WhatsApp ${c.whatsapp}` }) : "", c.zona ? el("p", { className: "sub", textContent: c.zona }) : "",
        c.whatsapp ? el("a", { className: "btn sec chico", href: `https://wa.me/${waDe(c.whatsapp)}?text=${encodeURIComponent(msg)}`, target: "_blank", rel: "noopener", textContent: "Escribirle por WhatsApp" }) : ""),
      el("div", {}, el("h3", { textContent: "Pagos" }),
        ...(v.pagos.length ? v.pagos.map((p) => el("p", { className: "linea", textContent: `${fecha(p.fecha)} · ${medio(p.medio)}` }, el("b", { textContent: plata(p.monto, v.moneda) })))
          : [el("p", { className: "sub", textContent: "Todavía no pagó nada." })]),
        el("p", { className: "linea total-linea", textContent: "Saldo" }, el("b", { className: saldo(v) ? "ambar" : "verde", textContent: saldo(v) ? plata(saldo(v), v.moneda) : "Pagado" })),
        saldo(v) ? el("div", { className: "acciones-pago" }, el("button", { type: "button", className: "btn chico", textContent: "Registrar pago", onclick: () => abrirPago(numero) }),
          API ? el("button", { type: "button", className: "btn sec chico", textContent: "Cobrar con QR", onclick: () => abrirQr(numero) }) : "") : "")),
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
  // Pedido con seña y sin pagos todavía: propone la seña (50 %, igual que la tienda); si no, el saldo.
  const sena = pagoDe.sena && !pagoDe.pagos.length ? Math.ceil(totalVenta(pagoDe) / 2) : 0;
  f.monto.value = sena || saldo(pagoDe);
  $("#pago-saldo").textContent = `Pedido N° ${numero} · saldo ${plata(saldo(pagoDe), pagoDe.moneda)}${sena ? ` · seña ${plata(sena, pagoDe.moneda)}` : ""}`;
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

// Cobrar con QR de Mercado Pago: seña (50 %) o saldo. El cliente escanea y paga; cuando Mercado Pago avisa al servidor,
// el pago queda anotado en el pedido y esta ventana lo muestra (consulta cada 5 s mientras está abierta).
let qrDe = null, qrEspera = 0;
const cargarQr = () => window.qrcode ? Promise.resolve()
  : new Promise((ok, mal) => document.head.append(el("script", { src: "../qrcode.js?v=" + (window.AUKAN_CONFIG?.version || "").slice(1), onload: ok, onerror: mal })));
function abrirQr(numero) {
  qrDe = venta(numero);
  const s = saldo(qrDe), sena = qrDe.sena && !qrDe.pagos.length ? Math.ceil(totalVenta(qrDe) / 2) : 0;
  const opciones = [...(sena && sena < s ? [["Seña 50 %", sena, true]] : []), [qrDe.pagos.length ? "Saldo" : "Total", s, false]];
  $("#qr-sub").textContent = `Pedido N° ${numero} · ${cliente(qrDe.cliente).nombre}`;
  $("#qr-montos").replaceChildren(...opciones.map(([t, m, esSena]) => el("button", { type: "button", className: "btn sec", ariaPressed: "false",
    textContent: `${t} · ${plata(m, qrDe.moneda)}`, onclick: (e) => generarQr(m, esSena, e.currentTarget) })));
  $("#qr-img").hidden = $("#qr-link").hidden = true;
  $("#qr-estado").className = ""; $("#qr-estado").textContent = "";
  $("#d-qr").showModal();
  $("#qr-montos button").click(); // la seña si corresponde; si no, el total
}
async function generarQr(monto, sena, boton) {
  for (const b of $("#qr-montos").children) b.ariaPressed = String(b === boton);
  clearInterval(qrEspera);
  $("#qr-img").hidden = $("#qr-link").hidden = true;
  $("#qr-estado").className = ""; $("#qr-estado").textContent = "Generando el QR…";
  try {
    const r = await llamar("/api/admin/mp/cobro", { numero: qrDe.numero, monto, sena });
    await cargarQr();
    const qr = qrcode(0, "M"); qr.addData(r.link); qr.make();
    $("#qr-img").src = qr.createDataURL(6, 2);
    $("#qr-link").href = r.link;
    $("#qr-img").hidden = $("#qr-link").hidden = false;
    $("#qr-estado").textContent = `Esperando el pago de ${plata(monto, qrDe.moneda)}. Cuando Mercado Pago lo confirme aparece acá y en el pedido.`;
    esperarPagoQr();
  } catch (e) {
    $("#qr-estado").className = "error";
    $("#qr-estado").textContent = { mp: "Mercado Pago no respondió. Revisá la credencial en Administración → Mercado Pago.",
      monto: "El saldo cambió. Cerrá y volvé a abrir el pedido." }[e.message] || "No se pudo generar el QR. Probá de nuevo.";
  }
}
function esperarPagoQr() {
  const antes = qrDe.pagos.length;
  qrEspera = setInterval(async () => {
    if (!$("#d-qr").open) return clearInterval(qrEspera);
    try { await traerServidor(); } catch { return; }
    const v = venta(qrDe.numero);
    if (!v || v.pagos.length <= antes) return;
    clearInterval(qrEspera);
    qrDe = v;
    $("#qr-img").hidden = $("#qr-link").hidden = true;
    $("#qr-estado").className = "pago-ok";
    $("#qr-estado").textContent = `¡Pago recibido! ${plata(v.pagos.at(-1).monto, v.moneda)} por Mercado Pago. El pedido quedó en ${nombreEstado(v)}.`;
    repintar();
  }, 5000);
}
$("#d-qr").addEventListener("close", () => { clearInterval(qrEspera); if (qrDe && $("#d-detalle").open) abrirDetalle(qrDe.numero); });

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
  reservarNumero();
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
  if (API && reservado == null) { reservarNumero(); return error("Esperá un segundo: estamos pidiendo el número de venta."); }
  const v = { numero: numeroVenta(), fecha: new Date().toISOString(), origen: "local", cliente: fv.cliente.value, vendedor: fv.vendedor.value,
    moneda: fv.moneda.value, items: itemsVenta.map((i) => ({ ...i })), pagos: [], estado: 0, sena: true, entrega: fv.entrega.value, nota: fv.nota.value.trim(),
    comision: usuario(fv.vendedor.value)?.comision ?? 0 };
  const pago = Math.round(+fv.pago.value || 0);
  if (pago < 0 || pago > totalVenta(v)) { if (API) reservado = v.numero; else db.ultimo--; return error(`El pago tiene que ser entre 0 y ${plata(totalVenta(v), v.moneda)}.`); }
  if (pago) { registrarPago(v, pago, fv.medio.value); v.sena = pago < totalVenta(v); }
  // Lo que había listo en stock se descuenta; lo demás se imprime a pedido.
  for (const i of v.items) { const p = db.productos.find((x) => x.id === i.id); if (p) p.stock = Math.max((p.stock || 0) - i.cant, 0); }
  db.ventas.unshift(v);
  itemsVenta = null;
  guardar(); repintar();
  avisar(`Venta N° ${v.numero} guardada.`);
});

// --- Modo feria: punto de venta simple con control de caja ---
// Cada cobro es una venta pagada y entregada (origen "feria"), a "Consumidor final", ligada a la caja abierta.
const ticket = new Map(); // id de producto -> cantidad
let feriaCat = "", feriaMedio = "";
const productoDe = (id) => db.productos.find((p) => p.id === id);
const totalTicket = () => [...ticket].reduce((s, [id, n]) => s + (productoDe(id)?.precio || 0) * n, 0);
const ORIGEN = { web: "Tienda web", local: "En persona", feria: "Feria" };

$("#f-abrir").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, fondo = Math.round(+f.fondo.value || 0);
  if (fondo < 0) { $("#abrir-error").textContent = "El efectivo inicial no puede ser negativo."; return; }
  db.cajas.push({ id: "k" + Date.now().toString(36), abierta: new Date().toISOString(), cerrada: null, fondo, vendedor: f.vendedor.value, movimientos: [], contado: null });
  guardar(); PINTAR.feria();
  avisar("Caja abierta. ¡Buena feria!");
});

function sumarAlTicket(id, n) {
  const p = productoDe(id), cant = Math.min(Math.max((ticket.get(id) || 0) + n, 0), 99);
  if (!p) return;
  if (cant) ticket.set(id, cant); else ticket.delete(id);
  pintarTicket(); marcarGrilla();
}
// Solo cambia el numerito de cada tarjeta (sin volver a dibujar la grilla ni mover el scroll).
function marcarGrilla() {
  for (const b of document.querySelectorAll("#pos-grilla .prod")) {
    const n = ticket.get(b.dataset.id) || 0, i = b.querySelector(".cant-en");
    i.hidden = !n; i.textContent = String(n);
  }
}
function pintarGrilla() {
  const q = normalizar($("#pos-q").value.trim());
  const lista = db.productos.filter((p) => p.precio > 0 && (!feriaCat || (feriaCat === "stock" ? p.stock > 0 : p.categoria === feriaCat))
    && (!q || normalizar(`${p.nombre} ${p.subcategoria} ${p.id}`).includes(q)));
  $("#pos-grilla").replaceChildren(...lista.slice(0, 120).map((p) => {
    const src = foto(p.foto), n = ticket.get(p.id);
    return el("button", { type: "button", className: "prod", dataset: { id: p.id }, ariaLabel: `Agregar ${p.nombre}, ${plata(p.precio)}`, onclick: () => sumarAlTicket(p.id, 1) },
      src ? el("img", { src, alt: "", loading: "lazy", width: 150, height: 150 }) : el("i", { className: "sin-foto", textContent: "Sin foto" }),
      el("span", {}, p.nombre, el("b", { textContent: plata(p.precio) }), p.stock ? el("small", { className: "stock-en", textContent: `${p.stock} en stock` }) : ""),
      el("i", { className: "cant-en", ariaHidden: "true", textContent: String(n || 0), hidden: !n }));
  }), lista.length ? "" : el("p", { className: "vacio caja", textContent: "No hay productos con precio que coincidan." }));
}
function pintarTicket() {
  const total = totalTicket(), cant = [...ticket.values()].reduce((s, n) => s + n, 0);
  $("#pos-items").replaceChildren(...[...ticket].map(([id, n]) => {
    const p = productoDe(id);
    return el("div", { className: "pos-linea" }, el("span", { textContent: p.nombre, title: p.nombre }),
      el("span", { className: "stock" },
        el("button", { type: "button", className: "paso", textContent: "−", ariaLabel: `Quitar uno de ${p.nombre}`, onclick: () => sumarAlTicket(id, -1) }),
        el("b", { textContent: String(n) }),
        el("button", { type: "button", className: "paso", textContent: "+", ariaLabel: `Sumar uno de ${p.nombre}`, onclick: () => sumarAlTicket(id, 1) })),
      el("small", { textContent: `${n} × ${plata(p.precio)} = ${plata(p.precio * n)}` }));
  }), ticket.size ? "" : el("p", { className: "vacio", textContent: "Tocá un producto para agregarlo." }));
  $("#pos-total").textContent = plata(total);
  $("#pos-cobrar").textContent = total ? `Cobrar ${plata(total)}` : "Cobrar";
  $("#pos-cobrar").disabled = !total;
  $("#pos-barra").textContent = cant ? `Ticket · ${cant} ${cant === 1 ? "artículo" : "artículos"} · ${plata(total)}` : "Ver ticket";
  $("#pos-vaciar").hidden = !ticket.size;
  // Medios de pago y vuelto.
  if (!db.medios.some((m) => m.id === feriaMedio)) feriaMedio = db.medios.find((m) => esEfectivo(db, m.id))?.id || db.medios[0]?.id || "";
  $("#pos-medios").replaceChildren(...db.medios.map((m) => el("button", { type: "button", className: "chip", textContent: m.nombre,
    ariaPressed: String(m.id === feriaMedio), onclick: () => { feriaMedio = m.id; pintarTicket(); } })));
  const efectivo = esEfectivo(db, feriaMedio);
  $("#pos-efectivo").hidden = !efectivo;
  const billetes = [...new Set([100, 200, 500, 1000, 2000].map((b) => Math.ceil(total / b) * b))].filter((b) => b > total).slice(0, 3);
  $("#pos-atajos").replaceChildren(...billetes.map((b) => el("button", { type: "button", className: "chip", textContent: plata(b),
    onclick: () => { $("#pos-recibido").value = b; pintarVuelto(); } })));
  pintarVuelto();
  $("#pos-error").textContent = "";
  pintarResumenCaja();
}
function pintarVuelto() {
  const total = totalTicket(), recibido = Math.round(+$("#pos-recibido").value || 0);
  $("#pos-vuelto").className = "pos-vuelto" + (recibido && recibido < total ? " rojo" : " verde");
  $("#pos-vuelto").textContent = !recibido || !total ? "" : recibido < total ? `Faltan ${plata(total - recibido)}` : `Vuelto: ${plata(recibido - total)}`;
}
$("#pos-recibido").addEventListener("input", pintarVuelto);
$("#pos-q").addEventListener("input", pintarGrilla);
$("#pos-vaciar").addEventListener("click", () => { ticket.clear(); $("#pos-recibido").value = ""; pintarTicket(); marcarGrilla(); });
$("#pos-barra").addEventListener("click", () => $("#pos-ticket").scrollIntoView({ behavior: "smooth" }));

function consumidorFinal() {
  let c = db.clientes.find((x) => x.id === "cf");
  if (!c) { c = { id: "cf", nombre: "Consumidor final", whatsapp: "", email: "", zona: "" }; db.clientes.push(c); }
  return c;
}
$("#pos-cobrar").addEventListener("click", () => {
  const caja = cajaAbierta(db), total = totalTicket();
  if (!caja || !total) return;
  const recibido = Math.round(+$("#pos-recibido").value || 0);
  if (esEfectivo(db, feriaMedio) && recibido && recibido < total) { $("#pos-error").textContent = `Faltan ${plata(total - recibido)} para cubrir el total.`; return; }
  // Sin conexión no hay número del servidor: la venta sale con uno propio (F + hora) y se sube cuando vuelve la señal.
  const numero = !API ? nuevoNumero(db) : reservado != null ? numeroVenta() : "F" + Date.now().toString(36).toUpperCase();
  const ahora = new Date().toISOString();
  const v = { numero, fecha: ahora, origen: "feria", cliente: consumidorFinal().id, vendedor: caja.vendedor, moneda: "UYU",
    items: [...ticket].map(([id, cant]) => { const p = productoDe(id); return { id, nombre: p.nombre, precio: p.precio, cant }; }),
    pagos: [{ fecha: ahora, medio: feriaMedio, monto: total }], estado: 4, sena: false, entrega: "En la feria", nota: "",
    comision: usuario(caja.vendedor)?.comision ?? 0, caja: caja.id };
  for (const i of v.items) { const p = productoDe(i.id); if (p) p.stock = Math.max((p.stock || 0) - i.cant, 0); }
  db.ventas.unshift(v);
  const vuelto = recibido > total ? recibido - total : 0;
  ticket.clear(); $("#pos-recibido").value = "";
  guardar(); reservarNumero(); pintarTicket(); pintarGrilla();
  $("#pos-ultima").replaceChildren(el("span", { textContent: `Última venta N° ${v.numero}` }), botonesImp(v.numero, { recibido }));
  avisar(`Venta N° ${v.numero}: ${plata(total)} con ${medio(feriaMedio)}${vuelto ? ` · vuelto ${plata(vuelto)}` : ""}.`, () => {
    db.ventas.splice(db.ventas.indexOf(v), 1);
    for (const i of v.items) { const p = productoDe(i.id); if (p) p.stock = (p.stock || 0) + i.cant; }
  });
  scrollTo({ top: 0, behavior: "smooth" });
});

function lineasCaja(caja) {
  const r = resumenCaja(db, caja), fila = (t, v, cls = "") => el("p", { className: cls }, el("span", { textContent: t }), el("b", { textContent: v }));
  return [fila("Ventas", `${r.ventas.length} · ${plata(r.total)}`),
    ...Object.entries(r.porMedio).map(([m, n]) => fila(`  ${medio(m)}`, plata(n))),
    fila("Efectivo inicial", plata(caja.fondo)),
    r.ingresos ? fila("Ingresos de efectivo", plata(r.ingresos)) : "", r.retiros ? fila("Retiros de efectivo", "− " + plata(r.retiros)) : "",
    fila("Efectivo que tendría que haber", plata(r.esperado), "total-linea")];
}
function pintarResumenCaja() {
  const caja = cajaAbierta(db);
  if (caja) $("#pos-resumen").replaceChildren(el("p", {}, el("span", { textContent: `Caja abierta ${new Date(caja.abierta).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })} · ${usuario(caja.vendedor)?.nombre || ""}` })), ...lineasCaja(caja));
}

$("#caja-mov").addEventListener("click", () => { const f = $("#f-mov"); f.reset(); $("#mov-error").textContent = ""; $("#d-mov").showModal(); });
$("#f-mov").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const f = e.target, monto = Math.round(+f.monto.value), caja = cajaAbierta(db);
  if (!(monto > 0)) { e.preventDefault(); $("#mov-error").textContent = "Poné un monto mayor a 0."; return; }
  if (!caja) return;
  caja.movimientos.push({ fecha: new Date().toISOString(), tipo: f.tipo.value, monto, nota: f.nota.value.trim() });
  guardar(); PINTAR.feria();
  avisar(f.tipo.value === "retiro" ? `Retiro de ${plata(monto)} anotado.` : `Ingreso de ${plata(monto)} anotado.`);
});

$("#caja-cerrar").addEventListener("click", () => {
  const caja = cajaAbierta(db), f = $("#f-cerrar");
  if (!caja) return;
  f.reset();
  $("#cerrar-resumen").replaceChildren(el("div", { className: "pos-resumen" }, ...lineasCaja(caja)));
  $("#cerrar-dif").textContent = $("#cerrar-error").textContent = "";
  $("#d-cerrar").showModal();
});
$("#f-cerrar").contado.addEventListener("input", (e) => {
  const caja = cajaAbierta(db), dif = Math.round(+e.target.value || 0) - resumenCaja(db, caja).esperado;
  $("#cerrar-dif").className = "pos-vuelto " + (dif === 0 ? "verde" : dif < 0 ? "rojo" : "ambar");
  $("#cerrar-dif").textContent = e.target.value === "" ? "" : dif === 0 ? "La caja cierra justa." : dif < 0 ? `Faltan ${plata(-dif)}.` : `Sobran ${plata(dif)}.`;
});
$("#f-cerrar").addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const f = e.target, caja = cajaAbierta(db);
  if (f.contado.value === "" || +f.contado.value < 0) { e.preventDefault(); $("#cerrar-error").textContent = "Contá el efectivo y poné cuánto hay."; return; }
  caja.contado = Math.round(+f.contado.value);
  caja.cerrada = new Date().toISOString();
  ticket.clear();
  guardar(); PINTAR.feria();
  const r = resumenCaja(db, caja);
  avisar(`Caja cerrada: ${plural(r.ventas.length, "venta")} por ${plata(r.total)}.${r.diferencia ? (r.diferencia < 0 ? ` Faltaron ${plata(-r.diferencia)}.` : ` Sobraron ${plata(r.diferencia)}.`) : " Cerró justa."}`);
});

PINTAR.feria = () => {
  const caja = cajaAbierta(db);
  $("#f-abrir").hidden = !!caja;
  $("#pos").hidden = $("#feria-botones").hidden = !caja;
  if (!caja) {
    const f = $("#f-abrir");
    f.vendedor.replaceChildren(...db.usuarios.map((u) => el("option", { value: u.id, textContent: u.nombre })));
    $("#abrir-error").textContent = "";
  } else {
    const cats = [...new Set(db.productos.filter((p) => p.precio > 0).map((p) => p.categoria))].sort();
    $("#pos-cats").replaceChildren(...[["", "Todo"], ["stock", "Con stock"], ...cats.map((c) => [c, c])].map(([v, t]) =>
      el("button", { type: "button", className: "chip", textContent: t, ariaPressed: String(v === feriaCat), onclick: () => { feriaCat = v; PINTAR.feria(); } })));
    for (const id of [...ticket.keys()]) if (!productoDe(id)) ticket.delete(id);
    pintarGrilla(); pintarTicket(); reservarNumero();
  }
  const viejas = db.cajas.filter((c) => c.cerrada).sort((a, b) => b.abierta.localeCompare(a.abierta)).slice(0, 10);
  $("#cajas-viejas").replaceChildren(viejas.length ? el("div", { className: "cajas-viejas" }, el("h2", { textContent: "Cajas anteriores" }),
    tabla(["Fecha", "Vendió", "#Ventas", "#Total", "#Contado", "#Diferencia"], viejas.map((c) => {
      const r = resumenCaja(db, c);
      return el("tr", {}, td(fecha(c.abierta)), td(usuario(c.vendedor)?.nombre || "—"), td(String(r.ventas.length), "num"), td(plata(r.total), "num"),
        td(plata(c.contado), "num"), td(r.diferencia ? (r.diferencia > 0 ? "+ " : "− ") + plata(Math.abs(r.diferencia)) : "Justa", "num " + (r.diferencia < 0 ? "rojo" : r.diferencia > 0 ? "ambar" : "verde")));
    }), "")) : "");
};

// --- Cuentas pendientes ---
PINTAR.pendientes = () => {
  const lista = db.ventas.filter(saldo).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const total = porMoneda(lista, saldo), viejas = lista.filter((v) => diasDesde(v.fecha) > 15);
  $("#kpis-deuda").replaceChildren(
    kpi("Por cobrar", plata(total.UYU), total.USD ? plata(total.USD, "USD") : plural(lista.length, "venta"), "ambar"),
    kpi("Hace más de 15 días", String(viejas.length), viejas.length ? plata(porMoneda(viejas, saldo).UYU) : "Nada atrasado"),
    kpi("Listos sin pagar", String(lista.filter((v) => v.estado >= 3).length), "Cobrar al entregar"));
  $("#pendientes-lista").replaceChildren(tabla([...CAB_VENTAS, "Hace", ""], lista.map((v) => {
    const c = cliente(v.cliente);
    const msg = `¡Hola, ${c.nombre.split(" ")[0]}! Te recordamos que del pedido N° ${v.numero} de Aukan3D queda un saldo de ${plata(saldo(v), v.moneda)}. ¡Gracias!`;
    return filaVenta(v, [td(plural(diasDesde(v.fecha), "día"), diasDesde(v.fecha) > 15 ? "ambar" : ""), td(el("span", { className: "acciones" },
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
  if (fotoNueva && API) { p.foto = fotoNueva; p.fotoV = (p.fotoV || 0) + 1; } // el servidor la publica para la tienda
  else if (fotoNueva) {
    // Demo: la foto nueva se baja con el nombre que usa el CSV, para subirla a fotos/ del sitio.
    const nombre = `${p.id}-${slug(p.nombre)}.webp`;
    el("a", { href: fotoNueva, download: nombre }).click();
    p.foto = fotoNueva; p.fotoArchivo = "fotos/" + nombre;
  }
  if (!productoEdit) db.productos.push(p);
  guardar(); repintar();
  avisar(fotoNueva && !API ? "Producto guardado. La foto se descargó para subirla a la carpeta fotos." : "Producto guardado.");
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
      el("p", { className: "sub chico", textContent: `Usado en ${plural(usos(m.id), "venta")}` }),
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
$("#usuarios-mes").value = mesActual();
$("#usuarios-mes").addEventListener("input", () => PINTAR.usuarios());
PINTAR.usuarios = () => {
  const mes = $("#usuarios-mes").value || mesActual();
  const lista = comisiones(db, mes);
  const total = suma(lista, (u) => u.comision.UYU);
  $("#usuarios-lista").replaceChildren(tabla(["Usuario", "Rol", "#Comisión", "#Ventas", "#Vendido", "#A liquidar", ""], lista.map((u) => el("tr", {},
    td(el("b", { textContent: u.nombre })), td(u.rol), td(`${u.porcentaje}%`, "num"), td(String(u.cantidad), "num"),
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

// --- Base de datos (solo dev) ---
const MB = (b) => (b < 1048576 ? Math.max(1, Math.round(b / 1024)).toLocaleString("es-UY") + " KB" : (b / 1048576).toLocaleString("es-UY", { maximumFractionDigits: 1 }) + " MB");
const NOMBRE_COL = { productos: "Productos", clientes: "Clientes", ventas: "Ventas", gastos: "Gastos", medios: "Medios de pago", usuarios: "Usuarios", cajas: "Cajas de feria" };
PINTAR.base = async () => {
  const caja = $("#base-estado");
  try {
    const r = await llamar("/api/admin/estado");
    const bloque = (titulo, b) => {
      if (!b) return el("div", { className: "caja" }, el("h2", { textContent: titulo }), el("p", { className: "sub", textContent: "No está conectada." }));
      const regs = suma(b.colecciones, (c) => c.n), pct = b.tamano != null ? (b.tamano / r.limite) * 100 : null;
      return el("div", { className: "caja" }, el("h2", { textContent: titulo }),
        el("div", { className: "kpis" },
          kpi("Tamaño", b.tamano != null ? MB(b.tamano) : "—", pct != null ? `${pct.toLocaleString("es-UY", { maximumFractionDigits: 2 })} % de 500 MB` : "", pct > 80 ? "rojo" : pct > 50 ? "ambar" : "verde"),
          kpi("Registros", regs.toLocaleString("es-UY"), `${suma(b.colecciones, (c) => c.borrados)} borrados guardados`),
          kpi("Fotos subidas", String(suma(b.colecciones, (c) => c.fotos)), "Desde el panel")),
        barras([...b.colecciones].sort((a, c) => c.bytes - a.bytes).map((c) => [`${NOMBRE_COL[c.col] || c.col} (${c.n})`, c.bytes, MB(c.bytes)])));
    };
    caja.replaceChildren(el("div", { className: "grilla" }, bloque("Base real", r.real), bloque("Base de pruebas", r.pruebas)),
      el("p", { className: "sub chico", textContent: `Actualizado a las ${new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}` }));
  } catch (e) { caja.replaceChildren(el("p", { className: "error", textContent: "No pudimos traer el uso de la base. Revisá la conexión." })); }
};
$("#base-actualizar").addEventListener("click", () => PINTAR.base());

// --- Mercado Pago (admin y dev ven lo mismo: la credencial vive en el servidor, en la base real) ---
const ESTADO_MP = { approved: ["Aprobado", "e3"], pending: ["Pendiente", "e0"], in_process: ["En revisión", "e0"], authorized: ["Autorizado", "e1"],
  rejected: ["Rechazado", "mal"], cancelled: ["Cancelado", "e4"], refunded: ["Devuelto", "e4"], charged_back: ["Contracargo", "mal"] };
const MEDIO_MP = { account_money: "Dinero en cuenta", visa: "Visa", master: "Mastercard", oca: "OCA", debvisa: "Visa débito", debmaster: "Mastercard débito", abitab: "Abitab", redpagos: "Redpagos" };
function pintarMp(r) {
  $("#mp-quitar").hidden = r.origen !== "panel";
  const estado = !r.configurado ? kpi("Estado", "Sin configurar", "Cargá la credencial abajo", "ambar")
    : kpi("Estado", r.conectado ? "Conectado" : "Sin conexión", r.conectado ? "Mercado Pago acepta la credencial" : "Mercado Pago no la acepta: cargala de nuevo", r.conectado ? "verde" : "rojo");
  $("#mp-estado").replaceChildren(el("div", { className: "kpis" }, estado, ...(r.configurado ? [
    kpi("Modo", r.modo === "prueba" ? "Prueba" : "Producción", r.modo === "prueba" ? "Cobros de mentira, para probar" : "Cobros reales", r.modo === "prueba" ? "ambar" : "verde"),
    kpi("Cuenta", r.cuenta ? r.cuenta.nombre || String(r.cuenta.id) : "—", r.cuenta ? `N° ${r.cuenta.id}${r.cuenta.pais ? " · " + r.cuenta.pais : ""}` : "", "largo"),
    kpi("Credencial", "…" + r.final, r.origen === "panel" ? `Cargada desde el panel${r.actualizado ? " el " + fecha(new Date(r.actualizado).toISOString()) : ""}` : "Cargada en el servidor")] : [])));
  pintarPagosMp(r.pagos || []);
}
// Cada cobro se cruza con su pedido (referencia AUKAN-N°); "Registrar" lo anota como pago con el id de Mercado Pago, una sola vez.
function pintarPagosMp(pagos) {
  const medioMp = db.medios.find((m) => /mercado ?pago/i.test(m.nombre))?.id || "m3";
  const filas = pagos.map((x) => {
    const numero = (x.referencia.match(/^AUKAN-(\w+)$/) || [])[1], v = numero && venta(numero);
    const [txt, tono] = ESTADO_MP[x.estado] || [x.estado, "e4"];
    let accion = "—";
    if (v && v.pagos.some((p) => p.mp === x.id)) accion = el("span", { className: "sub chico", textContent: "Registrado" });
    else if (v && x.estado === "approved" && x.moneda === v.moneda && saldo(v) > 0)
      accion = el("button", { type: "button", className: "btn sec chico", textContent: `Registrar en N° ${numero}`, onclick: () => {
        registrarPago(v, Math.min(Math.round(x.monto), saldo(v)), medioMp, x.fecha);
        v.pagos.at(-1).mp = x.id;
        guardar(); pintarPagosMp(pagos); avisar(`Pago de Mercado Pago registrado en el pedido N° ${numero}.`);
      } });
    else if (v && x.estado === "approved") accion = el("span", { className: "sub chico", textContent: "El pedido no tiene saldo" });
    return el("tr", {}, td(fecha(x.fecha)), td(numero ? `N° ${numero}${v ? "" : " (no está en esta base)"}` : x.referencia || "Sin pedido"),
      td(plata(x.monto, x.moneda), "num"), td(MEDIO_MP[x.medio] || x.medio || "—"), td(el("span", { className: `pill ${tono}`, textContent: txt, title: x.detalle })), td(accion, "num"));
  });
  $("#mp-pagos").replaceChildren(tabla(["Fecha", "Pedido", "#Monto", "Medio", "Estado", ""], filas, "Todavía no hay cobros en esta cuenta.", "t-mp"));
}
PINTAR.mp = async () => {
  try { pintarMp(await llamar("/api/admin/mp")); }
  catch (e) { if (e.message !== "sesion") $("#mp-estado").replaceChildren(el("p", { className: "error", textContent: "No pudimos consultar Mercado Pago. Revisá la conexión y tocá Actualizar." })); }
};
$("#mp-actualizar").addEventListener("click", () => PINTAR.mp());
const ERROR_MP = { formato: "Eso no parece un Access Token: empieza con TEST- o APP_USR-.", rechazado: "Mercado Pago no aceptó esa credencial. Revisá que sea el Access Token y no la Public Key." };
$("#f-mp").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, token = f.token.value.trim(), boton = f.querySelector("[type=submit]");
  if (!token) { $("#mp-error").textContent = "Pegá el Access Token."; return; }
  boton.disabled = true; $("#mp-error").textContent = "Probando con Mercado Pago…";
  try { pintarMp(await llamar("/api/admin/mp", { token })); f.reset(); $("#mp-error").textContent = ""; avisar("Credencial guardada: Mercado Pago la aceptó."); }
  catch (err) { $("#mp-error").textContent = ERROR_MP[err.message] || "No se pudo guardar. Probá de nuevo."; }
  finally { boton.disabled = false; }
});
// Quitar pide un segundo toque: sin credencial la tienda deja de ofrecer el pago con Mercado Pago.
let quitarMpT = 0;
$("#mp-quitar").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (!quitarMpT) { b.textContent = "Tocá de nuevo para quitarla"; quitarMpT = setTimeout(() => { quitarMpT = 0; b.textContent = "Quitar credencial"; }, 4000); return; }
  clearTimeout(quitarMpT); quitarMpT = 0; b.textContent = "Quitar credencial";
  try { pintarMp(await llamar("/api/admin/mp", { token: "" })); avisar("Credencial quitada."); } catch { avisar("No se pudo quitar. Probá de nuevo."); }
});

// --- Reportes y gastos ---
// Período del reporte: día, mes, trimestre, semestre, año o entre fechas; las flechas viajan de a un período.
const rep = { tipo: "mes", ancla: hoy() };
const MESES_DE = { mes: 1, trimestre: 3, semestre: 6, anio: 12 };
function rangoReporte() {
  if (rep.tipo === "rango") {
    const d = $("#rep-desde").value || mesActual() + "-01", h = $("#rep-hasta").value || hoy();
    return d <= h ? [d, h] : [h, d];
  }
  if (rep.tipo === "dia") return [rep.ancla, rep.ancla];
  const n = MESES_DE[rep.tipo], [a, m] = rep.ancla.split("-").map(Number);
  const ini = new Date(a, Math.floor((m - 1) / n) * n, 1), fin = new Date(ini.getFullYear(), ini.getMonth() + n, 0);
  return [diaLocal(ini), diaLocal(fin)];
}
function etiquetaReporte([d, h]) {
  const f = (x, o) => new Date(x + "T12:00").toLocaleDateString("es-UY", o);
  const a = d.slice(0, 4), m = +d.slice(5, 7);
  return { dia: f(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), mes: nombreMes(d.slice(0, 7)),
    trimestre: `${Math.ceil(m / 3)}.º trimestre ${a}`, semestre: `${m <= 6 ? "1.er" : "2.º"} semestre ${a}`, anio: a,
    rango: `${fecha(d + "T12:00")} al ${fecha(h + "T12:00")}` }[rep.tipo];
}
function moverReporte(paso) {
  const d = new Date(rep.ancla + "T12:00");
  if (rep.tipo === "dia") d.setDate(d.getDate() + paso); else { d.setDate(1); d.setMonth(d.getMonth() + paso * MESES_DE[rep.tipo]); }
  rep.ancla = diaLocal(d); PINTAR.reportes();
}
$("#rep-tipo").addEventListener("input", (e) => {
  rep.tipo = e.target.value;
  if (rep.tipo === "rango" && !$("#rep-desde").value) [$("#rep-desde").value, $("#rep-hasta").value] = [mesActual() + "-01", hoy()];
  PINTAR.reportes();
});
$("#rep-ant").addEventListener("click", () => moverReporte(-1));
$("#rep-sig").addEventListener("click", () => moverReporte(1));
$("#rep-hoy").addEventListener("click", () => { rep.ancla = hoy(); PINTAR.reportes(); });
for (const id of ["#rep-desde", "#rep-hasta"]) $(id).addEventListener("input", () => PINTAR.reportes());
PINTAR.reportes = () => {
  const [desde, hasta] = rangoReporte(), r = resumenRango(db, desde, hasta);
  const rango = rep.tipo === "rango";
  $("#rep-nav").classList.toggle("solo-etiqueta", rango);
  $("#rep-rango").hidden = !rango;
  $("#rep-etiqueta").textContent = etiquetaReporte([desde, hasta]);
  $("#rep-sig").disabled = !rango && hasta >= hoy();
  const usd = r.cobrado.USD || r.gastado.USD;
  $("#kpis-reporte").replaceChildren(
    kpi("Vendido", plata(r.vendido.UYU), r.vendido.USD ? plata(r.vendido.USD, "USD") : plural(r.ventas.length, "venta")),
    kpi("Cobrado", plata(r.cobrado.UYU), r.cobrado.USD ? plata(r.cobrado.USD, "USD") : "Pesos", "verde"),
    kpi("Gastos", plata(r.gastado.UYU), r.gastado.USD ? plata(r.gastado.USD, "USD") : plural(r.gastos.length, "gasto"), "rojo"),
    kpi("Resultado", plata(r.resultado.UYU), usd ? `${plata(r.resultado.USD, "USD")} en dólares` : "Cobrado menos gastos", r.resultado.UYU >= 0 ? "verde" : "rojo"));
  // Un día: la lista de sus ventas. Hasta 2 meses: por día. Más largo: por mes.
  const dias = (new Date(hasta) - new Date(desde)) / 864e5 + 1;
  if (dias === 1) {
    $("#serie-t").textContent = "Ventas del día"; $("#serie-sub").textContent = plural(r.ventas.length, "venta");
    $("#rep-serie").replaceChildren(tabla(CAB_VENTAS, r.ventas.map((v) => filaVenta(v)), "No hubo ventas este día.", "t-ventas"));
  } else {
    const porMes = dias > 62, serie = serieVentas(r.ventas, desde, hasta, porMes ? 7 : 10);
    $("#serie-t").textContent = porMes ? "Ventas por mes" : "Ventas por día"; $("#serie-sub").textContent = "Pesos vendidos";
    const nombre = (k) => (porMes ? nombreMes(k) : new Date(k + "T12:00").toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "numeric" }));
    $("#rep-serie").replaceChildren(barras(serie.map(([k, n]) => [nombre(k), n, n ? plata(n) : "—"])));
  }
  const top = masVendidos(r.ventas);
  $("#mas-vendidos").replaceChildren(tabla(["Producto", "#Cant.", "#Pesos"], top.map((x) => el("tr", {}, td(x.nombre), td(String(x.cant), "num"), td(plata(x.pesos), "num"))),
    "Sin ventas en el período."));
  const sumar = (lista, clave, valor) => { const o = {}; for (const x of lista) { const k = clave(x); if (k != null) o[k] = (o[k] || 0) + valor(x); } return o; };
  const barrasDe = (o) => barras(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n, plata(n)]));
  const pesos = r.ventas.filter((v) => v.moneda === "UYU");
  const cuantas = sumar(r.ventas, (v) => ORIGEN[v.origen] || "En persona", () => 1);
  // Por tipo: la barra es en pesos, pero un tipo con solo ventas en dólares igual aparece.
  const enPesos = sumar(pesos, (v) => ORIGEN[v.origen] || "En persona", totalVenta);
  const enUsd = sumar(r.ventas.filter((v) => v.moneda === "USD"), (v) => ORIGEN[v.origen] || "En persona", totalVenta);
  $("#por-origen").replaceChildren(barras(Object.keys(cuantas).map((k) => [k, enPesos[k] || 0]).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [k, n, [n || !enUsd[k] ? plata(n) : "", enUsd[k] ? plata(enUsd[k], "USD") : "", plural(cuantas[k], "venta")].filter(Boolean).join(" · ")])));
  $("#por-medio").replaceChildren(barrasDe(sumar(r.pagos.filter((p) => p.moneda === "UYU"), (p) => medio(p.medio), (p) => p.monto)));
  const porCat = {};
  for (const v of pesos) for (const i of v.items) { const c = db.productos.find((p) => p.id === i.id)?.categoria || "Otros"; porCat[c] = (porCat[c] || 0) + i.precio * i.cant; }
  $("#por-cat").replaceChildren(barrasDe(porCat));
  $("#gastos-lista").replaceChildren(tabla(["Fecha", "Concepto", "#Monto", ""], [...r.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((g) => el("tr", {},
    td(fecha(g.fecha + "T12:00")), td(el("span", {}, g.concepto, el("small", { className: "fecha-movil", textContent: fecha(g.fecha + "T12:00") }))), td(plata(g.monto, g.moneda), "num"),
    td(el("button", { type: "button", className: "btn sec chico peligro", textContent: "Borrar", ariaLabel: `Borrar gasto ${g.concepto}`, onclick: () => borrarGasto(g) })))),
  "No hay gastos cargados en este período.", "t-gastos"));
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

// Misma versión que la tienda (config.js), para saber qué está publicado.
for (const e of document.querySelectorAll("[data-version]")) e.textContent = window.AUKAN_CONFIG?.version || "";
if (API) {
  for (const e of document.querySelectorAll("[data-demo]")) e.hidden = true;
  $("#user-sub").textContent = PRUEBAS ? "Base de PRUEBAS" : "Conectado a la base de datos";
  document.documentElement.classList.toggle("pruebas", PRUEBAS);
  $("#banda-pruebas").hidden = !PRUEBAS;
  for (const b of document.querySelectorAll("[data-entorno]")) {
    b.textContent = PRUEBAS ? "Volver a producción" : "Pasar a pruebas";
    b.addEventListener("click", () => cambiarEntorno(!PRUEBAS));
  }
  if (conSesion()) traerServidor().then(mostrarApp, (e) => { if (e.message !== "sesion") cerrarSesion("No pudimos traer los datos. Revisá la conexión y probá de nuevo."); });
  else mostrarApp();
} else {
  if (traerPedidosWeb()) guardar();
  mostrarApp();
}
