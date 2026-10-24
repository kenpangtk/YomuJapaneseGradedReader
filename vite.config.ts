import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
