/**
 * STUB FILE FOR SPA BUILD
 * The Validation Queue is a Desktop Pro-only feature.
 * This empty store exists solely to satisfy the static Vite imports in the unified Toolbar.svelte
 * and prevent runtime errors when clicking the Validation UI in the web browser.
 */

export const validatorStore = {
  // Provide an empty issues array so Toolbar.svelte doesn't crash on .length
  issues: [],
  
  // Provide a dummy function so the click handler doesn't throw "is not a function"
  validateMap: () => {
    console.log("Validation Queue is a Desktop Pro exclusive feature.");
  }
};