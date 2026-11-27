# Pedidos Aukan3D

App web de pedidos para Aukan3D. Catálogo con buscador y categorías, carrito con varios productos y envío del pedido por WhatsApp. El catálogo sale de una Google Sheet, así que cambiar un precio en la planilla cambia la app.

Sin dependencias ni build: HTML, CSS y JS. Se publica gratis en GitHub Pages.

## Cómo funciona

```
Google Sheet "Productos"  --CSV publicado-->  app  --pedido-->  Apps Script --> Sheet "Pedidos"
                                                     \--------> WhatsApp de Aukan3D
```

## Puesta en marcha

1. **Planilla.** Crear una Google Sheet con una pestaña `Productos` e importar `productos.csv` (Archivo > Importar). Columnas: `id, categoria, subcategoria, nombre, precio, foto, activo`. Para ocultar un producto, poner `NO` en `activo`. Opcionales: `tamano` (ej. `12 cm de alto`) y `material` (ej. `PLA`), que se muestran en la ficha del producto. No cambiar el `id` de un producto existente.
2. **Publicar el catálogo.** Archivo > Compartir > Publicar en la web > pestaña `Productos` > formato CSV. Pegar la URL en `config.js` > `catalogoCsvUrl`.
3. **Guardar pedidos (opcional).** En la planilla: Extensiones > Apps Script, pegar `apps-script/Code.gs`, Implementar > Aplicación web (Ejecutar como: yo, Acceso: cualquier persona). Pegar la URL en `config.js` > `pedidosUrl`. Los pedidos llegan a la pestaña `Pedidos`, con precios recalculados desde la planilla.
4. **Publicar la app.** GitHub > Settings > Pages > Deploy from branch > `main` / root. Después se puede insertar en el Google Site (Insertar > URL).

## Fotos

Las fotos están en `fotos/` (WebP, 480px), copiadas del Google Site. El sitio no deja enlazarlas desde afuera, por eso van dentro de la app. La columna `foto` acepta un archivo de `fotos/` o una URL `https://` pública. Sin foto, la tarjeta muestra un recuadro "3D".

Para un producto nuevo: subir la foto a `fotos/` y poner su nombre en la planilla (ej. `fotos/162-goku.webp`). `bajar-fotos.ps1` vuelve a bajar todas las fotos del sitio en Windows.

Sin foto por ahora: Rumi/Zoey/Mira, Mazinger Z y San Expedito (el sitio no las tiene como imagen normal).

## Probar

```
python3 -m http.server 8080   # abrir http://localhost:8080
node test.js
```

## Pagos con Mercado Pago (modo prueba)
Al enviar un pedido, el Apps Script crea un cobro de Checkout Pro con los precios de la planilla y la app muestra el link y su QR.
1. En Mercado Pago Developers, crear una aplicación y copiar el **Access Token de prueba** (empieza con `TEST-`).
2. En Apps Script: Configuración del proyecto > Propiedades del script > `MP_ACCESS_TOKEN` = ese token. Nunca va en `config.js`.
3. Volver a implementar la app web y poner su URL en `pedidosUrl`.
4. Para pasar a cobros reales, cambiar la propiedad por el Access Token de producción (`APP_USR-...`).

Prueba del script: `node apps-script/test.js`.

## Panel de gestión (`admin/`)
Backoffice para Aukan3D: ventas y pedidos, cuentas pendientes, clientes, productos y stock, medios de pago, comisiones y reportes. Se abre en `/admin/` (en la demo: `.../Aukan3D-APP/admin/`).
Con `apiUrl` en `config.js` usa el servidor de `api/` (Cloudflare Worker + D1, ver `api/README.md`): ingreso con usuario y contraseña del servidor, datos compartidos entre dispositivos y pedidos de la tienda en vivo.
Sin `apiUrl` es una demo: ingreso `admin` / `admin` y datos de ejemplo guardados en el navegador ("Volver a los datos de ejemplo" los reinicia); los pedidos hechos en la tienda desde el mismo navegador aparecen en el panel.
Prueba: `node admin/test.js`; servidor: `cd api && npm run dev` y `node test.mjs`.
