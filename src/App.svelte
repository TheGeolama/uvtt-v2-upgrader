<script>
  import CompilationSpinner from './components/CompilationSpinner.svelte';
  import { mapStore } from "./stores/mapStore.js";
  import Uploader from "./components/Uploader.svelte";
  import CanvasWorkspace from "./components/CanvasWorkspace.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import ExportMenu from "./components/ExportMenu.svelte";
    // The spinner binds directly to your global mapStore export/import state
  $: isProcessing = $mapStore.isExporting || $mapStore.isParsing;
  $: progressPercentage = $mapStore.compilationProgress || 0;
</script>

<main>
  {#if !$mapStore.imageUrl}
    <Uploader />
  {:else}
    <Toolbar />
    <CanvasWorkspace />
    <ExportMenu />
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: #1e1e1e;
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  }

  main {
    width: 100vw;
    height: 100vh;
    position: relative;
  }
</style>
