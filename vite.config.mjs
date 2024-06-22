import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: './src',
  build: {
    outDir: './dist',
  },
  server: {
    port: 3000,
  }
  // publicDir: 'src/public', // Set the public directory
});
