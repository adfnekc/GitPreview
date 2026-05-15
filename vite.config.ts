/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content.ts'),
        background: resolve(__dirname, 'src/background.ts'),
        'pdf-viewer-loader': resolve(__dirname, 'src/preview/pdf/pdf-viewer-loader.ts'),
        'pdf-suppress-warnings': resolve(__dirname, 'src/preview/pdf/pdf-suppress-warnings.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
  },
});
