import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at /Genset-Simulator/
export default defineConfig({
  base: '/Genset-Simulator/',
  plugins: [react()],
});
