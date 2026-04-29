import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@platforms': resolve(__dirname, 'src/content-scripts/platforms'),
      '@ui': resolve(__dirname, 'src/content-scripts/ui'),
    },
  },
  plugins: [
    webExtension({
      manifest: 'manifest.json',
      additionalInputs: ['src/content-scripts/main.ts'],
      disableAutoLaunch: true,
      // Ensure the service worker is output as an ES module so Chrome can
      // register it correctly when manifest.json declares "type": "module".
      webExtensionPolyfill: false,
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Content scripts and service workers must be self-contained single files.
        // Avoid code-splitting for them; only allow splitting for popup/options pages.
        manualChunks: undefined,
      },
    },
  },
});
