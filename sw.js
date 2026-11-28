// Solo para mostrar los avisos de pedidos como notificación y abrir "Mis pedidos" al tocarla. No guarda nada en caché.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((ws) => {
    const w = ws.find((x) => new URL(x.url).origin === self.location.origin);
    if (w) { w.navigate(new URL("./#mis-pedidos", self.registration.scope).href).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(new URL("./#mis-pedidos", self.registration.scope).href);
  }));
});
