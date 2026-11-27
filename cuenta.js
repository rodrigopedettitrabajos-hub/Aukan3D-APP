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
  $("#cuenta-sesion").hidden = !activo;
  $("#cuenta-forms").hidden = activo;
  $("#invitado").hidden = activo;
  $("#cuenta").classList.toggle("con-sesion", activo);
  if (activo) {
    $("#cuenta-nombre").textContent = p.nombre;
    const fd = $("#form-datos");
    for (const k of ["nombre", "whatsapp", "email", "direccion"]) fd[k].value = p[k] || "";
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
// Lo llama app.js al enviar un pedido; solo se guarda si hay sesión.
function guardarPedido(pedido) {
  if (!leerPerfil()?.activo) return;
  const lista = leerPedidos();
  guardarPedidos([{ fecha: new Date().toISOString(), estado: 0, ...pedido, numero: pedido.numero || `W${lista.length + 1}` }, ...lista]);
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
      entregado ? el("button", { className: "secundario chico", type: "button", textContent: "Repetir pedido", onclick: () => repetir(p) }) : ""));
}
function repetir(p) {
  for (const i of p.items) if (productos.some((x) => x.id === i.id && x.precio)) cambiar(i.id, i.cant);
  $("#cuenta").close();
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

function elegirPanel(pedidos) {
  $("#tab-pedidos").ariaSelected = String(pedidos);
  $("#tab-datos").ariaSelected = String(!pedidos);
  $("#panel-pedidos").hidden = !pedidos;
  $("#form-datos").hidden = pedidos;
}
$("#tab-pedidos").addEventListener("click", () => elegirPanel(true));
$("#tab-datos").addEventListener("click", () => elegirPanel(false));
$("#form-datos").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  guardarPerfil({ ...leerPerfil(), nombre: d.nombre.trim(), whatsapp: d.whatsapp.trim(), email: d.email.trim().toLowerCase(), direccion: d.direccion.trim() });
  const f = $("#checkout");
  for (const k of ["nombre", "whatsapp", "email"]) f[k].value = ""; // que el pedido tome los datos nuevos
  pintarCuenta();
  $("#datos-ok").textContent = "Listo, guardamos tus datos.";
});

$("#ver-cuenta").addEventListener("click", () => { $("#datos-ok").textContent = ""; pintarCuenta(); $("#cuenta").showModal(); });
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
});

$("#cuenta-salir").addEventListener("click", () => {
  const p = leerPerfil();
  if (p) guardarPerfil({ ...p, activo: false });
  pintarCuenta();
  elegirTab(false);
});

$("#version").textContent = cfg.version;
pintarCuenta();
