import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  base: '/Daily-Todo/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico','apple-touch-icon.png','icon-192.png','icon-512.png','apple-touch-icon-180.png'],
      manifest: {
        name: '무한리필 실행기',
        short_name: '무한리필',
        description: 'Todoist + 커스텀 무한리필 실행기',
        theme_color: '#111827',
        background_color: '#f8f8fb',
        display: 'standalone',
        start_url: '/Daily-Todo/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] }
    })
  ]
})
