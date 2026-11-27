const cfg = window.AUKAN_CONFIG;
const $ = (s) => document.querySelector(s);
const pesos = (n) => "$" + n.toLocaleString("es-UY");

let productos = [];
let filtro = { cat: "Todo", q: "" };
const carrito = new Map(); // id -> cantidad

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
  pintarCategorias();
  pintar();
}

function pintarCategorias() {
  const cats = ["Todo", ...new Set(productos.map((p) => p.categoria))];
  $("#categorias").replaceChildren(...cats.map((c) =>
    el("button", { className: "chip", textContent: c, type: "button", ariaPressed: String(c === filtro.cat),
      onclick: () => { filtro.cat = c; pintarCategorias(); pintar(); } })));
}

function visibles() {
  const q = filtro.q.toLowerCase();
  return productos.filter((p) =>
    (filtro.cat === "Todo" || p.categoria === filtro.cat) &&
    (!q || `${p.nombre} ${p.categoria} ${p.subcategoria}`.toLowerCase().includes(q)));
}

function tarjeta(p) {
  const foto = p.foto
    ? el("img", { src: p.foto, alt: p.nombre, loading: "lazy", referrerPolicy: "no-referrer",
        onerror() { this.replaceWith(el("div", { className: "nofoto", textContent: "3D" })); } })
    : el("div", { className: "nofoto", textContent: "3D" });
  const cant = carrito.get(p.id) || 0;
  return el("article", { className: "card" },
    el("div", { className: "foto" }, foto),
    el("div", { className: "info" },
      el("span", { className: "sub", textContent: p.subcategoria || p.categoria }),
      el("h3", { textContent: p.nombre }),
      el("div", { className: "row" },
        el("strong", { textContent: pesos(p.precio) }),
        el("button", { className: cant ? "add on" : "add", type: "button",
          textContent: cant ? `En carrito (${cant})` : "Agregar",
          ariaLabel: `Agregar ${p.nombre}`, onclick: () => cambiar(p.id, 1) }))));
}

function pintar() {
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
}

function pintarCarrito() {
  const items = itemsCarrito();
  const n = items.reduce((s, i) => s + i.cant, 0);
  $("#cart-count").textContent = n;
  $("#total").textContent = pesos(items.reduce((s, i) => s + i.precio * i.cant, 0));
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

$("#buscar").addEventListener("input", (e) => { filtro.q = e.target.value; pintar(); });
$("#ver-carrito").addEventListener("click", () => $("#carrito").showModal());
$("#checkout").addEventListener("submit", enviar);
cargar();
