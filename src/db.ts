// Lokaler Speicher (IndexedDB). Alles bleibt auf dem Gerät.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Aufschluss, Foto, Projekt } from './model';

interface Schema extends DBSchema {
  projekte: { key: string; value: Projekt };
  aufschluesse: { key: string; value: Aufschluss; indexes: { projekt: string } };
  fotos: { key: string; value: Foto; indexes: { projekt: string; aufschluss: string } };
  einstellungen: { key: string; value: unknown };
}

let dbP: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  dbP ??= openDB<Schema>('geofoto', 1, {
    upgrade(d) {
      d.createObjectStore('projekte', { keyPath: 'id' });
      d.createObjectStore('aufschluesse', { keyPath: 'id' }).createIndex('projekt', 'projektId');
      const f = d.createObjectStore('fotos', { keyPath: 'id' });
      f.createIndex('projekt', 'projektId');
      f.createIndex('aufschluss', 'aufschlussId');
      d.createObjectStore('einstellungen');
    },
  });
  return dbP;
}

export const speicher = {
  async projekte() {
    return (await (await db()).getAll('projekte')).sort((a, b) => b.angelegt.localeCompare(a.angelegt));
  },
  async projekt(id: string) {
    return (await db()).get('projekte', id);
  },
  async projektSpeichern(p: Projekt) {
    await (await db()).put('projekte', p);
  },
  async projektLoeschen(id: string) {
    const d = await db();
    const tx = d.transaction(['projekte', 'aufschluesse', 'fotos'], 'readwrite');
    for (const k of await tx.objectStore('fotos').index('projekt').getAllKeys(id)) await tx.objectStore('fotos').delete(k);
    for (const k of await tx.objectStore('aufschluesse').index('projekt').getAllKeys(id)) await tx.objectStore('aufschluesse').delete(k);
    await tx.objectStore('projekte').delete(id);
    await tx.done;
  },

  async aufschluesse(projektId: string) {
    const a = await (await db()).getAllFromIndex('aufschluesse', 'projekt', projektId);
    return a.sort((x, y) => x.bezeichnung.localeCompare(y.bezeichnung, 'de', { numeric: true }));
  },
  async aufschluss(id: string) {
    return (await db()).get('aufschluesse', id);
  },
  async aufschlussSpeichern(a: Aufschluss) {
    await (await db()).put('aufschluesse', a);
  },
  async aufschlussLoeschen(id: string) {
    const d = await db();
    const tx = d.transaction(['aufschluesse', 'fotos'], 'readwrite');
    for (const k of await tx.objectStore('fotos').index('aufschluss').getAllKeys(id)) await tx.objectStore('fotos').delete(k);
    await tx.objectStore('aufschluesse').delete(id);
    await tx.done;
  },

  async fotosProjekt(projektId: string) {
    const f = await (await db()).getAllFromIndex('fotos', 'projekt', projektId);
    return f.sort((a, b) => a.zeit.localeCompare(b.zeit));
  },
  async fotosAufschluss(aufschlussId: string) {
    const f = await (await db()).getAllFromIndex('fotos', 'aufschluss', aufschlussId);
    return f.sort((a, b) => a.zeit.localeCompare(b.zeit));
  },
  async foto(id: string) {
    return (await db()).get('fotos', id);
  },
  async fotoSpeichern(f: Foto) {
    await (await db()).put('fotos', f);
  },
  async fotoLoeschen(id: string) {
    await (await db()).delete('fotos', id);
  },

  async einstellung<T>(k: string, standard: T): Promise<T> {
    return ((await (await db()).get('einstellungen', k)) as T) ?? standard;
  },
  async einstellungSetzen(k: string, v: unknown) {
    await (await db()).put('einstellungen', v, k);
  },
};

/** Browser bitten, die Daten nicht bei Speicherknappheit zu löschen */
export async function speicherSichern(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
