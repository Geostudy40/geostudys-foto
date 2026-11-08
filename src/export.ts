// Export: ZIP (beschriftet + Original + CSV) und Teilen über das Handy-Menü
import JSZip from 'jszip';
import { csv, datumZeit, tiefeText, type Aufschluss, type Foto, type Projekt } from './model';
import { speicher } from './db';

function heute(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(d.getDate())}-${z(d.getMonth() + 1)}-${String(d.getFullYear()).slice(2)}`;
}

/** Laufende Fassung je Projekt und Tag: Name_V{n}_{TT-MM-JJ} */
async function naechsteFassung(projektId: string): Promise<number> {
  const k = `export_${projektId}_${heute()}`;
  const n = (await speicher.einstellung<number>(k, 0)) + 1;
  await speicher.einstellungSetzen(k, n);
  return n;
}

function endung(b: Blob): string {
  if (b.type.includes('png')) return '.png';
  if (b.type.includes('heic')) return '.heic';
  return '.jpg';
}

export function fotoliste(p: Projekt, aufschluesse: Aufschluss[], fotos: Foto[]): string {
  const name = new Map(aufschluesse.map((a) => [a.id, a]));
  const kopf = ['Nr', 'Dateiname', 'Projekt', 'Aufschluss', 'Typ', 'Schritt', 'Titel', 'Tiefe von [m]', 'Tiefe bis [m]', 'Tiefe', 'Bemerkung', 'Datum', 'Uhrzeit', 'Breite (WGS84)', 'Laenge (WGS84)', 'Genauigkeit [m]', 'Fotograf', 'ausgeblendet'];
  const zeilen = fotos.map((f, i) => {
    const a = name.get(f.aufschlussId);
    const { datum, zeit } = datumZeit(f.zeit);
    return [
      i + 1, f.dateiname, p.nummer, a?.bezeichnung, a?.typ, f.schrittNr ?? 'Zusatz', f.titel,
      f.tiefeVon?.toString().replace('.', ','), f.tiefeBis?.toString().replace('.', ','), tiefeText(f.tiefeVon, f.tiefeBis),
      f.bemerkung, datum, zeit, f.gps?.lat.toFixed(6), f.gps?.lon.toFixed(6), f.gps ? Math.round(f.gps.acc) : '', f.fotograf, f.ausgeblendet ? 'ja' : '',
    ];
  });
  return csv([kopf, ...zeilen]);
}

export async function zipErstellen(projektId: string): Promise<File> {
  const p = (await speicher.projekt(projektId))!;
  const aufschluesse = await speicher.aufschluesse(projektId);
  const fotos = await speicher.fotosProjekt(projektId);
  const zip = new JSZip();
  for (const f of fotos) {
    zip.file(`1_beschriftet/${f.dateiname}`, f.beschriftet);
    zip.file(`2_original/${f.dateiname.replace(/\.jpg$/, endung(f.original))}`, f.original);
  }
  zip.file(`Fotoliste_${p.nummer}.csv`, fotoliste(p, aufschluesse, fotos));
  // Fotos sind schon komprimiert -> STORE spart Zeit und Akku
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const n = await naechsteFassung(projektId);
  return new File([blob], `Fotos_${p.nummer}_V${n}_${heute()}.zip`, { type: 'application/zip' });
}

export function herunterladen(datei: File) {
  const url = URL.createObjectURL(datei);
  const a = document.createElement('a');
  a.href = url;
  a.download = datei.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Teilen über das Handy-Menü (z. B. „In Drive speichern“).
 * ZIP-Dateien lässt Chrome auf Android nicht teilen, daher werden die
 * beschrifteten Fotos und die Fotoliste als Einzeldateien geteilt.
 */
export async function teilen(projektId: string, mitOriginalen: boolean): Promise<'geteilt' | 'abgebrochen' | 'nicht-unterstuetzt'> {
  const p = (await speicher.projekt(projektId))!;
  const aufschluesse = await speicher.aufschluesse(projektId);
  const fotos = await speicher.fotosProjekt(projektId);
  const dateien: File[] = fotos.map((f) => new File([f.beschriftet], f.dateiname, { type: 'image/jpeg' }));
  if (mitOriginalen) {
    for (const f of fotos) dateien.push(new File([f.original], f.dateiname.replace(/\.jpg$/, '_original' + endung(f.original)), { type: f.original.type || 'image/jpeg' }));
  }
  dateien.push(new File([fotoliste(p, aufschluesse, fotos)], `Fotoliste_${p.nummer}.csv`, { type: 'text/csv' }));
  if (!navigator.canShare?.({ files: dateien })) return 'nicht-unterstuetzt';
  try {
    await navigator.share({ files: dateien, title: `Fotos ${p.nummer}` });
    return 'geteilt';
  } catch {
    return 'abgebrochen';
  }
}
