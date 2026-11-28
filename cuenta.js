// Panel de cuenta (vista previa sin servidor).
// Datos y pedidos: ver leerPerfil/guardarPedido en catalogo.js.

function pintarCuenta() {
  const p = leerPerfil();
  const activo = !!p?.activo;
  $("#ver-cuenta").textContent = activo ? `Hola, ${p.nombre.split(" ")[0]}` : "Mi cuenta";
  pintarAvisos();
  $("#cuenta-forms").hidden = activo;
  $("#invitado").hidden = activo;
  if (activo) {
    const fd = $("#form-datos");
    for (const k of ["nombre", "whatsapp", "email", "departamento", "ciudad", "direccion"]) fd[k].value = p[k] || "";
    elegirBarrios(p.barrio);
    pintarPedidos();
  }
  // Completa el formulario del pedido con los datos de la cuenta.
  const f = $("#checkout");
  for (const k of ["nombre", "whatsapp", "email"]) if (activo && !f[k].value) f[k].value = p[k];
}

function elegirTab(registro) {
  $("#tab-registro").ariaSelected = String(registro);
  $("#tab-ingreso").ariaSelected = String(!registro);
  $("#form-registro").hidden = !registro;
  $("#form-ingreso").hidden = registro;
}

const ESTADOS = ["Recibido", "Seña pagada", "En impresión", "Listo para entregar", "Entregado"];
// Pagos que registró Aukan3D (llegan del servidor). Sin servidor no hay datos y no se muestra nada.
const pagadoDe = (p) => (p.pagos || []).reduce((t, x) => t + (+x.monto || 0), 0);
function resumenPago(p) {
  if (!p.pagos) return null;
  const pagado = pagadoDe(p), saldo = Math.max(0, p.total - pagado);
  if (!pagado) return { texto: "Todavía no registramos tu pago", clase: "pend" };
  if (!saldo) return { texto: `Pagado en total: ${pesos(pagado)}`, clase: "ok" };
  return { texto: `${p.sena ? "Seña pagada" : "Pagaste"}: ${pesos(pagado)} · Saldo ${pesos(saldo)}`, clase: "parcial" };
}
const lineaPago = (x) => [new Date(x.fecha).toLocaleDateString("es-UY"), x.mp ? `Mercado Pago · Operación N° ${x.mp}` : "Pago registrado por Aukan3D", pesos(+x.monto || 0)];
const fechaCorta = (iso) => new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short", year: "numeric" });
function tarjetaPedido(p) {
  const pasos = ESTADOS.map((e, i) => (i === 1 && !p.sena ? "Pagado" : e));
  const entregado = p.estado >= ESTADOS.length - 1;
  return el("article", { className: "pedido" },
    el("div", { className: "pedido-cab" },
      el("strong", { textContent: `Pedido N° ${p.numero}` }),
      el("span", { textContent: fechaCorta(p.fecha) })),
    el("ul", { className: "pedido-items" }, ...p.items.map((i) => el("li", { textContent: `${i.cant} x ${i.nombre}` }))),
    entregado ? "" : el("ol", { className: "pasos", ariaLabel: `Estado: ${pasos[p.estado]}` },
      ...pasos.map((t, i) => el("li", { textContent: t, className: i < p.estado ? "hecho" : i === p.estado ? "actual" : "",
        ariaCurrent: i === p.estado ? "step" : null }))),
    infoPago(p),
    el("div", { className: "pedido-pie" },
      el("span", { textContent: `${entregado ? "Entregado" : pasos[p.estado]} · Total ${pesos(p.total)}` }),
      el("div", { className: "pedido-acciones" },
        el("button", { className: "secundario chico", type: "button", textContent: "Comprobante", ariaLabel: `Descargar comprobante del pedido ${p.numero}`, onclick: () => comprobante(p) }),
        entregado ? el("button", { className: "secundario chico", type: "button", textContent: "Repetir pedido", onclick: () => repetir(p) }) : "")));
}
function infoPago(p) {
  const r = resumenPago(p);
  if (!r) return "";
  return el("div", { className: "pedido-pago " + r.clase }, el("strong", { textContent: r.texto }),
    ...p.pagos.map((x) => el("small", { textContent: lineaPago(x).join(" · ") })));
}
function repetir(p) {
  for (const i of p.items) if (productos.some((x) => x.id === i.id && x.precio)) cambiar(i.id, i.cant);
  $("#ver-carrito").click();
}
function pintarPedidos() {
  const lista = leerPedidos();
  const fin = ESTADOS.length - 1;
  const curso = lista.filter((p) => p.estado < fin), hist = lista.filter((p) => p.estado >= fin);
  $("#pedidos-curso").replaceChildren(...(curso.length ? curso.map(tarjetaPedido) : [el("p", { className: "vacio", textContent: "No tenés pedidos en curso." })]));
  $("#pedidos-historial").replaceChildren(...(hist.length ? hist.map(tarjetaPedido) : [el("p", { className: "vacio", textContent: "Todavía no hay pedidos entregados." })]));
  const hayEjemplos = lista.some((p) => p.ejemplo);
  $("#pedidos-ejemplo").textContent = hayEjemplos ? "Quitar los pedidos de ejemplo" : "Ver con pedidos de ejemplo";
  actualizarEstados();
}
// Con servidor: trae el estado que marcó Aukan3D en el panel (como mucho cada 10 s).
let estadosAl = 0;
async function actualizarEstados() {
  const abiertos = leerPedidos().filter((p) => !p.ejemplo && /^\d+$/.test(p.numero) && p.estado < ESTADOS.length - 1 && p.cliente?.whatsapp);
  if (!cfg.pedidosUrl || !abiertos.length || Date.now() - estadosAl < 10_000) return;
  estadosAl = Date.now();
  try {
    const r = await fetch(cfg.pedidosUrl.replace("/api/pedidos", "/api/pedidos/estado"), { method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ pedidos: abiertos.map((p) => ({ numero: String(p.numero), whatsapp: p.cliente.whatsapp })) }) });
    const { estados = {}, pagos = {} } = await r.json();
    let cambio = false;
    const lista = leerPedidos().map((p) => {
      if (!(p.numero in estados)) return p;
      const nuevo = { ...p, estado: estados[p.numero], ...(pagos[p.numero] ? { pagos: pagos[p.numero] } : {}) };
      if (nuevo.estado !== p.estado) avisar(nuevo, p.estado);
      if (nuevo.estado !== p.estado || JSON.stringify(nuevo.pagos) !== JSON.stringify(p.pagos)) cambio = true;
      return nuevo;
    });
    if (cambio) { guardarPedidos(lista); pintarPedidos(); }
    suscribirPush();
  } catch { /* sin conexión: queda el último estado conocido */ }
}
// Se consulta al entrar, al volver a la pestaña y cada minuto mientras la tienda está abierta con sesión.
addEventListener("hashchange", () => sesion() && actualizarEstados());
document.addEventListener("visibilitychange", () => !document.hidden && sesion() && actualizarEstados());
setInterval(() => !document.hidden && sesion() && actualizarEstados(), 60_000);

// ---------- Avisos al cliente cuando Aukan3D cambia el estado de un pedido ----------
// Quedan en este dispositivo (campana arriba). Con permiso, también como notificación del sistema
// mientras la tienda esté abierta (aunque sea en otra pestaña).
const AVISOS = "aukan_avisos";
const TEXTO_AVISO = [
  null,
  (p) => p.sena ? "Recibimos tu seña. ¡Tu pedido quedó confirmado!" : "Recibimos tu pago. ¡Tu pedido quedó confirmado!",
  () => "Tu pedido entró en impresión.",
  () => "¡Tu pedido está listo para entregar! Coordinamos la entrega por WhatsApp.",
  () => "Pedido entregado. ¡Gracias por tu compra!",
];
const leerAvisos = () => { try { return JSON.parse(localStorage.getItem(AVISOS)) || []; } catch { return []; } };
const guardarAvisos = (a) => { try { localStorage.setItem(AVISOS, JSON.stringify(a.slice(0, 20))); } catch { /* sin espacio: no pasa nada */ } };
function avisar(p, antes) {
  const texto = TEXTO_AVISO[p.estado]?.(p);
  if (!texto || p.estado < antes) return;
  guardarAvisos([{ numero: p.numero, estado: p.estado, texto, fecha: new Date().toISOString(), leido: false }, ...leerAvisos()]);
  pintarAvisos();
  $("#anuncio").textContent = `Pedido N° ${p.numero}: ${texto}`;
  if ("Notification" in window && Notification.permission === "granted" && !leerPush().endpoint) { // con push, el aviso ya llega del servidor
    const titulo = `Aukan3D · Pedido N° ${p.numero}`, op = { body: texto, icon: "logo.webp", tag: `pedido-${p.numero}` };
    navigator.serviceWorker?.getRegistration().then((r) => (r ? r.showNotification(titulo, op) : new Notification(titulo, op))).catch(() => {});
  }
}
function pintarAvisos() {
  const activo = !!sesion(), lista = leerAvisos(), nuevos = lista.filter((a) => !a.leido).length;
  $("#avisos").hidden = !activo;
  $("#avisos-n").hidden = !nuevos;
  $("#avisos-n").textContent = nuevos > 9 ? "9+" : String(nuevos);
  $("#ver-avisos").ariaLabel = nuevos ? `Avisos: ${nuevos} nuevo${nuevos > 1 ? "s" : ""}` : "Avisos";
  $("#avisos-lista").replaceChildren(...(lista.length
    ? lista.map((a) => el("a", { href: a.estado >= ESTADOS.length - 1 ? "#historial" : "#mis-pedidos", className: a.leido ? "" : "nuevo" },
        el("strong", { textContent: `Pedido N° ${a.numero}` }), el("span", { textContent: a.texto }),
        el("small", { textContent: new Date(a.fecha).toLocaleString("es-UY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })))
    : [el("p", { className: "vacio", textContent: "Cuando tu pedido cambie de estado te avisamos acá." })]));
  const permiso = "Notification" in window ? Notification.permission : "denied";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("#avisos-activar").hidden = permiso !== "default" || !("PushManager" in window);
  $("#avisos-ios").hidden = !(ios && !instalada && !("PushManager" in window));
}
function abrirAvisos(si) {
  $("#avisos-drop").hidden = !si;
  $("#ver-avisos").ariaExpanded = String(si);
  if (si) { actualizarEstados(); } else { guardarAvisos(leerAvisos().map((a) => ({ ...a, leido: true }))); pintarAvisos(); }
}
$("#ver-avisos").addEventListener("click", () => abrirAvisos($("#avisos-drop").hidden));
document.addEventListener("click", (e) => { if (!$("#avisos-drop").hidden && !e.target.closest(".avisos")) abrirAvisos(false); });
$("#avisos-drop").addEventListener("keydown", (e) => { if (e.key === "Escape") { abrirAvisos(false); $("#ver-avisos").focus(); } });
$("#avisos-lista").addEventListener("click", (e) => { if (e.target.closest("a")) abrirAvisos(false); });
$("#avisos-activar").addEventListener("click", async () => {
  try { await Notification.requestPermission(); } catch { /* navegador viejo */ }
  pintarAvisos();
  suscribirPush();
});
// Push: el navegador (o la app instalada) recibe el aviso aunque la tienda esté cerrada.
const API_BASE = cfg.pedidosUrl ? cfg.pedidosUrl.replace(/\/api\/pedidos.*$/, "") : "", CON_E = cfg.pedidosUrl.includes("e=pruebas") ? "?e=pruebas" : "";
const PUSH = "aukan_push";
const leerPush = () => leerJson(PUSH, {});
if ("serviceWorker" in navigator) navigator.serviceWorker.register(`sw.js?api=${encodeURIComponent(API_BASE)}${CON_E ? "&e=pruebas" : ""}`).catch(() => {});
const deB64 = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function suscribirPush() {
  if (!API_BASE || !sesion() || !("PushManager" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { clave } = await (await fetch(API_BASE + "/api/push/clave" + CON_E)).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64(clave) });
    }
    const abiertos = leerPedidos().filter((p) => !p.ejemplo && /^\d+$/.test(p.numero) && p.estado < ESTADOS.length - 1 && p.cliente?.whatsapp);
    const antes = leerPush(), numeros = abiertos.map((p) => String(p.numero));
    if (antes.endpoint === sub.endpoint && numeros.every((n) => antes.numeros?.includes(n))) return; // ya anotados
    if (!numeros.length) return escribir(PUSH, { endpoint: sub.endpoint, numeros: [] });
    const r = await (await fetch(API_BASE + "/api/push/alta" + CON_E, { method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ endpoint: sub.endpoint, pedidos: abiertos.map((p) => ({ numero: String(p.numero), whatsapp: p.cliente.whatsapp })) }) })).json();
    if (r.ok) escribir(PUSH, { endpoint: sub.endpoint, numeros: r.pedidos });
  } catch (e) { console.warn("push", e); }
}
if (cfg.pedidosUrl) for (const n of document.querySelectorAll(".nota-estado"))
  n.textContent = "Tus pedidos se guardan en este dispositivo. El estado se actualiza solo cuando Aukan3D lo cambia.";
$("#pedidos-ejemplo").addEventListener("click", () => {
  if (leerPedidos().some((p) => p.ejemplo)) { guardarPedidos(leerPedidos().filter((p) => !p.ejemplo)); return pintarPedidos(); }
  const item = (id, cant) => { const x = productos.find((p) => p.id === id) || {}; return { id, cant, nombre: x.nombre || "Figura", precio: x.precio || 0 }; };
  const pedido = (numero, dias, estado, sena, items) => ({ numero, fecha: new Date(Date.now() - dias * 864e5).toISOString(), estado, sena, ejemplo: true,
    items, total: items.reduce((s, i) => s + i.precio * i.cant, 0) });
  const [a, b, c] = productos.filter((p) => p.precio).map((p) => p.id);
  guardarPedidos([...leerPedidos(), pedido("E-2", 2, 2, true, [item(a, 1), item(b, 2)]), pedido("E-1", 30, 4, false, [item(c, 1)])]);
  pintarPedidos();
});

// Barrio: lista de los 62 barrios si la ciudad es Montevideo; si no, texto libre.
const esMvd = (t) => t.trim().toLowerCase() === "montevideo";
function elegirBarrios(valor) {
  const lista = esMvd($("#form-datos").ciudad.value), sel = $("#barrio-mvd"), txt = $("#barrio-txt");
  if (valor === undefined && sel.hidden !== lista) return; // sigue en el mismo modo: no tocar lo elegido
  const actual = valor ?? ""; // al cambiar entre lista y texto, el barrio anterior no sirve
  sel.hidden = sel.disabled = !lista;
  txt.hidden = txt.disabled = lista;
  if (lista) sel.value = [...sel.options].some((o) => o.value === actual) ? actual : "";
  else txt.value = actual || "";
}
$("#form-datos").departamento.addEventListener("change", (e) => {
  const c = $("#form-datos").ciudad;
  if (e.target.value === "Montevideo" && !c.value) c.value = "Montevideo";
  elegirBarrios();
});
$("#form-datos").ciudad.addEventListener("input", () => elegirBarrios());
$("#form-datos").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  guardarPerfil({ ...leerPerfil(), nombre: d.nombre.trim(), whatsapp: d.whatsapp.trim(), email: d.email.trim().toLowerCase(), departamento: d.departamento, ciudad: d.ciudad.trim(), barrio: (d.barrio || "").trim(), direccion: d.direccion.trim() });
  const f = $("#checkout");
  for (const k of ["nombre", "whatsapp", "email"]) f[k].value = ""; // que el pedido tome los datos nuevos
  pintarCuenta();
  $("#datos-ok").textContent = "Listo, guardamos tus datos.";
});

// Con sesión, "Hola, X" abre un desplegable con las pantallas de la cuenta; sin sesión, la ventanita de ingreso.
const menuCuenta = $("#menu-cuenta");
function abrirMenu(si) {
  menuCuenta.hidden = !si;
  $("#ver-cuenta").ariaExpanded = String(si);
  if (si) menuCuenta.querySelector("a").focus();
}
function irACuenta(hash = "#mis-pedidos") {
  $("#cuenta").close();
  abrirMenu(false);
  $("#datos-ok").textContent = "";
  location.hash === hash ? mostrarVista() : (location.hash = hash);
}
$("#ver-cuenta").addEventListener("click", () => {
  if (!leerPerfil()?.activo) return $("#cuenta").showModal();
  abrirMenu(menuCuenta.hidden);
});
menuCuenta.addEventListener("click", (e) => { if (e.target.closest("a")) abrirMenu(false); });
document.addEventListener("click", (e) => { if (!e.target.closest(".user-menu")) abrirMenu(false); });
menuCuenta.addEventListener("keydown", (e) => {
  const items = [...menuCuenta.children], i = items.indexOf(document.activeElement);
  if (e.key === "Escape") { abrirMenu(false); $("#ver-cuenta").focus(); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
});
// Si entran a una pantalla de la cuenta sin sesión, vuelven al catálogo con la ventanita de ingreso.
function cuidarCuenta() {
  if (!CUENTA.includes(location.hash) || leerPerfil()?.activo) return;
  verCatalogo();
  elegirTab(false);
  $("#cuenta").showModal();
}
addEventListener("hashchange", () => { cuidarCuenta(); $("#datos-ok").textContent = ""; });
$("#tab-registro").addEventListener("click", () => elegirTab(true));
$("#tab-ingreso").addEventListener("click", () => elegirTab(false));

$("#form-registro").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (d.clave !== d.clave2) { $("#registro-error").textContent = "Las contraseñas no coinciden."; return; }
  $("#registro-error").textContent = "";
  guardarPerfil({ nombre: d.nombre.trim(), whatsapp: d.whatsapp.trim(), email: d.email.trim().toLowerCase(), activo: true });
  // Si recién pidió como invitado, ese pedido pasa a su cuenta.
  if (ultimoPedido && !ultimoPedido.guardado) { guardarPedidos([ultimoPedido, ...leerPedidos()]); ultimoPedido.guardado = true; }
  e.target.reset();
  pintarCuenta();
  irACuenta();
});

$("#form-ingreso").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get("email").trim().toLowerCase();
  const p = leerPerfil();
  if (!p || p.email !== email) { $("#ingreso-error").textContent = "No encontramos una cuenta con ese correo en este dispositivo."; return; }
  $("#ingreso-error").textContent = "";
  guardarPerfil({ ...p, activo: true });
  e.target.reset();
  pintarCuenta();
  irACuenta();
});

// Cerrar sesión pregunta si olvidar los datos (dispositivo compartido) o recordarlos para la próxima.
$("#cuenta-salir").addEventListener("click", () => { abrirMenu(false); $("#salir").showModal(); });
$("#salir").addEventListener("close", () => {
  const v = $("#salir").returnValue;
  $("#salir").returnValue = "";
  if (v !== "olvidar" && v !== "recordar") return;
  if (v === "olvidar") { olvidarCuenta(); $("#checkout").reset(); }
  else guardarPerfil({ ...leerPerfil(), activo: false });
  pintarCuenta();
  elegirTab(false);
  verCatalogo();
});

$("#version").textContent = cfg.version;
pintarCuenta();
cuidarCuenta();
if (sesion()) actualizarEstados();
