<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let activeMap = $derived(mapStore.activeMap);
  let manifest = $derived(activeMap?.manifest);

  // Local state to track if panels are open or closed
  let envOpen = $state(true);
  let audioOpen = $state(true);
</script>

{#if activeMap}
  <div class="panel-section">
    <button
      class="collapse-header"
      aria-expanded={envOpen}
      onclick={() => (envOpen = !envOpen)}
    >
      <h3>🌍 ENVIRONMENT CONFIG</h3>
      <span class="caret">{envOpen ? "▼" : "▶"}</span>
    </button>

    {#if envOpen}
      <div class="panel-content">
        <label>
          <span>Grid Topology:</span>
          <select
            value={manifest.resolution?.topology?.type || "square"}
            onchange={(e) =>
              mapStore.updateItemProperty(
                activeMap.id,
                "resolution.topology.type",
                e.target.value,
              )}
          >
            <option value="square">Square</option>
            <option value="hex">Hexagonal</option>
            <option value="isometric">Isometric</option>
          </select>
        </label>
        <label>
          <span>Grid Size (Pixels):</span>
          <input
            type="number"
            value={manifest.resolution?.pixels_per_grid}
            onchange={(e) =>
              mapStore.updateItemProperty(
                activeMap.id,
                "resolution.pixels_per_grid",
                parseFloat(e.target.value),
              )}
          />
        </label>
        <label>
          <span>Grid Color:</span>
          <input
            type="color"
            value={manifest.resolution?.grid_color || "#ffffff"}
            onchange={(e) =>
              mapStore.updateItemProperty(
                activeMap.id,
                "resolution.grid_color",
                e.target.value,
              )}
          />
        </label>
        <label>
          <span>Main Grid Thickness (px):</span>
          <div class="slider-row">
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={manifest.resolution?.grid_line_width ?? 1.5}
              oninput={(e) =>
                mapStore.updateItemProperty(
                  activeMap.id,
                  "resolution.grid_line_width",
                  parseFloat(e.target.value),
                )}
            />
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={manifest.resolution?.grid_line_width ?? 1.5}
              onchange={(e) =>
                mapStore.updateItemProperty(
                  activeMap.id,
                  "resolution.grid_line_width",
                  parseFloat(e.target.value),
                )}
            />
          </div>
        </label>
        <label>
          <span>Subgrid Thickness (px):</span>
          <div class="slider-row">
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={manifest.resolution?.subgrid_line_width ?? 1.0}
              oninput={(e) =>
                mapStore.updateItemProperty(
                  activeMap.id,
                  "resolution.subgrid_line_width",
                  parseFloat(e.target.value),
                )}
            />
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={manifest.resolution?.subgrid_line_width ?? 1.0}
              onchange={(e) =>
                mapStore.updateItemProperty(
                  activeMap.id,
                  "resolution.subgrid_line_width",
                  parseFloat(e.target.value),
                )}
            />
          </div>
        </label>
      </div>
    {/if}
  </div>

  <div class="panel-section">
    <button
      class="collapse-header"
      aria-expanded={audioOpen}
      onclick={() => (audioOpen = !audioOpen)}
    >
      <h3>🎵 GLOBAL AUDIO</h3>
      <span class="caret">{audioOpen ? "▼" : "▶"}</span>
    </button>

    {#if audioOpen}
      <div class="panel-content">
        <label>
          <span>Background Soundtrack:</span>
          <select
            value={manifest.music?.track || ""}
            onchange={(e) =>
              mapStore.updateItemProperty(
                activeMap.id,
                "music.track",
                e.target.value,
              )}
          >
            <option value="">-- No Track --</option>
            {#each Object.keys(mapStore.audioBlobs) as track}
              <option value={track}>{track}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>Ambient Soundscape:</span>
          <select
            value={manifest.ambience?.track || ""}
            onchange={(e) =>
              mapStore.updateItemProperty(
                activeMap.id,
                "ambience.track",
                e.target.value,
              )}
          >
            <option value="">-- No Track --</option>
            {#each Object.keys(mapStore.audioBlobs) as track}
              <option value={track}>{track}</option>
            {/each}
          </select>
        </label>
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  .collapse-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: transparent;
    border: none;
    width: 100%;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .collapse-header:hover h3 {
    text-shadow: 0 0 8px rgba(0, 240, 255, 0.5);
  }
  .collapse-header:hover .caret {
    color: #e2e8f0;
  }
  .caret {
    font-size: 10px;
    color: #64748b;
    transition: color 0.2s;
  }
  .panel-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    color: #00f0ff;
    text-transform: uppercase;
    transition: text-shadow 0.2s;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #94a3b8;
  }
  input[type="number"],
  input[type="color"],
  select {
    background: #05080e;
    border: 1px solid #1e293b;
    color: #fff;
    padding: 6px;
    border-radius: 4px;
    box-sizing: border-box;
    width: 100%;
  }
  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .slider-row input[type="range"] {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    accent-color: #00f0ff;
  }
  .slider-row input[type="number"] {
    width: 50px;
    flex-shrink: 0;
    text-align: center;
    padding: 4px;
  }
</style>
