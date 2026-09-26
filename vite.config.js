
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  plugins: [react(), VitePWA({registerType:'autoUpdate', includeAssets:['favicon.ico'], manifest:{name:'Daily-Todo', short_name:'DailyTodo', theme_color:'#000'}})],
})
