import { describe, expect, it } from 'vitest';
import { FOTOREIHEN, abgedeckteTiefe, csv, dateiname, dateiTeil, fortschritt, naechsterSchritt, naechstesIntervall, status, tiefeText } from './model';

describe('Dateinamen (F7)', () => {
  it('Beispiel aus dem Briefing', () => {
    expect(dateiname({ projekt: '26-126', aufschluss: 'RKS 1', schrittNr: 4, kurztext: 'Kern', tiefeVon: 0, tiefeBis: 2 })).toBe('26-126_RKS1_04_Kern_0-2m.jpg');
  });
  it('ohne Tiefe', () => {
    expect(dateiname({ projekt: '26-126', aufschluss: 'RKS 2', schrittNr: 1, kurztext: 'Umgebung' })).toBe('26-126_RKS2_01_Umgebung.jpg');
  });
  it('Dezimaltiefe mit Komma', () => {
    expect(dateiname({ projekt: '26-126', aufschluss: 'RKS 1', schrittNr: 4, kurztext: 'Kern', tiefeVon: 1.5, tiefeBis: 2.25 })).toBe('26-126_RKS1_04_Kern_1,5-2,25m.jpg');
  });
  it('Zusatzfoto', () => {
    expect(dateiname({ projekt: '26-126', aufschluss: 'DPH 1', schrittNr: null, zusatzNr: 3, kurztext: 'Ölgeruch' })).toBe('26-126_DPH1_Z03_Oelgeruch.jpg');
  });
  it('doppelte Namen bekommen Suffix', () => {
    const v = new Set(['26-126_RKS1_03_Bohrung.jpg', '26-126_RKS1_03_Bohrung_2.jpg']);
    expect(dateiname({ projekt: '26-126', aufschluss: 'RKS 1', schrittNr: 3, kurztext: 'Bohrung' }, v)).toBe('26-126_RKS1_03_Bohrung_3.jpg');
  });
  it('Sonderzeichen werden entfernt', () => {
    expect(dateiTeil('GWM 1/neu (Ost)')).toBe('GWM1neuOst');
  });
});

describe('Tiefen', () => {
  it('Text', () => {
    expect(tiefeText(0, 1)).toBe('0–1 m');
    expect(tiefeText(undefined, undefined)).toBe('');
  });
  it('lückenlose Abdeckung', () => {
    expect(abgedeckteTiefe([{ tiefeVon: 1, tiefeBis: 2 }, { tiefeVon: 0, tiefeBis: 1 }, { tiefeVon: 3, tiefeBis: 4 }])).toBe(2);
  });
  it('nächstes Intervall', () => {
    expect(naechstesIntervall([], 4)).toEqual([0, 1]);
    expect(naechstesIntervall([{ tiefeVon: 0, tiefeBis: 1 }, { tiefeVon: 1, tiefeBis: 2 }], 4)).toEqual([2, 3]);
    expect(naechstesIntervall([{ tiefeVon: 0, tiefeBis: 3.5 }], 4)).toEqual([3.5, 4]);
  });
});

describe('Checkliste', () => {
  it('RKS mit Endtiefe: Kern erst bei voller Tiefe erledigt', () => {
    const fotos = [
      { schrittNr: 1, ausgeblendet: false },
      { schrittNr: 2, ausgeblendet: false },
      { schrittNr: 4, tiefeVon: 0, tiefeBis: 2, ausgeblendet: false },
    ];
    const st = status('RKS', 4, fotos);
    expect(fortschritt(st)).toEqual({ erledigt: 2, pflicht: 5 });
    expect(naechsterSchritt(st)?.nr).toBe(3);
    const st2 = status('RKS', 4, [...fotos, { schrittNr: 3, ausgeblendet: false }, { schrittNr: 4, tiefeVon: 2, tiefeBis: 4, ausgeblendet: false }]);
    expect(naechsterSchritt(st2)?.nr).toBe(7);
  });
  it('ausgeblendete Fotos zählen nicht', () => {
    expect(fortschritt(status('DPH', undefined, [{ schrittNr: 1, ausgeblendet: true }])).erledigt).toBe(0);
  });
});

describe('Fotoreihen', () => {
  it('Schritte fortlaufend nummeriert, Kurztexte eindeutig', () => {
    for (const [typ, r] of Object.entries(FOTOREIHEN)) {
      expect(r.map((s) => s.nr), typ).toEqual(r.map((_, i) => i + 1));
      expect(new Set(r.map((s) => s.kurztext)).size, typ).toBe(r.length);
    }
  });
  it('Baustelle: nur Übersicht ist Pflicht', () => {
    expect(fortschritt(status('Baustelle', undefined, [])).pflicht).toBe(1);
  });
  it('Haufwerk: 4 Pflichtfotos', () => {
    expect(fortschritt(status('HW', undefined, [])).pflicht).toBe(4);
  });
  it('Fundamentschurf: Dateiname Unterkante', () => {
    expect(dateiname({ projekt: '26-130', aufschluss: 'FS 2', schrittNr: 4, kurztext: 'UK', tiefeVon: 0, tiefeBis: 1.2 })).toBe('26-130_FS2_04_UK_0-1,2m.jpg');
  });
});

describe('CSV', () => {
  it('Semikolon und Anführungszeichen', () => {
    expect(csv([['a;b', 'c"d', 1]])).toBe('﻿"a;b";"c""d";1\r\n');
  });
});
