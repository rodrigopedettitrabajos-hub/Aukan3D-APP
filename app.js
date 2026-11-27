const cfg = window.AUKAN_CONFIG;
if (cfg.apiUrl) { // servidor propio (api/): catálogo y pedidos salen de ahí
  const api = cfg.apiUrl.replace(/\/+$/, "");
  cfg.catalogoCsvUrl = api + "/api/productos.csv";
  cfg.pedidosUrl = api + "/api/pedidos";
}
const $ = (s) => document.querySelector(s);
const pesos = (n) => "$" + n.toLocaleString("es-UY");

let productos = [];
const filtro = { cat: "Todo", sub: "", q: "", orden: "", fav: false };
const carrito = new Map(); // id -> cantidad (se guarda en el dispositivo: no se pierde al recargar)
const MAX = 99; // mismo tope por producto que apps-script/Code.gs
const guardarCarrito = () => escribir("aukan_carrito", carrito.size ? [...carrito] : null);
const favs = new Set(leerJson("aukan_favoritos", []));
let enDetalle = null;
let pagina = 1;
let porPagina = 20;
try { porPagina = [10, 20, 50].includes(+localStorage.aukan_por_pagina) ? +localStorage.aukan_por_pagina : 20; } catch { /* sin storage */ }

function el(tag, { dataset, ...props } = {}, ...hijos) {
  const e = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(e.dataset, dataset);
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
    $("#estado").replaceChildren("No pudimos cargar el catálogo. ",
      el("button", { className: "link-btn", type: "button", textContent: "Reintentar", onclick: () => { $("#estado").textContent = "Cargando catálogo…"; cargar(); } }),
      " o ", el("a", { href: waHola, target: "_blank", rel: "noopener", textContent: "pedinos por WhatsApp" }), ".");
    return;
  }
  for (const [id, cant] of leerJson("aukan_carrito", [])) if (productos.some((p) => p.id === id && p.precio)) carrito.set(id, Math.min(cant, MAX));
  $("#n-modelos").textContent = productos.length;
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

const CUENTA = ["#mis-pedidos", "#historial", "#mis-datos"]; // pantallas de la cuenta (menú del usuario)
const VISTAS = [...INFO.map(([h]) => h), ...CUENTA];
function mostrarVista() {
  const vista = VISTAS.includes(location.hash) ? location.hash.slice(1) : "";
  $("#hero").hidden = $("#catalogo").hidden = !!vista;
  $("#proximo").hidden = !!vista || !eventos.length;
  for (const h of VISTAS) $(h).hidden = h.slice(1) !== vista;
  vista ? (document.body.dataset.vista = vista) : delete document.body.dataset.vista;
  pintarFiltros();
  scrollTo(0, 0);
  cargarMapas();
}
// El mapa se carga recién cuando su pantalla está visible: cargado oculto, Google lo dibuja chiquito (iPhone).
function cargarMapas() {
  if (location.hash === "#eventos") requestAnimationFrame(() =>
    document.querySelectorAll("iframe[data-src]:not([src])").forEach((f) => { f.src = f.dataset.src; }));
}
function mapaDiferido(ev) {
  const f = el("iframe", { className: "evento-mapa", title: `Mapa: ${ev.lugar}`, referrerPolicy: "no-referrer-when-downgrade" });
  f.dataset.src = mapaUrl(ev);
  return f;
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
  const q = normalizar(filtro.q.trim());
  const lista = productos.filter((p) =>
    (filtro.cat === "Todo" || p.categoria === filtro.cat) &&
    (!filtro.sub || p.subcategoria === filtro.sub) &&
    (!filtro.fav || favs.has(p.id)) &&
    (!q || normalizar(`${p.nombre} ${p.categoria} ${p.subcategoria}`).includes(q)));
  const precio = (p) => p.precio || Infinity; // "Consultar" va al final
  if (filtro.orden === "menor") lista.sort((a, b) => precio(a) - precio(b));
  if (filtro.orden === "mayor") lista.sort((a, b) => (b.precio || -1) - (a.precio || -1));
  return lista;
}

// Filtros activos como etiquetas con ×, arriba de la grilla (se ven aunque no haya resultados).
function pintarActivos() {
  const chip = (texto, quitar) => el("button", { className: "chip", type: "button", ariaLabel: `Quitar filtro ${texto}`, onclick: () => { quitar(); irA(1); } }, texto, el("span", { ariaHidden: "true", textContent: " ×" }));
  const chips = [
    filtro.cat !== "Todo" && chip([filtro.cat, filtro.sub].filter(Boolean).join(" · "), () => { filtro.cat = "Todo"; filtro.sub = ""; }),
    filtro.q.trim() && chip(`"${filtro.q.trim()}"`, () => { filtro.q = $("#buscar").value = ""; }),
    filtro.fav && chip("Favoritos", () => { filtro.fav = false; }),
  ].filter(Boolean);
  $("#activos").replaceChildren(...chips);
  $("#activos").hidden = !chips.length;
  $("#buscar-borrar").hidden = !filtro.q;
  $("#solo-fav").ariaPressed = String(filtro.fav);
  $("#solo-fav").textContent = `♥ Favoritos${favs.size ? ` (${favs.size})` : ""}`;
}

function foto(p) {
  return p.foto
    ? el("img", { src: p.foto, alt: p.nombre, loading: "lazy", referrerPolicy: "no-referrer",
        onerror() { this.replaceWith(el("div", { className: "nofoto", textContent: "3D" })); } })
    : el("div", { className: "nofoto", textContent: "3D" });
}

// "Agregar" y, una vez en el pedido, el selector − n +. Igual en la tarjeta, la ficha y el carrito.
// data-foco permite devolver el foco al mismo botón después de repintar.
function control(p, pre = "") {
  const cant = carrito.get(p.id) || 0;
  const mas = (e) => { volar(e.currentTarget.closest(".card")?.querySelector(".foto img")); cambiar(p.id, 1); };
  if (!cant) return el("button", { className: "add", type: "button", textContent: "Agregar", ariaLabel: `Agregar ${p.nombre} al pedido`, onclick: mas, dataset: { foco: `${pre}${p.id}:add` } });
  return el("span", { className: "qty" },
    el("button", { type: "button", textContent: "−", ariaLabel: `Quitar uno de ${p.nombre}`, onclick: () => cambiar(p.id, -1), dataset: { foco: `${pre}${p.id}:-` } }),
    el("output", { textContent: cant, ariaLabel: `${cant} en el pedido` }),
    el("button", { type: "button", textContent: "+", ariaLabel: `Sumar uno de ${p.nombre}`, disabled: cant >= MAX, onclick: mas, dataset: { foco: `${pre}${p.id}:+` } }));
}

const precioTexto = (p) => (p.precio ? pesos(p.precio) : "Consultar");
const waConsulta = (p) => waLink(`Hola Aukan3D! Quiero consultar por: ${p.nombre}`);

function tarjeta(p) {
  const fav = favs.has(p.id);
  return el("article", { className: "card" },
    el("button", { className: "foto", type: "button", ariaLabel: `Ver ${p.nombre}`, onclick: () => abrirDetalle(p) }, foto(p),
      p.fotos.length > 1 ? el("span", { className: "n-fotos", textContent: `${p.fotos.length} fotos` }) : ""),
    el("button", { className: "fav", type: "button", textContent: fav ? "♥" : "♡", ariaPressed: String(fav), ariaLabel: `Guardar ${p.nombre} en favoritos`,
      dataset: { foco: `f${p.id}:fav` }, onclick: () => { fav ? favs.delete(p.id) : favs.add(p.id); escribir("aukan_favoritos", [...favs]); conFoco(pintar); } }),
    el("div", { className: "info" },
      el("span", { className: "sub", textContent: p.subcategoria || p.categoria }),
      el("h3", { textContent: p.nombre }),
      el("div", { className: "row" },
        el("strong", { className: "precio", textContent: precioTexto(p) }),
        p.precio ? control(p)
          : el("a", { className: "add", href: waConsulta(p), target: "_blank", rel: "noopener", textContent: "Consultar" }))));
}

function abrirDetalle(p) {
  enDetalle = p;
  $("#detalle-foto").replaceChildren(...carrusel(p));
  $("#detalle-sub").textContent = [p.categoria, p.subcategoria].filter(Boolean).join(" · ");
  $("#detalle-nombre").textContent = p.nombre;
  $("#detalle-precio").textContent = precioTexto(p);
  $("#detalle-datos").textContent = [p.tamano, p.material].filter(Boolean).join(" · ");
  $("#detalle-plazo").hidden = !p.precio;
  pintarDetalle();
  $("#detalle").showModal();
}

// Carrusel con scroll-snap: se desliza con el dedo; flechas y puntos para PC.
// Animación de "enviar al carrito": la foto vuela hasta el botón del carrito y los perros
// del inicio levantan la cabeza mientras viaja. Sin movimiento si el sistema lo pide.
function volar(img) {
  const destino = $("#ver-carrito"), perros = $(".mascotas");
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const latido = () => destino.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 350 });
  if (quieto || !img?.complete || !img.naturalWidth) return latido();
  const a = img.getBoundingClientRect(), b = destino.getBoundingClientRect();
  const clon = el("img", { src: img.src, alt: "", className: "volando" });
  Object.assign(clon.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px" });
  document.body.append(clon);
  perros.classList.add("miran");
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  clon.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1, borderRadius: "16px" },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 80}px) scale(.5)`, opacity: 1, borderRadius: "50%", offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: .6, borderRadius: "50%" },
  ], { duration: 750, easing: "cubic-bezier(.5,0,.6,1)" }).finished.then(() => {
    clon.remove();
    latido();
    setTimeout(() => perros.classList.remove("miran"), 250);
  });
}

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
  $("#detalle-control").replaceChildren(enDetalle.precio ? control(enDetalle, "d")
    : el("a", { className: "add", href: waConsulta(enDetalle), target: "_blank", rel: "noopener", textContent: "Consultar por WhatsApp" }));
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
  pintarActivos();
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
  if (!lista.length && $("#activos").hidden === false) $("#estado").append(" ", el("button", { className: "link-btn", type: "button", textContent: "Quitar filtros", onclick: () => { Object.assign(filtro, { cat: "Todo", sub: "", q: "", fav: false }); $("#buscar").value = ""; irA(1); } }));
  pintarPaginas(paginas);
  pintarCarrito();
}

function itemsCarrito() {
  return [...carrito].map(([id, cant]) => ({ ...productos.find((p) => p.id === id), cant }));
}

const sumar = (items) => items.reduce((s, i) => s + i.precio * i.cant, 0);

function cambiar(id, d) {
  const antes = carrito.get(id) || 0, n = Math.min(MAX, antes + d);
  n > 0 ? carrito.set(id, n) : carrito.delete(id);
  guardarCarrito();
  conFoco(() => { pintar(); pintarDetalle(); });
  const p = productos.find((x) => x.id === id);
  if (!n && antes) avisar(`Quitaste ${p.nombre}`, () => cambiar(id, antes));
  else if (n > antes) $("#anuncio").textContent = `Agregado: ${p.nombre} (${n})`;
}

// Repinta y devuelve el foco al mismo botón (o a otro del mismo producto) para no perderlo con el teclado.
function conFoco(repintar) {
  const k = document.activeElement?.dataset?.foco;
  repintar();
  if (!k) return;
  const [pre] = k.split(":"), q = (sel) => document.querySelector(`[data-foco${sel}]`);
  (q(`="${CSS.escape(k.replace(":add", ":+"))}"`) || q(`="${CSS.escape(k)}"`) || q(`^="${CSS.escape(pre)}:"`))?.focus();
}

// Aviso abajo con "Deshacer" (5 s).
let avisoT;
function avisar(texto, deshacer) {
  clearTimeout(avisoT);
  $("#aviso-txt").textContent = texto;
  $("#aviso-btn").hidden = !deshacer;
  $("#aviso-btn").onclick = () => { $("#aviso").hidden = true; deshacer(); };
  $("#aviso").hidden = false;
  avisoT = setTimeout(() => { $("#aviso").hidden = true; }, 5000);
}

function pintarCarrito() {
  const items = itemsCarrito();
  const n = items.reduce((s, i) => s + i.cant, 0);
  const suma = sumar(items), total = pesos(suma);
  $("#cart-count").textContent = n;
  $("#total").textContent = total;
  $("#barra").hidden = !n;
  $("#barra-cant").textContent = n === 1 ? "1 producto" : `${n} productos`;
  $("#barra-total").textContent = total;
  $("#plazo").textContent = suma ? `Se imprime a pedido: listo en 3 o más días hábiles · Seña 50 %: ${pesos(montoSena(suma))}` : "";
  $("#monto-sena").textContent = suma ? `(${pesos(montoSena(suma))})` : "";
  $("#monto-todo").textContent = suma ? `(${total})` : "";
  $("#enviar").disabled = !n;
  $("#items").replaceChildren(...(items.length ? items.map((i) =>
    el("li", {},
      el("span", { className: "nombre", textContent: i.nombre }),
      control(i, "c"),
      el("strong", { textContent: pesos(i.precio * i.cant) })))
    : [el("li", { className: "vacio", textContent: "Todavía no agregaste productos." })]));
}

async function enviar(ev) {
  ev.preventDefault();
  const form = ev.target;
  const cliente = Object.fromEntries(new FormData(form));
  cliente.envio = [cliente.envio_dir, cliente.envio_depto].filter(Boolean).join(", "); // solo con "Envío por agencia"
  delete cliente.envio_dir; delete cliente.envio_depto;
  const items = itemsCarrito(), suma = sumar(items), sena = cliente.modo !== "total";
  const perfil = sesion();
  const direccion = cliente.envio || [...new Set([perfil?.direccion, perfil?.barrio, perfil?.ciudad, perfil?.departamento].filter(Boolean))].join(", ");
  // El pedido guarda sus propios datos (cliente y dirección): el comprobante no mezcla con otra cuenta.
  const registro = (numero, total = suma) => { ultimoPedido = guardarPedido({ numero, total, sena, entrega: cliente.entrega, direccion,
    cliente: { nombre: cliente.nombre, whatsapp: cliente.whatsapp, email: cliente.email },
    items: items.map(({ id, nombre, precio, cant }) => ({ id, nombre, precio, cant })) }); };
  const texto = resumenPedido(items, cliente);
  if (!cfg.pedidosUrl) { // sin servidor: el pedido llega solo si el cliente manda el WhatsApp
    registro();
    const msj = `${texto}\nPedido N° ${ultimoPedido.numero}`;
    const abierto = window.open(waLink(msj), "_blank");
    return mostrarPago({ texto: msj, sena, recibido: false, bloqueado: !abierto, total: suma });
  }
  $("#enviar").disabled = true;
  $("#enviar-txt").textContent = "Enviando…";
  let r = {};
  try {
    // text/plain evita el preflight CORS que Apps Script no responde.
    const res = await fetch(cfg.pedidosUrl, { method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ cliente, items: items.map((i) => ({ id: i.id, cant: i.cant })) }) });
    r = await res.json();
  } catch { /* sin respuesta: queda el WhatsApp */ }
  $("#enviar-txt").textContent = "Enviar pedido por WhatsApp";
  $("#enviar").disabled = false;
  // Los montos del servidor mandan; si falló, los calculamos acá y el pedido sale por WhatsApp.
  registro(r.ok ? r.numero : undefined, r.ok ? r.total : suma);
  const pago = r.ok && /^https:\/\/([\w-]+\.)*mercadopago\.com(\.[a-z]{2})?\//.test(r.pago || "") ? r.pago : "";
  mostrarPago({ pago, sena, recibido: !!r.ok, total: r.ok ? r.total : suma, aPagar: r.ok ? r.aPagar : undefined,
    texto: `${texto}\nPedido N° ${ultimoPedido.numero}` + (pago ? `\nLink de pago: ${pago}` : "") });
  if (r.ok) terminar(form); // ya está en la planilla; si falló, el carrito queda hasta que lo manden
}

let ultimoPedido = null;

// Comprobante del pedido: se arma en #comprobante y se imprime (el navegador ofrece "Guardar como PDF").
function comprobante(p) {
  const c = p.cliente || {}, dir = p.direccion; // solo los datos guardados en el pedido
  const fila = (...celdas) => el("tr", {}, ...celdas.map((t) => el("td", { textContent: t })));
  const aPagar = p.sena ? montoSena(p.total) : p.total;
  $("#comprobante").replaceChildren(
    el("header", {}, el("img", { src: "logo.webp", alt: "", width: 64, height: 64 }),
      el("div", {}, el("h1", { textContent: "Comprobante de pedido" }), el("p", { textContent: `Pedido N° ${p.numero} · ${new Date(p.fecha).toLocaleDateString("es-UY")}` }))),
    el("section", {}, el("h2", { textContent: "Cliente" }),
      ...[c.nombre, c.whatsapp && `WhatsApp: ${c.whatsapp}`, c.email, dir && `Dirección: ${dir}`, p.entrega && `Entrega: ${p.entrega}`]
        .filter(Boolean).map((t) => el("p", { textContent: t }))),
    el("table", {},
      el("thead", {}, el("tr", {}, ...["Cant.", "Producto", "Precio", "Subtotal"].map((t) => el("th", { textContent: t })))),
      el("tbody", {}, ...p.items.map((i) => fila(String(i.cant), i.nombre, pesos(i.precio), pesos(i.precio * i.cant)))),
      el("tfoot", {}, fila("", "Total", "", pesos(p.total)),
        p.sena ? fila("", "Seña 50% a pagar", "", pesos(aPagar)) : fila("", "Pago total", "", pesos(aPagar)),
        p.sena ? fila("", "Saldo al entregar", "", pesos(p.total - aPagar)) : "")),
    el("p", { className: "comp-pie", textContent: `Aukan3D · Montevideo, Uruguay · WhatsApp ${cfg.whatsapp.replace(/^598/, "0")} · Instagram @aukan3d` }),
    el("p", { className: "comp-pie", textContent: "Este comprobante resume tu pedido; no es una factura." }));
  window.print();
}
const waLink = (texto) => `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(texto)}`;

function terminar(form) {
  carrito.clear();
  guardarCarrito();
  form.reset();
  pintar();
  pintarCuenta(); // vuelve a completar los datos si hay sesión
  actualizarEnvio();
}

// Pantalla final del carrito. Sin servidor (o si falló) el pedido no llegó hasta que manden el WhatsApp:
// lo decimos claro y el carrito queda guardado hasta "Ya lo mandé".
function mostrarPago({ pago = "", texto, sena, recibido, bloqueado, total, aPagar = sena ? montoSena(total) : total }) {
  for (const e of [$("#items"), $(".total"), $("#plazo"), $("#checkout")]) e.hidden = true;
  $("#pago").hidden = false;
  const n = ultimoPedido.items.reduce((s, i) => s + i.cant, 0);
  $("#pago-titulo").textContent = recibido ? "¡Pedido recibido!" : "Falta un paso: mandanos el mensaje";
  $("#pago-numero").textContent = `Pedido N° ${ultimoPedido.numero} · ${n === 1 ? "1 producto" : `${n} productos`}`;
  $("#pago-total").textContent = sena ? `Seña ${pesos(aPagar)} · total ${pesos(total)}` : `Total ${pesos(total)}`;
  $("#pago-texto").textContent = pago ? `${sena ? "Pagá la seña" : "Pagalo"} con Mercado Pago: escaneá el QR con el celular o tocá el botón.`
    : recibido ? "Ya lo tenemos. Avisanos por WhatsApp y coordinamos el pago."
    : bloqueado ? "Tu navegador no abrió WhatsApp. Tocá el botón para mandarnos el pedido."
    : "Te abrimos WhatsApp con el pedido escrito. Hasta que nos llegue ese mensaje no lo tenemos: si no lo mandaste, tocá el botón.";
  $("#pago-wa").href = waLink(texto);
  $("#pago-wa-txt").textContent = recibido ? "Avisar por WhatsApp" : "Mandar el pedido por WhatsApp";
  $("#pago-listo").hidden = recibido;
  $("#pago-link").textContent = sena ? "Pagar la seña con Mercado Pago" : "Pagar con Mercado Pago";
  $("#pago-link").hidden = $("#pago-qr").hidden = !pago;
  $("#ofrecer-cuenta").hidden = !!sesion(); // a los invitados les ofrecemos guardar este pedido en una cuenta
  if (!pago) return;
  $("#pago-link").href = pago;
  cargarQr().then(() => {
    const qr = qrcode(0, "M");
    qr.addData(pago);
    qr.make();
    $("#pago-qr").src = qr.createDataURL(6, 2);
  }, () => { $("#pago-qr").hidden = true; });
}
// La librería del QR (57 KB) se baja recién cuando hay un link de pago.
const cargarQr = () => window.qrcode ? Promise.resolve()
  : new Promise((ok, mal) => document.head.append(el("script", { src: "qrcode.js?v=" + cfg.version.slice(1), onload: ok, onerror: mal })));
$("#pago-listo").addEventListener("click", () => {
  terminar($("#checkout"));
  $("#carrito").close();
  avisar("¡Gracias! Te respondemos por WhatsApp.");
});

$("#carrito").addEventListener("close", () => {
  for (const e of [$("#items"), $(".total"), $("#plazo"), $("#checkout")]) e.hidden = false;
  $("#pago").hidden = true;
});
// Registro opcional: desde el carrito o después de pedir como invitado.
$("#invitado-ingresar").addEventListener("click", () => { elegirTab(false); $("#cuenta").showModal(); });
$("#invitado-registro").addEventListener("click", () => { elegirTab(true); $("#cuenta").showModal(); });
$("#crear-cuenta").addEventListener("click", () => {
  const f = $("#form-registro");
  for (const k of ["nombre", "whatsapp", "email"]) f[k].value = ultimoPedido?.cliente[k] || "";
  $("#carrito").close();
  elegirTab(true);
  $("#cuenta").showModal();
  f.clave.focus();
});
// Visor: si la foto viene de un carrusel, se pasa a las otras con flechas, deslizando o con ← →.
let visorFotos = [], visorI = 0;
function verGrande(src, alt, fotos = [src]) {
  visorFotos = fotos; visorI = Math.max(0, fotos.indexOf(src));
  $("#visor-img").alt = alt;
  $("#visor").classList.toggle("varias", fotos.length > 1);
  verFoto(0);
  $("#visor").showModal();
}
function verFoto(d) {
  visorI = (visorI + d + visorFotos.length) % visorFotos.length;
  $("#visor-img").src = visorFotos[visorI];
  $("#visor-n").textContent = visorFotos.length > 1 ? `${visorI + 1} / ${visorFotos.length}` : "";
}
$("#visor-ant").onclick = () => verFoto(-1);
$("#visor-sig").onclick = () => verFoto(1);
$("#visor").addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") verFoto(-1); if (e.key === "ArrowRight") verFoto(1); });
let toqueX = null;
$("#visor-img").addEventListener("pointerdown", (e) => { toqueX = e.clientX; });
$("#visor-img").addEventListener("pointerup", (e) => {
  const dx = e.clientX - toqueX;
  if (toqueX !== null && Math.abs(dx) > 40) verFoto(dx < 0 ? 1 : -1);
  toqueX = null;
});
// Galería: los eventos con data-fotos="a.webp|b.webp" pasan a carrusel (la foto del HTML va primera).
document.querySelectorAll("#galeria [data-fotos]").forEach((fig) => {
  const img = fig.querySelector("img");
  img.replaceWith(...carrusel({ nombre: img.alt, fotos: [img.getAttribute("src"), ...fig.dataset.fotos.split("|")] }));
});
// Cualquier foto de la ficha o de la galería se agranda al tocarla (o con Enter).
const AMPLIABLE = ".carrusel img, #galeria img";
document.querySelectorAll("#galeria img").forEach((i) => Object.assign(i, { tabIndex: 0, role: "button" }));
const ampliar = (e) => {
  const img = e.target.closest?.(AMPLIABLE);
  if (!img || (e.type === "keydown" && e.key !== "Enter")) return;
  e.preventDefault(); // si no, el Enter "aprieta" el botón cerrar del visor recién abierto
  const fotos = [...(img.closest(".carrusel")?.querySelectorAll("img") || [img])].map((i) => i.src);
  verGrande(img.src, img.alt, fotos);
};
document.addEventListener("click", ampliar);
document.addEventListener("keydown", ampliar);

// Eventos (config.js): tarjeta en el inicio y pantalla "Eventos" con mapa.
const hoy = new Date().toLocaleDateString("sv"); // AAAA-MM-DD en la hora local
const eventos = (cfg.eventos || []).filter((ev) => !ev.hasta || ev.hasta >= hoy); // los que ya pasaron no se muestran
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
      ev.mapa ? mapaDiferido(ev) : "",
      ev.mapa ? el("a", { className: "secundario", href: lugarUrl(ev), target: "_blank", rel: "noopener", textContent: "Cómo llegar" }) : "")))
  : [el("p", { textContent: "Por ahora no hay eventos agendados. Seguinos en Instagram para enterarte." })]));
cargarMapas();

const waHola = waLink("Hola Aukan3D! Quería hacer una consulta.");
document.querySelectorAll("#wa-flotante, #nosotros-wa, .wa-link").forEach((a) => (a.href = waHola));

const verCarrito = () => $("#carrito").showModal();
$("#buscar").addEventListener("input", (e) => { filtro.q = e.target.value; pagina = 1; pintar(); });
$("#buscar-borrar").addEventListener("click", () => { filtro.q = $("#buscar").value = ""; pagina = 1; pintar(); $("#buscar").focus(); });
$("#orden").addEventListener("change", (e) => { filtro.orden = e.target.value; irA(1); });
$("#solo-fav").addEventListener("click", () => { filtro.fav = !filtro.fav; irA(1); });
// "/" lleva a la búsqueda (si no se está escribiendo en otro campo).
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.target.closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
  e.preventDefault();
  verCatalogo();
  $("#buscar").focus();
});
$("#por-pagina").addEventListener("change", (e) => {
  porPagina = +e.target.value;
  try { localStorage.aukan_por_pagina = porPagina; } catch { /* sin storage */ }
  irA(1);
});
$("#ver-carrito").addEventListener("click", verCarrito);
$("#pago-comprobante").addEventListener("click", () => comprobante(ultimoPedido));
$("#barra-ver").addEventListener("click", verCarrito);
$("#detalle").addEventListener("close", () => { enDetalle = null; });
// Tocar fuera del contenido cierra el modal.
for (const d of document.querySelectorAll("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
$("#checkout").addEventListener("submit", enviar);

// Envío por agencia: pide departamento y dirección (completados con la cuenta, si hay).
const fc = $("#checkout");
fc.envio_depto.append(...[...$("#form-datos").departamento.options].map((o) => o.cloneNode(true)));
function actualizarEnvio() {
  const si = fc.entrega.value === "Envío por agencia", p = sesion();
  $("#envio").hidden = !si;
  for (const c of [fc.envio_depto, fc.envio_dir]) { c.disabled = !si; c.required = si; }
  if (si && p) {
    if (!fc.envio_depto.value) fc.envio_depto.value = p.departamento || "";
    if (!fc.envio_dir.value) fc.envio_dir.value = [p.direccion, p.barrio, p.ciudad].filter(Boolean).join(", ");
  }
}
fc.addEventListener("change", (e) => { if (e.target.name === "entrega") actualizarEnvio(); });
actualizarEnvio();
// Desde el carrito, "Preguntas frecuentes" cierra el carrito.
$("#carrito-faq").addEventListener("click", () => $("#carrito").close());

// Mensajes propios en vez de los genéricos del navegador (data-falta / data-formato en cada campo).
document.addEventListener("invalid", (e) => {
  const i = e.target, d = i.dataset;
  i.setCustomValidity(i.validity.valueMissing ? d.falta || "" : (i.validity.patternMismatch || i.validity.typeMismatch) ? d.formato || "" : "");
}, true);
document.addEventListener("input", (e) => e.target.setCustomValidity?.(""), true);
// Antes de validar, se limpian los mensajes viejos (un campo pudo completarse solo, sin "input").
document.addEventListener("click", (e) => {
  e.target.closest?.("button[type=submit], form button:not([type])")?.form?.querySelectorAll("input, select, textarea").forEach((i) => i.setCustomValidity(""));
}, true);
cargar();
