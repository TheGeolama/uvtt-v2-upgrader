<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { packageForPlatform } from "$lib/utils/exporters.js";
  import VideoExportPanel from "$lib/components/panels/VideoExportPanel.svelte";

  // --- SVELTE 5 REACTIVE BINDINGS ---
  let catalog = $derived(mapStore.catalog);
  let activeMap = $derived(mapStore.activeMap);

  /** @type {boolean} Toggle for compiling all maps in the catalog into a single zip archive. */
  let packageCompound = $state(true);

  /** @type {boolean} UI lock flag to prevent duplicate export triggers. */
  let isCompiling = $state(false);

  /**
   * Intercepts file uploads from the "Load Project" hidden input.
   * Routes standard `.uvtt-proj` or `.zip` archives to the central store for unpacking.
   *
   * @param {Event} e - The HTML input change event.
   */
  function triggerFileImport(e) {
    const file = e.target.files[0];
    if (file) {
      mapStore.loadProjectFromFile(file);
    }
  }

  /**
   * Routes the Universal VTT v2 Export.
   * If Compound is checked, it triggers the multi-file .uvtt2z JSZip packager.
   * Uses native OS Save dialogs from projectIO.js.
   */
  async function handleExportV2() {
    isCompiling = true;
    try {
      if (packageCompound && catalog.length > 1) {
        await mapStore.exportCompoundVTT();
      } else {
        mapStore.exportVTT();
      }
    } catch (err) {
      console.error("V2 Export Failed:", err);
    } finally {
      isCompiling = false;
    }
  }

  /**
   * Routes the Legacy V1 export pipeline.
   */
  function handleExportV1() {
    mapStore.exportLegacyV1();
  }

  /**
   * Routes third-party platform exports (e.g., Foundry VTT JSON).
   */
  function handleExportFoundry() {
    if (!activeMap) return;
    const payload = packageForPlatform(activeMap.manifest, "foundry");
    // Uses the new projectIO downloadJSON to trigger the native OS dialog!
    mapStore.downloadJSON(
      `${activeMap.filename || "export"}_foundry.json`,
      payload,
    );
  }
</script>

<div class="panel-container">
  <div class="panel-section">
    <h3>Project Management</h3>
    <div class="button-group">
      <button onclick={() => document.getElementById("project-upload").click()}>
        📂 Load Project
      </button>
      <button onclick={() => mapStore.saveProject()}> 💾 Save Project </button>
    </div>
    <input
      type="file"
      id="project-upload"
      accept=".uvtt-proj,.zip"
      style="display: none;"
      onchange={triggerFileImport}
    />
  </div>

  <div class="panel-section">
    <h3>VTT Export</h3>
    <label class="checkbox-row">
      <input type="checkbox" bind:checked={packageCompound} />
      <span>Package Catalog as Compound Archive</span>
    </label>

    <div class="button-group" style="margin-top: 10px;">
      <button
        onclick={handleExportV2}
        disabled={isCompiling}
        class="primary-btn"
      >
        {#if isCompiling}
          ⏳ Compiling...
        {:else}
          🚀 Universal VTT v2 ({packageCompound && catalog.length > 1
            ? ".uvtt2z"
            : ".uvtt"})
        {/if}
      </button>
    </div>

    <div class="button-group" style="margin-top: 8px;">
      <button onclick={handleExportV1}>Legacy V1 (.dd2vtt)</button>
      <button onclick={handleExportFoundry}>Foundry VTT (.json)</button>
    </div>
  </div>

  <VideoExportPanel />
</div>

<style>
  .panel-container {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  .panel-section {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 12px;
  }
  .button-group {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .checkbox-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    cursor: pointer;
    font-size: 12px;
    color: #94a3b8;
  }
  input[type="checkbox"] {
    cursor: pointer;
    width: 14px;
    height: 14px;
    accent-color: #00f0ff;
  }
  h3 {
    margin: 0;
    font-size: 13px;
    color: #00f0ff;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  button {
    flex: 1;
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }
  button:hover:not(:disabled) {
    background: #334155;
    border-color: #475569;
  }
  button.primary-btn {
    background: #00f0ff;
    color: #0f172a;
    font-weight: 600;
    border: none;
  }
  button.primary-btn:hover:not(:disabled) {
    background: #38bdf8;
  }
  button:disabled {
    background: #0f172a;
    color: #475569;
    border-color: #1e293b;
    cursor: not-allowed;
  }
</style>
