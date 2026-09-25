import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `base: './'`: the build is served from the app's local server and must not assume the
// site root, so every asset (and the 808 samples) resolves relative to index.html.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
})
