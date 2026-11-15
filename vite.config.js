import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Source lives in src/; the build is one self-contained HTML file (dist/index.html) that
// scripts/finish-build.mjs copies to ./index.html, so the game still runs from a double-click.
export default defineConfig({
  root: 'src',
  base: './',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { port: 5191 },
});
