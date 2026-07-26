/**
 * @fileoverview Vite Configuration file for the UVTT v2 IDE.
 * Acts as the low-level build engine and development server configuration.
 * Optimizes the build pipeline for modern, heavy-duty browser APIs (like WebGPU and PixiJS) 
 * and ensures strict port bindings required for the Wails/Go desktop integration.
 */

import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// https://vitejs.dev/config/
export default defineConfig({
  // Injects SvelteKit's routing and compilation logic into the Vite pipeline
  plugins: [sveltekit()],
  
  // ----------------------------------------------------------------------
  // DEVELOPMENT SERVER CONFIGURATION
  // ----------------------------------------------------------------------
  server: {
    port: 3000,
    // strictPort prevents Vite from automatically switching to 3001, 3002, etc. if 3000 is taken.
    // This is crucial for desktop (Wails/Go) development, as the backend is hardcoded 
    // to listen to and communicate with a specific local port.
    strictPort: true,
    
    // NEW: Allow Vite to serve files from the root frontend directory (which includes wailsjs)
    fs: {
      allow: ['.'] 
    }
  },

  // ----------------------------------------------------------------------
  // PRODUCTION BUILD CONFIGURATION
  // ----------------------------------------------------------------------
  build: {
    // Targets the absolute latest JavaScript specifications. 
    // Necessary because advanced graphics rendering (WebGPU, top-level await, modern PixiJS) 
    // requires engine features that do not exist in older ECMAScript targets like es2015.
    target: 'esnext',
    
    // Generates source maps to allow debugging production issues back to the original Svelte components
    sourcemap: true,
    
    // Uses esbuild for rapid, high-performance minification of the final JavaScript payload
    minify: 'esbuild'
  }
});