# Servidor de Aukan3D (Cloudflare Workers + D1)

Guarda el catálogo, los pedidos de la tienda y los datos del panel de gestión en una base D1 (SQLite) de Cloudflare.
Plan gratis: alcanza de sobra para la tienda.

## Rutas
- `GET /api/productos.csv`: catálogo activo (lo lee la tienda).
- `POST /api/pedidos`: alta de pedido (precios desde la base; límite 5 pedidos por WhatsApp cada 10 min).
- `POST /api/pedidos/estado`: estado de los pedidos para "Mis pedidos" (número + WhatsApp; 60 consultas por IP cada 10 min).
- `POST /api/login`: ingreso al panel (10 intentos por IP cada 15 min). Devuelve un token de 12 h.
- `GET /api/admin/datos?desde=`, `POST /api/admin/lote`, `POST /api/admin/numero`: datos del panel (con token).
- `GET /api/admin/estado`: tamaño y registros de las bases (solo usuario dev).
- `GET /api/admin/mp`, `POST /api/admin/mp`: estado de Mercado Pago (cuenta, modo, últimos 30 cobros) y carga de la credencial. Admin y dev ven la misma: se guarda en la tabla `ajustes` de la base real y nunca vuelve al navegador (solo los últimos 4 caracteres). Si no hay, usa el secreto `MP_ACCESS_TOKEN`.
- `POST /api/admin/mp/cobro`: link de pago (para el QR del panel) por la seña o el saldo de un pedido.
- `POST /api/mp/aviso`: aviso de Mercado Pago (webhook). Va en cada link de pago como `notification_url`, no hace falta configurarlo en Mercado Pago. Pide el pago a Mercado Pago y, si está aprobado, lo anota una sola vez en el pedido `AUKAN-N°`.
- Pruebas locales de Mercado Pago: `MP_API=http://localhost:8799` en `.dev.vars` (test.mjs levanta un Mercado Pago de mentira ahí).

## Probar en la computadora
```
npm install
node clave.mjs "clave-de-prueba-123"     # pegar el resultado en .dev.vars como ADMIN_CLAVE_HASH
# .dev.vars: ADMIN_USUARIO=admin, ADMIN_CLAVE_HASH=..., FIRMA=<texto largo al azar>
node semilla.mjs
npx wrangler d1 execute aukan3d --local --file=schema.sql
npx wrangler d1 execute aukan3d --local --file=semilla.sql
npm run dev            # en otra terminal: node test.mjs
```

## Publicar (una sola vez)
```
npx wrangler login
npx wrangler d1 create aukan3d          # copiar el database_id en wrangler.toml
npx wrangler d1 execute aukan3d --remote --file=schema.sql
node semilla.mjs && npx wrangler d1 execute aukan3d --remote --file=semilla.sql
npx wrangler secret put ADMIN_USUARIO     # ej. admin
npx wrangler secret put ADMIN_CLAVE_HASH  # salida de: node clave.mjs "contraseña"
npx wrangler secret put FIRMA             # texto largo al azar
npx wrangler secret put DEV_CLAVE_HASH    # opcional: usuario "dev" (node clave.mjs "contraseña")
npx wrangler secret put MP_ACCESS_TOKEN   # opcional: token de Mercado Pago (TEST-... para pruebas)
npx wrangler deploy
```
Base de pruebas (para el usuario dev): `npx wrangler d1 create aukan3d-pruebas`, copiar su id en `DB_PRUEBAS` de wrangler.toml y cargarle `schema.sql` y `semilla.sql` igual que a la real (con `aukan3d-pruebas`). El panel la usa con el botón "Pasar a pruebas" (solo dev); las llamadas llevan `?e=pruebas`.

Después poner la dirección que muestra `deploy` (https://aukan3d-api.<cuenta>.workers.dev) en `apiUrl` de `config.js`.
Los secretos nunca van en el repo ni en config.js.
