/**
 * @fileoverview SvelteKit Configuration file for the UVTT v2 IDE.
 * Configures the build pipeline to generate a fully Client-Side Rendered (CSR) 
 * Single Page Application (SPA)[cite: 16]. This static output is required for both hosting 
 * on GitHub Pages and for bundling into the native Wails/Go desktop executable[cite: 16].
 */

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Enables Vite-based preprocessing for modern features like PostCSS and nested CSS[cite: 16]
  preprocess: vitePreprocess(),
  
  kit: {
    // ----------------------------------------------------------------------
    // BUILD ADAPTER
    // ----------------------------------------------------------------------
    adapter: adapter({
      // Setting a fallback converts SvelteKit from a traditional SSR/SSG framework 
      // into a pure SPA. This ensures all routing is handled entirely in the browser, 
      // which is mandatory for WebGPU canvas rendering and desktop environments[cite: 16].
      fallback: 'index.html' 
    }),

    // ----------------------------------------------------------------------
    // IMPORT ALIASES
    // ----------------------------------------------------------------------
    // Maps semantic shortcuts to physical directories, preventing messy 
    // relative paths (e.g., "../../../components/...") in the codebase[cite: 16].
    alias: {
      '$lib': './src/lib',
      '$components': './src/lib/components',
      '$stores': './src/lib/stores',
      '$utils': './src/lib/utils',
      '$src': './src'
    },

    // ----------------------------------------------------------------------
    // DEPLOYMENT PATHS
    // ----------------------------------------------------------------------
    paths: {
      // Explicitly define the base path for GitHub Pages production deployments.
      // In production, assets will load from '/uvtt-v2-upgrader/...'. 
      // In local dev, it remains at the standard root '/'[cite: 16].
      base: process.env.NODE_ENV === 'production' ? '/uvtt-v2-upgrader' : ''
    }
  }
};

export default config;