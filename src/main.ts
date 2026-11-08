// GeoFoto – Oberfläche (Vanilla TS, Hash-Routing)
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { speicher, speicherSichern } from './db';
import { verarbeite } from './bild';
import { herunterladen, teilen, zipErstellen } from './export';
import {
  AUFSCHLUSS_TYPEN, BAUSTELLE, FOTOREIHEN, praefix, dateiname, datumZeit, fortschritt, gpsText, naechsterSchritt, naechstesIntervall,
  neueId, status, tiefeText, zahl, type Aufschluss, type AufschlussTyp, type Foto, type Fotoschritt, type GpsPunkt, type Projekt,
} from './model';

registerSW({ immediate: true });

const app = document.getElementById('app')!;
const VERSION = '0.1.0';

// ---------- Hilfen ----------

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const gehe = (h: string) => (location.hash = h);

let urls: string[] = [];
function blobUrl(b: Blob) {
  const u = URL.createObjectURL(b);
  urls.push(u);
  return u;
}
function aufraeumen() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}

function meldung(text: string, art: 'ok' | 'fehler' = 'ok') {
  const m = document.createElement('div');
  m.className = `meldung ${art}`;
  m.textContent = text;
  document.body.appendChild(m);
  setTimeout(() => m.remove(), art === 'fehler' ? 6000 : 3000);
}

function kopf(titel: string, zurueck?: string, rechts = '') {
  return `<header>
    ${zurueck != null ? `<a class="zurueck" href="${zurueck}" aria-label="zurück">‹</a>` : '<span class="logo">GF</span>'}
    <h1>${titel}</h1>${rechts}
  </header>`;
}

// ---------- GPS ----------

let gps: GpsPunkt | undefined;
let gpsWatch: number | null = null;
function gpsStart(anzeige?: () => void) {
  if (gpsWatch != null || !('geolocation' in navigator)) return;
  gpsWatch = navigator.geolocation.watchPosition(
    (p) => {
      gps = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      anzeige?.();
    },
    () => anzeige?.(),
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
  );
}
function gpsStopp() {
  if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch);
  gpsWatch = null;
}

// ---------- Kamera ----------

const kamera = document.createElement('input');
kamera.type = 'file';
kamera.accept = 'image/*';
kamera.setAttribute('capture', 'environment');
kamera.style.display = 'none';
document.body.appendChild(kamera);

interface Auftrag {
  aufschluss: Aufschluss;
  schritt: Fotoschritt | null; // null = Zusatzfoto
  tiefeVon?: number;
  tiefeBis?: number;
  bemerkung: string;
  kurztext?: string; // für Zusatzfotos
}
let auftrag: Auftrag | null = null;

function ausloesen(a: Auftrag) {
  auftrag = a;
  kamera.value = '';
  kamera.click();
}

kamera.addEventListener('change', async () => {
  const datei = kamera.files?.[0];
  const a = auftrag;
  if (!datei || !a) return;
  const warten = document.createElement('div');
  warten.className = 'warten';
  warten.textContent = 'Foto wird beschriftet …';
  document.body.appendChild(warten);
  try {
    const f = await fotoAnlegen(datei, a);
    meldung(`Gespeichert: ${f.dateiname}`);
  } catch (e) {
    console.error(e);
    meldung('Foto konnte nicht gespeichert werden: ' + (e as Error).message, 'fehler');
  } finally {
    warten.remove();
    route();
  }
});

async function fotoAnlegen(datei: Blob, a: Auftrag): Promise<Foto> {
  const p = (await speicher.projekt(a.aufschluss.projektId))!;
  const vorhandene = await speicher.fotosProjekt(p.id);
  const eigene = vorhandene.filter((f) => f.aufschlussId === a.aufschluss.id);
  const fotograf = await speicher.einstellung('fotograf', '');
  const zeit = new Date().toISOString();
  const kurztext = a.schritt ? a.schritt.kurztext : a.kurztext || 'Zusatz';
  const name = dateiname(
    {
      projekt: p.nummer, aufschluss: a.aufschluss.bezeichnung, schrittNr: a.schritt?.nr ?? null,
      zusatzNr: eigene.filter((f) => f.schrittNr == null).length + 1, kurztext, tiefeVon: a.tiefeVon, tiefeBis: a.tiefeBis,
    },
    new Set(vorhandene.map((f) => f.dateiname)),
  );
  const titel = a.schritt ? a.schritt.titel : a.kurztext || 'Zusatzfoto';
  const tiefe = tiefeText(a.tiefeVon, a.tiefeBis);
  const { beschriftet, vorschau } = await verarbeite(datei, {
    projekt: `${p.nummer} ${p.kurzname}`.trim(),
    aufschluss: `${a.aufschluss.bezeichnung} · ${titel}${tiefe ? ' ' + tiefe : ''}`,
    bemerkung: a.bemerkung || undefined,
    zeit, gps, fotograf: fotograf || '—', dateiname: name,
  });
  const foto: Foto = {
    id: neueId(), projektId: p.id, aufschlussId: a.aufschluss.id, schrittNr: a.schritt?.nr ?? null, titel, kurztext,
    tiefeVon: a.tiefeVon, tiefeBis: a.tiefeBis, bemerkung: a.bemerkung, zeit, gps: gps ? { ...gps } : undefined,
    fotograf, dateiname: name, original: datei, beschriftet, vorschau, ausgeblendet: false,
  };
  await speicher.fotoSpeichern(foto);
  return foto;
}

// ---------- Ansichten ----------

async function startseite() {
  gpsStopp();
  const projekte = await speicher.projekte();
  const fotograf = await speicher.einstellung('fotograf', '');
  const zeilen = await Promise.all(
    projekte.map(async (p) => {
      const n = (await speicher.fotosProjekt(p.id)).length;
      const a = (await speicher.aufschluesse(p.id)).length;
      return `<a class="karte" href="#/p/${p.id}"><b>${esc(p.nummer)}</b> ${esc(p.kurzname)}<small>${a} Aufschlüsse · ${n} Fotos</small></a>`;
    }),
  );
  app.innerHTML = `${kopf('GeoFoto', undefined, '<a class="kopfknopf" href="#/einstellungen" aria-label="Einstellungen">⚙</a>')}
    <main>
      ${fotograf ? '' : '<a class="hinweis" href="#/einstellungen">Bitte zuerst den Namen des Fotografen eintragen ›</a>'}
      ${zeilen.join('') || '<p class="leer">Noch keine Projekte.</p>'}
    </main>
    <footer><a class="knopf gross" href="#/neu">+ Neues Projekt</a></footer>`;
}

async function projektFormular(id?: string) {
  const p: Projekt = (id && (await speicher.projekt(id))) || { id: neueId(), nummer: '', kurzname: '', anschrift: '', auftraggeber: '', angelegt: new Date().toISOString() };
  app.innerHTML = `${kopf(id ? 'Projekt bearbeiten' : 'Neues Projekt', id ? `#/p/${id}` : '#/')}
    <main><form id="f" class="formular">
      <label>Projektnummer<input name="nummer" required placeholder="26-126" value="${esc(p.nummer)}" inputmode="text" autocomplete="off"></label>
      <label>Kurzname<input name="kurzname" placeholder="Rosenthaler Str. 39" value="${esc(p.kurzname)}" autocomplete="off"></label>
      <label>Anschrift<input name="anschrift" placeholder="Hof 1, Rosenthaler Straße 39, 10178 Berlin" value="${esc(p.anschrift)}" autocomplete="off"></label>
      <label>Auftraggeber<input name="auftraggeber" value="${esc(p.auftraggeber)}" autocomplete="off"></label>
      <button class="knopf gross">Speichern</button>
      ${id ? '<button type="button" id="loeschen" class="knopf gefahr">Projekt mit allen Fotos löschen</button>' : ''}
    </form></main>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(e.target as HTMLFormElement);
    Object.assign(p, { nummer: String(d.get('nummer')).trim(), kurzname: String(d.get('kurzname')).trim(), anschrift: String(d.get('anschrift')).trim(), auftraggeber: String(d.get('auftraggeber')).trim() });
    await speicher.projektSpeichern(p);
    gehe(id ? `#/p/${p.id}` : `#/p/${p.id}/aufschluss`);
  });
  if (id)
    $('#loeschen').addEventListener('click', async () => {
      const n = (await speicher.fotosProjekt(p.id)).length;
      if (!confirm(`Projekt ${p.nummer} mit ${n} Fotos endgültig vom Handy löschen?\nVorher exportieren!`)) return;
      await speicher.projektLoeschen(p.id);
      gehe('#/');
    });
}

async function projektseite(id: string) {
  gpsStopp();
  const p = await speicher.projekt(id);
  if (!p) return gehe('#/');
  let alle = await speicher.aufschluesse(id);
  // Bereich „Baustelle“ für freie Fotos – je Projekt genau einmal, auch bei älteren Projekten
  let baustelle = alle.find((a) => a.typ === 'Baustelle');
  if (!baustelle) {
    baustelle = { id: neueId(), projektId: id, typ: 'Baustelle', bezeichnung: BAUSTELLE, angelegt: new Date().toISOString() };
    await speicher.aufschlussSpeichern(baustelle);
  }
  const aufschluesse = alle.filter((a) => a.typ !== 'Baustelle');
  const fotos = await speicher.fotosProjekt(id);
  const karte = (a: Aufschluss) => {
    const eigene = fotos.filter((f) => f.aufschlussId === a.id);
    const { erledigt, pflicht } = fortschritt(status(a.typ, a.endtiefe, eigene));
    const fertig = erledigt === pflicht;
    return `<a class="karte aufschluss" href="#/a/${a.id}">
      <span class="marke ${fertig ? 'gruen' : eigene.length ? 'gelb' : 'rot'}">${erledigt}/${pflicht}</span>
      <b>${esc(a.bezeichnung)}</b>${a.endtiefe ? ` <span class="grau">bis ${zahl(a.endtiefe)} m</span>` : ''}
      <small>${eigene.length} Fotos${a.typ === 'Baustelle' ? ' · Übersicht, Nachbarbebauung, Leitungen, freie Fotos' : ''}</small></a>`;
  };
  const karten = aufschluesse.map(karte);
  app.innerHTML = `${kopf(`${esc(p.nummer)} ${esc(p.kurzname)}`, '#/', `<a class="kopfknopf" href="#/p/${id}/bearbeiten" aria-label="bearbeiten">✎</a>`)}
    <main>
      <h2>Baustelle / freie Fotos</h2>
      ${karte(baustelle)}
      <button id="frei" class="knopf hell">📷 Freies Foto (Baustelle, Haufwerk, Probe …)</button>
      <h2>Aufschlüsse, Haufwerke, Proben</h2>
      ${karten.join('') || '<p class="leer">Noch nichts angelegt.</p>'}
      <a class="knopf" href="#/p/${id}/aufschluss">+ Anlegen (RKS, Schurf, Haufwerk …)</a>
      <h2>Export (${fotos.length} Fotos)</h2>
      <button id="teilen" class="knopf">Fotos + Liste teilen (z. B. in Drive)</button>
      <button id="teilenO" class="knopf hell">… mit Originalen teilen</button>
      <button id="zip" class="knopf hell">ZIP herunterladen</button>
    </main>`;
  const export_ = async (fn: () => Promise<void>) => {
    if (!fotos.length) return meldung('Noch keine Fotos im Projekt.', 'fehler');
    try {
      await fn();
    } catch (e) {
      meldung('Export fehlgeschlagen: ' + (e as Error).message, 'fehler');
    }
  };
  $('#teilen').addEventListener('click', () => export_(async () => {
    const r = await teilen(id, false);
    if (r === 'nicht-unterstuetzt') meldung('Teilen wird hier nicht unterstützt – bitte ZIP herunterladen.', 'fehler');
  }));
  $('#teilenO').addEventListener('click', () => export_(async () => {
    const r = await teilen(id, true);
    if (r === 'nicht-unterstuetzt') meldung('Teilen wird hier nicht unterstützt – bitte ZIP herunterladen.', 'fehler');
  }));
  const bs = baustelle;
  $('#frei').addEventListener('click', () => zusatzDialog(bs, ''));
  $('#zip').addEventListener('click', () => export_(async () => herunterladen(await zipErstellen(id))));
}

async function aufschlussAnlegen(projektId: string) {
  const p = await speicher.projekt(projektId);
  if (!p) return gehe('#/');
  const vorhanden = await speicher.aufschluesse(projektId);
  let typ: AufschlussTyp = 'RKS';
  const naechsteNr = (t: AufschlussTyp) => {
    const nrs = vorhanden.filter((a) => a.typ === t).map((a) => parseInt(a.bezeichnung.replace(/\D+/g, '')) || 0);
    return (nrs.length ? Math.max(...nrs) : 0) + 1;
  };
  app.innerHTML = `${kopf('Anlegen', `#/p/${projektId}`)}
    <main><form id="f" class="formular">
      ${(['Aufschluss', 'Umwelt / Bauwerk'] as const).map((g) => `<h2>${g}</h2><div class="chips typen">${AUFSCHLUSS_TYPEN.filter((t) => t.gruppe === g).map((t) => `<button type="button" data-typ="${t.typ}" class="chip${t.typ === typ ? ' an' : ''}" title="${t.name}">${t.praefix}</button>`).join('')}</div>`).join('')}
      <p id="typname" class="typname"></p>
      <label>Anzahl<div class="zahlwahl" id="anzahl">${[1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<button type="button" class="chip${n === 1 ? ' an' : ''}" data-n="${n}">${n}</button>`).join('')}</div></label>
      <label>Erste Nummer<input name="start" type="number" inputmode="numeric" min="1" value="${naechsteNr(typ)}"></label>
      <label>Endtiefe [m] (optional, für die Kern-Checkliste)<input name="endtiefe" type="number" inputmode="decimal" step="0.1" min="0" placeholder="z. B. 4"></label>
      <p id="vorschau" class="grau"></p>
      <button class="knopf gross">Anlegen</button>
    </form></main>`;
  let anzahl = 1;
  const vorschau = () => {
    const start = Number(($('input[name=start]') as HTMLInputElement).value) || 1;
    const namen = Array.from({ length: anzahl }, (_, i) => `${praefix(typ)} ${start + i}`);
    $('#vorschau').textContent = 'Wird angelegt: ' + namen.join(', ');
    const t = AUFSCHLUSS_TYPEN.find((x) => x.typ === typ)!;
    $('#typname').textContent = `${t.name} – Fotoreihe: ${FOTOREIHEN[typ].map((s) => s.titel.split(' (')[0]).join(' · ')}`;
  };
  app.querySelectorAll('.typen').forEach((g) => g.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    typ = b.dataset.typ as AufschlussTyp;
    app.querySelectorAll('.typen .chip').forEach((c) => c.classList.toggle('an', c === b));
    ($('input[name=start]') as HTMLInputElement).value = String(naechsteNr(typ));
    vorschau();
  }));
  $('#anzahl').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    anzahl = Number(b.dataset.n);
    app.querySelectorAll('#anzahl .chip').forEach((c) => c.classList.toggle('an', c === b));
    vorschau();
  });
  $('input[name=start]').addEventListener('input', vorschau);
  vorschau();
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(e.target as HTMLFormElement);
    const start = Number(d.get('start')) || 1;
    const et = parseFloat(String(d.get('endtiefe')).replace(',', '.'));
    for (let i = 0; i < anzahl; i++) {
      await speicher.aufschlussSpeichern({
        id: neueId(), projektId, typ, bezeichnung: `${praefix(typ)} ${start + i}`,
        endtiefe: et > 0 ? et : undefined, angelegt: new Date().toISOString(),
      });
    }
    gehe(`#/p/${projektId}`);
  });
}

async function aufschlussseite(id: string) {
  const a = await speicher.aufschluss(id);
  if (!a) return gehe('#/');
  const p = (await speicher.projekt(a.projektId))!;
  const fotos = await speicher.fotosAufschluss(id);
  const st = status(a.typ, a.endtiefe, fotos);
  const { erledigt, pflicht } = fortschritt(st);
  const naechster = naechsterSchritt(st);

  const zeilen = st.map((s) => {
    const eigene = fotos.filter((f) => f.schrittNr === s.schritt.nr);
    const offen = s.schritt.pflicht && !s.erledigt;
    const tiefe = s.schritt.mitTiefe && s.tiefeBis != null && s.schritt.pflicht ? ` · bis ${zahl(s.tiefeBis)} m${a.endtiefe ? ` von ${zahl(a.endtiefe)} m` : ''}` : '';
    return `<div class="schritt ${offen ? 'offen' : s.erledigt ? 'fertig' : ''}">
      <button class="schrittknopf" data-nr="${s.schritt.nr}">
        <span class="nr">${s.erledigt ? '✓' : s.schritt.nr}</span>
        <span>${esc(s.schritt.titel)}${s.schritt.pflicht ? '' : ' <i>(optional)</i>'}<small>${s.anzahl} Foto${s.anzahl === 1 ? '' : 's'}${tiefe}</small></span>
        <span class="kamera">📷</span>
      </button>
      ${eigene.length ? `<div class="bilder">${eigene.map((f) => `<a href="#/f/${f.id}" class="${f.ausgeblendet ? 'aus' : ''}"><img src="${blobUrl(f.vorschau)}" alt="${esc(f.dateiname)}"></a>`).join('')}</div>` : ''}
    </div>`;
  });
  const zusatz = fotos.filter((f) => f.schrittNr == null);

  app.innerHTML = `${kopf(`${esc(a.bezeichnung)} <small>${esc(p.nummer)}</small>`, `#/p/${p.id}`, `<a class="kopfknopf" href="#/a/${id}/bearbeiten" aria-label="bearbeiten">✎</a>`)}
    <main>
      <div class="statuszeile"><span class="marke ${erledigt === pflicht ? 'gruen' : 'rot'}">${erledigt}/${pflicht} Pflichtfotos</span><span id="gps" class="grau"></span></div>
      <label class="bemerkung">Bemerkung zum nächsten Foto<input id="bem" placeholder="z. B. Ölgeruch ab 1,2 m, Blickrichtung N" autocomplete="off"></label>
      ${zeilen.join('')}
      <div class="schritt">
        <button class="schrittknopf" id="zusatz"><span class="nr">+</span><span>Zusatzfoto<small>${zusatz.length} Fotos · Detail, Auffälligkeit</small></span><span class="kamera">📷</span></button>
        ${zusatz.length ? `<div class="bilder">${zusatz.map((f) => `<a href="#/f/${f.id}" class="${f.ausgeblendet ? 'aus' : ''}"><img src="${blobUrl(f.vorschau)}" alt=""></a>`).join('')}</div>` : ''}
      </div>
    </main>
    <footer>${naechster ? `<button id="weiter" class="knopf gross">📷 ${naechster.nr} · ${esc(naechster.titel)}</button>` : '<p class="fertigtext">✓ Fotoreihe vollständig</p>'}</footer>`;

  const gpsAnzeige = () => {
    const el = document.getElementById('gps');
    if (el) el.textContent = gps ? `GPS ±${Math.round(gps.acc)} m` : 'GPS sucht …';
    el?.classList.toggle('warnung', !gps || gps.acc > 20);
  };
  gpsAnzeige();
  gpsStart(gpsAnzeige);

  const bem = () => ($('#bem') as HTMLInputElement).value.trim();
  const schrittWaehlen = (s: Fotoschritt) => {
    if (s.mitTiefe) return tiefenDialog(a, s, fotos.filter((f) => f.schrittNr === s.nr), bem());
    ausloesen({ aufschluss: a, schritt: s, bemerkung: bem() });
  };
  app.querySelectorAll<HTMLButtonElement>('.schrittknopf[data-nr]').forEach((b) =>
    b.addEventListener('click', () => schrittWaehlen(FOTOREIHEN[a.typ].find((s) => s.nr === Number(b.dataset.nr))!)),
  );
  document.getElementById('weiter')?.addEventListener('click', () => schrittWaehlen(naechster!));
  $('#zusatz').addEventListener('click', () => zusatzDialog(a, bem()));
}

function dialog(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'dialog';
  d.innerHTML = `<div class="dialogfenster">${html}</div>`;
  d.addEventListener('click', (e) => {
    if (e.target === d || (e.target as HTMLElement).closest('[data-schliessen]')) d.remove();
  });
  document.body.appendChild(d);
  return d;
}

async function tiefenDialog(a: Aufschluss, s: Fotoschritt, bisher: Foto[], bemerkung: string) {
  const schritt = await speicher.einstellung('schrittweite', 1);
  const [von, bis] = naechstesIntervall(s.pflicht ? bisher : [], a.endtiefe, schritt);
  const max = a.endtiefe ?? Math.max(5, bis);
  const chips: string[] = [];
  for (let t = 0; t < max - 0.001 && chips.length < 20; t += schritt) {
    const b = Math.min(Math.round((t + schritt) * 100) / 100, a.endtiefe ?? 1e9);
    const schon = bisher.some((f) => f.tiefeVon === t && f.tiefeBis === b);
    chips.push(`<button type="button" class="chip${t === von ? ' an' : ''}${schon ? ' erledigt' : ''}" data-v="${t}" data-b="${b}">${zahl(t)}–${zahl(b)}</button>`);
  }
  const d = dialog(`
    <h2>${esc(s.titel)}</h2>
    ${s.hinweis ? `<p class="erinnerung">⚠ ${esc(s.hinweis)}</p>` : ''}
    <div class="chips tiefen">${chips.join('')}</div>
    <div class="tiefeneingabe">
      <label>von [m]<input id="tv" type="number" inputmode="decimal" step="0.05" value="${von}"></label>
      <label>bis [m]<input id="tb" type="number" inputmode="decimal" step="0.05" value="${bis}"></label>
    </div>
    <button id="los" class="knopf gross">📷 Aufnehmen</button>
    <button class="knopf hell" data-schliessen>Abbrechen</button>`);
  const tv = d.querySelector<HTMLInputElement>('#tv')!;
  const tb = d.querySelector<HTMLInputElement>('#tb')!;
  d.querySelector('.tiefen')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    tv.value = b.dataset.v!;
    tb.value = b.dataset.b!;
    d.querySelectorAll('.tiefen .chip').forEach((c) => c.classList.toggle('an', c === b));
  });
  d.querySelector('#los')!.addEventListener('click', () => {
    const v = parseFloat(tv.value.replace(',', '.'));
    const b = parseFloat(tb.value.replace(',', '.'));
    if (isNaN(v) || isNaN(b) || b <= v) return meldung('Tiefe prüfen: „bis“ muss größer als „von“ sein.', 'fehler');
    if (a.endtiefe && b > a.endtiefe + 0.001) meldung(`Hinweis: ${zahl(b)} m liegt unter der Endtiefe ${zahl(a.endtiefe)} m.`, 'fehler');
    d.remove();
    ausloesen({ aufschluss: a, schritt: s, tiefeVon: v, tiefeBis: b, bemerkung });
  });
}

function zusatzDialog(a: Aufschluss, bemerkung: string) {
  const vorschlaege = ['Detail', 'Baustelle', 'Haufwerk', 'Probe', 'Fundament', 'Auffaelligkeit', 'Geruch', 'Grundwasser', 'Hindernis', 'Leitung', 'Nachbarbebauung'];
  const d = dialog(`
    <h2>Zusatzfoto</h2>
    <div class="chips" id="zv">${vorschlaege.map((v, i) => `<button type="button" class="chip${i === 0 ? ' an' : ''}" data-v="${v}">${v.replace('Auffaelligkeit', 'Auffälligkeit')}</button>`).join('')}</div>
    <label>Kurztext für den Dateinamen<input id="kt" value="Detail" autocomplete="off"></label>
    <label>Tiefe [m] (optional)<input id="zt" type="number" inputmode="decimal" step="0.05"></label>
    <button id="los" class="knopf gross">📷 Aufnehmen</button>
    <button class="knopf hell" data-schliessen>Abbrechen</button>`);
  const kt = d.querySelector<HTMLInputElement>('#kt')!;
  d.querySelector('#zv')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    kt.value = b.dataset.v!;
    d.querySelectorAll('#zv .chip').forEach((c) => c.classList.toggle('an', c === b));
  });
  d.querySelector('#los')!.addEventListener('click', () => {
    const t = parseFloat(d.querySelector<HTMLInputElement>('#zt')!.value.replace(',', '.'));
    d.remove();
    ausloesen({ aufschluss: a, schritt: null, kurztext: kt.value.trim() || 'Detail', tiefeVon: isNaN(t) ? undefined : t, bemerkung });
  });
}

async function aufschlussBearbeiten(id: string) {
  const a = await speicher.aufschluss(id);
  if (!a) return gehe('#/');
  app.innerHTML = `${kopf('Aufschluss bearbeiten', `#/a/${id}`)}
    <main><form id="f" class="formular">
      <label>Bezeichnung<input name="bez" required value="${esc(a.bezeichnung)}"></label>
      <label>Endtiefe [m]<input name="et" type="number" inputmode="decimal" step="0.1" value="${a.endtiefe ?? ''}"></label>
      <p class="grau">Typ: ${a.typ}. Bereits vergebene Dateinamen bleiben unverändert.</p>
      <button class="knopf gross">Speichern</button>
      <button type="button" id="loeschen" class="knopf gefahr">Aufschluss mit Fotos löschen</button>
    </form></main>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(e.target as HTMLFormElement);
    const et = parseFloat(String(d.get('et')).replace(',', '.'));
    a.bezeichnung = String(d.get('bez')).trim();
    a.endtiefe = et > 0 ? et : undefined;
    await speicher.aufschlussSpeichern(a);
    gehe(`#/a/${id}`);
  });
  $('#loeschen').addEventListener('click', async () => {
    const n = (await speicher.fotosAufschluss(id)).length;
    if (!confirm(`${a.bezeichnung} mit ${n} Fotos löschen?`)) return;
    await speicher.aufschlussLoeschen(id);
    gehe(`#/p/${a.projektId}`);
  });
}

async function fotoseite(id: string) {
  const f = await speicher.foto(id);
  if (!f) return gehe('#/');
  const { datum, zeit } = datumZeit(f.zeit);
  app.innerHTML = `${kopf('Foto', `#/a/${f.aufschlussId}`)}
    <main>
      <img class="grossbild" src="${blobUrl(f.beschriftet)}" alt="">
      <table class="info">
        <tr><th>Datei</th><td>${esc(f.dateiname)}</td></tr>
        <tr><th>Titel</th><td>${esc(f.titel)} ${esc(tiefeText(f.tiefeVon, f.tiefeBis))}</td></tr>
        <tr><th>Zeit</th><td>${datum} ${zeit}</td></tr>
        <tr><th>GPS</th><td>${esc(gpsText(f.gps))}</td></tr>
        <tr><th>Fotograf</th><td>${esc(f.fotograf)}</td></tr>
        <tr><th>Größe</th><td>${Math.round(f.beschriftet.size / 1024)} kB beschriftet · ${Math.round(f.original.size / 1024)} kB Original</td></tr>
      </table>
      <form id="f" class="formular">
        <label>Bemerkung<input name="bem" value="${esc(f.bemerkung)}" autocomplete="off"></label>
        <button class="knopf">Bemerkung übernehmen (Schriftfeld neu)</button>
      </form>
      <button id="aus" class="knopf hell">${f.ausgeblendet ? 'Wieder einblenden' : 'Ausblenden (nicht aussagekräftig)'}</button>
      <button id="loeschen" class="knopf gefahr">Foto löschen</button>
    </main>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = (await speicher.projekt(f.projektId))!;
    const a = (await speicher.aufschluss(f.aufschlussId))!;
    f.bemerkung = String(new FormData(e.target as HTMLFormElement).get('bem')).trim();
    const t = tiefeText(f.tiefeVon, f.tiefeBis);
    const r = await verarbeite(f.original, {
      projekt: `${p.nummer} ${p.kurzname}`.trim(), aufschluss: `${a.bezeichnung} · ${f.titel}${t ? ' ' + t : ''}`,
      bemerkung: f.bemerkung || undefined, zeit: f.zeit, gps: f.gps, fotograf: f.fotograf || '—', dateiname: f.dateiname,
    });
    Object.assign(f, r, { hochgeladen: false });
    await speicher.fotoSpeichern(f);
    meldung('Schriftfeld aktualisiert');
    route();
  });
  $('#aus').addEventListener('click', async () => {
    f.ausgeblendet = !f.ausgeblendet;
    await speicher.fotoSpeichern(f);
    route();
  });
  $('#loeschen').addEventListener('click', async () => {
    if (!confirm(`${f.dateiname} löschen?`)) return;
    await speicher.fotoLoeschen(f.id);
    gehe(`#/a/${f.aufschlussId}`);
  });
}

async function einstellungen() {
  gpsStopp();
  const fotograf = await speicher.einstellung('fotograf', '');
  const schritt = await speicher.einstellung('schrittweite', 1);
  let gesichert = false;
  try {
    gesichert = (await navigator.storage?.persisted?.()) ?? false;
  } catch { /* egal */ }
  const schaetzung = await navigator.storage?.estimate?.().catch(() => undefined);
  app.innerHTML = `${kopf('Einstellungen', '#/')}
    <main><form id="f" class="formular">
      <label>Fotograf (erscheint im Schriftfeld)<input name="fotograf" required value="${esc(fotograf)}" placeholder="K. Bazrafshan" autocomplete="name"></label>
      <label>Schrittweite Kernfotos [m]<div class="chips" id="sw">${[0.5, 1, 2].map((n) => `<button type="button" class="chip${n === schritt ? ' an' : ''}" data-n="${n}">${zahl(n)} m</button>`).join('')}</div></label>
      <button class="knopf gross">Speichern</button>
    </form>
    <h2>Speicher</h2>
    <p class="grau">Daten dauerhaft geschützt: <b>${gesichert ? 'ja' : 'nein'}</b>${schaetzung?.usage != null ? ` · belegt ca. ${Math.round(schaetzung.usage / 1048576)} MB` : ''}</p>
    ${gesichert ? '' : '<button id="persist" class="knopf hell">Daten dauerhaft schützen</button><p class="grau">Tipp: App über „Zum Startbildschirm hinzufügen“ installieren, dann löscht der Browser die Fotos nicht bei Speicherknappheit.</p>'}
    <p class="grau">GeoFoto ${VERSION} · Daten bleiben auf diesem Gerät.</p>
    </main>`;
  let sw = schritt;
  $('#sw').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    sw = Number(b.dataset.n);
    app.querySelectorAll('#sw .chip').forEach((c) => c.classList.toggle('an', c === b));
  });
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    await speicher.einstellungSetzen('fotograf', String(new FormData(e.target as HTMLFormElement).get('fotograf')).trim());
    await speicher.einstellungSetzen('schrittweite', sw);
    meldung('Gespeichert');
    gehe('#/');
  });
  document.getElementById('persist')?.addEventListener('click', async () => {
    meldung((await speicherSichern()) ? 'Daten sind jetzt geschützt.' : 'Browser hat abgelehnt – App installieren und erneut versuchen.', 'ok');
    route();
  });
}

// ---------- Router ----------

let letzterHash = '';
async function route() {
  aufraeumen();
  const neu = location.hash !== letzterHash;
  letzterHash = location.hash;
  const h = location.hash.replace(/^#/, '') || '/';
  const t = h.split('/').filter(Boolean);
  try {
    if (t[0] === 'neu') return await projektFormular();
    if (t[0] === 'einstellungen') return await einstellungen();
    if (t[0] === 'p' && t[2] === 'bearbeiten') return await projektFormular(t[1]);
    if (t[0] === 'p' && t[2] === 'aufschluss') return await aufschlussAnlegen(t[1]);
    if (t[0] === 'p') return await projektseite(t[1]);
    if (t[0] === 'a' && t[2] === 'bearbeiten') return await aufschlussBearbeiten(t[1]);
    if (t[0] === 'a') return await aufschlussseite(t[1]);
    if (t[0] === 'f') return await fotoseite(t[1]);
    return await startseite();
  } finally {
    if (neu) window.scrollTo?.(0, 0);
  }
}

window.addEventListener('hashchange', route);
route();
speicherSichern();
