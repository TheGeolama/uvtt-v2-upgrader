/**
 * @fileoverview Vite Configuration file for the UVTT v2 IDE.
 * Acts as the low-level build engine and development server configuration[cite: 17].
 * Optimizes the build pipeline for modern, heavy-duty browser APIs (like WebGPU and PixiJS) 
 * and ensures strict port bindings required for the Wails/Go desktop integration[cite: 17].
 */

import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// https://vitejs.dev/config/[cite: 17]
export default defineConfig({
  // Injects SvelteKit's routing and compilation logic into the Vite pipeline[cite: 17]
  plugins: [sveltekit()],
  
  // ----------------------------------------------------------------------
  // DEVELOPMENT SERVER CONFIGURATION
  // ----------------------------------------------------------------------
  server: {
    port: 3000,
    // strictPort prevents Vite from automatically switching to 3001, 3002, etc. if 3000 is taken.
    // This is crucial for desktop (Wails/Go) development, as the backend is hardcoded 
    // to listen to and communicate with a specific local port[cite: 17].
    strictPort: true
  },

  // ----------------------------------------------------------------------
  // PRODUCTION BUILD CONFIGURATION
  // ----------------------------------------------------------------------
  build: {
    // Targets the absolute latest JavaScript specifications. 
    // Necessary because advanced graphics rendering (WebGPU, top-level await, modern PixiJS) 
    // requires engine features that do not exist in older ECMAScript targets like es2015[cite: 17].
    target: 'esnext',
    
    // Generates source maps to allow debugging production issues back to the original Svelte components[cite: 17]
    sourcemap: true,
    
    // Uses esbuild for rapid, high-performance minification of the final JavaScript payload[cite: 17]
    minify: 'esbuild'
  }
});