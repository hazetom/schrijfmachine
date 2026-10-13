// Minimale zip-lezer en -schrijver voor .docx, zonder externe library.
// Comprimeren en uitpakken gebeurt met de ingebouwde Compression Streams van de browser,
// dus dit werkt ook offline.

const CRC_TABEL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABEL[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function viaStream(data, stream) {
  const s = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function kanRaw(soort) {
  try {
    if (soort === 'c') { new CompressionStream('deflate-raw'); return true; }
    new DecompressionStream('deflate-raw'); return true;
  } catch (e) { return false; }
}

function dosTijd(d) {
  const tijd = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const datum = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { tijd, datum };
}

// bestanden: [{ naam: 'word/document.xml', data: Uint8Array | string }]
export async function maakZip(bestanden) {
  const enc = new TextEncoder();
  const comprimeren = typeof CompressionStream !== 'undefined' && kanRaw('c');
  const { tijd, datum } = dosTijd(new Date());
  const delen = [];
  const centraal = [];
  let offset = 0;
  for (const b of bestanden) {
    const ruw = typeof b.data === 'string' ? enc.encode(b.data) : b.data;
    const naam = enc.encode(b.naam);
    const crc = crc32(ruw);
    let inhoud = ruw, methode = 0;
    if (comprimeren && ruw.length > 64) {
      const c = await viaStream(ruw, new CompressionStream('deflate-raw'));
      if (c.length < ruw.length) { inhoud = c; methode = 8; }
    }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 namen
    lh.setUint16(8, methode, true);
    lh.setUint16(10, tijd, true);
    lh.setUint16(12, datum, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, inhoud.length, true);
    lh.setUint32(22, ruw.length, true);
    lh.setUint16(26, naam.length, true);
    lh.setUint16(28, 0, true);
    delen.push(new Uint8Array(lh.buffer), naam, inhoud);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, methode, true);
    ch.setUint16(12, tijd, true);
    ch.setUint16(14, datum, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, inhoud.length, true);
    ch.setUint32(24, ruw.length, true);
    ch.setUint16(28, naam.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    centraal.push(new Uint8Array(ch.buffer), naam);
    offset += 30 + naam.length + inhoud.length;
  }
  const cdGrootte = centraal.reduce((s, x) => s + x.length, 0);
  const eind = new DataView(new ArrayBuffer(22));
  eind.setUint32(0, 0x06054b50, true);
  eind.setUint16(8, bestanden.length, true);
  eind.setUint16(10, bestanden.length, true);
  eind.setUint32(12, cdGrootte, true);
  eind.setUint32(16, offset, true);
  return new Blob([...delen, ...centraal, new Uint8Array(eind.buffer)], { type: 'application/zip' });
}

// Geeft een Map naam -> Uint8Array
export async function leesZip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('Dit is geen geldig .docx-bestand');
  const aantal = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const uit = new Map();
  for (let k = 0; k < aantal; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Beschadigd zip-bestand');
    const methode = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const naam = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    const lnlen = dv.getUint16(lho + 26, true);
    const lxlen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lxlen;
    const ruw = u8.subarray(start, start + csize);
    let data;
    if (methode === 0) data = ruw.slice();
    else if (methode === 8) data = await viaStream(ruw, new DecompressionStream('deflate-raw'));
    else continue;
    uit.set(naam, data);
  }
  return uit;
}
