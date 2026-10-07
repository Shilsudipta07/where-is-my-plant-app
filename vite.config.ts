import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const geoapifyKey = (
    process.env.VITE_GEOAPIFY_API_KEY ||
    process.env.GEOAPIFY_API_KEY ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GEOAPIFY_API_KEY': JSON.stringify(geoapifyKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
