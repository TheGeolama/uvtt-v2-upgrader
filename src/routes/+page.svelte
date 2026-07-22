<script>
  import { onMount } from "svelte";
  import Uploader from "$components/Uploader.svelte";
  import CanvasWorkspace from "$components/CanvasWorkspace.svelte";
  import Toolbar from "$components/Toolbar.svelte";
  import ToastManager from "$components/ToastManager.svelte";
  import LoadingOverlay from "$components/LoadingOverlay.svelte";
  import { mapStore } from "$stores/mapStore.svelte.js";
  import { browser } from "$app/environment";

  // Svelte 5 Runes for reactive state & derived conditions
  let isClient = $state(false);
  let isLoaded = $derived(mapStore.catalog && mapStore.catalog.length > 0);

  // Svelte 5 $effect Rune handles client-side lifecycle safely
  $effect(() => {
    if (browser) {
      isClient = true;
      console.log(
        "🚀 Svelte 5 + SvelteKit Orchestrator initialized on the client-side.",
      );
    }
  });
</script>

<main class="app-container">
  {#if !isClient}
    <div class="ssr-loader">
      <div class="spinner"></div>
      <p>INITIALIZING WEBGPU PIPELINE...</p>
    </div>
  {:else if !isLoaded}
    <Uploader />
  {:else}
    <div class="workspace-wrapper">
      <CanvasWorkspace />
      <Toolbar />
    </div>
  {/if}

  {#if isClient}
    <LoadingOverlay />
    <ToastManager />
  {/if}
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #0f172a;
    color: #f8fafc;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Oxygen,
      Ubuntu,
      Cantarell,
      sans-serif;
  }

  .app-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background-color: #0f172a;
    user-select: none;
    -webkit-user-select: none;
  }

  .ssr-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 1.5rem;
    background-color: #0f172a;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 3px solid rgba(0, 240, 255, 0.1);
    border-top: 3px solid #00f0ff;
    border-radius: 50%;
    animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    box-shadow: 0 0 15px rgba(0, 240, 255, 0.2);
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .ssr-loader p {
    color: #94a3b8;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-shadow: 0 0 8px rgba(148, 163, 184, 0.3);
  }

  .workspace-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
