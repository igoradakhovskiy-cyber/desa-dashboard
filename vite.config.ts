import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base must match the GitHub Pages repo path: https://<user>.github.io/desa-dashboard/
export default defineConfig({
  base: '/desa-dashboard/',
  plugins: [react(), tailwindcss()],
})
