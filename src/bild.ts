// Bildverarbeitung: Verkleinern, Schriftfeld unter das Foto setzen, EXIF schreiben.
// Das Original wird nie verändert, sondern unverändert mitgespeichert.
import piexif from 'piexifjs';
import { datumZeit, gpsText, type GpsPunkt } from './model';

const NAVY = '#1F3864';
const MAX_KANTE = 2400;
const QUALITAET = 0.85;

export interface Schriftfeld {
  projekt: string; // "26-126 Rosenthaler Str. 39"
  aufschluss: string; // "RKS 1 · Kern 0–2 m"
  bemerkung?: string;
  zeit: string; // ISO
  gps?: GpsPunkt;
  fotograf: string;
  dateiname: string;
}

async function ladeBild(datei: Blob): Promise<ImageBitmap> {
  // 'from-image' berücksichtigt die EXIF-Drehung des Handys
  return createImageBitmap(datei, { imageOrientation: 'from-image' });
}

function canvasZuBlob(c: HTMLCanvasElement, q = QUALITAET): Promise<Blob> {
  return new Promise((ok, fehler) => c.toBlob((b) => (b ? ok(b) : fehler(new Error('Bild konnte nicht erzeugt werden'))), 'image/jpeg', q));
}

/** Text auf Breite kürzen */
function passend(ctx: CanvasRenderingContext2D, t: string, breite: number): string {
  if (ctx.measureText(t).width <= breite) return t;
  while (t.length > 3 && ctx.measureText(t + '…').width > breite) t = t.slice(0, -1);
  return t + '…';
}

export async function verarbeite(original: Blob, sf: Schriftfeld): Promise<{ beschriftet: Blob; vorschau: Blob }> {
  const bmp = await ladeBild(original);
  const f = Math.min(1, MAX_KANTE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * f);
  const h = Math.round(bmp.height * f);

  // Schriftfeld: Höhe abhängig von der Bildbreite, damit es auf Hoch- und Querformat lesbar bleibt
  const fs = Math.max(18, Math.round(w / 46)); // Schriftgröße
  const zeilen = sf.bemerkung ? 3 : 2;
  const pad = Math.round(fs * 0.6);
  const feldH = Math.round(zeilen * fs * 1.35 + 2 * pad);

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h + feldH;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  // Navy-Block links mit Firmenname
  ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
  const blockB = Math.round(ctx.measureText('GeoStudys').width + 2 * pad);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, h, blockB, feldH);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText('GeoStudys', pad, h + feldH / 2);

  // Linie oben
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, h, w, Math.max(2, Math.round(fs / 10)));

  const { datum, zeit } = datumZeit(sf.zeit);
  const x = blockB + pad;
  const breite = w - x - pad;
  const z = [
    { t: `${sf.projekt}  |  ${sf.aufschluss}`, fett: true },
    { t: `${datum} ${zeit}  |  ${gpsText(sf.gps)}  |  Foto: ${sf.fotograf}`, fett: false },
  ];
  if (sf.bemerkung) z.push({ t: sf.bemerkung, fett: false });
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  z.forEach((zeile, i) => {
    ctx.font = `${zeile.fett ? 'bold ' : ''}${fs}px Arial, Helvetica, sans-serif`;
    ctx.fillText(passend(ctx, zeile.t, breite), x, h + pad + i * fs * 1.35);
  });

  let beschriftet = await canvasZuBlob(c);
  beschriftet = await mitExif(beschriftet, sf);

  // Vorschau für die Liste
  const vf = 360 / Math.max(c.width, c.height);
  const v = document.createElement('canvas');
  v.width = Math.round(c.width * vf);
  v.height = Math.round(c.height * vf);
  v.getContext('2d')!.drawImage(c, 0, 0, v.width, v.height);
  const vorschau = await canvasZuBlob(v, 0.7);
  return { beschriftet, vorschau };
}

// ---------- EXIF ----------

function ascii(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[–—]/g, '-').replace(/·/g, '-').replace(/±/g, '+/-')
    .replace(/[^\x20-\x7E]/g, '');
}

function grad(dez: number): [number, number][] {
  const a = Math.abs(dez);
  const g = Math.floor(a);
  const m = Math.floor((a - g) * 60);
  const s = Math.round(((a - g) * 60 - m) * 60 * 1000);
  return [[g, 1], [m, 1], [s, 1000]];
}

async function mitExif(jpeg: Blob, sf: Schriftfeld): Promise<Blob> {
  try {
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const d = new Date(sf.zeit);
    const z = (n: number) => String(n).padStart(2, '0');
    const exifZeit = `${d.getFullYear()}:${z(d.getMonth() + 1)}:${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
    const exif: Record<string, Record<number, unknown>> = {
      '0th': {
        [piexif.ImageIFD.ImageDescription]: ascii(`${sf.projekt} | ${sf.aufschluss}${sf.bemerkung ? ' | ' + sf.bemerkung : ''}`),
        [piexif.ImageIFD.Artist]: ascii(sf.fotograf),
        [piexif.ImageIFD.Software]: 'GeoFoto (GeoStudys)',
        [piexif.ImageIFD.DateTime]: exifZeit,
      },
      Exif: { [piexif.ExifIFD.DateTimeOriginal]: exifZeit },
      GPS: {},
    };
    if (sf.gps) {
      exif.GPS = {
        [piexif.GPSIFD.GPSLatitudeRef]: sf.gps.lat >= 0 ? 'N' : 'S',
        [piexif.GPSIFD.GPSLatitude]: grad(sf.gps.lat),
        [piexif.GPSIFD.GPSLongitudeRef]: sf.gps.lon >= 0 ? 'E' : 'W',
        [piexif.GPSIFD.GPSLongitude]: grad(sf.gps.lon),
        [piexif.GPSIFD.GPSHPositioningError]: [Math.round(sf.gps.acc * 10), 10],
      };
    }
    const neu = piexif.insert(piexif.dump(exif), bin);
    const out = new Uint8Array(neu.length);
    for (let i = 0; i < neu.length; i++) out[i] = neu.charCodeAt(i);
    return new Blob([out], { type: 'image/jpeg' });
  } catch (e) {
    console.warn('EXIF konnte nicht geschrieben werden', e);
    return jpeg; // Foto trotzdem behalten
  }
}
