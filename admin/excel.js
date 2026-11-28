// Excel (.xlsx) sin librerías: escribir una hoja y leer la primera hoja de un archivo.
// Un .xlsx es un ZIP con XML adentro. Al escribir se guarda sin comprimir; al leer se descomprime con
// DecompressionStream("deflate-raw") del navegador (también existe en Node 18+, para los tests).

const crcTabla = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTabla[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const xmlEsc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""); // caracteres que el XML no admite
const xmlDes = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (x, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (x, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const letraCol = (i) => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const indiceCol = (ref) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function zip(archivos) { // [[nombre, Uint8Array]] -> Uint8Array (sin comprimir)
  const enc = new TextEncoder(), partes = [], central = [];
  let pos = 0;
  for (const [nombre, datos] of archivos) {
    const n = enc.encode(nombre), crc = crc32(datos), local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true); local.setUint16(26, n.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint32(16, crc, true);
    cd.setUint32(20, datos.length, true); cd.setUint32(24, datos.length, true); cd.setUint16(28, n.length, true); cd.setUint32(42, pos, true);
    partes.push(new Uint8Array(local.buffer), n, datos); central.push(new Uint8Array(cd.buffer), n);
    pos += 30 + n.length + datos.length;
  }
  const tam = central.reduce((t, x) => t + x.length, 0), fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tam, true); fin.setUint32(16, pos, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)], out = new Uint8Array(todo.reduce((t, x) => t + x.length, 0));
  let o = 0; for (const x of todo) { out.set(x, o); o += x.length; }
  return out;
}

// filas: [[celda, ...], ...]; la primera fila va en negrita. anchos: ancho de cada columna (en caracteres).
function crearXlsx(filas, { hoja = "Hoja1", anchos = [] } = {}) { return crearLibro([{ hoja, filas, anchos }]); }
// Varias hojas: [{ hoja, filas, anchos }] (nombres de hoja de hasta 31 letras, sin repetir).
function crearLibro(hojas) {
  const enc = new TextEncoder();
  const celda = (v, c, r, s) => (typeof v === "number" && Number.isFinite(v) ? `<c r="${letraCol(c)}${r}"${s}><v>${v}</v></c>`
    : v == null || v === "" ? "" : `<c r="${letraCol(c)}${r}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`);
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const hojaXml = ({ filas, anchos = [] }) => {
    const xmlFilas = filas.map((f, i) => `<row r="${i + 1}">${f.map((v, c) => celda(v, c, i + 1, i === 0 ? ' s="1"' : "")).join("")}</row>`).join("");
    const cols = anchos.length ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${xmlFilas}</sheetData></worksheet>`;
  };
  const n = hojas.map((_, i) => i + 1);
  const archivos = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${n.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${R}"><sheets>${hojas.map((h, i) => `<sheet name="${xmlEsc(String(h.hoja || "Hoja" + (i + 1)).slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${n.map((i) => `<Relationship Id="rId${i}" Type="${R}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ...Object.fromEntries(hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)])),
  };
  return new Blob([zip(Object.entries(archivos).map(([n, t]) => [n, enc.encode(t)]))], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function unzip(buf) { // ArrayBuffer -> Map nombre -> texto (solo los .xml que hacen falta)
  const v = new DataView(buf), dec = new TextDecoder();
  let fin = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("no es xlsx");
  const archivos = new Map();
  for (let n = v.getUint16(fin + 10, true), p = v.getUint32(fin + 16, true); n--; ) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("no es xlsx");
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true), largo = v.getUint16(p + 28, true);
    const nombre = dec.decode(new Uint8Array(buf, p + 46, largo)), local = v.getUint32(p + 42, true);
    p += 46 + largo + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (!/^xl\/(sharedStrings|workbook|worksheets\/sheet\d+)\.xml$|^xl\/_rels\/workbook\.xml\.rels$/.test(nombre)) continue;
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true), datos = new Uint8Array(buf, ini, tam);
    archivos.set(nombre, metodo === 0 ? dec.decode(datos)
      : await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text());
  }
  return archivos;
}

// Primera hoja del libro -> [[valor, ...], ...] (texto o número; las celdas vacías quedan "").
async function leerXlsx(buf) {
  const a = await unzip(buf);
  const textoDe = (x) => xmlDes([...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
  const comunes = [...(a.get("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  const id = (a.get("xl/workbook.xml") || "").match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const destino = id && (a.get("xl/_rels/workbook.xml.rels") || "").match(new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"|<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${id}"`));
  const ruta = destino ? "xl/" + (destino[1] || destino[2]).replace(/^\/?xl\//, "") : "xl/worksheets/sheet1.xml";
  const hoja = a.get(ruta) || [...a.entries()].find(([n]) => n.startsWith("xl/worksheets/"))?.[1];
  if (!hoja) throw new Error("sin hojas");
  const filas = [];
  for (const [, atrs, cuerpo] of hoja.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = (+atrs.match(/\br="(\d+)"/)?.[1] || filas.length + 1) - 1, fila = [];
    for (const [, ca, cc = ""] of (cuerpo || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = ca.match(/\br="([A-Z]+)\d*"/)?.[1], t = ca.match(/\bt="(\w+)"/)?.[1], vv = cc.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const valor = t === "s" ? comunes[+vv] ?? "" : t === "inlineStr" ? textoDe(cc) : t === "str" || t === "e" ? xmlDes(vv || "") : t === "b" ? (vv === "1" ? "SI" : "NO") : vv != null && vv !== "" ? Number(vv) : "";
      fila[ref ? indiceCol(ref) : fila.length] = valor;
    }
    filas[r] = Array.from(fila, (x) => x ?? "");
  }
  return Array.from(filas, (x) => x || []);
}

if (typeof module !== "undefined") module.exports = { crearXlsx, crearLibro, leerXlsx, letraCol, indiceCol };
