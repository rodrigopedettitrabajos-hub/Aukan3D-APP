# Pedidos Aukan3D

App web de pedidos para Aukan3D. Catálogo con buscador y categorías, carrito con varios productos y envío del pedido por WhatsApp. El catálogo sale de una Google Sheet, así que cambiar un precio en la planilla cambia la app.

Sin dependencias ni build: HTML, CSS y JS. Se publica gratis en GitHub Pages.

## Cómo funciona

```
Google Sheet "Productos"  --CSV publicado-->  app  --pedido-->  Apps Script --> Sheet "Pedidos"
                                                     \--------> WhatsApp de Aukan3D
```

## Puesta en marcha

1. **Planilla.** Crear una Google Sheet con una pestaña `Productos` e importar `productos.csv` (Archivo > Importar). Columnas: `id, categoria, subcategoria, nombre, precio, foto, activo`. Para ocultar un producto, poner `NO` en `activo`. No cambiar el `id` de un producto existente.
2. **Publicar el catálogo.** Archivo > Compartir > Publicar en la web > pestaña `Productos` > formato CSV. Pegar la URL en `config.js` > `catalogoCsvUrl`.
3. **Guardar pedidos (opcional).** En la planilla: Extensiones > Apps Script, pegar `apps-script/Code.gs`, Implementar > Aplicación web (Ejecutar como: yo, Acceso: cualquier persona). Pegar la URL en `config.js` > `pedidosUrl`. Los pedidos llegan a la pestaña `Pedidos`, con precios recalculados desde la planilla.
4. **Publicar la app.** GitHub > Settings > Pages > Deploy from branch > `main` / root. Después se puede insertar en el Google Site (Insertar > URL).

## Fotos

Las fotos del Google Site no se pueden enlazar desde afuera (Google las sirve con enlaces temporales). La columna `foto` acepta:
- un archivo dentro del repo, por ejemplo `fotos/charizard.webp`, o
- una URL `https://` pública.

Sin foto, la tarjeta muestra un recuadro "3D".

## Probar

```
python3 -m http.server 8080   # abrir http://localhost:8080
node test.js
```
