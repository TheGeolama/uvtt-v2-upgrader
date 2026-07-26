<script>
  /**
   * Svelte 5 Runes: $props() replaces the old `export let` syntax.
   * This cleanly defines the inputs this component accepts from its parent.
   * We also set safe default values so the app won't crash if a prop is missing.
   * * @prop {boolean} isVisible - Controls whether the overlay is injected into the DOM.
   * @prop {string} message - The dynamic text displayed beneath the loading spinner.
   */
  let { isVisible = false, message = "Processing..." } = $props();
</script>

{#if isVisible}
  <div class="overlay">
    <div class="spinner"></div>
    <p>{message}</p>
  </div>
{/if}

<style>
  /* The Main Overlay Wrapper
    Locks to the viewport corners and forces everything behind it to blur out.
  */
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    /* Deep slate background with 85% opacity to darken the app underneath */
    background: rgba(15, 23, 42, 0.85);
    /* Modern CSS blur effect for a frosted glass look */
    backdrop-filter: blur(4px);
    /* Flexbox centers the spinner and text perfectly in the middle of the screen */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* 9999 ensures it renders on top of ALL other UI panels and toolbars */
    z-index: 9999;
    color: #00f0ff;
    font-family: system-ui, sans-serif;
  }

  /* The CSS Spinner
    Created by drawing a circle with a border, making one edge of the border a bright color,
    and infinitely rotating the entire div.
  */
  .spinner {
    width: 50px;
    height: 50px;
    /* Dark border for the base track */
    border: 4px solid #1e293b;
    /* Bright cyan border for the moving segment */
    border-top-color: #00f0ff;
    /* Makes the div a perfect circle */
    border-radius: 50%;
    /* Triggers the keyframe animation defined below to run infinitely at 1 second per rotation */
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }

  /* Loading Text Styling
    Slightly spaced out and uppercase for a technical, CAD-like aesthetic.
  */
  p {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* Hardware-accelerated rotation animation for the spinner.
  */
  @keyframes spin {
    100% {
      /* Rotates the element a full 360 degrees */
      transform: rotate(360deg);
    }
  }
</style>
