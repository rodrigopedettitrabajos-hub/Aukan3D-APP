const cfg = window.AUKAN_CONFIG;
const $ = (s) => document.querySelector(s);
const pesos = (n) => "$" + n.toLocaleString("es-UY");

let productos = [];
const filtro = { cat: "Todo", sub: "", q: "" };
const carrito = new Map(); // id -> cantidad
let enDetalle = null;
let pagina = 1;
let porPagina = 20;
try { porPagina = [10, 20, 50].includes(+localStorage.aukan_por_pagina) ? +localStorage.aukan_por_pagina : 20; } catch { /* sin storage */ }

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
  if (location.hash) mostrarVista();
}

function opcion(texto, activo, elegir) {
  return el("button", { className: "menu-item", type: "button", textContent: texto, ariaPressed: String(activo),
    onclick: () => { elegir(); cerrarMenu(); verCatalogo(); irA(1); } });
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
  }), ...enlacesInfo("link-info"), el("details", { className: "drop mas" },
    el("summary", { className: "menu-item" }, "Más"), el("div", { className: "drop-panel" }, ...enlacesInfo(""))));
}

// Galería, Nosotros y Preguntas son pantallas aparte (#galeria, etc.); sin # se ve el catálogo.
// En pantallas chicas sus botones van dentro de "Más".
const INFO = [["#eventos", "Eventos"], ["#galeria", "Galería"], ["#nosotros", "Nosotros"], ["#preguntas", "Preguntas frecuentes"]];
const enlacesInfo = (clase) => INFO.map(([href, texto]) =>
  el("a", { className: `menu-item ${clase}`, href, textContent: clase && href === "#preguntas" ? "Preguntas" : texto, ariaCurrent: location.hash === href ? "page" : null, onclick: cerrarMenu }));

function mostrarVista() {
  const vista = INFO.some(([h]) => h === location.hash) ? location.hash.slice(1) : "";
  $("#hero").hidden = $("#catalogo").hidden = !!vista;
  $("#proximo").hidden = !!vista || !eventos.length;
  for (const [h] of INFO) $(h).hidden = h.slice(1) !== vista;
  vista ? (document.body.dataset.vista = vista) : delete document.body.dataset.vista;
  pintarFiltros();
  scrollTo(0, 0);
}

function verCatalogo() {
  if (location.hash) history.pushState(null, "", location.pathname + location.search);
  mostrarVista();
}
addEventListener("hashchange", mostrarVista);
addEventListener("popstate", mostrarVista);

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

const precioTexto = (p) => (p.precio ? pesos(p.precio) : "Consultar");
const waConsulta = (p) => waLink(`Hola Aukan3D! Quiero consultar por: ${p.nombre}`);

function tarjeta(p) {
  return el("article", { className: "card" },
    el("button", { className: "foto", type: "button", ariaLabel: `Ver ${p.nombre}`, onclick: () => abrirDetalle(p) }, foto(p),
      p.fotos.length > 1 ? el("span", { className: "n-fotos", textContent: `${p.fotos.length} fotos` }) : ""),
    el("div", { className: "info" },
      el("span", { className: "sub", textContent: p.subcategoria || p.categoria }),
      el("h3", { textContent: p.nombre }),
      el("div", { className: "row" },
        el("strong", { className: "precio", textContent: precioTexto(p) }),
        p.precio
          ? el("button", { className: carrito.has(p.id) ? "add on" : "add", type: "button",
              textContent: textoBoton(p.id), ariaLabel: `Agregar ${p.nombre}`, onclick: () => cambiar(p.id, 1) })
          : el("a", { className: "add", href: waConsulta(p), target: "_blank", rel: "noopener", textContent: "Consultar" }))));
}

function abrirDetalle(p) {
  enDetalle = p;
  $("#detalle-foto").replaceChildren(...carrusel(p));
  $("#detalle-sub").textContent = [p.categoria, p.subcategoria].filter(Boolean).join(" · ");
  $("#detalle-nombre").textContent = p.nombre;
  $("#detalle-precio").textContent = precioTexto(p);
  pintarDetalle();
  $("#detalle").showModal();
}

// Carrusel con scroll-snap: se desliza con el dedo; flechas y puntos para PC.
function carrusel(p) {
  const fotos = p.fotos.length ? p.fotos : [""];
  const pista = el("div", { className: "carrusel" }, ...fotos.map((f) => foto({ ...p, foto: f })));
  if (fotos.length < 2) return [pista];
  const ir = (d) => pista.scrollBy({ left: d * pista.clientWidth, behavior: "smooth" });
  const puntos = el("div", { className: "puntos" }, ...fotos.map((_, i) =>
    el("button", { type: "button", ariaLabel: `Foto ${i + 1}`, onclick: () => pista.scrollTo({ left: i * pista.clientWidth, behavior: "smooth" }) })));
  const marcar = () => {
    const i = Math.round(pista.scrollLeft / pista.clientWidth);
    [...puntos.children].forEach((b, k) => { b.ariaCurrent = k === i ? "true" : null; });
  };
  pista.addEventListener("scroll", marcar, { passive: true });
  requestAnimationFrame(marcar);
  return [pista,
    el("button", { className: "car-btn ant", type: "button", ariaLabel: "Foto anterior", textContent: "‹", onclick: () => ir(-1) }),
    el("button", { className: "car-btn sig", type: "button", ariaLabel: "Foto siguiente", textContent: "›", onclick: () => ir(1) }),
    puntos];
}

function pintarDetalle() {
  if (!enDetalle) return;
  const b = $("#detalle-add");
  if (!enDetalle.precio) { b.textContent = "Consultar por WhatsApp"; b.className = "add"; return; }
  b.textContent = carrito.has(enDetalle.id) ? `En pedido (${carrito.get(enDetalle.id)}) · sumar otro` : "Agregar al pedido";
  b.className = carrito.has(enDetalle.id) ? "add on" : "add";
}

// 1 … 4 5 6 … 17: primera, última y las vecinas de la actual.
function numerosPagina(actual, total) {
  const nums = [...new Set([1, actual - 1, actual, actual + 1, total])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  return nums.flatMap((n, i) => (i && n - nums[i - 1] > 1 ? ["…", n] : [n]));
}

function irA(n) {
  pagina = n;
  pintar();
  const y = $("main").getBoundingClientRect().top + scrollY - $(".top").offsetHeight;
  scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function pintarPaginas(total) {
  const nav = $("#paginas");
  nav.hidden = total <= 1;
  if (nav.hidden) return nav.replaceChildren();
  const boton = (texto, n, extra = {}) => el("button", { type: "button", className: "pag", textContent: texto, onclick: () => irA(n), ...extra });
  nav.replaceChildren(
    boton("‹", pagina - 1, { disabled: pagina === 1, ariaLabel: "Página anterior" }),
    ...numerosPagina(pagina, total).map((n) => n === "…"
      ? el("span", { className: "pag-gap", textContent: "…" })
      : boton(String(n), n, { ariaCurrent: n === pagina ? "page" : null, ariaLabel: `Página ${n}` })),
    boton("›", pagina + 1, { disabled: pagina === total, ariaLabel: "Página siguiente" }));
}

function pintar() {
  pintarFiltros();
  const lista = visibles();
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  pagina = Math.min(pagina, paginas);
  const desde = (pagina - 1) * porPagina;
  $("#estado").textContent = lista.length ? "" : "No encontramos productos con esa búsqueda.";
  $("#lista-barra").hidden = !lista.length;
  const hasta = Math.min(desde + porPagina, lista.length);
  $("#conteo").textContent = `${desde + 1}${hasta > desde + 1 ? "–" + hasta : ""} de ${lista.length} productos`;
  $("#por-pagina").value = String(porPagina);
  $("#grilla").replaceChildren(...lista.slice(desde, desde + porPagina).map(tarjeta));
  pintarPaginas(paginas);
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
  const suma = items.reduce((s, i) => s + i.precio * i.cant, 0);
  $("#monto-sena").textContent = suma ? `(${pesos(montoSena(suma))})` : "";
  $("#monto-todo").textContent = suma ? `(${total})` : "";
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
  const suma = items.reduce((s, i) => s + i.precio * i.cant, 0);
  const sena = cliente.modo !== "total";
  const montos = (total, aPagar) => sena ? `Seña ${pesos(aPagar)} · total ${pesos(total)}` : `Total ${pesos(total)}`;
  ultimoCliente = cliente;
  if (!cfg.pedidosUrl) { // sin servidor: directo a WhatsApp
    window.open(waLink(texto), "_blank");
    mostrarPago("", montos(suma, montoSena(suma)), texto, sena);
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
  // Los montos del servidor mandan; sin respuesta, los calculamos acá.
  mostrarPago(pago, r.ok ? montos(r.total, r.aPagar) : montos(suma, montoSena(suma)),
    texto + (r.numero ? `\nPedido N° ${r.numero}` : "") + (pago ? `\nLink de pago: ${pago}` : ""), sena);
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
function mostrarPago(pago, total, texto, sena) {
  $("#pago-link").textContent = sena ? "Pagar la seña con Mercado Pago" : "Pagar con Mercado Pago";
  for (const e of [$("#items"), $(".total"), $("#checkout")]) e.hidden = true;
  $("#pago").hidden = false;
  $("#pago-titulo").textContent = "¡Pedido recibido!";
  $("#pago-total").textContent = total;
  $("#pago-wa").href = waLink(texto);
  $("#pago-link").hidden = $("#pago-qr").hidden = !pago;
  $("#pago-texto").textContent = pago
    ? `${sena ? "Pagá la seña" : "Pagalo"} con Mercado Pago: escaneá el QR con el celular o tocá el botón.`
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
function verGrande(src, alt) {
  Object.assign($("#visor-img"), { src, alt });
  $("#visor").showModal();
}

// Eventos (config.js): tarjeta en el inicio y pantalla "Eventos" con mapa.
const eventos = cfg.eventos || [];
const mapaUrl = (ev) => `https://www.google.com/maps?hl=es&q=${encodeURIComponent(ev.mapa)}&z=16&output=embed`;
const lugarUrl = (ev) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.mapa)}`;
function datosEvento(ev) {
  return el("div", { className: "evento-datos" },
    el("span", { className: "evento-etiqueta", textContent: "Próximo evento" }),
    el("h3", { textContent: ev.nombre }),
    el("p", { className: "evento-cuando", textContent: `${ev.fecha} · ${ev.horario}` }),
    el("p", { textContent: ev.lugar }),
    ev.detalle ? el("p", { className: "evento-detalle", textContent: ev.detalle }) : "");
}
if (eventos.length) {
  const ev = eventos[0];
  $("#proximo").replaceChildren(el("a", { className: "proximo-card", href: "#eventos" },
    el("img", { src: ev.foto, alt: "", loading: "lazy" }), datosEvento(ev),
    el("span", { className: "proximo-ver", textContent: "Ver mapa y detalles ›" })));
  $("#proximo").hidden = false;
}
$("#eventos-lista").replaceChildren(...(eventos.length ? eventos.map((ev) =>
  el("article", { className: "evento-full" },
    el("button", { className: "flyer-btn", type: "button", ariaLabel: `Ver afiche de ${ev.nombre} en grande`, onclick: () => verGrande(ev.foto, `Afiche de ${ev.nombre}`) },
      el("img", { className: "evento-flyer", src: ev.foto, alt: `Afiche de ${ev.nombre}`, loading: "lazy" })),
    el("div", {}, datosEvento(ev),
      ev.mapa ? el("iframe", { className: "evento-mapa", src: mapaUrl(ev), title: `Mapa: ${ev.lugar}`, loading: "lazy", referrerPolicy: "no-referrer-when-downgrade" }) : "",
      ev.mapa ? el("a", { className: "secundario", href: lugarUrl(ev), target: "_blank", rel: "noopener", textContent: "Cómo llegar" }) : "")))
  : [el("p", { textContent: "Por ahora no hay eventos agendados. Seguinos en Instagram para enterarte." })]));

$("#wa-flotante").href = $("#nosotros-wa").href = waLink("Hola Aukan3D! Quería hacer una consulta.");

const verCarrito = () => $("#carrito").showModal();
$("#buscar").addEventListener("input", (e) => { filtro.q = e.target.value; pagina = 1; pintar(); });
$("#por-pagina").addEventListener("change", (e) => {
  porPagina = +e.target.value;
  try { localStorage.aukan_por_pagina = porPagina; } catch { /* sin storage */ }
  irA(1);
});
$("#ver-carrito").addEventListener("click", verCarrito);
$("#barra-ver").addEventListener("click", verCarrito);
$("#detalle-add").addEventListener("click", () =>
  enDetalle.precio ? cambiar(enDetalle.id, 1) : window.open(waConsulta(enDetalle), "_blank"));
$("#detalle").addEventListener("close", () => { enDetalle = null; });
// Tocar fuera del contenido cierra el modal.
for (const d of document.querySelectorAll("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
$("#checkout").addEventListener("submit", enviar);
cargar();
