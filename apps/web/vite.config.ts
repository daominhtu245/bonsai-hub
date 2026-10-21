import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Bonsai AI',
        short_name: 'Bonsai AI',
        description: 'Chụp phôi, nhận bản vẽ thế cây và lộ trình chăm từng giai đoạn.',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        background_color: '#F4EFE6',
        theme_color: '#3F5B3A',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Không cache API và ảnh ký sẵn (URL hết hạn sau 1 giờ).
        navigateFallbackDenylist: [/^\/api\//, /^\/s\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_PROXY ?? 'http://localhost:8001', changeOrigin: true },
      '/s/': { target: process.env.API_PROXY ?? 'http://localhost:8001', changeOrigin: true },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
});
