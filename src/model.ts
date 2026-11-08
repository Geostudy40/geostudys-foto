// Datenmodell und reine Logik (ohne Browser-APIs, daher testbar)

export type AufschlussTyp =
  | 'Baustelle' | 'RKS' | 'DPH' | 'BS' | 'KB' | 'GWM' | 'Schurf' | 'FS' | 'HW' | 'Probe' | 'CPT' | 'Sonstiges';

/** Auswahl beim Anlegen; praefix = Bezeichnung ohne Nummer */
export const AUFSCHLUSS_TYPEN: { typ: AufschlussTyp; name: string; praefix: string; gruppe: 'Aufschluss' | 'Umwelt / Bauwerk' }[] = [
  { typ: 'RKS', name: 'Rammkernsondierung', praefix: 'RKS', gruppe: 'Aufschluss' },
  { typ: 'DPH', name: 'Schwere Rammsondierung', praefix: 'DPH', gruppe: 'Aufschluss' },
  { typ: 'CPT', name: 'Drucksondierung', praefix: 'CPT', gruppe: 'Aufschluss' },
  { typ: 'BS', name: 'Bohrsondierung', praefix: 'BS', gruppe: 'Aufschluss' },
  { typ: 'KB', name: 'Kernbohrung', praefix: 'KB', gruppe: 'Aufschluss' },
  { typ: 'GWM', name: 'Grundwassermessstelle', praefix: 'GWM', gruppe: 'Aufschluss' },
  { typ: 'Schurf', name: 'Schurf', praefix: 'Schurf', gruppe: 'Aufschluss' },
  { typ: 'FS', name: 'Fundamentschurf (Gründung freilegen)', praefix: 'FS', gruppe: 'Umwelt / Bauwerk' },
  { typ: 'HW', name: 'Haufwerk (Beprobung)', praefix: 'HW', gruppe: 'Umwelt / Bauwerk' },
  { typ: 'Probe', name: 'Einzelprobe / Mischprobe', praefix: 'Probe', gruppe: 'Umwelt / Bauwerk' },
  { typ: 'Sonstiges', name: 'Sonstiger Punkt', praefix: 'Punkt', gruppe: 'Umwelt / Bauwerk' },
];

/** Der Bereich „Baustelle“ wird je Projekt automatisch angelegt (freie Fotos) */
export const BAUSTELLE = 'Baustelle';

export interface Projekt {
  id: string;
  nummer: string; // z. B. 26-126
  kurzname: string;
  anschrift: string;
  auftraggeber: string;
  angelegt: string; // ISO
  driveOrdner?: { id: string; name: string }; // Stufe 1b: Zielordner in Google Drive
}

export interface Aufschluss {
  id: string;
  projektId: string;
  typ: AufschlussTyp;
  bezeichnung: string; // z. B. RKS 1
  endtiefe?: number; // m u. GOK
  angelegt: string;
}

export interface Fotoschritt {
  nr: number;
  titel: string;
  kurztext: string; // für den Dateinamen
  pflicht: boolean;
  mitTiefe: boolean; // Kernfotos: Tiefe von–bis
  hinweis?: string; // Erinnerung vor der Aufnahme
}

export interface GpsPunkt {
  lat: number;
  lon: number;
  acc: number;
}

export interface Foto {
  id: string;
  projektId: string;
  aufschlussId: string;
  schrittNr: number | null; // null = Zusatzfoto
  titel: string;
  kurztext: string;
  tiefeVon?: number;
  tiefeBis?: number;
  bemerkung: string;
  zeit: string; // ISO
  gps?: GpsPunkt;
  fotograf: string;
  dateiname: string;
  original: Blob;
  beschriftet: Blob;
  vorschau: Blob;
  ausgeblendet: boolean;
  hochgeladen?: boolean; // Stufe 1b
}

const TAFEL = 'Fototafel und Zollstock im Bild? Tafel beschriftet?';
const GEFAESS = 'Gefäße beschriftet und lesbar im Bild? Probenbezeichnung auf der Tafel?';

type S = Omit<Fotoschritt, 'nr'>;
/** nummeriert die Schritte fortlaufend 1, 2, 3 … */
const reihe = (...s: S[]): Fotoschritt[] => s.map((x, i) => ({ ...x, nr: i + 1 }));

const umgebung: S = { titel: 'Umgebung / Lage', kurztext: 'Umgebung', pflicht: true, mitTiefe: false, hinweis: 'Übersicht mit Bezugspunkten (Gebäude, Straße), Blickrichtung in die Bemerkung.' };
const ansatz: S = { titel: 'Ansatzpunkt', kurztext: 'Ansatzpunkt', pflicht: true, mitTiefe: false, hinweis: 'Ansatzpunkt nah, Oberfläche erkennbar (Asphalt, Pflaster, Rasen).' };
const detail: S = { titel: 'Details / Auffälligkeiten', kurztext: 'Detail', pflicht: false, mitTiefe: true, hinweis: TAFEL };
const proben: S = { titel: 'Proben / Gefäße', kurztext: 'Proben', pflicht: false, mitTiefe: false, hinweis: GEFAESS };

const kernreihe = (kernTitel: string): Fotoschritt[] =>
  reihe(
    umgebung, ansatz,
    { titel: 'Bohrung im Einsatz', kurztext: 'Bohrung', pflicht: true, mitTiefe: false },
    { titel: kernTitel, kurztext: 'Kern', pflicht: true, mitTiefe: true, hinweis: TAFEL },
    detail, proben,
    { titel: 'Abschluss / Verfüllung', kurztext: 'Abschluss', pflicht: true, mitTiefe: false },
  );

export const FOTOREIHEN: Record<AufschlussTyp, Fotoschritt[]> = {
  Baustelle: reihe(
    { titel: 'Übersicht Baufeld (aus der Ferne)', kurztext: 'Uebersicht', pflicht: true, mitTiefe: false, hinweis: 'Möglichst erhöht und mit Bezugspunkten; Blickrichtung in die Bemerkung.' },
    { titel: 'Zufahrt / Lager- und Arbeitsflächen', kurztext: 'Zufahrt', pflicht: false, mitTiefe: false },
    { titel: 'Nachbarbebauung (Beweissicherung)', kurztext: 'Nachbarbebauung', pflicht: false, mitTiefe: false, hinweis: 'Vor Beginn der Arbeiten; vorhandene Risse und Schäden nah fotografieren.' },
    { titel: 'Bestand / Oberflächen / Bewuchs', kurztext: 'Bestand', pflicht: false, mitTiefe: false },
    { titel: 'Leitungen / Hindernisse / Markierungen', kurztext: 'Leitungen', pflicht: false, mitTiefe: false },
    { titel: 'Auffälligkeiten (Ablagerungen, Verfärbungen)', kurztext: 'Auffaelligkeit', pflicht: false, mitTiefe: false },
  ),
  RKS: kernreihe('Kerne mit Maßstab'),
  BS: kernreihe('Bohrgut mit Maßstab'),
  KB: kernreihe('Kernkisten mit Maßstab'),
  DPH: reihe(umgebung, ansatz,
    { titel: 'Sondierung im Einsatz', kurztext: 'Sondierung', pflicht: true, mitTiefe: false },
    { titel: 'Abschluss', kurztext: 'Abschluss', pflicht: true, mitTiefe: false }),
  CPT: reihe(umgebung, ansatz,
    { titel: 'Sondierung im Einsatz', kurztext: 'Sondierung', pflicht: true, mitTiefe: false },
    { titel: 'Messwertanzeige / Protokoll', kurztext: 'Messwerte', pflicht: false, mitTiefe: false },
    { titel: 'Abschluss', kurztext: 'Abschluss', pflicht: true, mitTiefe: false }),
  GWM: reihe(umgebung, ansatz,
    { titel: 'Bohrung im Einsatz', kurztext: 'Bohrung', pflicht: true, mitTiefe: false },
    { titel: 'Bohrgut / Kerne mit Maßstab', kurztext: 'Kern', pflicht: true, mitTiefe: true, hinweis: TAFEL },
    { titel: 'Ausbaumaterial (Filter, Vollrohr, Kies, Ton)', kurztext: 'Ausbau', pflicht: true, mitTiefe: false },
    proben,
    { titel: 'Abschluss (Kappe, Schutzrohr)', kurztext: 'Abschluss', pflicht: true, mitTiefe: false }),
  Schurf: reihe(umgebung,
    { titel: 'Schurf Übersicht', kurztext: 'Uebersicht', pflicht: true, mitTiefe: false },
    { titel: 'Schurfwand mit Maßstab', kurztext: 'Wand', pflicht: true, mitTiefe: true, hinweis: TAFEL },
    { titel: 'Schurfsohle', kurztext: 'Sohle', pflicht: false, mitTiefe: true },
    detail, proben,
    { titel: 'Verfüllung', kurztext: 'Verfuellung', pflicht: true, mitTiefe: false }),
  FS: reihe(
    { titel: 'Lage am Gebäude', kurztext: 'Lage', pflicht: true, mitTiefe: false, hinweis: 'Gebäudeecke oder Achse erkennbar; Blickrichtung in die Bemerkung.' },
    { titel: 'Schurf Übersicht', kurztext: 'Uebersicht', pflicht: true, mitTiefe: false },
    { titel: 'Fundament mit Maßstab (Aufbau, Material)', kurztext: 'Fundament', pflicht: true, mitTiefe: true, hinweis: 'Zollstock senkrecht von GOK bzw. OK Gelände, Fototafel im Bild.' },
    { titel: 'Fundamentunterkante / Gründungssohle', kurztext: 'UK', pflicht: true, mitTiefe: true, hinweis: 'Tiefe der Unterkante ablesbar? Boden unter der Gründung erkennbar?' },
    { titel: 'Details (Abdichtung, Vorsprung, Risse)', kurztext: 'Detail', pflicht: false, mitTiefe: true },
    proben,
    { titel: 'Verfüllung / Wiederherstellung', kurztext: 'Verfuellung', pflicht: true, mitTiefe: false }),
  HW: reihe(
    { titel: 'Haufwerk Übersicht mit Bezug', kurztext: 'Uebersicht', pflicht: true, mitTiefe: false, hinweis: 'Ganzes Haufwerk mit Person, Gerät oder Zollstock als Größenvergleich.' },
    { titel: 'Material nah mit Maßstab', kurztext: 'Material', pflicht: true, mitTiefe: false, hinweis: TAFEL },
    { titel: 'Probenahme (Schürfe / Entnahmestellen)', kurztext: 'Probenahme', pflicht: true, mitTiefe: false },
    { titel: 'Mischprobe / Gefäße beschriftet', kurztext: 'Gefaesse', pflicht: true, mitTiefe: false, hinweis: GEFAESS },
    { titel: 'Fremdbestandteile / Auffälligkeiten', kurztext: 'Auffaelligkeit', pflicht: false, mitTiefe: false }),
  Probe: reihe(
    { titel: 'Entnahmestelle Übersicht', kurztext: 'Stelle', pflicht: true, mitTiefe: false },
    { titel: 'Probe ausgelegt mit Maßstab', kurztext: 'Probe', pflicht: true, mitTiefe: true, hinweis: TAFEL },
    { titel: 'Gefäße beschriftet', kurztext: 'Gefaesse', pflicht: true, mitTiefe: false, hinweis: GEFAESS },
    { titel: 'Detail', kurztext: 'Detail', pflicht: false, mitTiefe: false }),
  Sonstiges: reihe(
    { titel: 'Übersicht', kurztext: 'Uebersicht', pflicht: true, mitTiefe: false },
    { titel: 'Detail', kurztext: 'Detail', pflicht: false, mitTiefe: false }),
};

export function praefix(typ: AufschlussTyp): string {
  return AUFSCHLUSS_TYPEN.find((t) => t.typ === typ)?.praefix ?? typ;
}

// ---------- Formatierung ----------

/** 1.5 -> "1,5"; 2 -> "2" (deutsches Komma, ohne überflüssige Nullen) */
export function zahl(m: number): string {
  return (Math.round(m * 100) / 100).toString().replace('.', ',');
}

export function tiefeText(von?: number, bis?: number): string {
  if (von == null && bis == null) return '';
  if (bis == null) return `${zahl(von!)} m`;
  if (von == null) return `bis ${zahl(bis)} m`;
  return `${zahl(von)}–${zahl(bis)} m`;
}

/** "RKS 1" -> "RKS1", Sonderzeichen raus, Umlaute ersetzt */
export function dateiTeil(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9,\-]/g, '');
}

/**
 * Dateiname nach F7: {Projekt}_{Aufschluss}_{Schritt:02}_{Kurztext}_{Tiefe}.jpg
 * Zusatzfotos: Schritt "Z" + laufende Nummer (Z01 …).
 * Gleicher Name schon vergeben -> Suffix _2, _3 …
 */
export function dateiname(
  p: { projekt: string; aufschluss: string; schrittNr: number | null; zusatzNr?: number; kurztext: string; tiefeVon?: number; tiefeBis?: number },
  vergeben: Set<string> = new Set(),
): string {
  const schritt = p.schrittNr == null ? 'Z' + String(p.zusatzNr ?? 1).padStart(2, '0') : String(p.schrittNr).padStart(2, '0');
  const teile = [dateiTeil(p.projekt), dateiTeil(p.aufschluss), schritt, dateiTeil(p.kurztext) || 'Foto'];
  if (p.tiefeVon != null || p.tiefeBis != null) {
    const t = p.tiefeBis != null && p.tiefeVon != null ? `${zahl(p.tiefeVon)}-${zahl(p.tiefeBis)}m` : `${zahl((p.tiefeVon ?? p.tiefeBis)!)}m`;
    teile.push(t);
  }
  const basis = teile.join('_');
  let name = basis + '.jpg';
  let i = 2;
  while (vergeben.has(name)) name = `${basis}_${i++}.jpg`;
  return name;
}

// ---------- Fortschritt / Checkliste ----------

export interface SchrittStatus {
  schritt: Fotoschritt;
  anzahl: number;
  erledigt: boolean;
  /** bei Tiefenschritten: bis wohin Fotos vorliegen */
  tiefeBis?: number;
}

/** Größte lückenlos von 0 an fotografierte Tiefe */
export function abgedeckteTiefe(fotos: { tiefeVon?: number; tiefeBis?: number }[]): number {
  const iv = fotos
    .filter((f) => f.tiefeVon != null && f.tiefeBis != null)
    .map((f) => [f.tiefeVon!, f.tiefeBis!] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let bis = 0;
  for (const [v, b] of iv) {
    if (v > bis + 0.001) break;
    bis = Math.max(bis, b);
  }
  return bis;
}

export function status(typ: AufschlussTyp, endtiefe: number | undefined, fotos: Pick<Foto, 'schrittNr' | 'tiefeVon' | 'tiefeBis' | 'ausgeblendet'>[]): SchrittStatus[] {
  return FOTOREIHEN[typ].map((s) => {
    const eigene = fotos.filter((f) => f.schrittNr === s.nr && !f.ausgeblendet);
    const st: SchrittStatus = { schritt: s, anzahl: eigene.length, erledigt: eigene.length > 0 };
    if (s.mitTiefe && s.pflicht) {
      st.tiefeBis = abgedeckteTiefe(eigene);
      // mit bekannter Endtiefe erst erledigt, wenn bis zur Endtiefe fotografiert
      if (endtiefe) st.erledigt = st.tiefeBis >= endtiefe - 0.001;
    }
    return st;
  });
}

export function fortschritt(st: SchrittStatus[]): { erledigt: number; pflicht: number } {
  const p = st.filter((s) => s.schritt.pflicht);
  return { erledigt: p.filter((s) => s.erledigt).length, pflicht: p.length };
}

/** Nächster offener Pflichtschritt (für den großen Aufnahme-Knopf) */
export function naechsterSchritt(st: SchrittStatus[]): Fotoschritt | undefined {
  return st.find((s) => s.schritt.pflicht && !s.erledigt)?.schritt;
}

/** Vorschlag für das nächste Kernintervall: lückenlos weiter, Schrittweite 1 m */
export function naechstesIntervall(fotos: { tiefeVon?: number; tiefeBis?: number }[], endtiefe?: number, schritt = 1): [number, number] {
  const von = abgedeckteTiefe(fotos);
  let bis = von + schritt;
  if (endtiefe && bis > endtiefe) bis = endtiefe;
  if (bis <= von) bis = von + schritt;
  return [von, Math.round(bis * 100) / 100];
}

// ---------- Anzeige ----------

export function datumZeit(iso: string): { datum: string; zeit: string } {
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, '0');
  return { datum: `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}`, zeit: `${z(d.getHours())}:${z(d.getMinutes())}` };
}

export function gpsText(g?: GpsPunkt): string {
  if (!g) return 'GPS: keine Position';
  return `${g.lat.toFixed(5)} N  ${g.lon.toFixed(5)} E (±${Math.round(g.acc)} m)`;
}

// ---------- CSV ----------

export function csv(zeilen: (string | number | undefined | null)[][]): string {
  const feld = (v: string | number | undefined | null) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM, damit Excel UTF-8 erkennt; Semikolon für deutsches Excel
  return '﻿' + zeilen.map((z) => z.map(feld).join(';')).join('\r\n') + '\r\n';
}

export function neueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
