// Servidor de Aukan3D en Cloudflare Workers + D1 (SQLite).
// - Público: catálogo en CSV (lo lee la tienda) y alta de pedidos (precios recalculados acá).
// - Panel de gestión: ingreso con usuario y contraseña, y lectura/escritura de sus datos.
// Cada registro del panel se guarda como JSON en la tabla docs (col, id); ver schema.sql.

const COLECCIONES = ["productos", "clientes", "ventas", "gastos", "medios", "usuarios", "cajas"];
const MAX_ITEMS = 50, MAX_CANT = 99;

export default {
  async fetch(req, env) {
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
      const r = await rutear(req, pruebas ? { ...env, DB: env.DB_PRUEBAS, DB_REAL: env.DB, PRUEBAS: true } : env, url);
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
  if (m === "POST" && p === "/api/login") return login(req, env);
  if (p.startsWith("/api/admin/")) {
    const quien = await tokenValido(req, env);
    if (!quien) return json({ ok: false, error: "sesion" }, 401);
    if (env.PRUEBAS && quien !== "dev") return json({ ok: false, error: "entorno" }, 403); // solo el usuario dev entra a pruebas
    if (m === "GET" && p === "/api/admin/datos") return datos(env, Number(url.searchParams.get("desde")) || 0);
    if (m === "POST" && p === "/api/admin/lote") return lote(req, env);
    if (m === "POST" && p === "/api/admin/numero") return json({ ok: true, numero: await contador(env) });
    if (m === "GET" && p === "/api/admin/estado") return quien === "dev" ? estadoBases(env) : json({ ok: false, error: "solo dev" }, 403);
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

// ---------- estado de pedidos para "Mis pedidos" de la tienda ----------
// El número es correlativo, así que además pide el WhatsApp del pedido; solo devuelve el estado (ningún dato personal).
async function estadoPedidos(req, env) {
  let body;
  try { body = await leerJson(req, 10_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (!(await pasaLimite(env, "est:" + ip, 60, 600_000))) return json({ ok: false, error: "limite" }, 429);
  const pedidos = (Array.isArray(body.pedidos) ? body.pedidos : []).slice(0, 20)
    .map((x) => ({ numero: limpio(x && x.numero, 12), tel: digitos(x && x.whatsapp) })).filter((x) => /^\d+$/.test(x.numero) && x.tel.length >= 8);
  const estados = {};
  if (pedidos.length) {
    const marcas = pedidos.map(() => "?").join(",");
    const { results } = await env.DB.prepare(`SELECT data FROM docs WHERE col = 'ventas' AND id IN (${marcas})`).bind(...pedidos.map((x) => x.numero)).all();
    const ventas = results.map((r) => JSON.parse(r.data)).filter((v) => !v._borrado);
    const ids = [...new Set(ventas.map((v) => String(v.cliente)))];
    const clientes = ids.length ? (await env.DB.prepare(`SELECT id, data FROM docs WHERE col = 'clientes' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results : [];
    const telDe = new Map(clientes.map((c) => [c.id, digitos(JSON.parse(c.data).whatsapp)]));
    for (const v of ventas) {
      const pedido = pedidos.find((x) => x.numero === String(v.numero));
      if (pedido && telDe.get(String(v.cliente)) === pedido.tel) estados[v.numero] = v.estado;
    }
  }
  return json({ ok: true, estados });
}

// ---------- pedido de la tienda (mismo contrato que apps-script/Code.gs) ----------
async function nuevoPedido(req, env) {
  let body;
  try { body = await leerJson(req, 50_000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const c = body.cliente || {};
  const nombre = limpio(c.nombre, 80), whatsapp = limpio(c.whatsapp, 20);
  if (c.web || !nombre || !/^\+?[0-9 ]{8,20}$/.test(whatsapp)) return json({ ok: false, error: "datos" }, 400); // web: campo trampa
  if (!(await pasaLimite(env, "wa:" + digitos(whatsapp), 5, 600_000))) return json({ ok: false, error: "limite" }, 429);
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
    : items.map((i) => ({ title: i.nombre, quantity: i.cant, unit_price: i.precio, currency_id: "UYU" })), `AUKAN-${numero}`, limpio(c.email, 120));
  const entrega = limpio(c.entrega, 40) + (c.envio ? " · " + limpio(c.envio, 160) : "");
  const venta = { numero: String(numero), fecha: new Date(ahora).toISOString(), origen: "web", cliente: cli.id, vendedor: "", moneda: "UYU", items, pagos: [],
    estado: 0, sena, entrega, nota: limpio(c.comentario, 500), pago };
  await guardarDoc(env, "ventas", numero, venta, ahora).run();
  return json({ ok: true, total, aPagar, sena, numero, pago });
}

// Cobro de Checkout Pro con los precios de la base. Devuelve el link o "" si no hay token o falla.
async function linkPago(env, items, referencia, email) {
  const token = env.MP_ACCESS_TOKEN;
  if (!token) return "";
  const pref = { items, external_reference: referencia };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) pref.payer = { email };
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
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
// Cuentas: la del negocio (ADMIN_USUARIO / ADMIN_CLAVE_HASH) y "dev" (DEV_CLAVE_HASH), que además puede usar la base de pruebas.
async function login(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  if (!(await pasaLimite(env, "login:" + ip, 10, 900_000))) return json({ ok: false, error: "limite" }, 429);
  let b;
  try { b = await leerJson(req, 2000); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const usuario = limpio(b.usuario, 60).toLowerCase();
  const cuentas = [[String(env.ADMIN_USUARIO || "").toLowerCase(), env.ADMIN_CLAVE_HASH], ["dev", env.DEV_CLAVE_HASH]];
  const cuenta = cuentas.find(([u, hash]) => u && hash && mismo(usuario, u));
  // Sin cuenta igual se calcula un hash, para que la respuesta tarde lo mismo.
  const claveOk = await claveCorrecta(String(b.clave || ""), cuenta ? cuenta[1] : env.ADMIN_CLAVE_HASH);
  if (!cuenta || !claveOk) return json({ ok: false, error: "credenciales" }, 401);
  const datos = b64url(texto(JSON.stringify({ u: cuenta[0], exp: Date.now() + 12 * 3600_000 })));
  return json({ ok: true, usuario: cuenta[0], token: `${datos}.${await hmac(env.FIRMA, datos)}` });
}
// Devuelve el usuario del token, o "" si no es válido o venció.
async function tokenValido(req, env) {
  const [datos, firma] = (req.headers.get("Authorization") || "").replace(/^Bearer /, "").split(".");
  if (!datos || !firma || !env.FIRMA || !mismo(await hmac(env.FIRMA, datos), firma)) return "";
  try { const t = JSON.parse(new TextDecoder().decode(deB64(datos))); return t.exp > Date.now() ? String(t.u) : ""; } catch { return ""; }
}

// ---------- datos del panel ----------
async function datos(env, desde) {
  const { results } = await env.DB.prepare("SELECT col, data, actualizado FROM docs WHERE actualizado >= ?").bind(desde).all();
  const r = Object.fromEntries(COLECCIONES.map((c) => [c, []]));
  let hasta = desde;
  for (const x of results) { if (r[x.col]) r[x.col].push(JSON.parse(x.data)); hasta = Math.max(hasta, x.actualizado); }
  return json({ ok: true, hasta, ...r }); // >= desde: puede repetir algo ya visto; el panel lo reemplaza por id
}
// Cambios del panel en un solo envío: { set: [{col, id, data}], del: [{col, id}] }.
// Borrar deja una marca { _borrado: true, id } para que los otros dispositivos también lo quiten.
async function lote(req, env) {
  let b;
  try { b = await leerJson(req); } catch { return json({ ok: false, error: "invalido" }, 400); }
  const set = Array.isArray(b.set) ? b.set : [], del = Array.isArray(b.del) ? b.del : [];
  if (set.length + del.length > 500) return json({ ok: false, error: "muchos" }, 400);
  const valido = (x) => x && COLECCIONES.includes(x.col) && /^[\w.-]{1,60}$/.test(String(x.id));
  if (![...set, ...del].every(valido) || !set.every((x) => x.data && typeof x.data === "object")) return json({ ok: false, error: "datos" }, 400);
  const ahora = Date.now();
  const sentencias = [...set.map((x) => guardarDoc(env, x.col, x.id, x.data, ahora)),
    ...del.map((x) => guardarDoc(env, x.col, x.id, { _borrado: true, id: String(x.id), numero: x.col === "ventas" ? x.id : undefined }, ahora))];
  if (sentencias.length) await env.DB.batch(sentencias); // todo o nada
  return json({ ok: true, hasta: ahora });
}
