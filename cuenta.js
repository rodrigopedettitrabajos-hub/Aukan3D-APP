// Panel de cuenta (vista previa sin servidor).
// shortcut: la cuenta vive en localStorage de este dispositivo y la contraseña NO se guarda ni se verifica;
// reemplazar por registro real cuando haya base de datos.
const CLAVE_PERFIL = "aukan_perfil";

function leerPerfil() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PERFIL)) || null; } catch { return null; }
}
function guardarPerfil(p) {
  try { localStorage.setItem(CLAVE_PERFIL, JSON.stringify(p)); } catch { /* modo privado: la sesión dura lo que la pestaña */ }
}

function pintarCuenta() {
  const p = leerPerfil();
  const activo = !!p?.activo;
  $("#ver-cuenta").textContent = activo ? `Hola, ${p.nombre.split(" ")[0]}` : "Ingresar";
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

// Pedidos de la cuenta (vista previa: localStorage). Cuando haya base de datos, el estado viene del servidor.
const CLAVE_PEDIDOS = "aukan_pedidos";
const ESTADOS = ["Recibido", "Seña pagada", "En impresión", "Listo para entregar", "Entregado"];
function leerPedidos() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PEDIDOS)) || []; } catch { return []; }
}
function guardarPedidos(lista) {
  try { localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(lista.slice(0, 50))); } catch { /* sin almacenamiento */ }
}
// Lo llama app.js al enviar un pedido: lo devuelve completo (para el comprobante) y lo guarda solo si hay sesión.
function guardarPedido(pedido) {
  const p = { fecha: new Date().toISOString(), estado: 0, ...pedido, numero: pedido.numero || `W${Date.now().toString(36).toUpperCase().slice(-6)}` };
  if (leerPerfil()?.activo) guardarPedidos([p, ...leerPedidos()]);
  return p;
}

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
    el("div", { className: "pedido-pie" },
      el("span", { textContent: `${entregado ? "Entregado" : pasos[p.estado]} · Total ${pesos(p.total)}` }),
      el("div", { className: "pedido-acciones" },
        el("button", { className: "secundario chico", type: "button", textContent: "Comprobante", ariaLabel: `Descargar comprobante del pedido ${p.numero}`, onclick: () => comprobante(p) }),
        entregado ? el("button", { className: "secundario chico", type: "button", textContent: "Repetir pedido", onclick: () => repetir(p) }) : "")));
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
  $("#pedidos-ejemplo").hidden = lista.some((p) => p.ejemplo);
}
$("#pedidos-ejemplo").addEventListener("click", () => {
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

$("#cuenta-salir").addEventListener("click", () => {
  abrirMenu(false);
  const p = leerPerfil();
  if (p) guardarPerfil({ ...p, activo: false });
  pintarCuenta();
  elegirTab(false);
  verCatalogo();
});

$("#version").textContent = cfg.version;
pintarCuenta();
cuidarCuenta();
