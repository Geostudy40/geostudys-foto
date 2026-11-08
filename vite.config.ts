import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' damit die App auch unter einem Unterpfad (GitHub Pages) läuft
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'GeoFoto – Felddokumentation GeoStudys',
        short_name: 'GeoFoto',
        description: 'Fotodokumentation von Aufschlüssen im Feld',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#1F3864',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
    }),
  ],
});
