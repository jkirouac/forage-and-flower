import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served by Vercel on its own address, garden.packed.camp.
const base = '/'

// The built page carries its own Content-Security-Policy (other headers are in
// vercel.json): only our own scripts (plus the inline theme script, by hash),
// and connections only to Supabase. Added at build time only, because the dev server
// injects scripts of its own.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        )
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inline.join(' ')}`,
          "style-src 'self' 'unsafe-inline'",
          // Plant photos come from Wikimedia Commons; site designs from the garden's
          // private bucket (signed links).
          "img-src 'self' data: blob: https://upload.wikimedia.org https://thumb.wikimedia.org https://*.supabase.co",
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        )
      },
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Forage & Flower',
        short_name: 'Forage & Flower',
        description: 'Our garden through the year: what to plant, where to buy it, and what to do this month.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f5f1e6',
        theme_color: '#f5f1e6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Plant photos you've looked at stay on the phone, so they show without signal.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(upload|thumb)\.wikimedia\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'plant-photos',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // Site designs you've opened stay on the phone. Signed links change, so the
          // cache ignores the token; the path is the file.
          {
            urlPattern: /\/storage\/v1\/object\/sign\/garden-designs\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'site-designs',
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 80, maxAgeSeconds: 180 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
