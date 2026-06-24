import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Use the GitHub Pages sub-path only for production builds;
  // keep the dev server at the root so localhost is unaffected.
  base: command === 'build' ? '/Himawari/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
  ],
}))
