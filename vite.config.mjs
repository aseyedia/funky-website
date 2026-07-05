import { defineConfig } from 'vite';

export default defineConfig({
  root: './src',
  base: '/funky/',
  build: {
    outDir: '../dist',
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
