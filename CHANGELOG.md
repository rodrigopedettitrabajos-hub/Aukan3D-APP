# Cambios

Versiones `V0.XX` mientras la app está en desarrollo. Cada entrega sube el número, actualiza `version` en `config.js` y el `?v=` de los archivos en `index.html` (para que el navegador no use copias viejas).

## V0.25 · 2026-11-27
Primera versión del panel de gestión (backoffice) en `admin/`, basada en el prototipo de Rodrigo. Pantallas con datos de ejemplo guardados en el navegador; la base de datos viene después.
- Ingreso con usuario y contraseña de muestra (`admin` / `admin`).
- Panel principal: vendido, cobrado y pendiente del mes, pedidos en curso por estado, más vendidos y últimas ventas.
- Ventas y pedidos: los de la tienda web y los hechos en persona o en ferias, en pesos o dólares. Detalle con estado paso a paso, pagos, saldo y botón para escribirle al cliente por WhatsApp. Nueva venta con buscador de productos, seña 50% o pago total y descuento de stock.
- Cuentas pendientes: ventas con saldo de la más vieja a la más nueva, cobrar y recordar por WhatsApp.
- Clientes: compras, total comprado, saldo y última compra.
- Productos y stock: el catálogo de la tienda con stock listo (+ / −), alta y edición, foto optimizada a 600 × 600 WebP y "Descargar CSV" para pegar en la planilla.
- Medios de pago con imagen de QR, usuarios con comisión (10% por defecto) y reportes del mes con gastos, por categoría y por medio de pago.
- Mismos colores que la tienda, modo oscuro y celular.

## V0.24 · 2026-11-27
Cambios aprobados de las auditorías (Ponytail, seguridad de Cloudflare e impeccable).
- Pantalla final honesta: "Falta un paso: mandanos el mensaje" con número de pedido, resumen, los 3 pasos que siguen y "Ya lo mandé". El carrito queda guardado (también al recargar) hasta confirmar. Avisa si el navegador bloqueó WhatsApp o si falló el servidor.
- Cada cuenta ve solo sus pedidos; el comprobante usa solo los datos del pedido. "Cerrar sesión" pregunta si borrar los datos del dispositivo y el ingreso avisa que es una vista previa. El pedido hecho como invitado pasa a la cuenta si la crea después.
- Apps Script: número de pedido propio que no se repite, clave única para Mercado Pago, límite de 5 pedidos cada 10 minutos por WhatsApp y campo trampa para robots.
- Tope de 99 unidades por producto, como en el servidor. La librería del QR se baja solo cuando hay link de pago.
- Celular: menú en una sola fila deslizable y portada más compacta; los productos se ven en la primera pantalla.
- Un solo color principal (azul de la marca) con mejor contraste; botones − / + de 44 px; puntos del carrusel más fáciles de tocar; colores de error legibles en modo oscuro.
- Selector − n + en tarjetas, ficha y carrito; "Deshacer" al quitar un producto; favoritos; ordenar por precio; búsqueda sin acentos, con × y atajo "/"; etiquetas para quitar filtros.
- Carrito: plazo y seña a la vista, ayudas (seña, plazos, entrega), dirección cuando es envío por agencia y mensajes de error propios en los campos.
- Ficha: "Se imprime a pedido · listo en 3 o más días hábiles" y tamaño o material si la planilla los tiene (columnas opcionales `tamano` y `material`).
- Contenido: los eventos pasados se ocultan solos (campo `hasta`), la cantidad de modelos se cuenta sola y se unieron dos preguntas repetidas.

## V0.23 · 2026-11-27
- Comprobante de pedido: botón "Descargar comprobante (PDF)" al terminar el pedido y "Comprobante" en cada pedido de Mis pedidos e Historial. Abre la impresión del navegador con la opción Guardar como PDF. Incluye cliente, dirección, productos, total, seña y saldo (no es una factura).

## V0.22 · 2026-11-27
- La cuenta deja de ser una ventanita: al tocar "Hola, …" se abre un desplegable con Mis pedidos, Historial de compras, Mis datos y Cerrar sesión, y cada uno es una pantalla aparte.
- Ingresar y crear cuenta siguen en la ventanita (ahora se puede desplazar en pantallas bajas); al terminar llevan a Mis pedidos.

## V0.21 · 2026-11-27
- Mis datos: dirección de entrega con Departamento, Ciudad o localidad, Barrio (lista de los 62 barrios si la ciudad es Montevideo) y Dirección.

## V0.20 · 2026-11-27
- Panel de usuario al ingresar: "Mis pedidos" (en curso con estado paso a paso: Recibido, Seña pagada, En impresión, Listo para entregar, Entregado; e historial con "Repetir pedido") y "Mis datos" para editar nombre, WhatsApp, correo y barrio.
- Los pedidos hechos con sesión iniciada quedan en el panel. Botón "Ver con pedidos de ejemplo" para mostrarlo.
- Vista previa: todo se guarda en el dispositivo; el estado real llega con la base de datos.

## V0.19 · 2026-11-27
- Eventos: el mapa se carga recién al abrir la pantalla (cargado oculto, Google lo dibujaba chiquito en una esquina en celulares).

## V0.18 · 2026-11-27
- Foto en grande con carrusel: si viene de un carrusel (galería o ficha del producto), se pasa a las otras con flechas, deslizando o con las teclas ← →, y muestra "2 / 4".

## V0.17 · 2026-11-27
- Galería: Cosplay Anime Fest 2025 (3 fotos) y Friki Fest Solidaria 2026 (4 fotos) con carrusel, como en el sitio. Se agrandan al tocarlas.

## V0.16 · 2026-11-27
- Todas las fotos de la ficha del producto (incluido el carrusel) y de la Galería se agrandan al tocarlas.

## V0.15 · 2026-11-27
- Al agregar un producto, la foto vuela hasta el carrito y el contador late. Mientras vuela, las mascotas miran hacia arriba y vuelven al frente cuando llega.
- Mascotas una arriba de la otra (también en celulares chicos).
- Redes (Instagram, TikTok, Facebook, WhatsApp) en el pie de página, con sus íconos. También en Nosotros.

## V0.14 · 2026-11-27
- Carrusel de fotos en la ficha del producto (se desliza con el dedo, con flechas y puntos). En la columna foto del catálogo se separan varias fotos con |.
- Fotos para Rumi/Zoey/Mira, Mazinger Z y San Expedito (venían en carrusel en el sitio).
- Nueva categoría Ideas personalizadas (9 trabajos) con botón "Consultar" por WhatsApp.
- Inicio como el sitio: "Proyectos personalizados y modelos listos para imprimir", temas y las mascotas.
- El afiche del evento se agranda al tocarlo.

## V0.13 · 2026-11-27
- Próximos eventos: tarjeta en el inicio y pantalla "Eventos" con afiche, fecha, lugar, mapa y botón "Cómo llegar" (copiado del Google Site). Los eventos se cargan en config.js.

## V0.12 · 2026-11-27
- Al pedir se elige "Quiero dar una seña del 50%" o "Lo pago todo", con el monto de cada opción.
- El link y QR de Mercado Pago cobran la seña o el total según lo elegido (el servidor calcula el monto). La planilla guarda el modo y el monto a pagar.

## V0.11 · 2026-11-27
- Galería, Nosotros y Preguntas frecuentes se abren como pantallas aparte (con su propio link y botón Atrás). Elegir una categoría vuelve al catálogo.

## V0.10 · 2026-11-27
- Secciones Galería (fotos de eventos), Nosotros (con redes sociales) y Preguntas frecuentes, copiadas del Google Site.
- En el menú: a la derecha en PC y dentro de "Más" en el celular.
- Elegir una categoría vuelve arriba de la lista.

## V0.09 · 2026-11-27
- Elegir cuántos productos ver: 10, 20 o 50 (recuerda la elección). Paginación cuando hay más productos que eso.
- Contador "1–20 de 161 productos".

## V0.08 · 2026-11-27
- Invitación a crear cuenta más visible en el carrito, con botón "Crear cuenta". Se sigue pudiendo pedir como invitado.

## V0.07 · 2026-11-27
- Se puede pedir sin cuenta. El carrito avisa que no hace falta y ofrece ingresar.
- Después de pedir como invitado se ofrece crear la cuenta con los datos ya cargados.

## V0.06 · 2026-11-27
- Botón de WhatsApp con animación: onda que late y un saludo cada 4 segundos (se apaga si el sistema pide menos movimiento).

## V0.05 · 2026-11-27
- Pago con Mercado Pago: al enviar el pedido se genera el link de pago con el total y su QR (modo prueba; necesita el servidor de pedidos y el token de Mercado Pago).
- El mensaje de WhatsApp incluye el número de pedido y el link de pago.
- Botón flotante de WhatsApp para consultas.

## V0.04 · 2026-11-27
- Categorías en un menú arriba, dentro del encabezado. Crochet se despliega por personaje.
- Se quitan las filas de filtros debajo del buscador.

## V0.03 · 2026-11-27
- Modo claro y oscuro con botón en el encabezado. Arranca según el sistema y recuerda la elección.

## V0.02 · 2026-11-27
- Panel de cuenta: crear cuenta e ingresar (vista previa: se guarda solo en el dispositivo, sin contraseña guardada).
- Los datos de la cuenta completan el formulario del pedido.
- Versión visible en el pie de página.

## V0.01 · 2026-11-27
- Catálogo de 161 productos copiado del Google Site, con 158 fotos.
- Buscador, filtros por categoría y por personaje en Crochet.
- Foto en grande al tocar un producto.
- Carrito con barra fija y pedido por WhatsApp.
- Logo y colores de Aukan3D.
