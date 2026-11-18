import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true }, // reachable from a phone on the LAN for touch testing
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
});
