import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built game works from any folder (e.g. esjotace.github.io/oxasmash/).
  base: './',
  test: {
    include: ['tests/**/*.test.js'],
  },
});
