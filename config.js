// Ajustes del negocio. Es lo único que hay que tocar para conectar la app.
window.AUKAN_CONFIG = {
  // Dirección del servidor (api/, Cloudflare Worker), ej. "https://aukan3d-api.xxx.workers.dev".
  // Vacío: demo con productos.csv y pedidos solo por WhatsApp.
  apiUrl: "https://aukan3d-api.aukan3d.workers.dev",
  whatsapp: "59896849148",
  // Eventos que se muestran en el inicio y en "Eventos". Para agregar uno, copiar un bloque.
  eventos: [
    {
      nombre: "Friki Fest",
      lugar: "Espacio Modelo",
      fecha: "14 y 15 de noviembre",
      horario: "de 14 a 20 h",
      hasta: "2026-11-15", // último día (AAAA-MM-DD): después deja de mostrarse
      detalle: "Entrada gratuita",
      foto: "fotos/galeria/evento-frikifest.webp",
      mapa: "-34.872695,-56.153531", // latitud,longitud del lugar
    },
  ],
  version: "V0.79", // subir en cada entrega (ver CHANGELOG.md)
};
