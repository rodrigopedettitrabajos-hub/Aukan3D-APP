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
  const url = cfg.catalogoCsvUrl || "productos.csv";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    productos = productosDesdeCsv(await res.text());
  } catch (e) {
    $("#estado").textContent = "No pudimos cargar el catálogo. Probá recargar la página.";
    return;
  }
  pintar();
}

function chips(nav, opciones, actual, elegir) {
  nav.replaceChildren(...opciones.map(([valor, texto]) =>
    el("button", { className: "chip", textContent: texto, type: "button", ariaPressed: String(valor === actual),
      onclick: () => elegir(valor) })));
}

function pintarFiltros() {
  chips($("#categorias"), ["Todo", ...new Set(productos.map((p) => p.categoria))].map((c) => [c, c]), filtro.cat,
    (c) => { filtro.cat = c; filtro.sub = ""; pintar(); });
  const subs = [...new Set(productos.filter((p) => p.categoria === filtro.cat && p.subcategoria).map((p) => p.subcategoria))];
  $("#subcategorias").hidden = !subs.length;
  chips($("#subcategorias"), [["", "Todos"], ...subs.map((s) => [s, s])], filtro.sub,
    (s) => { filtro.sub = s; pintar(); });
}

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
  // Abrimos la ventana antes del await para que el navegador no la bloquee como popup.
  const wa = window.open("", "_blank");
  if (cfg.pedidosUrl) {
    try {
      // text/plain evita el preflight CORS que Apps Script no responde.
      await fetch(cfg.pedidosUrl, { method: "POST", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ cliente, items: items.map((i) => ({ id: i.id, cant: i.cant })) }) });
    } catch { /* el pedido igual sale por WhatsApp */ }
  }
  const url = `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(resumenPedido(items, cliente))}`;
  wa ? (wa.location = url) : (location.href = url);
  carrito.clear();
  ev.target.reset();
  $("#carrito").close();
  pintar();
}

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
