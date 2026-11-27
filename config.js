// Ajustes del negocio. Es lo único que hay que tocar para conectar la app.
window.AUKAN_CONFIG = {
  // Google Sheet > Archivo > Compartir > Publicar en la web > pestaña "Productos" > CSV.
  // Vacío: usa productos.csv (copia del catálogo del sitio).
  catalogoCsvUrl: "",
  // URL de la app web de Apps Script (ver apps-script/Code.gs). Vacío: solo WhatsApp.
  pedidosUrl: "",
  whatsapp: "59896849148",
  // Eventos que se muestran en el inicio y en "Eventos". Para agregar uno, copiar un bloque.
  eventos: [
    {
      nombre: "Friki Fest",
      lugar: "Espacio Modelo",
      fecha: "14 y 15 de noviembre",
      horario: "de 14 a 20 h",
      detalle: "Entrada gratuita",
      foto: "fotos/galeria/evento-frikifest.webp",
      mapa: "-34.872695,-56.153531", // latitud,longitud del lugar
    },
  ],
  version: "V0.13", // subir en cada entrega (ver CHANGELOG.md)
};
