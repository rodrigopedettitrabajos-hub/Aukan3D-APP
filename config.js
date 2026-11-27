// Ajustes del negocio. Es lo único que hay que tocar para conectar la app.
window.AUKAN_CONFIG = {
  // Google Sheet > Archivo > Compartir > Publicar en la web > pestaña "Productos" > CSV.
  // Vacío: usa productos.csv (copia del catálogo del sitio).
  catalogoCsvUrl: "",
  // URL de la app web de Apps Script (ver apps-script/Code.gs). Vacío: solo WhatsApp.
  pedidosUrl: "",
  whatsapp: "59896849148",
  version: "V0.12", // subir en cada entrega (ver CHANGELOG.md)
};
