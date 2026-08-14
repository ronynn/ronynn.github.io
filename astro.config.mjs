import { defineConfig } from 'astro/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  site: 'https://ronynn.github.io/',
  output: 'static',
  vite: {
    css: {
      minify:'esbuild'
    },
    plugins: [
      VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        injectRegister: 'auto', 
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\.github\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'github-api',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 }
              }
            }
          ]
        },
        manifest: {
          name: 'Ronynn Homepage',
          short_name: 'Ronynn',
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#000000'
        }
      })
    ]
  }
});