/**
 * STUB FILE FOR SPA BUILD
 * The Validation Queue is a Desktop Pro-only feature.
 * This empty store exists solely to satisfy the static Vite imports in the unified Toolbar.svelte
 * and mapStore.svelte.js, preventing runtime and compile errors in the web browser.
 */

// 1. Export the dummy Class (Capital V) expected by mapStore.svelte.js
export class ValidatorStore {
  constructor() {
    this.issues = [];
  }
  
  validateMap() {
    console.log("Validation Queue is a Desktop Pro exclusive feature.");
  }
}

// 2. Export the instantiated singleton (Lowercase v) expected by Toolbar.svelte
export const validatorStore = new ValidatorStore();