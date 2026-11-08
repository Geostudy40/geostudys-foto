# GeoFoto – Foto-App GeoStudys

Offline-fähige Web-App (PWA) für die Fotodokumentation von Aufschlüssen.
Konzept: `../BRIEFING_Foto-App_V1_04-11-26.md`, Stand: `../NOTIZ_Stand_V1_08-11-26.md`.

## Befehle
- `npm install` – Pakete laden (einmalig)
- `npm run dev` – lokal testen
- `npm test` – Unit-Tests (Dateinamen, Checkliste, CSV)
- `npm run build` – fertige App nach `dist/` (das wird gehostet)

## Aufbau
- `src/model.ts` – Datenmodell, Fotoreihen, Dateinamen, Checkliste (ohne Browser-APIs, getestet)
- `src/db.ts` – Speicher auf dem Handy (IndexedDB)
- `src/bild.ts` – Verkleinern, Schriftfeld, EXIF
- `src/export.ts` – ZIP, CSV, Teilen
- `src/main.ts` – Oberfläche
