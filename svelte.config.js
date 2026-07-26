/**
 * @fileoverview SvelteKit Configuration file for the UVTT v2 IDE.
 * Configures the build pipeline to generate a fully Client-Side Rendered (CSR) 
 * Single Page Application (SPA). This static output is required for both hosting 
 * on GitHub Pages and for bundling into the native Wails/Go desktop executable.
 */

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Enables Vite-based preprocessing for modern features like PostCSS and nested CSS
  preprocess: vitePreprocess(),
  
  kit: {
    // ----------------------------------------------------------------------
    // BUILD ADAPTER
    // ----------------------------------------------------------------------
    adapter: adapter({
      // Setting a fallback converts SvelteKit from a traditional SSR/SSG framework 
      // into a pure SPA. This ensures all routing is handled entirely in the browser, 
      // which is mandatory for WebGPU canvas rendering and desktop environments.
      fallback: 'index.html',
      
      // Explicitly direct output to the 'build' folder so the Wails Go compiler 
      // can perfectly target //go:embed all:frontend/build
      pages: 'build',
      assets: 'build',
      precompress: false,
      strict: true
    }),

    // ----------------------------------------------------------------------
    // IMPORT ALIASES
    // ----------------------------------------------------------------------
    // Maps semantic shortcuts to physical directories, preventing messy 
    // relative paths (e.g., "../../../components/...") in the codebase.
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
      // CRITICAL DUAL-BUILD LOGIC:
      // GitHub Pages requires the '/uvtt-v2-upgrader' base path.
      // Wails Desktop requires an empty string '' base path.
      // By checking for 'GITHUB_ACTIONS', we dynamically set the correct path 
      // depending on where the compiler is running!
      base: ''
    }
  }
};

export default config;