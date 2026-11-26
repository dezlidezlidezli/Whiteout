import { defineConfig } from 'vite';

// Relative base so the build works at any path (GitHub Pages serves from /<repo>/).
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1500 },
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
