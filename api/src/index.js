// Servidor de Aukan3D en Cloudflare Workers + D1 (SQLite).
// - Público: catálogo en CSV (lo lee la tienda) y alta de pedidos (precios recalculados acá).
// - Panel de gestión: ingreso con usuario y contraseña, y lectura/escritura de sus datos.
// Cada registro del panel se guarda como JSON en la tabla docs (col, id); ver schema.sql.

const COLECCIONES = ["productos", "clientes", "ventas", "gastos", "medios", "usuarios", "cajas", "mensajes", "resenas"];
const MAX_ITEMS = 50, MAX_CANT = 99;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origen = req.headers.get("Origin") || "";
    // "https://*.algo.dev" acepta cualquier subdominio (las vistas previas de Cloudflare Pages).
    const permitido = (env.ORIGENES || "").split(",").map((s) => s.trim()).some((o) =>
      o === origen || (o.startsWith("https://*.") && /^https:\/\/[a-z0-9-]+\./.test(origen) && origen.endsWith(o.slice(9)) && !/[/:@]/.test(origen.slice(8))));
    const cors = permitido ? { "Access-Control-Allow-Origin": origen, "Vary": "Origin" } : {};
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" } });
    }
    try {
      // ?e=pruebas usa la base de pruebas (DB_PRUEBAS): datos de mentira para probar sin tocar los reales.
      const pruebas = url.searchParams.get("e") === "pruebas";
      if (pruebas && !env.DB_PRUEBAS) return json({ ok: false, error: "entorno" }, 503, cors);
      const r = await rutear(req, { ...(pruebas ? { ...env, DB: env.DB_PRUEBAS, DB_REAL: env.DB, PRUEBAS: true } : env), AQUI: url.origin, TIENDA: permitido ? origen : "", CTX: ctx }, url);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: "servidor" }, 500, cors);
    }
  },
};

async function rutear(req, env, url) {
  const p = url.pathname, m = req.method;
  if (m === "GET" && p === "/api/productos.csv") return catalogoCsv(env, url);
  if (m === "GET" && p.startsWith("/api/fotos/")) return foto(env, p.slice(11).replace(/\.webp$/, ""));
  if (m === "POST" && p === "/api/pedidos") return nuevoPedido(req, env);
  if (m === "POST" && p === "/api/pedidos/estado") return estadoPedidos(req, env);
  if (m === "POST" && p === "/api/resenas") return nuevaResena(req, env);
  if (m === "POST" && p === "/api/login") return login(req, env);
  if (m === "POST" && p === "/api/mp/aviso") return avisoMp(req, env, url);
  if (m === "GET" && p === "/api/tienda") return datosTienda(env);
  if (m === "GET" && p === "/api/push/clave") return json({ ok: true, clave: (await clavesPush(env)).publica });
  if (m === "POST" && p === "/api/push/alta") return altaPush(req, env);
  if (m === "POST" && p === "/api/push/ultimo") return ultimoPush(req, env);
  if (p.startsWith("/api/admin/")) {
    const quien = await sesionDe(req, env);
    if (!quien) return json({ ok: false, error: "sesion" }, 401);
    if (!(env.PRUEBAS ? quien.pruebas : quien.real)) return json({ ok: false, error: "entorno" }, 403);
    const no = () => json({ ok: false, error: "permiso" }, 403);
    if (m === "POST" && p === "/api/admin/mi-clave") return cambiarMiClave(req, env, quien);
    if (m === "GET" && p === "/api/admin/datos") return datos(env, Number(url.searchParams.get("desde")) || 0, quien);
    if (m === "POST" && p === "/api/admin/lote") return lote(req, env, quien);
    if (m === "POST" && p === "/api/admin/numero") return json({ ok: true, numero: await contador(env) });
    if (m === "GET" && p === "/api/admin/estado") return quien.permisos.includes("base") ? estadoBases(env) : no();
    if (p.startsWith("/api/admin/mp/cobro")) { if (!puedeCobrar(quien)) return no(); }
    else if (p.startsWith("/api/admin/mp") && !quien.permisos.includes("mp")) return no();
    if (m === "GET" && p === "/api/admin/mp") return estadoMp(env);
    if (m === "POST" && p === "/api/admin/mp") return guardarMp(req, env);
    if (m === "POST" && p === "/api/admin/mp/cobro") return cobroMp(req, env);
    if (p.startsWith("/api/admin/cuentas") && !quien.permisos.includes("accesos")) return no();
    if (m === "GET" && p === "/api/admin/cuentas") return listarCuentas(env);
    if (m === "POST" && p === "/api/admin/cuentas") return guardarCuenta(req, env, quien);
    if (m === "POST" && p === "/api/admin/cuentas/clave") return reiniciarClave(req, env, quien);
    if (m === "POST" && p === "/api/admin/cuentas/borrar") return borrarCuenta(req, env, quien);
  }
  return json({ ok: false, error: "no existe" }, 404);
}

// ---------- utilidades ----------
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
const limpio = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const digitos = (t) => String(t || "").replace(/\D/g, "");
async function leerJson(req, max = 2_000_000) {
  const t = await req.text();
  if (t.length > max) throw new Error("grande");
  return JSON.parse(t);
}
async function docs(env, col) {
  const { results } = await env.DB.prepare("SELECT data FROM docs WHERE col = ?").bind(col).all();
  return results.map((r) => JSON.parse(r.data));
}
const guardarDoc = (env, col, id, data, ahora = Date.now()) =>
  env.DB.prepare("INSERT INTO docs (col, id, data, actualizado) VALUES (?, ?, ?, ?) ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, actualizado = excluded.actualizado")
    .bind(col, String(id), JSON.stringify(data), ahora);
async function contador(env, nombre = "venta") {
  const r = await env.DB.prepare("UPDATE contadores SET n = n + 1 WHERE nombre = ? RETURNING n").bind(nombre).first();
  return r.n;
}
// Límite simple por clave (WhatsApp o IP): n intentos cada `ventana` ms.
async function pasaLimite(env, clave, n, ventana) {
  const ahora = Date.now();
  const r = await env.DB.prepare(`INSERT INTO limites (clave, n, hasta) VALUES (?1, 1, ?2)
      ON CONFLICT (clave) DO UPDATE SET n = CASE WHEN hasta < ?3 THEN 1 ELSE n + 1 END, hasta = CASE WHEN hasta < ?3 THEN ?2 ELSE hasta END
      RETURNING n`).bind(clave, ahora + ventana, ahora).first();
  return r.n <= n;
}

// ---------- catálogo público ----------
async function catalogoCsv(env, url) {
  const campo = (v) => { const t = String(v ?? ""); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const cols = ["id", "categoria", "subcategoria", "nombre", "precio", "foto", "activo", "tamano", "material"];
  const lista = (await docs(env, "productos")).filter((p) => p.activo && !p._borrado).sort((a, b) => (+a.id || 0) - (+b.id || 0));
  // Las fotos subidas desde el panel (data:) se sirven en /api/fotos/<id>.webp; las demás son archivos de la tienda.
  const fotoDe = (p) => (String(p.foto || "").startsWith("data:") ? `${url.origin}/api/fotos/${encodeURIComponent(p.id)}.webp?v=${p.fotoV || 1}` : p.foto || "");
  const csv = [cols.join(","), ...lista.map((p) => cols.map((c) =>
    campo(c === "activo" ? "SI" : c === "foto" ? fotoDe(p) : c === "precio" ? p.precio || "" : p[c])).join(","))].join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=60" } });
}
async function foto(env, id) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE col = 'productos' AND id = ?").bind(decodeURIComponent(id)).first();
  const f = r && JSON.parse(r.data).foto;
  if (!f || !f.startsWith("data:image/webp;base64,")) return new Response("No existe", { status: 404 });
  const bytes = Uint8Array.from(atob(f.slice(23)), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400" } });
}

// ---------- uso de las bases (solo usuario dev) ----------
// Tamaño (D1 lo informa en meta.size_after) y registros por colección. Las lecturas/escrituras del día solo están en el tablero de Cloudflare.
async function usoBase(db) {
  if (!db) return null;
  const r = await db.prepare(`SELECT col, COUNT(*) AS n, SUM(CASE WHEN data LIKE '%"_borrado":true%' THEN 1 ELSE 0 END) AS borrados,
      SUM(LENGTH(data)) AS bytes, SUM(CASE WHEN col = 'productos' AND data LIKE '%"foto":"data:%' THEN 1 ELSE 0 END) AS fotos FROM docs GROUP BY col`).all();
  return { tamano: r.meta?.size_after ?? null, colecciones: r.results.map((x) => ({ col: x.col, n: x.n, borrados: x.borrados, bytes: x.bytes, fotos: x.fotos })) };
}
async function estadoBases(env) {
  const [real, pruebas] = await Promise.all([usoBase(env.DB_REAL || env.DB), usoBase(env.DB_PRUEBAS)]);
  return json({ ok: true, limite: 500 * 1024 * 1024, real, pruebas });
}

// ---------- datos públicos para la tienda (envíos y negocio, se editan en el panel) ----------
const PUBLICOS = ["negocio", "direccion", "horario", "redes", "agencias", "costo", "plazo", "retiro"];
async function datosTienda(env) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE col = 'mensajes' AND id = 'negocio'").first();
  const d = r ? JSON.parse(r.data) : {};
  return json({ ok: true, ...Object.fromEntries(PUBLICOS.map((k) => [k, limpio(d[k], 300)])) }, 200, { "Cache-Control": "public, max-age=60" });
}

// ---------- estado de pedidos para "Mis pedidos" de la tienda ----------
// El número es correlativo, así que además pide el WhatsApp del pedido; solo devuelve el estado (ningún dato personal).
async function estadoPedidos(req, env) {
  let body;
  try { body = await leerJson(req, 10_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (!(await pasaLimite(env, "est:" + ip, 60, 600_000))) return json({ ok: false, error: "limite" }, 429);
  const estados = {}, pagos = {};
  for (const v of await pedidosDelCliente(env, body.pedidos)) {
    estados[v.numero] = v.estado;
    // Pagos para el comprobante del cliente: de Mercado Pago va el N° de operación; el medio interno no sale.
    pagos[v.numero] = (v.pagos || []).map((x) => ({ fecha: x.fecha, monto: x.monto, ...(x.mp ? { mp: String(x.mp) } : {}) }));
  }
  return json({ ok: true, estados, pagos });
}

// ---------- reseñas: el cliente califica un pedido entregado (mismo control: número + WhatsApp del pedido) ----------
// Una por pedido (id = número); si la manda de nuevo, la reemplaza.
async function nuevaResena(req, env) {
  let b;
  try { b = await leerJson(req, 5_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  if (!(await pasaLimite(env, "res:" + (req.headers.get("CF-Connecting-IP") || ""), 10, 600_000))) return json({ ok: false, error: "limite" }, 429);
  const estrellas = Number(b.estrellas), comentario = limpio(b.comentario, 500);
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return json({ ok: false, error: "estrellas" }, 400);
  const [v] = await pedidosDelCliente(env, [{ numero: b.numero, whatsapp: b.whatsapp }]);
  if (!v) return json({ ok: false, error: "pedido" }, 404);
  if (v.estado < 4) return json({ ok: false, error: "sin-entregar" }, 409);
  const resena = { id: String(v.numero), numero: v.numero, cliente: v.cliente, estrellas, comentario, fecha: new Date().toISOString() };
  await guardarDoc(env, "resenas", resena.id, resena).run();
  return json({ ok: true });
}

// ---------- pedido de la tienda ----------
async function nuevoPedido(req, env) {
  let body;
  try { body = await leerJson(req, 50_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const c = body.cliente || {};
  const nombre = limpio(c.nombre, 80), whatsapp = limpio(c.whatsapp, 20);
  if (c.web || !nombre || !/^\+?[0-9 ]{8,20}$/.test(whatsapp)) return json({ ok: false, error: "datos" }, 400); // web: campo trampa
  if (!(await pasaLimite(env, "wa:" + digitos(whatsapp), 5, 600_000))) return json({ ok: false, error: "limite" }, 429);
  if (!(await pasaLimite(env, "ped:" + (req.headers.get("CF-Connecting-IP") || ""), 20, 600_000))) return json({ ok: false, error: "limite" }, 429); // con otro WhatsApp cada vez
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MAX_ITEMS) return json({ ok: false, error: "items" }, 400);

  // Precios desde la base, nunca desde el navegador.
  const catalogo = new Map((await docs(env, "productos")).filter((p) => !p._borrado).map((p) => [String(p.id), p]));
  const items = [];
  for (const i of body.items) {
    const p = catalogo.get(String(i.id));
    const cant = Math.min(Math.max(parseInt(i.cant, 10) || 0, 1), MAX_CANT);
    if (!p || !p.activo || !(p.precio > 0)) return json({ ok: false, error: "producto" }, 400);
    items.push({ id: String(p.id), nombre: String(p.nombre).slice(0, 120), precio: p.precio, cant });
  }
  const total = items.reduce((s, i) => s + i.precio * i.cant, 0);
  const sena = c.modo !== "total";
  const aPagar = sena ? Math.ceil(total / 2) : total; // igual que montoSena() de la tienda

  // Cliente: el mismo si ya compró con ese WhatsApp.
  const tel = digitos(whatsapp);
  let cli = (await docs(env, "clientes")).find((x) => !x._borrado && digitos(x.whatsapp) === tel);
  const ahora = Date.now();
  if (!cli) {
    cli = { id: "c" + ahora.toString(36) + Math.random().toString(36).slice(2, 6), nombre, whatsapp, email: limpio(c.email, 120), zona: limpio(c.envio, 80) };
    await guardarDoc(env, "clientes", cli.id, cli, ahora).run();
  }
  const numero = await contador(env);
  const pago = await linkPago(env, sena ? [{ title: `Seña 50% pedido AUKAN-${numero}`, quantity: 1, unit_price: aPagar, currency_id: "UYU" }]
    : items.map((i) => ({ title: i.nombre, quantity: i.cant, unit_price: i.precio, currency_id: "UYU" })), referencia(env, numero), volverATienda(env));
  const entrega = limpio(c.entrega, 40) + (c.envio ? " · " + limpio(c.envio, 160) : "");
  const venta = { numero: String(numero), fecha: new Date(ahora).toISOString(), origen: "web", cliente: cli.id, vendedor: "", moneda: "UYU", items, pagos: [],
    estado: 0, sena, entrega, nota: limpio(c.comentario, 500), pago };
  // Con link de Mercado Pago el pedido espera el pago: no aparece en el panel hasta que Mercado Pago avisa que se acreditó.
  // Sin link (no hay credencial o Mercado Pago no respondió) entra igual, para no perderlo, y el pago se coordina.
  if (pago) venta.espera = true;
  await guardarDoc(env, "ventas", numero, venta, ahora).run();
  // Pedidos que esperaban el pago y nunca se pagaron: a los 7 días se borran.
  await env.DB.prepare(`DELETE FROM docs WHERE col = 'ventas' AND actualizado < ? AND data LIKE '%"espera":true%'`).bind(ahora - 7 * 86400_000).run();
  return json({ ok: true, total, aPagar, sena, numero, pago });
}

// ---------- Mercado Pago ----------
// Dirección de vuelta tras pagar: la tienda que hizo el pedido, solo si es un origen permitido (ORIGENES).
// Referencia del pago: las dos bases numeran por separado y comparten la credencial, así que la de pruebas lleva "P-".
const referencia = (env, numero) => `AUKAN-${env.PRUEBAS ? "P-" : ""}${numero}`;
const volverATienda = (env) => (String(env.TIENDA || "").startsWith("https://") ? env.TIENDA + "/#mis-pedidos" : "");
// La credencial se carga desde el panel (o queda el secreto MP_ACCESS_TOKEN de wrangler). Se guarda siempre en la base real,
// así admin y dev (también en modo pruebas) ven y usan la misma cuenta. Nunca se devuelve al navegador: solo sus últimos 4 caracteres.
const mpApi = (env) => env.MP_API || "https://api.mercadopago.com"; // MP_API solo para pruebas locales
const baseAjustes = (env) => env.DB_REAL || env.DB;
// Tablas que se agregaron después de la primera versión: se crean si faltan, una sola vez por instancia del Worker.
const TABLAS = {
  ajustes: "CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado INTEGER NOT NULL)",
  cuentas: "CREATE TABLE IF NOT EXISTS cuentas (usuario TEXT PRIMARY KEY, data TEXT NOT NULL, actualizado INTEGER NOT NULL)",
  push: "CREATE TABLE IF NOT EXISTS push (endpoint TEXT NOT NULL, numero TEXT NOT NULL, ultimo TEXT, actualizado INTEGER NOT NULL, PRIMARY KEY (endpoint, numero))",
};
const creadas = new WeakMap(); // base -> Set de tablas ya creadas
async function tabla(db, nombre) {
  if (!creadas.has(db)) creadas.set(db, new Set());
  const hechas = creadas.get(db);
  if (!hechas.has(nombre)) { await db.prepare(TABLAS[nombre]).run(); hechas.add(nombre); }
  return db;
}
async function credencialMp(env) {
  const db = await tabla(baseAjustes(env), "ajustes");
  const r = await db.prepare("SELECT valor, actualizado FROM ajustes WHERE clave = 'mp_token'").first();
  if (r) return { token: r.valor, origen: "panel", actualizado: r.actualizado };
  return { token: env.MP_ACCESS_TOKEN || "", origen: env.MP_ACCESS_TOKEN ? "secreto" : "", actualizado: null };
}
const pedirMp = (env, token, ruta) => fetch(mpApi(env) + ruta, { headers: { Authorization: "Bearer " + token } });
async function cuentaMp(env, token) {
  const res = await pedirMp(env, token, "/users/me");
  if (!res.ok) return null;
  const u = await res.json();
  return { id: u.id, nombre: u.nickname || "", email: u.email || "", pais: u.site_id || "", prueba: (u.tags || []).includes("test_user") };
}
async function estadoMp(env) {
  const { token, origen, actualizado } = await credencialMp(env);
  if (!token) return json({ ok: true, configurado: false });
  const [cuenta, pagos] = await Promise.all([cuentaMp(env, token).catch(() => null),
    pedirMp(env, token, "/v1/payments/search?sort=date_created&criteria=desc&limit=30").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  return json({ ok: true, configurado: true, origen, actualizado, final: token.slice(-4), conectado: !!cuenta, cuenta,
    modo: token.startsWith("TEST-") || cuenta?.prueba ? "prueba" : "produccion",
    pagos: (pagos?.results || []).map((x) => ({ id: String(x.id), fecha: x.date_created, estado: x.status, detalle: x.status_detail || "",
      monto: x.transaction_amount, moneda: x.currency_id, referencia: String(x.external_reference || ""), medio: x.payment_method_id || "" })) });
}
async function guardarMp(req, env) {
  let body;
  try { body = await leerJson(req, 2_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const token = limpio(body.token, 300);
  const db = baseAjustes(env);
  await credencialMp(env); // crea la tabla si falta
  if (!token) { await db.prepare("DELETE FROM ajustes WHERE clave = 'mp_token'").run(); return estadoMp(env); }
  if (!/^(TEST|APP_USR)-[\w-]{20,}$/.test(token)) return json({ ok: false, error: "formato" }, 400);
  if (!(await cuentaMp(env, token).catch(() => null))) return json({ ok: false, error: "rechazado" }, 400); // Mercado Pago no la acepta
  await db.prepare("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('mp_token', ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado")
    .bind(token, Date.now()).run();
  return estadoMp(env);
}

const totalDe = (v) => v.items.reduce((t, i) => t + i.precio * i.cant, 0);
const saldoDe = (v) => Math.max(totalDe(v) - v.pagos.reduce((t, x) => t + x.monto, 0), 0);
const ventaDoc = async (env, numero) => {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE col = 'ventas' AND id = ?").bind(String(numero)).first();
  const v = r && JSON.parse(r.data);
  return v && !v._borrado ? v : null;
};
// QR desde el panel: link de pago por la seña o el saldo de un pedido (el monto lo valida el servidor contra el saldo).
async function cobroMp(req, env) {
  let body;
  try { body = await leerJson(req, 2_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const v = await ventaDoc(env, limpio(body.numero, 12));
  if (!v) return json({ ok: false, error: "pedido" }, 404);
  const monto = Math.round(Number(body.monto));
  if (!(monto >= 1 && monto <= saldoDe(v))) return json({ ok: false, error: "monto" }, 400);
  const titulo = body.sena ? `Seña 50 % pedido AUKAN-${v.numero}` : `Pedido AUKAN-${v.numero}`;
  const link = await linkPago(env, [{ title: titulo, quantity: 1, unit_price: monto, currency_id: v.moneda === "USD" ? "USD" : "UYU" }], referencia(env, v.numero));
  return link ? json({ ok: true, link }) : json({ ok: false, error: "mp" }, 502);
}
// Aviso de Mercado Pago (webhook). No se confía en lo que llega: se pide el pago a Mercado Pago con la credencial y,
// si está aprobado y es de un pedido, se anota una sola vez (por id de pago). Siempre responde 200 para que no reintente sin fin.
async function avisoMp(req, env, url) {
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (!(await pasaLimite(env, "mp:" + ip, 120, 600_000))) return json({ ok: false, error: "limite" }, 429);
  let body = {};
  try { body = await leerJson(req, 10_000); } catch { /* algunos avisos vienen solo en la dirección */ }
  const tipo = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const id = String((body.data && body.data.id) || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
  if (tipo !== "payment" || !/^\d{1,20}$/.test(id)) return json({ ok: true, ignorado: true });
  const { token } = await credencialMp(env);
  if (!token) return json({ ok: true, ignorado: true });
  const res = await pedirMp(env, token, "/v1/payments/" + id);
  if (!res.ok) return json({ ok: true, ignorado: true });
  const x = await res.json();
  const numero = (String(x.external_reference || "").match(env.PRUEBAS ? /^AUKAN-P-(\d+)$/ : /^AUKAN-(\d+)$/) || [])[1]; // solo pagos de esta base
  if (x.status !== "approved" || !numero) return json({ ok: true, estado: x.status });
  return json({ ok: true, registrado: await anotarPagoMp(env, numero, x) });
}
// shortcut: si el panel guarda ese mismo pedido en el mismo segundo, queda la última escritura (igual que entre dos dispositivos).
async function anotarPagoMp(env, numero, x) {
  const v = await ventaDoc(env, numero);
  if (!v || v.pagos.some((p) => p.mp === String(x.id)) || (x.currency_id || "UYU") !== (v.moneda || "UYU")) return false;
  const monto = Math.min(Math.round(x.transaction_amount), saldoDe(v));
  if (!(monto > 0)) return false;
  const medios = (await docs(env, "medios")).filter((m) => !m._borrado);
  const medio = (medios.find((m) => /mercado ?pago/i.test(m.nombre)) || { id: "m3" }).id;
  v.pagos.push({ fecha: x.date_approved || x.date_created || new Date().toISOString(), medio, monto, mp: String(x.id) });
  const avanza = v.estado === 0;
  if (avanza) v.estado = 1;
  delete v.espera; // pagado: ahora sí entra al panel (llega como pedido nuevo)
  await guardarDoc(env, "ventas", String(v.numero), v).run();
  if (avanza) enSegundoPlano(env, avisarPush(env, v));
  return true;
}

// Cobro de Checkout Pro con los precios de la base. Devuelve el link o "" si no hay token o falla.
async function linkPago(env, items, referencia, volver = "") {
  const { token } = await credencialMp(env);
  if (!token) return "";
  const pref = { items, external_reference: referencia };
  // Mercado Pago avisa cada pago a esta dirección (con ?e=pruebas si el pedido es de la base de pruebas). Solo https: en local no hay aviso.
  if (String(env.AQUI || "").startsWith("https://")) pref.notification_url = env.AQUI + "/api/mp/aviso" + (env.PRUEBAS ? "?e=pruebas" : "");
  // Sin payer.email: con una cuenta de prueba, un mail real del cliente hace fallar el pago ("una de las partes es de prueba").
  // Al terminar de pagar, Mercado Pago lo devuelve a "Mis pedidos" de la tienda (solo https).
  if (volver.startsWith("https://")) { pref.back_urls = { success: volver, pending: volver, failure: volver }; pref.auto_return = "approved"; }
  const res = await fetch(mpApi(env) + "/checkout/preferences", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(pref),
  });
  if (!res.ok) { console.error("Mercado Pago", res.status, await res.text()); return ""; }
  const r = await res.json();
  return token.startsWith("TEST-") ? r.sandbox_init_point : r.init_point; // con credenciales de prueba sirve el de sandbox
}

// ---------- ingreso al panel ----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const texto = (s) => new TextEncoder().encode(s);
async function hmac(clave, datos) {
  const k = await crypto.subtle.importKey("raw", texto(clave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, texto(datos)));
}
// Formato del hash: pbkdf2$<iteraciones>$<sal base64>$<hash base64> (lo genera api/clave.mjs).
export async function claveCorrecta(clave, guardado) {
  const [tipo, iter, sal, hash] = String(guardado || "").trim().split("$"); // trim: PowerShell agrega un salto de línea al cargar el secreto
  if (tipo !== "pbkdf2" || !hash) return false;
  const k = await crypto.subtle.importKey("raw", texto(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deB64(sal), iterations: Number(iter) }, k, 256);
  return mismo(b64url(bits), hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}
function mismo(a, b) { // comparación de tiempo constante
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// Cuentas del panel:
// - Fijas (secretos del Worker): la del negocio (ADMIN_USUARIO / ADMIN_CLAVE_HASH) y "dev" (DEV_CLAVE_HASH, entra también a pruebas).
// - Creadas desde el panel (pantalla Accesos): tabla `cuentas` de la base REAL, con permisos por sección y en qué base pueden entrar.
// Permisos: secciones del panel. "base", "mp" y "accesos" son de administración; el resto, del día a día.
export const PERMISOS = ["ventas", "feria", "pendientes", "clientes", "productos", "reportes", "usuarios", "medios", "mensajes", "mp", "accesos", "base"];
// Qué permiso hace falta para escribir cada colección (alcanza con uno de la lista).
const ESCRIBE = { ventas: ["ventas", "feria", "pendientes"], clientes: ["clientes", "ventas", "feria"], productos: ["productos", "ventas", "feria"],
  gastos: ["reportes"], medios: ["medios"], usuarios: ["usuarios"], cajas: ["feria"], mensajes: ["mensajes"], resenas: ["reportes"] };
const puedeEscribir = (q, col) => (ESCRIBE[col] || []).some((x) => q.permisos.includes(x));
// Lectura: sin estos permisos, los clientes llegan solo con id y nombre (sin WhatsApp ni correo) y los gastos no llegan.
const VE_CLIENTES = ["ventas", "pendientes", "clientes", "reportes"];
// El costo de los productos (para márgenes) solo lo ven quienes manejan productos o reportes; la feria y ventas no.
const VE_COSTO = ["productos", "reportes"];
const algunoDe = (q, lista) => lista.some((x) => q.permisos.includes(x));
// Quien tiene Accesos solo maneja cuentas que no lo superan: ni permisos que no tiene, ni la base real si no entra a ella.
const abarca = (q, c) => c.permisos.every((x) => q.permisos.includes(x)) && (c.entorno === "pruebas" || q.real);
const puedeCobrar = (q) => ["ventas", "pendientes", "feria"].some((x) => q.permisos.includes(x));
const FIJAS = (env) => [
  { usuario: String(env.ADMIN_USUARIO || "").toLowerCase(), hash: env.ADMIN_CLAVE_HASH, nombre: "Administrador", permisos: PERMISOS.filter((x) => x !== "base"), real: true, pruebas: false },
  { usuario: "dev", hash: env.DEV_CLAVE_HASH, nombre: "Dev", permisos: PERMISOS, real: true, pruebas: true },
].filter((c) => c.usuario && c.hash);
const tablaCuentas = (env) => tabla(baseAjustes(env), "cuentas");
async function cuentaGuardada(env, usuario) {
  const r = await (await tablaCuentas(env)).prepare("SELECT data FROM cuentas WHERE usuario = ?").bind(usuario).first();
  return r ? { usuario, ...JSON.parse(r.data) } : null;
}
const entornos = (c) => ({ real: c.entorno !== "pruebas", pruebas: c.entorno !== "real" });
async function buscarCuenta(env, usuario) {
  const fija = FIJAS(env).find((c) => mismo(usuario, c.usuario));
  if (fija) return { ...fija, fija: true };
  const c = await cuentaGuardada(env, usuario);
  return c && c.activo ? { ...c, ...entornos(c) } : null;
}
async function login(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  if (!(await pasaLimite(env, "login:" + ip, 10, 900_000))) return json({ ok: false, error: "limite" }, 429);
  let b;
  try { b = await leerJson(req, 2000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const usuario = limpio(b.usuario, 60).toLowerCase();
  const cuenta = usuario ? await buscarCuenta(env, usuario) : null;
  // Sin cuenta igual se calcula un hash, para que la respuesta tarde lo mismo.
  const claveOk = await claveCorrecta(String(b.clave || ""), cuenta ? cuenta.hash : env.ADMIN_CLAVE_HASH);
  if (!cuenta || !claveOk) return json({ ok: false, error: "credenciales" }, 401);
  const datos = b64url(texto(JSON.stringify({ u: cuenta.usuario, exp: Date.now() + 12 * 3600_000 })));
  return json({ ok: true, usuario: cuenta.usuario, nombre: cuenta.nombre, permisos: cuenta.permisos, real: cuenta.real, pruebas: cuenta.pruebas,
    cambiarClave: !!cuenta.cambiarClave, token: `${datos}.${await hmac(env.FIRMA, datos)}` });
}
// Devuelve el usuario del token, o "" si no es válido o venció.
async function tokenValido(req, env) {
  const [datos, firma] = (req.headers.get("Authorization") || "").replace(/^Bearer /, "").split(".");
  if (!datos || !firma || !env.FIRMA || !mismo(await hmac(env.FIRMA, datos), firma)) return "";
  try { const t = JSON.parse(new TextDecoder().decode(deB64(datos))); return t.exp > Date.now() ? String(t.u) : ""; } catch { return ""; }
}
// La cuenta se relee en cada pedido: si la desactivan o le cambian permisos, vale al instante.
async function sesionDe(req, env) {
  const u = await tokenValido(req, env);
  return u ? buscarCuenta(env, u) : null;
}
const sinClave = ({ hash, ...c }) => c;
async function listarCuentas(env) {
  const { results } = await (await tablaCuentas(env)).prepare("SELECT usuario, data FROM cuentas ORDER BY usuario").all();
  return json({ ok: true, permisos: PERMISOS, cuentas: results.map((r) => sinClave({ usuario: r.usuario, ...JSON.parse(r.data) })) });
}
// Contraseña temporal: se muestra una sola vez y al entrar pide cambiarla.
function claveTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => letras[x % letras.length]).join("");
}
async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16)), iter = 100000; // 100 000: el máximo que permite Workers
  const k = await crypto.subtle.importKey("raw", texto(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iter }, k, 256);
  return `pbkdf2$${iter}$${b64url(sal)}$${b64url(bits)}`;
}
async function escribirCuenta(env, c) {
  const { usuario, ...data } = c;
  await (await tablaCuentas(env)).prepare("INSERT INTO cuentas (usuario, data, actualizado) VALUES (?, ?, ?) ON CONFLICT (usuario) DO UPDATE SET data = excluded.data, actualizado = excluded.actualizado")
    .bind(usuario, JSON.stringify(data), Date.now()).run();
}
async function guardarCuenta(req, env, quien) {
  let b;
  try { b = await leerJson(req, 5000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const usuario = limpio(b.usuario, 30).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return json({ ok: false, error: "usuario" }, 400);
  if (FIJAS(env).some((c) => c.usuario === usuario) || usuario === "dev" || usuario === "admin") return json({ ok: false, error: "reservado" }, 400);
  const nombre = limpio(b.nombre, 60), email = limpio(b.email, 120).toLowerCase();
  if (!nombre) return json({ ok: false, error: "nombre" }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "email" }, 400);
  const entorno = ["pruebas", "real", "ambos"].includes(b.entorno) ? b.entorno : "pruebas";
  // Nadie da permisos que no tiene (una cuenta con Accesos no puede crear otra con Base de datos si ella no lo tiene).
  const permisos = PERMISOS.filter((x) => Array.isArray(b.permisos) && b.permisos.includes(x) && quien.permisos.includes(x));
  const antes = await cuentaGuardada(env, usuario);
  if (!abarca(quien, { permisos, entorno }) || (antes && !abarca(quien, antes))) return json({ ok: false, error: "permiso" }, 403);
  if (b.nueva && antes) return json({ ok: false, error: "existe" }, 409);
  if (!b.nueva && !antes) return json({ ok: false, error: "no existe" }, 404);
  const c = { ...(antes || { creado: Date.now() }), usuario, nombre, email, entorno, permisos, activo: b.activo !== false };
  let clave = "";
  if (!antes) { clave = claveTemporal(); c.hash = await hashClave(clave); c.cambiarClave = true; }
  await escribirCuenta(env, c);
  return json({ ok: true, cuenta: sinClave(c), ...(clave ? { clave } : {}) });
}
async function reiniciarClave(req, env, quien) {
  let b;
  try { b = await leerJson(req, 2000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const c = await cuentaGuardada(env, limpio(b.usuario, 30).toLowerCase());
  if (!c) return json({ ok: false, error: "no existe" }, 404);
  if (!abarca(quien, c)) return json({ ok: false, error: "permiso" }, 403);
  const clave = claveTemporal();
  await escribirCuenta(env, { ...c, hash: await hashClave(clave), cambiarClave: true });
  return json({ ok: true, clave });
}
// Borrar: solo cuentas ya desactivadas (primero se desactiva, así no se borra una por error).
async function borrarCuenta(req, env, quien) {
  let b;
  try { b = await leerJson(req, 2000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const c = await cuentaGuardada(env, limpio(b.usuario, 30).toLowerCase());
  if (!c) return json({ ok: false, error: "no existe" }, 404);
  if (!abarca(quien, c)) return json({ ok: false, error: "permiso" }, 403);
  if (c.activo) return json({ ok: false, error: "activa" }, 400);
  await (await tablaCuentas(env)).prepare("DELETE FROM cuentas WHERE usuario = ?").bind(c.usuario).run();
  return json({ ok: true });
}
async function cambiarMiClave(req, env, quien) {
  if (quien.fija) return json({ ok: false, error: "fija" }, 400); // las fijas se cambian con wrangler secret
  let b;
  try { b = await leerJson(req, 2000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const nueva = String(b.nueva || "");
  if (nueva.length < 10 || nueva.length > 200) return json({ ok: false, error: "corta" }, 400);
  if (!(await claveCorrecta(String(b.actual || ""), quien.hash))) return json({ ok: false, error: "actual" }, 400);
  const c = await cuentaGuardada(env, quien.usuario);
  await escribirCuenta(env, { ...c, hash: await hashClave(nueva), cambiarClave: false });
  return json({ ok: true });
}

// ---------- datos del panel ----------
async function datos(env, desde, quien) {
  const { results } = await env.DB.prepare("SELECT col, data, actualizado FROM docs WHERE actualizado >= ?").bind(desde).all();
  const r = Object.fromEntries(COLECCIONES.map((c) => [c, []]));
  const veClientes = algunoDe(quien, VE_CLIENTES), veGastos = algunoDe(quien, ["reportes"]), veCosto = algunoDe(quien, VE_COSTO);
  let hasta = desde;
  for (const x of results) {
    let d = JSON.parse(x.data);
    if (x.col === "gastos" && !veGastos) d = null;
    if (x.col === "productos" && !veCosto && d) delete d.costo;
    if (x.col === "clientes" && !veClientes && d) d = { id: d.id, nombre: d.nombre, ...(d._borrado ? { _borrado: true } : {}) };
    if (d && r[x.col] && !d.espera) r[x.col].push(d); // pedidos de la tienda sin pagar: el panel no los ve hasta que se pagan
    hasta = Math.max(hasta, x.actualizado);
  }
  return json({ ok: true, hasta, ...r }); // >= desde: puede repetir algo ya visto; el panel lo reemplaza por id
}
// Cambios del panel en un solo envío: { set: [{col, id, data}], del: [{col, id}] }.
// Borrar deja una marca { _borrado: true, id } para que los otros dispositivos también lo quiten.
async function lote(req, env, quien) {
  let b;
  try { b = await leerJson(req); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const set = Array.isArray(b.set) ? b.set : [], del = Array.isArray(b.del) ? b.del : [];
  if (set.length + del.length > 500) return json({ ok: false, error: "muchos" }, 400);
  const valido = (x) => x && COLECCIONES.includes(x.col) && /^[\w.-]{1,60}$/.test(String(x.id));
  if (![...set, ...del].every(valido) || !set.every((x) => x.data && typeof x.data === "object")) return json({ ok: false, error: "datos" }, 400);
  if (![...set, ...del].every((x) => puedeEscribir(quien, x.col))) return json({ ok: false, error: "permiso" }, 403);
  // Quien no ve el costo (feria, ventas) igual guarda productos al mover stock: se conserva el costo guardado.
  const sinCosto = algunoDe(quien, VE_COSTO) ? [] : set.filter((x) => x.col === "productos");
  if (sinCosto.length) {
    const { results } = await env.DB.prepare(`SELECT id, data FROM docs WHERE col = 'productos' AND id IN (${sinCosto.map(() => "?").join(",")})`)
      .bind(...sinCosto.map((x) => String(x.id))).all();
    const costo = new Map(results.map((r) => [r.id, JSON.parse(r.data).costo]));
    for (const x of sinCosto) { const { costo: _, ...resto } = x.data; x.data = costo.get(String(x.id)) ? { ...resto, costo: costo.get(String(x.id)) } : resto; }
  }
  const ahora = Date.now();
  const ventasSet = set.filter((x) => x.col === "ventas" && Number.isInteger(x.data.estado));
  const antes = ventasSet.length ? await estadosDe(env, ventasSet.map((x) => String(x.id))) : new Map();
  const sentencias = [...set.map((x) => guardarDoc(env, x.col, x.id, x.data, ahora)),
    ...del.map((x) => guardarDoc(env, x.col, x.id, { _borrado: true, id: String(x.id), numero: x.col === "ventas" ? x.id : undefined }, ahora))];
  if (sentencias.length) await env.DB.batch(sentencias); // todo o nada
  // Avisos push al cliente por cada pedido que avanzó de estado (sin demorar la respuesta).
  const avanzaron = ventasSet.filter((x) => antes.has(String(x.id)) && x.data.estado > antes.get(String(x.id)));
  if (avanzaron.length) enSegundoPlano(env, Promise.all(avanzaron.map((x) => avisarPush(env, x.data))));
  return json({ ok: true, hasta: ahora });
}

// ---------- avisos push al cliente (tienda instalada o abierta en el navegador) ----------
// Sin datos cifrados: el push llega vacío y el service worker de la tienda pide el texto a /api/push/ultimo con su endpoint
// (el endpoint lo conoce solo ese navegador). Las claves VAPID se crean solas la primera vez y quedan en `ajustes`.
const enSegundoPlano = (env, promesa) => { const p = promesa.catch((e) => console.error("push", e)); if (env.CTX) env.CTX.waitUntil(p); };
async function clavesPush(env) {
  const db = await tabla(baseAjustes(env), "ajustes");
  const r = await db.prepare("SELECT valor FROM ajustes WHERE clave = 'vapid'").first();
  if (r) return JSON.parse(r.valor);
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const claves = { publica: b64url(await crypto.subtle.exportKey("raw", par.publicKey)), privada: await crypto.subtle.exportKey("jwk", par.privateKey) };
  await db.prepare("INSERT OR IGNORE INTO ajustes (clave, valor, actualizado) VALUES ('vapid', ?, ?)").bind(JSON.stringify(claves), Date.now()).run();
  return JSON.parse((await db.prepare("SELECT valor FROM ajustes WHERE clave = 'vapid'").first()).valor); // si dos llegaron a la vez, gana la primera
}
const tablaPush = (env) => tabla(env.DB, "push");
// Solo servicios de push conocidos (evita que el servidor mande pedidos a cualquier dirección).
const HOSTS_PUSH = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", ".notify.windows.com", ".push.apple.com"];
function endpointValido(env, e) {
  let u; try { u = new URL(String(e || "")); } catch { return false; }
  if (String(e).length > 1000) return false;
  if (env.PUSH_PRUEBA && u.origin === env.PUSH_PRUEBA) return true; // solo en pruebas locales (.dev.vars)
  return u.protocol === "https:" && HOSTS_PUSH.some((h) => (h.startsWith(".") ? u.hostname.endsWith(h) : u.hostname === h));
}
// Pedidos del cliente que pueden recibir avisos: mismo control que /api/pedidos/estado (número + WhatsApp del pedido).
async function pedidosDelCliente(env, lista) {
  const pedidos = (Array.isArray(lista) ? lista : []).slice(0, 20)
    .map((x) => ({ numero: limpio(x && x.numero, 12), tel: digitos(x && x.whatsapp) })).filter((x) => /^\d+$/.test(x.numero) && x.tel.length >= 8);
  if (!pedidos.length) return [];
  const { results } = await env.DB.prepare(`SELECT data FROM docs WHERE col = 'ventas' AND id IN (${pedidos.map(() => "?").join(",")})`).bind(...pedidos.map((x) => x.numero)).all();
  const ventas = results.map((r) => JSON.parse(r.data)).filter((v) => !v._borrado);
  const ids = [...new Set(ventas.map((v) => String(v.cliente)))];
  const clientes = ids.length ? (await env.DB.prepare(`SELECT id, data FROM docs WHERE col = 'clientes' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results : [];
  const telDe = new Map(clientes.map((c) => [c.id, digitos(JSON.parse(c.data).whatsapp)]));
  return ventas.filter((v) => telDe.get(String(v.cliente)) === pedidos.find((x) => x.numero === String(v.numero))?.tel);
}
async function altaPush(req, env) {
  let b;
  try { b = await leerJson(req, 10_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (!(await pasaLimite(env, "push:" + ip, 30, 600_000))) return json({ ok: false, error: "limite" }, 429);
  const endpoint = String(b.endpoint || "");
  if (!endpointValido(env, endpoint)) return json({ ok: false, error: "endpoint" }, 400);
  const numeros = (await pedidosDelCliente(env, b.pedidos)).map((v) => String(v.numero));
  await tablaPush(env);
  const ahora = Date.now();
  if (numeros.length) await env.DB.batch(numeros.map((n) => env.DB.prepare("INSERT INTO push (endpoint, numero, actualizado) VALUES (?, ?, ?) ON CONFLICT (endpoint, numero) DO UPDATE SET actualizado = excluded.actualizado").bind(endpoint, n, ahora)));
  return json({ ok: true, pedidos: numeros });
}
async function ultimoPush(req, env) {
  let b;
  try { b = await leerJson(req, 2000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  await tablaPush(env);
  const r = await env.DB.prepare("SELECT ultimo FROM push WHERE endpoint = ? AND ultimo IS NOT NULL ORDER BY actualizado DESC LIMIT 1").bind(String(b.endpoint || "")).first();
  return json({ ok: true, aviso: r ? JSON.parse(r.ultimo) : null });
}
async function estadosDe(env, ids) {
  const { results } = await env.DB.prepare(`SELECT id, data FROM docs WHERE col = 'ventas' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  return new Map(results.map((r) => [r.id, JSON.parse(r.data).estado]));
}
function textoAviso(v) {
  const n = `N° ${v.numero}`;
  return [null,
    saldoDe(v) ? `Recibimos la seña de tu pedido ${n}. ¡Quedó confirmado!` : `Recibimos el pago de tu pedido ${n}. ¡Quedó confirmado!`,
    `Tu pedido ${n} entró en impresión.`,
    `¡Tu pedido ${n} está listo para entregar! Coordinamos la entrega por WhatsApp.`,
    `Entregamos tu pedido ${n}. ¡Gracias por tu compra!`][v.estado];
}
async function avisarPush(env, v) {
  const texto = textoAviso(v);
  if (!texto) return;
  await tablaPush(env);
  const aviso = JSON.stringify({ numero: String(v.numero), estado: v.estado, titulo: `Aukan3D · Pedido N° ${v.numero}`, texto });
  const ahora = Date.now();
  await env.DB.prepare("UPDATE push SET ultimo = ?, actualizado = ? WHERE numero = ?").bind(aviso, ahora, String(v.numero)).run();
  const { results } = await env.DB.prepare("SELECT endpoint FROM push WHERE numero = ?").bind(String(v.numero)).all();
  const claves = await clavesPush(env);
  await Promise.all(results.map(async ({ endpoint }) => {
    const res = await fetch(endpoint, { method: "POST", headers: { TTL: "86400", Urgency: "normal", "Content-Length": "0",
      Authorization: `vapid t=${await jwtVapid(claves, new URL(endpoint).origin)}, k=${claves.publica}` } }).catch(() => null);
    if (res && (res.status === 404 || res.status === 410)) await env.DB.prepare("DELETE FROM push WHERE endpoint = ?").bind(endpoint).run(); // ya no existe
  }));
}
async function jwtVapid(claves, aud) {
  const cab = b64url(texto(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = b64url(texto(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://aukan3d.pages.dev" })));
  const k = await crypto.subtle.importKey("jwk", claves.privada, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, texto(`${cab}.${cuerpo}`));
  return `${cab}.${cuerpo}.${b64url(firma)}`;
}
