# Aukan3D

Tienda web de Aukan3D (catálogo, carrito, pedidos con seña o pago total por Mercado Pago, "Mis pedidos" con avisos) y panel de gestión en `/admin/`.

Sin build: HTML, CSS y JS. La tienda y el panel se publican en Cloudflare Pages (y GitHub Pages). El servidor está en `api/` (Cloudflare Worker + D1, ver `api/README.md`).

## Cómo funciona

```
tienda (index.html) --catálogo CSV / pedido / estado / push--> api (Worker) --> D1 (base real o de pruebas)
panel (admin/)      --usuario y contraseña, datos, cobros-----> api           --> Mercado Pago
```

- Con `apiUrl` en `config.js`, la tienda lee el catálogo del servidor, manda los pedidos (precios recalculados en el servidor) y cobra con Mercado Pago. `?e=pruebas` usa la base de pruebas.
- Sin `apiUrl` es una demo: catálogo de `productos.csv`, pedidos por WhatsApp, panel con `admin` / `admin` y datos guardados en el navegador.

## Fotos

Las fotos del catálogo están en `fotos/` (WebP). Las que se suben desde el panel quedan en la base y se sirven en `/api/fotos/<id>.webp`. `bajar-fotos.ps1` vuelve a bajar las fotos del sitio viejo en Windows.

## Probar

```
python3 -m http.server 8090   # abrir http://localhost:8090
node test.js                  # tienda
node admin/test.js            # panel
cd api && npm run dev         # servidor local, y en otra terminal: node test.mjs
```

## Mercado Pago

La credencial se carga desde el panel (Administración > Mercado Pago) y queda solo en el servidor. Nunca va en `config.js`. Con una credencial `TEST-` los cobros son de prueba.
