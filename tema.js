// Se carga en <head> para aplicar el tema antes de pintar (sin parpadeo).
(() => {
  const KEY = "aukan_tema";
  const root = document.documentElement;
  const sistema = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  let guardado = null;
  try { guardado = localStorage.getItem(KEY); } catch { /* sin almacenamiento: sigue al sistema */ }
  if (guardado === "dark" || guardado === "light") root.dataset.theme = guardado;
  const actual = () => root.dataset.theme || sistema();

  function pintarBoton() {
    const b = document.getElementById("tema");
    const oscuro = actual() === "dark";
    b.textContent = oscuro ? "☀" : "☾";
    b.ariaLabel = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    b.title = b.ariaLabel;
  }

  addEventListener("DOMContentLoaded", () => {
    pintarBoton();
    document.getElementById("tema").addEventListener("click", () => {
      root.dataset.theme = actual() === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, root.dataset.theme); } catch { /* idem */ }
      pintarBoton();
    });
  });
})();
