// Genera el hash de la contraseña del panel para el secreto ADMIN_CLAVE_HASH.
// Uso: node clave.mjs "mi-contraseña"   (la contraseña no se guarda en ningún lado)
import { webcrypto as crypto } from "node:crypto";

const clave = process.argv[2];
if (!clave || clave.length < 10) {
  console.error('Uso: node clave.mjs "contraseña de al menos 10 caracteres"');
  process.exit(1);
}
const iter = 100000;
const sal = crypto.getRandomValues(new Uint8Array(16));
const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iter }, k, 256);
const b64 = (b) => Buffer.from(b).toString("base64");
console.log(`pbkdf2$${iter}$${b64(sal)}$${b64(bits)}`);
