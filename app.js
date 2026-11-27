const cfg = window.AUKAN_CONFIG;
const $ = (s) => document.querySelector(s);
const pesos = (n) => "$" + n.toLocaleString("es-UY");

let productos = [];
const filtro = { cat: "Todo", sub: "", q: "" };
const carrito = new Map(); // id -> cantidad
let enDetalle = null;

function el(tag, props = {}, ...hijos) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...hijos);
  return e;
}

async function cargar() {
  try {
    let csv = window.PRODUCTOS_CSV; // copia local, funciona abriendo index.html con doble clic
    if (cfg.catalogoCsvUrl) {
      const res = await fetch(cfg.catalogoCsvUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      csv = await res.text();
    }
    productos = productosDesdeCsv(csv);
  } catch (e) {
    $("#estado").textContent = "No pudimos cargar el catálogo. Probá recargar la página.";
    return;
  }
  pintar();
}

function opcion(texto, activo, elegir) {
  return el("button", { className: "menu-item", type: "button", textContent: texto, ariaPressed: String(activo),
    onclick: () => { elegir(); cerrarMenu(); pintar(); } });
}

function cerrarMenu() {
  document.querySelectorAll("#menu details[open]").forEach((d) => d.removeAttribute("open"));
}

// Menú de categorías arriba; las que tienen subcategorías (Crochet) se despliegan por personaje.
function pintarFiltros() {
  const cats = ["Todo", ...new Set(productos.map((p) => p.categoria))];
  $("#menu").replaceChildren(...cats.map((c) => {
    const subs = [...new Set(productos.filter((p) => p.categoria === c && p.subcategoria).map((p) => p.subcategoria))];
    const elegida = filtro.cat === c;
    if (!subs.length) return opcion(c, elegida, () => { filtro.cat = c; filtro.sub = ""; });
    const titulo = el("summary", { className: "menu-item" + (elegida ? " on" : "") }, c);
    const panel = el("div", { className: "drop-panel" },
      opcion(`Todo ${c}`, elegida && !filtro.sub, () => { filtro.cat = c; filtro.sub = ""; }),
      ...subs.map((s) => opcion(s, elegida && filtro.sub === s, () => { filtro.cat = c; filtro.sub = s; })));
    return el("details", { className: "drop" }, titulo, panel);
  }));
}

document.addEventListener("click", (e) => { if (!e.target.closest("#menu details")) cerrarMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarMenu(); });
$("#menu").addEventListener("toggle", (e) => { // una sola abierta a la vez
  if (e.target.open) document.querySelectorAll("#menu details[open]").forEach((d) => d !== e.target && d.removeAttribute("open"));
}, true);

function visibles() {
  const q = filtro.q.toLowerCase();
  return productos.filter((p) =>
    (filtro.cat === "Todo" || p.categoria === filtro.cat) &&
    (!filtro.sub || p.subcategoria === filtro.sub) &&
    (!q || `${p.nombre} ${p.categoria} ${p.subcategoria}`.toLowerCase().includes(q)));
}

function foto(p) {
  return p.foto
    ? el("img", { src: p.foto, alt: p.nombre, loading: "lazy", referrerPolicy: "no-referrer",
        onerror() { this.replaceWith(el("div", { className: "nofoto", textContent: "3D" })); } })
    : el("div", { className: "nofoto", textContent: "3D" });
}

function textoBoton(id) {
  const cant = carrito.get(id) || 0;
  return cant ? `En pedido (${cant})` : "Agregar";
}

function tarjeta(p) {
  return el("article", { className: "card" },
    el("button", { className: "foto", type: "button", ariaLabel: `Ver ${p.nombre}`, onclick: () => abrirDetalle(p) }, foto(p)),
    el("div", { className: "info" },
      el("span", { className: "sub", textContent: p.subcategoria || p.categoria }),
      el("h3", { textContent: p.nombre }),
      el("div", { className: "row" },
        el("strong", { className: "precio", textContent: pesos(p.precio) }),
        el("button", { className: carrito.has(p.id) ? "add on" : "add", type: "button",
          textContent: textoBoton(p.id), ariaLabel: `Agregar ${p.nombre}`, onclick: () => cambiar(p.id, 1) }))));
}

function abrirDetalle(p) {
  enDetalle = p;
  $("#detalle-foto").replaceChildren(foto(p));
  $("#detalle-sub").textContent = [p.categoria, p.subcategoria].filter(Boolean).join(" · ");
  $("#detalle-nombre").textContent = p.nombre;
  $("#detalle-precio").textContent = pesos(p.precio);
  pintarDetalle();
  $("#detalle").showModal();
}

function pintarDetalle() {
  if (!enDetalle) return;
  const b = $("#detalle-add");
  b.textContent = carrito.has(enDetalle.id) ? `En pedido (${carrito.get(enDetalle.id)}) · sumar otro` : "Agregar al pedido";
  b.className = carrito.has(enDetalle.id) ? "add on" : "add";
}

function pintar() {
  pintarFiltros();
  const lista = visibles();
  $("#estado").textContent = lista.length ? "" : "No encontramos productos con esa búsqueda.";
  $("#grilla").replaceChildren(...lista.map(tarjeta));
  pintarCarrito();
}

function itemsCarrito() {
  return [...carrito].map(([id, cant]) => ({ ...productos.find((p) => p.id === id), cant }));
}

function cambiar(id, d) {
  const n = (carrito.get(id) || 0) + d;
  n > 0 ? carrito.set(id, n) : carrito.delete(id);
  pintar();
  pintarDetalle();
}

function pintarCarrito() {
  const items = itemsCarrito();
  const n = items.reduce((s, i) => s + i.cant, 0);
  const total = pesos(items.reduce((s, i) => s + i.precio * i.cant, 0));
  $("#cart-count").textContent = n;
  $("#total").textContent = total;
  $("#barra").hidden = !n;
  $("#barra-cant").textContent = n === 1 ? "1 producto" : `${n} productos`;
  $("#barra-total").textContent = total;
  $("#enviar").disabled = !n;
  $("#items").replaceChildren(...(items.length ? items.map((i) =>
    el("li", {},
      el("span", { className: "nombre", textContent: i.nombre }),
      el("span", { className: "qty" },
        el("button", { type: "button", textContent: "−", ariaLabel: "Quitar uno", onclick: () => cambiar(i.id, -1) }),
        el("output", { textContent: i.cant }),
        el("button", { type: "button", textContent: "+", ariaLabel: "Agregar uno", onclick: () => cambiar(i.id, 1) })),
      el("strong", { textContent: pesos(i.precio * i.cant) })))
    : [el("li", { className: "vacio", textContent: "Todavía no agregaste productos." })]));
}

async function enviar(ev) {
  ev.preventDefault();
  const cliente = Object.fromEntries(new FormData(ev.target));
  const items = itemsCarrito();
  const texto = resumenPedido(items, cliente);
  ultimoCliente = cliente;
  if (!cfg.pedidosUrl) { // sin servidor: directo a WhatsApp
    window.open(waLink(texto), "_blank");
    mostrarPago("", $("#total").textContent, texto);
    $("#pago-titulo").textContent = "¡Pedido listo!";
    return terminar(ev.target);
  }
  $("#enviar").disabled = true;
  $("#enviar").textContent = "Enviando…";
  let r = {};
  try {
    // text/plain evita el preflight CORS que Apps Script no responde.
    const res = await fetch(cfg.pedidosUrl, { method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ cliente, items: items.map((i) => ({ id: i.id, cant: i.cant })) }) });
    r = await res.json();
  } catch { /* el pedido igual sale por WhatsApp */ }
  $("#enviar").textContent = "Enviar pedido por WhatsApp";
  const pago = /^https:\/\/([\w-]+\.)*mercadopago\.com(\.[a-z]{2})?\//.test(r.pago || "") ? r.pago : "";
  mostrarPago(pago, r.ok ? pesos(r.total) : $("#total").textContent,
    texto + (r.numero ? `\nPedido N° ${r.numero}` : "") + (pago ? `\nLink de pago: ${pago}` : ""));
  terminar(ev.target);
}

let ultimoCliente = null;
const waLink = (texto) => `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(texto)}`;

function terminar(form) {
  carrito.clear();
  form.reset();
  pintar();
  pintarCuenta(); // vuelve a completar los datos si hay sesión
}

// Pantalla final del carrito: QR y botón de Mercado Pago, más el aviso por WhatsApp.
function mostrarPago(pago, total, texto) {
  for (const e of [$("#items"), $(".total"), $("#checkout")]) e.hidden = true;
  $("#pago").hidden = false;
  $("#pago-titulo").textContent = "¡Pedido recibido!";
  $("#pago-total").textContent = total;
  $("#pago-wa").href = waLink(texto);
  $("#pago-link").hidden = $("#pago-qr").hidden = !pago;
  $("#pago-texto").textContent = pago
    ? "Pagalo con Mercado Pago: escaneá el QR con el celular o tocá el botón."
    : "Te abrimos WhatsApp con tu pedido. Si no se abrió, tocá el botón y te pasamos cómo pagarlo.";
  $("#ofrecer-cuenta").hidden = !!leerPerfil()?.activo; // a los invitados les ofrecemos crear cuenta
  if (!pago) return;
  $("#pago-link").href = pago;
  const qr = qrcode(0, "M");
  qr.addData(pago);
  qr.make();
  $("#pago-qr").src = qr.createDataURL(6, 2);
}

$("#carrito").addEventListener("close", () => {
  for (const e of [$("#items"), $(".total"), $("#checkout")]) e.hidden = false;
  $("#pago").hidden = true;
});
// Registro opcional: desde el carrito o después de pedir como invitado.
$("#invitado-ingresar").addEventListener("click", () => { elegirTab(false); $("#cuenta").showModal(); });
$("#invitado-registro").addEventListener("click", () => { elegirTab(true); $("#cuenta").showModal(); });
$("#crear-cuenta").addEventListener("click", () => {
  const f = $("#form-registro");
  for (const k of ["nombre", "whatsapp", "email"]) f[k].value = ultimoCliente?.[k] || "";
  $("#carrito").close();
  elegirTab(true);
  $("#cuenta").showModal();
  f.clave.focus();
});
$("#wa-flotante").href = waLink("Hola Aukan3D! Quería hacer una consulta.");

const verCarrito = () => $("#carrito").showModal();
$("#buscar").addEventListener("input", (e) => { filtro.q = e.target.value; pintar(); });
$("#ver-carrito").addEventListener("click", verCarrito);
$("#barra-ver").addEventListener("click", verCarrito);
$("#detalle-add").addEventListener("click", () => cambiar(enDetalle.id, 1));
$("#detalle").addEventListener("close", () => { enDetalle = null; });
// Tocar fuera del contenido cierra el modal.
for (const d of document.querySelectorAll("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
$("#checkout").addEventListener("submit", enviar);
cargar();
