import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Toda chamada /api vai para o backend Express (porta 3001)
      '/api': 'http://localhost:3001',
    },
  },
});
