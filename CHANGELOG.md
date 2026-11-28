# Cambios

Versiones `V0.XX` mientras la app está en desarrollo. Cada entrega sube el número, actualiza `version` en `config.js` y el `?v=` de los archivos en `index.html` (para que el navegador no use copias viejas).

## V0.50 · 2026-11-28
- Arreglo: con el servidor sin actualizar (o una sesión abierta antes de V0.49) admin y dev quedaban sin secciones. Ahora las cuentas fijas tienen todo aunque el servidor no mande permisos.
- Tienda instalable como app (manifest e íconos) y avisos push: con permiso, el aviso de cambio de estado llega aunque la tienda esté cerrada. En iPhone, desde la app agregada a inicio. Las claves se crean solas en el servidor.
- Servidor: /api/push/clave, /api/push/alta y /api/push/ultimo; al avanzar el estado de un pedido (panel o pago de Mercado Pago) manda el push. Hay que volver a subir el servidor.

## V0.49 · 2026-11-28
- Panel: nueva pantalla Accesos al panel (administrador y dev). Crear cuentas con usuario, nombre, correo, base (solo pruebas, solo real o ambas) y secciones permitidas; reiniciar contraseña (temporal, se ve una vez) y desactivar (corta la sesión al instante). Botón "+ Probador": cuenta solo para pruebas con todo el día a día, sin Mercado Pago, Base de datos ni Accesos.
- Panel: el menú muestra solo las secciones permitidas y el servidor también lo controla. Quien entra con contraseña temporal tiene que elegir una nueva.
- Panel: al cambiar el estado de un pedido aparece "Avisarle por WhatsApp" con el mensaje armado para el cliente.
- Hay que volver a subir el servidor. La verificación por mail queda para cuando haya dominio propio.

## V0.48 · 2026-11-28
- Tienda: avisos al cliente cuando Aukan3D cambia el estado de su pedido (seña o pago recibido, en impresión, listo, entregado). Campana arriba con los avisos nuevos y, si el cliente lo permite, notificación del dispositivo mientras la tienda esté abierta. El estado se consulta al entrar, al volver a la pestaña y cada minuto.
- Tienda: cada pedido en Mis pedidos muestra lo pagado (seña o total, saldo) y cada pago; los de Mercado Pago con su número de operación. El comprobante suma la sección Pagos.
- Servidor: /api/pedidos/estado devuelve también los pagos del pedido (fecha, monto y N° de operación de Mercado Pago). Hay que volver a subir el servidor.

## V0.47 · 2026-11-28
- Panel: menú lateral más legible (letra normal en vez de mayúsculas angostas, más contraste) y títulos de sección en celeste con una línea al costado para separar mejor Ventas, Catálogo y Administración.

## V0.46 · 2026-11-28
- Panel: el estado y el número de operación de Mercado Pago quedan compactos en la lista (la pastilla ya no se estira y el número va como texto chico debajo).

## V0.45 · 2026-11-28
- Panel: los pagos de Mercado Pago muestran su número de operación (en la lista de ventas, en el detalle del pedido y en la hoja impresa). Se toca para copiarlo y buscarlo en Mercado Pago, en Actividad.

## V0.44 · 2026-11-28
- Tienda: el botón de Mercado Pago abre el pago en la misma pestaña, y al terminar vuelve ahí (a Mis pedidos) en vez de dejar una pestaña nueva.

## V0.43 · 2026-11-28
- Mercado Pago: el link de pago ya no lleva el mail del cliente. Con una cuenta de prueba, un mail real hacía fallar el pago con "Una de las partes con la que intentas hacer el pago es de prueba".

## V0.42 · 2026-11-28
- Mercado Pago: el nombre largo de la cuenta ya no se sale de su recuadro (los recuadros de números cortan el texto largo en vez de desbordar).

## V0.41 · 2026-11-28
- El pedido de la tienda se paga antes de entrar: con link de Mercado Pago queda en espera y no aparece en el panel. Cuando Mercado Pago confirma el pago entra como pedido nuevo (campana y aviso), ya en Seña pagada o Pagado. Si no hay credencial de Mercado Pago, el pedido entra igual para no perderlo.
- Tienda: botón "Hacer pedido y pagar" y pantalla "Último paso: pagá con Mercado Pago".
- Panel: un pedido con seña que ya no tiene saldo se muestra "Pagado" (antes seguía en "Seña pagada").

## V0.40 · 2026-11-28
- Mercado Pago en el panel (Administración → Mercado Pago, igual para admin y dev): estado de la cuenta, modo prueba o producción, carga de la credencial (queda solo en el servidor) y últimos 30 cobros cruzados con su pedido.
- "Cobrar con QR" en el detalle del pedido: QR de Mercado Pago por la seña (50 %) o el total/saldo. Cuando Mercado Pago confirma, el pago se anota solo y la ventana muestra "¡Pago recibido!".
- Aviso automático de Mercado Pago (webhook `/api/mp/aviso`): cada pago aprobado se anota en su pedido una sola vez y el panel avisa "Mercado Pago confirmó el pago".
- Tienda: el botón es "Hacer pedido" (ya no abre WhatsApp: el pedido llega solo al panel) y después se paga con Mercado Pago. Al terminar de pagar vuelve a "Mis pedidos".
- Portada: texto al medio y un perrito a cada lado.

## V0.39 · 2026-11-27
- Ventas: cada fila tiene los botones "A4" y "80 mm" para elegir el formato al imprimir, sin abrir el pedido.

## V0.38 · 2026-11-27
- Reportes, "Por tipo": un tipo con ventas solo en dólares (por ejemplo una venta en persona en USD) ahora aparece con su monto en USD; antes no se mostraba.
- Prueba de punta a punta contra la tienda publicada y la base de pruebas real (`probar-compras.bat`, fuera del repo), con un seguro que corta cualquier escritura a la base real.

## V0.37 · 2026-11-27
- Imprimir en A4 o en ticket de 80 mm (impresora térmica): botones en el detalle del pedido y en la última venta de Modo feria. El ticket ajusta su largo al contenido y muestra recibido y vuelto. El botón "Imprimir" de la lista usa el último formato elegido.
- Base de datos (solo usuario dev, en Administración): tamaño de la base real y la de pruebas contra los 500 MB del plan gratis y registros por tipo. Servidor: `GET /api/admin/estado`.
- Registrar pago en un pedido con seña propone el 50 % (antes proponía el total y lo dejaba pagado de una).
- Tienda: "Mis pedidos" trae el estado también al entrar a la sección o volver a la pestaña, no solo al recargar.
- Probado de punta a punta con 14 escenarios (compras con y sin cuenta, envío, seña y total, límite por WhatsApp, cobros en USD, feria con caja, reportes y dos pestañas del panel).

## V0.36 · 2026-11-27
- Revisión de textos cortados y encimados en tienda y panel (PC, tablet y dos tamaños de celular):
  - Arriba en el panel, "Administrador" y "Vista previa…" salían pegados (desde la campana); ahora uno debajo del otro. En tablet se oculta el subtítulo para que no se parta.
  - Usuarios: la columna Comisión mostraba "[object Object]%"; ahora el % de cada vendedor.
  - Barras de reportes y panel: los nombres largos pasan a dos líneas en vez de cortarse.
  - Celular chico: estados de las tablas, "Nuevo medio de pago" y los botones de Cuentas pendientes ya no se salen de la pantalla. Gastos muestra la fecha bajo el concepto.
  - "N° 1042" ya no se parte en dos renglones.
- Ortografía: "¡Hola, …!" en los mensajes de WhatsApp, "50 %" igual en todos lados, "…" en los ejemplos y plurales correctos ("1 venta", "1 día").
- La lista de pedidos vistos de la campana es aparte para la base de pruebas.

## V0.35 · 2026-11-27
- Panel, Reportes: período a elegir (día, mes, trimestre, semestre, año o entre fechas) con flechas para ir hacia atrás y adelante, y botón "Hoy".
- Reportes nuevos: ventas por día (o por mes si el período es largo; en un día, la lista de ventas), productos más vendidos, ventas por tipo (tienda web, en persona, feria) y cobrado por forma de pago, todos del período elegido.

## V0.34 · 2026-11-27
- Panel: campana arriba con los pedidos nuevos de la tienda (número rojo, lista, tocar abre el pedido, "Marcar todo como visto"). El título de la pestaña muestra cuántos hay y, si se permite, el navegador avisa aunque estés en otra pestaña.
- Panel: botón "Imprimir" en cada venta y en el detalle del pedido (hoja limpia, sirve para guardar como PDF).
- Tienda: "Mis pedidos" toma el estado que se marca en el panel (servidor: `POST /api/pedidos/estado`, pide número + WhatsApp del pedido y devuelve solo el estado).

## V0.33 · 2026-11-27
- Panel: al volver a la pestaña trae los pedidos nuevos en el momento (además de buscar cada 20 segundos).

## V0.32 · 2026-11-27
- Usuario "dev" con base de pruebas aparte: desde el panel pasa de producción a pruebas y vuelve con un botón. En pruebas se ve una franja naranja y nada afecta los datos reales. La tienda abierta en ese mismo navegador también manda sus pedidos a la base de pruebas (con aviso arriba). El usuario del negocio no puede entrar a pruebas.

## V0.31 · 2026-11-27
- Menú del panel ordenado por grupos (Ventas, Catálogo, Administración). Modo feria queda abajo, separado y destacado.

## V0.30 · 2026-11-27
- Modo feria en el panel de gestión: punto de venta con las fotos del catálogo, buscador y categorías (y "Con stock"). Se toca el producto, se elige cómo paga y se cobra; en efectivo calcula el vuelto con atajos de billetes. Cada venta queda registrada como "Feria", pagada y entregada, y descuenta stock. Con "Deshacer" por si fue un error.
- Control de caja: se abre con el efectivo inicial y quién vende, se anotan retiros o ingresos de efectivo, y al cerrar se cuenta la plata y muestra si falta o sobra. Debajo quedan las cajas anteriores.
- Ventas y pedidos: filtro "Solo feria".
- Sin señal en la feria, las ventas salen con número propio (F + hora) y se suben al servidor cuando vuelve la conexión, mientras la página siga abierta.

## V0.29 · 2026-11-27
- Base de datos real: servidor propio en Cloudflare (Worker + base D1, plan gratis) en `api/`, publicado en https://aukan3d-api.aukan3d.workers.dev.
- La tienda toma el catálogo y manda los pedidos al servidor (los precios se recalculan allá). Cada pedido aparece en el panel de gestión desde cualquier dispositivo, en menos de 20 segundos.
- El panel pide usuario y contraseña al servidor (contraseña cifrada, sesión de 12 horas, límite de intentos). Ventas, clientes, productos, stock, medios de pago, usuarios y gastos se guardan en la base y se ven igual en todas las computadoras y celulares.
- Los números de venta del panel y de la tienda son una sola serie. Las fotos nuevas de productos se publican solas en la tienda.
- "Ver la tienda" en el panel abre la tienda en otra pestaña.
- Sin `apiUrl` en `config.js` todo sigue funcionando como demo (admin / admin y datos de ejemplo en el navegador).

## V0.28 · 2026-11-27
- El panel de gestión muestra la versión (abajo en el menú y en la pantalla de ingreso), la misma que la tienda.

## V0.27 · 2026-11-27
- Puente para la demo: los pedidos que se hacen en la tienda aparecen solos en el panel de gestión (Ventas y pedidos, como "Tienda web", con el cliente creado o encontrado por su WhatsApp), aunque el panel ya esté abierto. Solo ve los pedidos hechos desde el mismo navegador; con la base de datos van a llegar todos.

## V0.26 · 2026-11-27
Cambios aprobados de las auditorías del panel de gestión (`auditorias/admin-v025.md`).
- Los meses y el "hoy" se cuentan con la hora de Uruguay (antes, una venta del último día después de las 21:00 caía en el mes siguiente).
- Nueva venta: al pasar a dólares los precios quedan para poner a mano y al volver a pesos vuelven los del catálogo; "Agregar" ya no muestra un error falso; los productos con el mismo nombre (dos ANGEL, dos PIKACHU) se eligen por número; los precios se redondean a pesos; si se cierra sin guardar, queda como borrador.
- La comisión se guarda en cada venta: cambiar el % de un vendedor no cambia los meses pasados.
- Cambiar el estado de un pedido muestra "Deshacer" (también con la ventana abierta).
- "Entregado" en gris y "Listo para entregar" en verde; etiquetas con mejor contraste.
- Celular: la tabla de ventas entra sin deslizar (el saldo va debajo del total), "Salir" en la barra negra y botones de stock de 44 px.
- Los nombres cortados muestran el nombre completo al pasar el mouse.

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
