import { defineConfig } from 'vite'

export default defineConfig({
  base: '/the-merchant-v2/',
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
})
