import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built game works from any folder (e.g. esjotace.github.io/oxasmash/).
  base: './',
  // Online rooms: the dev page passes /ws on to the game server (npm run server, port 8787).
  server: {
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
