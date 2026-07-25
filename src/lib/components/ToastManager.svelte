<!-- 
  @component ToastManager
  Global notification renderer[cite: 13].
  Subscribes to the reactive `uiStore` to display non-blocking, auto-dismissing 
  toast notifications (success, error, warning, info) at the bottom-right of the screen[cite: 13].
-->
<script>
  import { uiStore } from "$lib/stores/uiStore.svelte.js";
  import { fly, fade } from "svelte/transition";
</script>

<!-- 
  The container uses pointer-events: none so clicks fall through to the PixiJS canvas,
  while the individual toasts re-enable pointer-events so they can be manually closed[cite: 13]. 
-->
<div class="toast-container">
  {#each uiStore.toasts as toast (toast.id)}
    <div
      class="toast {toast.type}"
      in:fly={{ y: 20, duration: 300 }}
      out:fade={{ duration: 200 }}
    >
      <div class="toast-icon">
        <!-- Map the semantic toast type to a visual emoji icon[cite: 13] -->
        {#if toast.type === "success"}✅
        {:else if toast.type === "error"}🚨
        {:else if toast.type === "warning"}⚠️
        {:else}ℹ️{/if}
      </div>

      <div class="toast-message">{toast.message}</div>

      <button
        class="close-btn"
        onclick={() => uiStore.removeToast(toast.id)}
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 10000;
    /* Crucial: Allows clicking through the invisible container background[cite: 13] */
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #0f172a;
    border: 1px solid #1e293b;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.5),
      0 4px 6px -4px rgba(0, 0, 0, 0.5);
    min-width: 250px;
    max-width: 400px;
    /* Re-enable clicking on the toast itself so the close button works[cite: 13] */
    pointer-events: auto;
    font-family: system-ui, sans-serif;
  }

  /* --- Semantic Color Themes ---[cite: 13] */
  .toast.info {
    border-left: 4px solid #3b82f6;
  }
  .toast.success {
    border-left: 4px solid #10b981;
  }
  .toast.warning {
    border-left: 4px solid #f59e0b;
  }
  .toast.error {
    border-left: 4px solid #ef4444;
  }

  .toast-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .toast-message {
    color: #f8fafc;
    font-size: 13px;
    line-height: 1.4;
    flex: 1;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #1e293b;
    color: #f8fafc;
  }
</style>
