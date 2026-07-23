<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { upgradeLegacyMap } from "$lib/utils/legacyParser.js";
  import EventPanel from "$lib/components/panels/EventPanel.svelte";
  import GeometryPanel from "$lib/components/panels/GeometryPanel.svelte";
  import FileExportPanel from "$lib/components/panels/FileExportPanel.svelte";
  import MapSettingsPanel from "$lib/components/panels/MapSettingsPanel.svelte";
  import AssetLibraryPanel from "$lib/components/panels/AssetLibraryPanel.svelte";
  import GridAlignPanel from "$lib/components/panels/GridAlignPanel.svelte";
  import EntityPanel from "$lib/components/panels/EntityPanel.svelte";
  import HistoryPanel from "$lib/components/panels/HistoryPanel.svelte";

  let activeMap = $derived(mapStore.activeMap);
  let catalog = $derived(mapStore.catalog);
  let activeTool = $derived(mapStore.activeTool);
  let lightingPreview = $derived(mapStore.lightingPreview);
  let visionEnabled = $derived(mapStore.vision?.enabled);
  let manifest = $derived(activeMap?.manifest);

  let mouseX = $derived(mapStore.mouseX);
  let mouseY = $derived(mapStore.mouseY);
  let zoomScale = $derived(mapStore.zoomScale);

  let hotkeyHint = $derived.by(() => {
    if (visionEnabled) {
      return "🎭 <span style='color: #4ade80; font-weight: bold;'>PLAYER PREVIEW ACTIVE</span> <span class='sep'>|</span> <span class='key'>Left-Click & Drag:</span> Move Vision Token <span class='sep'>|</span> <span class='key'>Space+Drag:</span> Pan Camera";
    }

    switch (activeTool) {
      case "wall":
      case "portal":
      case "roof":
        return "<span class='key'>Left-Click:</span> Draw Node <span class='sep'>|</span> <span class='key'>Shift:</span> Bypass Snap <span class='sep'>|</span> <span class='key'>Ctrl-Click:</span> Select <span class='sep'>|</span> <span class='key'>Alt+Right-Click:</span> Delete Node <span class='sep'>|</span> <span class='key'>Enter/Right-Click:</span> Finish";
      case "select":
        return "<span class='key'>Left-Click:</span> Select <span class='sep'>|</span> <span class='key'>Shift:</span> Multi-Select <span class='sep'>|</span> <span class='key'>Ctrl+C/V:</span> Copy/Paste <span class='sep'>|</span> <span class='key'>Ctrl+D:</span> Clone <span class='sep'>|</span> <span class='key'>Alt+Click:</span> Split Vector";
      case "spawn":
      case "light":
      case "audio":
      case "emitter":
      case "event":
        return "<span class='key'>Left-Click:</span> Place Entity <span class='sep'>|</span> <span class='key'>Shift:</span> Free Placement <span class='sep'>|</span> <span class='key'>Ctrl-Click:</span> Select";
      case "asset":
        return "<span class='key'>Drag & Drop:</span> Place Prop on Canvas <span class='sep'>|</span> Desktop Local I/O Bypasses Browser Restrictions";
      default:
        return "<span class='key'>Space+Drag:</span> Pan Camera <span class='sep'>|</span> <span class='key'>Scroll:</span> Zoom <span class='sep'>|</span> <span class='key'>Ctrl+Z/Y:</span> Undo/Redo";
    }
  });

  let selectedItemIds = $derived(mapStore.selectedItemIds);
  let selectedItems = $derived(
    selectedItemIds
      .map((id) => {
        let item = manifest?.geometry?.walls?.find((w) => w.id === id);
        if (item) return { ...item, category: "wall" };

        item = manifest?.geometry?.portals?.find((p) => p.id === id);
        if (item) return { ...item, category: "portal" };

        item = manifest?.geometry?.overhead?.find((r) => r.id === id);
        if (item) return { ...item, category: "roof" };

        item = manifest?.entities?.lights?.find((l) => l.id === id);
        if (item) return { ...item, category: "light" };

        item = manifest?.entities?.events?.find((e) => e.id === id);
        if (item) return { ...item, category: "event" };

        item = manifest?.entities?.audio?.zones?.find((a) => a.id === id);
        if (item) return { ...item, category: "audio" };

        item = manifest?.entities?.emitters?.find((em) => em.id === id);
        if (item) return { ...item, category: "emitter" };

        item = manifest?.entities?.landing_zones?.find((lz) => lz.id === id);
        if (item) return { ...item, category: "spawn" };

        item = manifest?.entities?.props?.find((pr) => pr.id === id);
        if (item) return { ...item, category: "prop" };

        return null;
      })
      .filter(Boolean),
  );
  let displayCategory = $derived(
    selectedItems.length > 0 ? selectedItems[0].category : activeTool,
  );

  function selectTool(tool) {
    mapStore.setTool(tool);
  }

  async function handleImportLevel(e) {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split(".").pop().toLowerCase();

    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      await mapStore.importImageAsMap(file);
    } else {
      try {
        const text = await file.text();
        const parsedMap = upgradeLegacyMap(text, file.name);
        if (parsedMap) mapStore.appendLevel(parsedMap);
      } catch (err) {
        console.error(err);
        alert("Failed to import level");
      }
    }
    e.target.value = null;
  }
</script>

{#if activeMap}
  <div class="level-nav-bar">
    <div class="level-controls">
      <span class="icon" title="Compound Dungeon">🌍</span>
      <select
        class="level-select"
        value={activeMap.id}
        onchange={(e) => mapStore.switchMap(e.target.value)}
      >
        {#each catalog as map}
          <option value={map.id}>{map.filename}</option>
        {/each}
      </select>
      <input
        class="level-rename"
        type="text"
        placeholder="Rename level..."
        value={activeMap.filename}
        oninput={(e) => mapStore.renameMapLevel(activeMap.id, e.target.value)}
      />

      <div class="divider"></div>

      <button
        class="icon-btn"
        disabled={!activeMap.history || activeMap.historyIndex <= 0}
        onclick={() => mapStore.undo()}
        title="Undo (Ctrl+Z)"
      >
        ↶
      </button>
      <button
        class="icon-btn"
        disabled={!activeMap.history ||
          activeMap.historyIndex >= activeMap.history.length - 1}
        onclick={() => mapStore.redo()}
        title="Redo (Ctrl+Y)"
      >
        ↷
      </button>

      <div class="divider"></div>

      <button
        class="icon-btn positive"
        onclick={() => mapStore.addMapLevel()}
        title="Add Blank Level"
      >
        ➕
      </button>
      <label
        class="icon-btn wave import-btn"
        title="Import Map (.dd2vtt, .png, .jpg, .webp)"
      >
        📥
        <input
          type="file"
          accept=".dd2vtt,.uvtt,.json,.txt,.png,.jpg,.jpeg,.webp"
          style="display: none;"
          onchange={handleImportLevel}
        />
      </label>
      <button
        class="icon-btn negative"
        onclick={() => {
          if (confirm("Delete this level forever?"))
            mapStore.deleteMapLevel(activeMap.id);
        }}
        title="Delete Level"
      >
        🗑️
      </button>
    </div>
  </div>

  <div class="toolbar-wrapper">
    <div class="tool-selector">
      <div class="tool-group">
        <span class="group-label">📐 ARCHITECTURE</span>
        <button
          class:active={activeTool === "select"}
          onclick={() => selectTool("select")}
          aria-label="Selection Tool"
        >
          <span>🔍</span> Select
        </button>
        <button
          class:active={activeTool === "wall"}
          onclick={() => selectTool("wall")}
          aria-label="Draw Walls"
        >
          <span>🧱</span> Wall
        </button>
        <button
          class:active={activeTool === "portal"}
          onclick={() => selectTool("portal")}
          aria-label="Draw Portals"
        >
          <span>🚪</span> Portal
        </button>
        <button
          class:active={activeTool === "roof"}
          onclick={() => selectTool("roof")}
          aria-label="Draw Roofs"
        >
          <span>🌳</span> Roof
        </button>
        <button
          class={activeTool === "grid_align" ? "active" : ""}
          onclick={() => mapStore.setTool("grid_align")}
        >
          📐 Align Grid
        </button>
      </div>

      <div class="tool-group">
        <span class="group-label">💡 ENTITIES</span>
        <button
          class:active={activeTool === "light"}
          onclick={() => selectTool("light")}
          aria-label="Place Lights"
        >
          <span>💡</span> Light
        </button>
        <button
          class:active={activeTool === "audio"}
          onclick={() => selectTool("audio")}
          aria-label="Place Audio"
        >
          <span>🎵</span> Audio
        </button>
        <button
          class:active={activeTool === "event"}
          onclick={() => selectTool("event")}
          aria-label="Place Event"
        >
          <span>⚡</span> Event
        </button>
        <button
          class:active={activeTool === "spawn"}
          onclick={() => selectTool("spawn")}
          aria-label="Place Spawn"
        >
          <span>🚩</span> Spawn
        </button>
        <button
          class:active={activeTool === "emitter"}
          onclick={() => selectTool("emitter")}
          aria-label="Place Emitter"
        >
          <span>🌧️</span> Emitter
        </button>
      </div>

      <div class="tool-group">
        <span class="group-label">📦 ASSETS</span>
        <button
          class:active={activeTool === "asset"}
          onclick={() => selectTool("asset")}
          aria-label="Global Asset Library"
        >
          <span>📂</span> Library
        </button>
      </div>

      <div class="tool-group">
        <span class="group-label">🌍 ENVIRONMENT</span>
        <button
          class:active={lightingPreview}
          onclick={() => mapStore.toggleLightingPreview()}
          aria-label="Toggle Lighting Preview"
        >
          <span>🌓</span> Lighting
        </button>
        <button
          class:active-player={visionEnabled}
          onclick={() => mapStore.toggleVision()}
          aria-label="Toggle Player Preview"
        >
          <span>👁️</span> Player View
        </button>
      </div>
    </div>

    <div class="properties-panel">
      {#if mapStore.selectedItemIds.length > 0 || mapStore.clipboard.length > 0}
        <div
          class="panel-section"
          style="border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.02); margin-bottom: 16px;"
        >
          <h3 style="color: #38bdf8;">
            ✂️ CLIPBOARD {#if mapStore.selectedItemIds.length > 0}({mapStore
                .selectedItemIds.length} Selected){/if}
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button
              class="action-btn"
              style="justify-content: center;"
              onclick={() => mapStore.copySelected()}
              disabled={mapStore.selectedItemIds.length === 0}
              title="Ctrl+C"
            >
              📄 Copy
            </button>
            <button
              class="action-btn"
              style="justify-content: center;"
              onclick={() => mapStore.pasteClipboard(0, 0)}
              disabled={mapStore.clipboard.length === 0}
              title="Ctrl+V"
            >
              📋 Paste
            </button>
            <button
              class="action-btn"
              style="justify-content: center;"
              onclick={() => mapStore.duplicateSelected()}
              disabled={mapStore.selectedItemIds.length === 0}
              title="Ctrl+D"
            >
              👯 Duplicate
            </button>
            <button
              class="action-btn"
              style="justify-content: center; color: #ef4444;"
              onclick={() => mapStore.deleteSelected()}
              disabled={mapStore.selectedItemIds.length === 0}
              title="Delete/Backspace"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      {/if}

      {#if mapStore.selectedItemIds.length > 0}
        <div
          class="panel-section"
          style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.02); margin-bottom: 16px;"
        >
          <h3 style="color: #f59e0b;">🎛️ VISIBILITY OVERRIDE</h3>
          <label
            style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
          >
            Universal Visibility (Player View)
            <select
              style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
              onchange={(e) => {
                mapStore.selectedItemIds.forEach((id) => {
                  mapStore.updateItemProperty(
                    id,
                    "properties.visibility",
                    e.target.value,
                  );
                });
              }}
            >
              <option value="visible">👁️ Visible to Everyone</option>
              <option value="gm_only">🕵️ GM Only (Hidden from Players)</option>
              <option value="hidden">🚫 Completely Disabled</option>
            </select>
          </label>
          <p class="helper-text" style="margin-top: 8px; font-size: 10px;">
            <strong>GM Only:</strong> VTTs will load this object for the GM, but
            never send it to connected players until triggered.
          </p>
        </div>
      {/if}

      {#if displayCategory === "select"}
        {#if selectedItems.length === 0}
          <div class="panel-section">
            <h3>🖱️ SELECTION TOOL</h3>
            <p class="helper-text" style="margin-top: 8px;">
              Click an object on the map to view and edit its properties. Hold
              Shift to select multiple items.
            </p>
          </div>
        {/if}
      {:else if displayCategory === "asset"}
        <AssetLibraryPanel />
      {:else if displayCategory === "grid_align"}
        <GridAlignPanel />
      {:else}
        <div class="panel-section">
          <h3>📝 {displayCategory.toUpperCase()} CONFIG</h3>

          {#if selectedItems.length === 0 && displayCategory !== "prop"}
            <div class="status-indicator editing-defaults">
              <span>✏️ Configuring Defaults for New {displayCategory}s</span>
            </div>
          {:else}
            <div class="status-indicator editing-active">
              <span
                >🎯 Editing {selectedItems.length} Selected Item{selectedItems.length >
                1
                  ? "s"
                  : ""}</span
              >
            </div>
          {/if}

          {#if ["wall", "portal", "roof"].includes(displayCategory)}
            <GeometryPanel />
          {:else if displayCategory === "event"}
            <EventPanel />
          {:else}
            <EntityPanel />
          {/if}

          {#if selectedItems.length > 0}
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              {#if ["wall", "portal"].includes(displayCategory)}
                <button
                  class="action-btn"
                  onclick={() =>
                    mapStore.convertCategory(
                      selectedItems[0].id,
                      displayCategory === "wall" ? "portals" : "walls",
                    )}
                >
                  🔄 Convert
                </button>
              {/if}
              <button
                class="action-btn wave"
                onclick={() => mapStore.duplicateSelected()}>📋 Clone</button
              >
              <button
                class="action-btn positive"
                onclick={() => mapStore.deleteSelected()}>🗑️ Delete</button
              >
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="global-panel-right">
    <FileExportPanel />
    <HistoryPanel />
    <MapSettingsPanel />
  </div>

  <div class="status-bar">
    <div class="status-segment coord-readout">X: {mouseX} | Y: {mouseY}</div>
    <div class="status-segment zoom-readout">Zoom: {zoomScale}%</div>
    <div class="status-segment hint">{@html hotkeyHint}</div>
    <div class="status-segment right">UVTT v2 Compiler</div>
  </div>
{/if}

<style>
  /* --- LEVEL NAVIGATION BAR STYLES --- */
  .level-nav-bar {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #0b1329ee;
    border: 1px solid #1e293b;
    padding: 8px 16px;
    border-radius: 30px;
    pointer-events: auto;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .level-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .level-nav-bar .icon {
    font-size: 16px;
  }

  .level-select {
    background: #1e293b;
    border: 1px solid #334155;
    color: #00f0ff;
    padding: 6px 12px;
    border-radius: 15px;
    font-weight: bold;
    outline: none;
    min-width: 150px;
    cursor: pointer;
  }

  .level-rename {
    background: transparent;
    border: 1px dashed transparent;
    color: #e2e8f0;
    padding: 4px 8px;
    border-radius: 4px;
    width: 140px;
    transition: all 0.2s;
  }

  .level-rename:hover,
  .level-rename:focus {
    background: #1e293b;
    border-color: #334155;
  }

  .divider {
    width: 1px;
    height: 24px;
    background: #334155;
    margin: 0 4px;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 16px;
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .icon-btn:hover {
    transform: scale(1.1);
  }

  .icon-btn.positive:hover {
    text-shadow: 0 0 8px #22c55e;
  }

  .icon-btn.negative:hover {
    text-shadow: 0 0 8px #ef4444;
  }

  .icon-btn.wave:hover {
    text-shadow: 0 0 8px #3b82f6;
  }

  .import-btn {
    margin: 0;
    display: flex;
  }

  /* --- LEFT TOOLBAR STYLES --- */
  .toolbar-wrapper {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 10;
    pointer-events: none;
    display: flex;
    gap: 15px;
  }

  .tool-selector,
  .properties-panel {
    background: #0b1329ee;
    border: 1px solid #1e293b;
    padding: 15px;
    border-radius: 8px;
    pointer-events: auto;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3);
  }

  .tool-selector {
    width: 160px; /* Increased from 140px to fit 'Player View' */
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-label {
    font-size: 10px;
    font-weight: bold;
    color: #64748b;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 4px;
    margin-bottom: 2px;
  }

  .properties-panel {
    width: 280px;
    max-height: 85vh;
    overflow-y: auto;
  }

  /* --- RIGHT TOOLBAR STYLES --- */
  .global-panel-right {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 280px;
    max-height: 85vh;
    overflow-y: auto;
    background: #0b1329ee;
    border: 1px solid #1e293b;
    padding: 15px;
    border-radius: 8px;
    pointer-events: auto;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3);
    z-index: 10;
  }

  /* --- SHARED PANEL STYLES --- */
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .panel-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .status-indicator {
    font-size: 11px;
    font-weight: bold;
    padding: 6px 8px;
    border-radius: 4px;
    text-align: center;
  }

  .editing-defaults {
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
    border: 1px dashed #475569;
  }

  .editing-active {
    background: rgba(0, 240, 255, 0.1);
    color: #00f0ff;
    border: 1px solid #00f0ff;
  }

  .helper-text {
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.4;
  }

  h3 {
    margin: 0;
    font-size: 14px;
    color: #00f0ff;
    text-transform: uppercase;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #94a3b8;
  }

  select {
    background: #05080e;
    border: 1px solid #1e293b;
    color: #fff;
    padding: 6px;
    border-radius: 4px;
    box-sizing: border-box;
    width: 100%;
  }

  button {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  button:hover {
    background: #334155;
  }

  button.active {
    background: #00f0ff22;
    border-color: #00f0ff;
    color: #00f0ff;
  }

  /* Player Preview Active State */
  button.active-player {
    background: #22c55e22;
    border-color: #22c55e;
    color: #4ade80;
  }

  .action-btn {
    flex: 1;
    font-size: 12px;
    padding: 8px;
    justify-content: center;
  }

  .action-btn.positive {
    background: #ef444422;
    border-color: #ef4444;
    color: #fca5a5;
  }

  .action-btn.wave {
    background: #3b82f622;
    border-color: #3b82f6;
    color: #93c5fd;
  }

  /* --- CAD STATUS BAR STYLES --- */
  .status-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: 30px;
    background: #05080edd;
    border-top: 1px solid #1e293b;
    display: flex;
    align-items: center;
    padding: 0 20px;
    box-sizing: border-box;
    z-index: 100;
    font-size: 11px;
    color: #94a3b8;
    gap: 20px;
    backdrop-filter: blur(4px);
  }

  .status-segment {
    display: flex;
    align-items: center;
    white-space: nowrap;
  }

  .coord-readout {
    width: 120px;
    font-family: monospace;
    color: #00f0ff;
  }

  .zoom-readout {
    width: 80px;
    font-family: monospace;
    color: #e2e8f0;
  }

  .status-segment.hint {
    flex: 1;
    justify-content: center;
    color: #64748b;
  }

  :global(.status-segment.hint .key) {
    color: #e2e8f0;
    font-weight: bold;
  }

  :global(.status-segment.hint .sep) {
    margin: 0 8px;
    color: #334155;
  }

  .status-segment.right {
    margin-left: auto;
    color: #3b82f6;
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
</style>
