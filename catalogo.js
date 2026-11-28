// Lógica pura (sin DOM), compartida por la app y por test.js.

// Parser CSV mínimo: comillas, comas y saltos de línea dentro de comillas (formato de Google Sheets).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Solo https o un archivo dentro de la app (ej. fotos/charizard.webp). Nada de javascript:, data:, etc.
function fotoSegura(f) {
  return /^https:\/\/\S+$/.test(f) || /^[\w-]+(\/[\w-]+)*\.(webp|jpe?g|png)$/i.test(f) ? f : "";
}

function productosDesdeCsv(text) {
  const [head, ...rows] = parseCsv(text);
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (r, k) => (r[h.indexOf(k)] || "").trim();
  return rows
    .map((r) => ({
      id: col(r, "id"),
      categoria: col(r, "categoria") || "Otros",
      subcategoria: col(r, "subcategoria"),
      nombre: col(r, "nombre"),
      precio: Number(col(r, "precio").replace(/[^\d]/g, "")) || 0,
      // Varias fotos separadas por | (la primera es la de la tarjeta, el resto va al carrusel).
      fotos: col(r, "foto").split("|").map((f) => fotoSegura(f.trim())).filter(Boolean),
      activo: !/^(no|false|0)$/i.test(col(r, "activo")),
      tamano: col(r, "tamano"), // opcional, ej. "12 cm de alto"
      material: col(r, "material"), // opcional, ej. "PLA"
    }))
    .map((p) => ({ ...p, foto: p.fotos[0] || "" })) // sin precio = "Consultar"
    .filter((p) => p.id && p.nombre && p.activo);
}

// Igual que en el servidor (api: nuevoPedido): la seña es el 50% redondeado hacia arriba.
const montoSena = (total) => Math.ceil(total / 2);

function resumenPedido(items, cliente) {
  const total = items.reduce((s, i) => s + i.precio * i.cant, 0);
  const lineas = items.map((i) => `• ${i.cant} x ${i.nombre} ($${i.precio})`);
  return [
    "¡Hola, Aukan3D! Quiero hacer este pedido:",
    ...lineas,
    `Total: $${total}`,
    `Nombre: ${cliente.nombre}`,
    `Entrega: ${cliente.entrega}${cliente.envio ? ` (${cliente.envio})` : ""}`,
    cliente.modo === "total" ? `Pago: todo ($${total})` : `Pago: seña del 50 % ($${montoSena(total)})`,
    cliente.comentario ? `Comentario: ${cliente.comentario}` : "",
  ].filter(Boolean).join("\n");
}

// Búsqueda sin mayúsculas ni acentos: "pokemon" encuentra "Pokémon".
const normalizar = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Cuenta de vista previa (localStorage). shortcut: la contraseña NO se guarda ni se verifica;
// reemplazar por cuentas reales cuando haya base de datos.
const CLAVE_PERFIL = "aukan_perfil";
const CLAVE_DEMO_PANEL = "aukan_pedidos_panel"; // pedidos de este navegador que lee admin/
const clavePedidos = (email) => "aukan_pedidos:" + email; // cada cuenta ve solo sus pedidos
function leerJson(k, vacio) { try { return JSON.parse(localStorage.getItem(k)) ?? vacio; } catch { return vacio; } }
function escribir(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } }
const leerPerfil = () => leerJson(CLAVE_PERFIL, null);
const guardarPerfil = (p) => escribir(CLAVE_PERFIL, p);
const sesion = () => { const p = leerPerfil(); return p?.activo ? p : null; };
const leerPedidos = (email = sesion()?.email) => (email ? leerJson(clavePedidos(email), []) : []);
const guardarPedidos = (lista, email = sesion()?.email) => email && escribir(clavePedidos(email), lista.slice(0, 50));
// Devuelve el pedido completo (para el comprobante) y lo guarda solo si hay sesión.
function guardarPedido(pedido) {
  const p = { fecha: new Date().toISOString(), estado: 0, ...pedido, numero: pedido.numero || `W${Date.now().toString(36).toUpperCase().slice(-6)}` };
  if (sesion()) { guardarPedidos([p, ...leerPedidos()]); p.guardado = true; }
  // shortcut: copia para el panel de gestión de la demo (mismo navegador); se va cuando haya base de datos.
  escribir(CLAVE_DEMO_PANEL, [p, ...leerJson(CLAVE_DEMO_PANEL, [])].slice(0, 50));
  return p;
}
// "Cerrar sesión" con "olvidar mis datos": borra el perfil y sus pedidos de este dispositivo.
function olvidarCuenta() {
  const p = leerPerfil();
  if (p?.email) escribir(clavePedidos(p.email), null);
  escribir(CLAVE_PERFIL, null);
}
try { localStorage.removeItem("aukan_pedidos"); } catch { /* clave vieja compartida (V0.20–V0.23) */ }

// Textos de entrega y envío con los datos que carga Aukan3D en el panel (pantalla Envíos). Sin datos, quedan los textos de siempre.
function textosEnvio(d = {}) {
  const punto = (t) => (t && !/[.!?]$/.test(t) ? t + "." : t || "");
  const agencias = d.agencias ? ` por ${d.agencias}` : "";
  const costo = d.costo ? ` ${punto(d.costo)}` : " Coordinamos el costo por WhatsApp.";
  const plazo = d.plazo ? ` Llega en ${punto(d.plazo)}` : "";
  const retiro = d.retiro ? `Retiro coordinado: ${punto(d.retiro)}` : "Retiro coordinado: nos encontramos en un punto de Montevideo.";
  return {
    faq: `Sí. En Montevideo ${d.retiro ? "coordinamos el retiro: " + punto(d.retiro) : "entregamos en puntos de encuentro."} Al interior enviamos${agencias}.${costo}${plazo}`,
    entrega: `${retiro} Envío por agencia: lo mandamos al interior${agencias}.${costo}${plazo}`,
    info: d.agencias || d.costo || d.plazo ? `Enviamos${agencias}.${costo}${plazo}`.trim() : "",
  };
}

if (typeof module !== "undefined") module.exports = { textosEnvio, parseCsv, productosDesdeCsv, resumenPedido, montoSena, normalizar,
  leerPerfil, guardarPerfil, leerPedidos, guardarPedidos, guardarPedido, olvidarCuenta };
