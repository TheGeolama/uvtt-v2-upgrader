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
<<<<<<< HEAD
      fallback: 'index.html' 
=======
      fallback: 'index.html',
      
      // Explicitly direct output to the 'build' folder so the Wails Go compiler 
      // can perfectly target //go:embed all:frontend/build
      pages: 'build',
      assets: 'build',
      precompress: false,
      strict: true
>>>>>>> f25e47d41c2e717e93e8ab7945bc4347a7af40f4
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
<<<<<<< HEAD
      // Explicitly define the base path for GitHub Pages production deployments.
      // In production builds, assets will correctly load from '/uvtt-v2-upgrader/...'. 
      // In local dev ('npm run dev'), it remains at the standard root '/'.
      base: process.argv.includes('dev') ? '' : '/uvtt-v2-upgrader'
=======
      // CRITICAL FOR WAILS DESKTOP:
      // Wails serves files directly from the root of the embedded 'build' folder.
      // If you previously used a base path for GitHub Pages (e.g., '/uvtt-v2-upgrader'), 
      // you MUST leave this empty ('') for the desktop build, otherwise Wails will 404
      // and result in a blank white screen on startup.
      base: ''
>>>>>>> f25e47d41c2e717e93e8ab7945bc4347a7af40f4
    }
  }
};

export default config;