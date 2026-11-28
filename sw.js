// Service worker de la tienda: avisos de pedidos (push) y abrir "Mis pedidos" al tocar uno. No guarda nada en caché.
// El push llega vacío: el texto se pide al servidor con el endpoint de esta suscripción (ver api: /api/push/ultimo).
const params = new URL(self.location.href).searchParams;
const API = params.get("api") || "", ENTORNO = params.get("e") === "pruebas" ? "?e=pruebas" : "";

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let aviso = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(API + "/api/push/ultimo" + ENTORNO, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ endpoint: sub?.endpoint || "" }) });
      aviso = (await r.json()).aviso;
    } catch { /* sin conexión: aviso genérico */ }
    const titulo = aviso?.titulo || "Aukan3D";
    await self.registration.showNotification(titulo, { body: aviso?.texto || "Tu pedido cambió de estado. Tocá para verlo.",
      icon: "icono-192.png", badge: "icono-192.png", tag: aviso ? `pedido-${aviso.numero}` : "pedido", data: { estado: aviso?.estado } });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.estado >= 4 ? "./#historial" : "./#mis-pedidos", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => new URL(x.url).origin === self.location.origin);
    if (w) { w.navigate(destino).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(destino);
  }));
});
