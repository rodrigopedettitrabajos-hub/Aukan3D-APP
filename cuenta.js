// Panel de cuenta (vista previa sin servidor).
// shortcut: la cuenta vive en localStorage de este dispositivo y la contraseña NO se guarda ni se verifica;
// reemplazar por registro real cuando haya base de datos.
const CLAVE_PERFIL = "aukan_perfil";

function leerPerfil() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PERFIL)) || null; } catch { return null; }
}
function guardarPerfil(p) {
  try { localStorage.setItem(CLAVE_PERFIL, JSON.stringify(p)); } catch { /* modo privado: la sesión dura lo que la pestaña */ }
}

function pintarCuenta() {
  const p = leerPerfil();
  const activo = !!p?.activo;
  $("#ver-cuenta").textContent = activo ? `Hola, ${p.nombre.split(" ")[0]}` : "Ingresar";
  $("#cuenta-sesion").hidden = !activo;
  $("#cuenta-forms").hidden = activo;
  if (activo) $("#cuenta-nombre").textContent = p.nombre;
  // Completa el formulario del pedido con los datos de la cuenta.
  const f = $("#checkout");
  for (const k of ["nombre", "whatsapp", "email"]) if (activo && !f[k].value) f[k].value = p[k];
}

function elegirTab(registro) {
  $("#tab-registro").ariaSelected = String(registro);
  $("#tab-ingreso").ariaSelected = String(!registro);
  $("#form-registro").hidden = !registro;
  $("#form-ingreso").hidden = registro;
}

$("#ver-cuenta").addEventListener("click", () => $("#cuenta").showModal());
$("#tab-registro").addEventListener("click", () => elegirTab(true));
$("#tab-ingreso").addEventListener("click", () => elegirTab(false));

$("#form-registro").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (d.clave !== d.clave2) { $("#registro-error").textContent = "Las contraseñas no coinciden."; return; }
  $("#registro-error").textContent = "";
  guardarPerfil({ nombre: d.nombre.trim(), whatsapp: d.whatsapp.trim(), email: d.email.trim().toLowerCase(), activo: true });
  e.target.reset();
  pintarCuenta();
});

$("#form-ingreso").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get("email").trim().toLowerCase();
  const p = leerPerfil();
  if (!p || p.email !== email) { $("#ingreso-error").textContent = "No encontramos una cuenta con ese correo en este dispositivo."; return; }
  $("#ingreso-error").textContent = "";
  guardarPerfil({ ...p, activo: true });
  e.target.reset();
  pintarCuenta();
});

$("#cuenta-salir").addEventListener("click", () => {
  const p = leerPerfil();
  if (p) guardarPerfil({ ...p, activo: false });
  pintarCuenta();
  elegirTab(false);
});

$("#version").textContent = cfg.version;
pintarCuenta();
