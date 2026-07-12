import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Pulls base path from GitHub Actions env if deploying to GH Pages, otherwise defaults to root.
  // This allows the local development server to run cleanly at "/" while 
  // automatically prefixing paths correctly on GitHub Pages (e.g. "/uvtt-v2-upgrader/").
  const base = process.env.VITE_BASE_PATH || './';

  return {
    plugins: [svelte()],
    base: base,
    server: {
      port: 3000,
      strictPort: true
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // WebGPU/PixiJS v8 compilation optimization
      target: 'esnext',
      sourcemap: true,
      minify: 'esbuild'
    }
  };
});
