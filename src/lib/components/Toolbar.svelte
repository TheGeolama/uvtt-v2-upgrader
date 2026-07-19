<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { upgradeLegacyMap } from "$lib/utils/legacyParser.js";
  import { packageForPlatform } from "$lib/utils/exporters.js";
  import JSZip from "jszip";

  let activeMap = $derived(mapStore.activeMap);
  let catalog = $derived(mapStore.catalog);
  let activeTool = $derived(mapStore.activeTool);
  let lightingPreview = $derived(mapStore.lightingPreview);
  let visionEnabled = $derived(mapStore.vision?.enabled);
  let manifest = $derived(activeMap?.manifest);

  // --- DESKTOP PRO CAPABILITY CHECK ---
  // Safely checks if the engine is running inside the Wails/Go wrapper
  let isDesktopPro = $derived(
    typeof window !== "undefined" && !!window?.go?.main,
  );

  // --- LOCAL SMART GEOMETRY STATE ---
  let edgeSensitivity = $state(0.45);
  let isCrunchingWalls = $state(false);

  async function handleAutoTraceWalls() {
    if (isCrunchingWalls) return;
    isCrunchingWalls = true;
    try {
      await mapStore.autoTraceMapWalls(edgeSensitivity);
    } finally {
      isCrunchingWalls = false;
    }
  }

  // --- CAD STATUS BAR METRICS ---
  let mouseX = $derived(mapStore.mouseX);
  let mouseY = $derived(mapStore.mouseY);
  let zoomScale = $derived(mapStore.zoomScale);

  // Context-Aware Hotkey Routing
  let hotkeyHint = $derived.by(() => {
    if (visionEnabled) {
      return "<span class='key'>Left-Click & Drag:</span> Move Vision Token <span class='sep'>|</span> <span class='key'>Space+Drag:</span> Pan Camera";
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

  let packageCompound = $state(false);

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
  let activeConf = $derived(
    selectedItems.length > 0
      ? selectedItems[0]
      : mapStore.defaultSettings[displayCategory] || {},
  );

  function selectTool(tool) {
    mapStore.setTool(tool);
  }

  function handlePropChange(category, keyPath, value) {
    if (selectedItems.length > 0) {
      selectedItems.forEach((item) => {
        mapStore.updateItemProperty(item.id, keyPath, value);
      });
    } else {
      mapStore.updateDefaultSetting(category, keyPath, value);
    }
  }

  async function handlePlatformExport(platform) {
    if (packageCompound) {
      if (catalog.length === 0) return;

      alert(
        `Packaging ${catalog.length} map levels into a ${platform.toUpperCase()} ZIP archive...`,
      );

      try {
        const zip = new JSZip();

        zip.file(
          "README_Export.txt",
          `Compound Dungeon Export for ${platform.toUpperCase()}\nGenerated by UVTT v2 IDE\nContains ${catalog.length} map level(s).`,
        );

        for (let i = 0; i < catalog.length; i++) {
          const mapDef = catalog[i];
          const { filename, data } = await packageForPlatform(
            platform,
            mapDef.manifest,
          );

          const safeFilename = `Floor_${i + 1}_${filename}`;
          zip.file(safeFilename, data);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        mapStore.downloadBlob(
          `Compound_Dungeon_${platform.toUpperCase()}_Export.zip`,
          zipBlob,
        );
      } catch (err) {
        console.error("ZIP Generation Failed:", err);
        alert(`Compound Export to ${platform} failed: ${err.message}`);
      }
    } else {
      if (!activeMap) return;
      try {
        const { filename, data } = await packageForPlatform(
          platform,
          activeMap.manifest,
        );
        mapStore.downloadBlob(
          filename,
          new Blob([data], { type: "application/json" }),
        );
      } catch (err) {
        alert(`Export to ${platform} failed: ${err.message}`);
      }
    }
  }

  function triggerFileImport(e) {
    const file = e.target.files[0];
    if (file) mapStore.loadProjectFromFile(file);
    e.target.value = null;
  }

  async function handleImportLevel(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedMap = upgradeLegacyMap(text, file.name);
      if (parsedMap) mapStore.appendLevel(parsedMap);
    } catch (err) {
      console.error(err);
      alert("Failed to import level");
    }
    e.target.value = null;
  }
</script>

{#if activeMap}
  <!-- Always-Visible Level Navigation Bar (Top Center) -->
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

      <!-- UNDO / REDO BUTTONS -->
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
        title="Import Legacy Floor (.dd2vtt)"
      >
        📥
        <input
          type="file"
          accept=".dd2vtt,.uvtt,.json,.txt"
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
          <span>🌓</span> Preview
        </button>
        <button
          class:active={visionEnabled}
          onclick={() => mapStore.toggleVision()}
          aria-label="Toggle Vision Sandbox"
        >
          <span>👁️</span> Vision
        </button>
      </div>
    </div>

    <div class="properties-panel">
      {#if displayCategory === "select"}
        <div class="panel-section">
          <h3>💾 FILE & EXPORT</h3>
          <label class="checkbox-row" style="margin-bottom: 8px;">
            <input type="checkbox" bind:checked={packageCompound} />
            <span>Package Catalog as Compound Dungeon</span>
          </label>

          <div style="display: flex; gap: 8px; flex-direction: column;">
            <div style="display: flex; gap: 8px;">
              <button
                class="action-btn wave"
                onclick={() => mapStore.saveProject()}>📦 Save</button
              >
              <button
                class="action-btn"
                style="background: #ef444422; border-color: #ef4444; color: #fca5a5;"
                onclick={() => {
                  if (
                    confirm(
                      "Close project and return to start screen? Unsaved changes will be lost.",
                    )
                  )
                    mapStore.closeProject();
                }}
              >
                ❌ Close
              </button>
            </div>

            <label
              class="action-btn"
              style="background: #1e293b; color: #e2e8f0; text-align: center; cursor: pointer;"
            >
              📂 Load Project
              <input
                type="file"
                accept=".uvtt-proj,.zip"
                style="display: none;"
                onchange={triggerFileImport}
              />
            </label>

            <div style="display: flex; gap: 8px;">
              <button
                class="action-btn"
                onclick={() =>
                  packageCompound
                    ? mapStore.exportCompoundVTT(true)
                    : mapStore.exportLegacyV1()}>⏳ Export v1</button
              >
              <button
                class="action-btn positive"
                onclick={() =>
                  packageCompound
                    ? mapStore.exportCompoundVTT(false)
                    : mapStore.exportVTT()}>📤 Compile v2</button
              >
            </div>

            <button
              class="action-btn secure"
              onclick={() => mapStore.exportSecureVTT(packageCompound)}
              >🔒 Secure Archive (.zip)</button
            >
          </div>

          <div
            style="margin-top: 12px; border-top: 1px solid #1e293b; padding-top: 10px;"
          >
            <h4 style="color: #64748b; font-size: 10px; margin-bottom: 8px;">
              PLATFORM EXPORTS
            </h4>
            <div
              style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;"
            >
              <button
                class="action-btn"
                onclick={() => handlePlatformExport("foundry")}>Foundry</button
              >
              <button
                class="action-btn"
                onclick={() => handlePlatformExport("roll20")}>Roll20</button
              >
              <button
                class="action-btn"
                onclick={() => handlePlatformExport("fg")}>FG</button
              >
            </div>
          </div>

          <p class="helper-text" style="margin-top: 5px;">
            Your work is continuously auto-saved to your browser's local cache.
          </p>
        </div>

        <div class="panel-section">
          <h3>🌍 ENVIRONMENT CONFIG</h3>
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

        <div class="panel-section">
          <h3>🎵 GLOBAL AUDIO</h3>
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
      {:else if displayCategory === "asset"}
        <div class="panel-section">
          <h3>📂 LOCAL ASSET LIBRARY</h3>

          {#if isDesktopPro}
            <button
              class="action-btn wave"
              onclick={() => mapStore.mountAssetLibrary()}
            >
              📁 Mount Local Folder
            </button>
            <p class="helper-text" style="margin-top: 8px;">
              Select a directory on your hard drive to instantly load custom
              tokens, props, and audio tracks into the engine without uploading.
            </p>

            {#if mapStore.globalAssets.audio.length > 0}
              <div style="margin-top: 15px;">
                <span
                  style="font-size: 10px; font-weight: bold; color: #00f0ff;"
                  >AUDIO LOADED ({mapStore.globalAssets.audio.length})</span
                >
                <ul
                  style="font-size: 11px; color: #e2e8f0; padding-left: 15px; margin-top: 4px; max-height: 100px; overflow-y: auto;"
                >
                  {#each mapStore.globalAssets.audio as aud}
                    <li>{aud.name}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if mapStore.globalAssets.images.length > 0}
              <div style="margin-top: 15px;">
                <span
                  style="font-size: 10px; font-weight: bold; color: #00f0ff;"
                  >PROPS & TOKENS ({mapStore.globalAssets.images.length})</span
                >
                <div
                  style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; max-height: 150px; overflow-y: auto; padding-right: 4px;"
                >
                  {#each mapStore.globalAssets.images as img}
                    <img
                      src={img.data}
                      alt={img.name}
                      draggable="true"
                      ondragstart={(e) => {
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({
                            type: "asset_prop",
                            image: img.data,
                            name: img.name,
                          }),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      style="width: 48px; height: 48px; object-fit: cover; border: 1px solid #334155; border-radius: 4px; cursor: grab;"
                    />
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <!-- THE OPEN CORE UPSELL -->
            <button
              class="action-btn secure"
              style="cursor: not-allowed; opacity: 0.8; font-weight: bold;"
            >
              ⭐ Upgrade to Pro
            </button>
            <p class="helper-text" style="margin-top: 12px;">
              The Global Asset Library requires unrestricted local file system
              access. Upgrade to the Desktop Pro version to securely mount local
              OS folders and drag-and-drop gigabytes of assets instantly.
            </p>
          {/if}
        </div>
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

          {#if displayCategory === "prop"}
            <label>
              <span>Asset Name:</span>
              <input type="text" value={activeConf.name || "Prop"} disabled />
            </label>
            <label>
              <span>Rotation (Degrees):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={activeConf.rotation ?? 0}
                  oninput={(e) =>
                    handlePropChange(
                      "prop",
                      "rotation",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={activeConf.rotation ?? 0}
                  onchange={(e) =>
                    handlePropChange(
                      "prop",
                      "rotation",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label>
              <span>Scale (%):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="10"
                  max="500"
                  value={activeConf.scale ?? 100}
                  oninput={(e) =>
                    handlePropChange(
                      "prop",
                      "scale",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={activeConf.scale ?? 100}
                  onchange={(e) =>
                    handlePropChange(
                      "prop",
                      "scale",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label>
              <span>Z-Axis Elevation:</span>
              <input
                type="number"
                step="0.5"
                value={activeConf.position?.z ?? 0}
                onchange={(e) =>
                  handlePropChange(
                    "prop",
                    "position.z",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
          {:else if displayCategory === "wall"}
            <label>
              <span>Wall Collision Presets:</span>
              <select
                value={activeConf.properties?.type || "standard"}
                onchange={(e) =>
                  handlePropChange("wall", "properties.type", e.target.value)}
              >
                <option value="standard">Standard Solid Wall</option>
                <option value="terrain">Terrain Ridge</option>
                <option value="invisible">Invisible Block (Sight Only)</option>
              </select>
            </label>
            <label>
              <span>Directional Blocking (Line-of-Sight):</span>
              <select
                value={activeConf.properties?.directional_mode || "two_way"}
                onchange={(e) =>
                  handlePropChange(
                    "wall",
                    "properties.directional_mode",
                    e.target.value,
                  )}
              >
                <option value="two_way">Two-Way (Blocks Both Directions)</option
                >
                <option value="one_way_lr"
                  >One-Way (Blocks Left-to-Right)</option
                >
                <option value="one_way_rl"
                  >One-Way (Blocks Right-to-Left)</option
                >
              </select>
            </label>
            <div style="display: flex; gap: 8px;">
              <label style="flex: 1; min-width: 0;">
                <span>Z-Height Bottom:</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeConf.properties?.bottom ?? 0.0}
                  onchange={(e) =>
                    handlePropChange(
                      "wall",
                      "properties.bottom",
                      parseFloat(e.target.value),
                    )}
                />
              </label>
              <label style="flex: 1; min-width: 0;">
                <span>Z-Height Top:</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeConf.properties?.top ?? 10.0}
                  onchange={(e) =>
                    handlePropChange(
                      "wall",
                      "properties.top",
                      parseFloat(e.target.value),
                    )}
                />
              </label>
            </div>

            <!-- 🤖 SMART GEOMETRY AUTO-WALL CONTAINER -->
            {#if isDesktopPro && selectedItems.length === 0}
              <div
                class="auto-match-panel"
                style="margin-top: 15px; border-color: rgba(0, 240, 255, 0.4); background: rgba(0, 240, 255, 0.02);"
              >
                <span
                  style="font-size: 11px; font-weight: bold; color: #00f0ff; letter-spacing: 0.5px;"
                >
                  🤖 SMART GEOMETRY COMPUTER VISION
                </span>
                <label style="margin-top: 8px;">
                  <span>Edge Trace Sensitivity:</span>
                  <div class="slider-row">
                    <input
                      type="range"
                      min="0.05"
                      max="0.95"
                      step="0.05"
                      bind:value={edgeSensitivity}
                    />
                    <span
                      style="font-family: monospace; font-size: 11px; width: 30px; text-align: right; color: #fff;"
                    >
                      {Math.round(edgeSensitivity * 100)}%
                    </span>
                  </div>
                </label>
                <button
                  class="action-btn wave"
                  style="margin-top: 10px; width: 100%; justify-content: center; font-weight: bold;"
                  onclick={handleAutoTraceWalls}
                  disabled={isCrunchingWalls}
                >
                  {#if isCrunchingWalls}
                    <span>⏳ Crunching Pixels...</span>
                  {:else}
                    <span>🪄 Auto-Trace Background Walls</span>
                  {/if}
                </button>
              </div>
            {/if}
            <!-- 🤖 SMART GEOMETRY AUTO-WALL CONTAINER -->
            {#if isDesktopPro && selectedItems.length === 0}
              <div
                class="auto-match-panel"
                style="margin-top: 15px; border-color: rgba(0, 240, 255, 0.4); background: rgba(0, 240, 255, 0.02);"
              >
                <span
                  style="font-size: 11px; font-weight: bold; color: #00f0ff; letter-spacing: 0.5px;"
                >
                  🤖 SMART GEOMETRY COMPUTER VISION
                </span>
                <label style="margin-top: 8px;">
                  <span>Edge Trace Sensitivity:</span>
                  <div class="slider-row">
                    <input
                      type="range"
                      min="0.05"
                      max="0.95"
                      step="0.05"
                      bind:value={edgeSensitivity}
                    />
                    <span
                      style="font-family: monospace; font-size: 11px; width: 30px; text-align: right; color: #fff;"
                    >
                      {Math.round(edgeSensitivity * 100)}%
                    </span>
                  </div>
                </label>
                <button
                  class="action-btn wave"
                  style="margin-top: 10px; width: 100%; justify-content: center; font-weight: bold;"
                  onclick={handleAutoTraceWalls}
                  disabled={isCrunchingWalls}
                >
                  {#if isCrunchingWalls}
                    <span>⏳ Crunching Pixels...</span>
                  {:else}
                    <span>🪄 Auto-Trace Background Walls</span>
                  {/if}
                </button>
              </div>
            {/if}
          {:else if displayCategory === "portal"}
            <label>
              <span>Portal Architecture:</span>
              <select
                value={activeConf.properties?.type || "door"}
                onchange={(e) =>
                  handlePropChange("portal", "properties.type", e.target.value)}
              >
                <option value="door">Solid Door</option>
                <option value="window">Transparent Window</option>
                <option value="secret">Secret Door (Hidden)</option>
              </select>
            </label>
            <label>
              <span>Initial State:</span>
              <select
                value={activeConf.properties?.state || "closed"}
                onchange={(e) =>
                  handlePropChange(
                    "portal",
                    "properties.state",
                    e.target.value,
                  )}
              >
                <option value="closed">Closed (Blocks Movement)</option>
                <option value="open">Open (Passable)</option>
                <option value="locked">Locked</option>
                <option value="broken">Broken (Passable/Lets Light In)</option>
              </select>
            </label>
            <div style="display: flex; gap: 8px;">
              <label style="flex: 1; min-width: 0;">
                <span>Z-Height Bottom:</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeConf.properties?.bottom ?? 0.0}
                  onchange={(e) =>
                    handlePropChange(
                      "portal",
                      "properties.bottom",
                      parseFloat(e.target.value),
                    )}
                />
              </label>
              <label style="flex: 1; min-width: 0;">
                <span>Z-Height Top:</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeConf.properties?.top ?? 10.0}
                  onchange={(e) =>
                    handlePropChange(
                      "portal",
                      "properties.top",
                      parseFloat(e.target.value),
                    )}
                />
              </label>
            </div>
          {:else if displayCategory === "roof"}
            <label>
              <span>Roof Tint / Color:</span>
              <input
                type="color"
                value={activeConf.properties?.tint || "#475569"}
                onchange={(e) =>
                  handlePropChange("roof", "properties.tint", e.target.value)}
              />
            </label>
            <label>
              <span>Opacity (%):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={activeConf.properties?.opacity ?? 100}
                  oninput={(e) =>
                    handlePropChange(
                      "roof",
                      "properties.opacity",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={activeConf.properties?.opacity ?? 100}
                  onchange={(e) =>
                    handlePropChange(
                      "roof",
                      "properties.opacity",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <div style="display: flex; gap: 8px;">
              <label style="flex: 1; min-width: 0;">
                <span>Z-Height Bottom:</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeConf.properties?.bottom ?? 10.0}
                  onchange={(e) =>
                    handlePropChange(
                      "roof",
                      "properties.bottom",
                      parseFloat(e.target.value),
                    )}
                />
              </label>
              <label style="flex: 1; min-width: 0;">
                <span>Z-Height Top:</span>
                <input
                  type="number"
                  step="0.5"
                  value={activeConf.properties?.top ?? 20.0}
                  onchange={(e) =>
                    handlePropChange(
                      "roof",
                      "properties.top",
                      parseFloat(e.target.value),
                    )}
                />
              </label>
            </div>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={activeConf.properties?.hidden || false}
                onchange={(e) =>
                  handlePropChange(
                    "roof",
                    "properties.hidden",
                    e.target.checked,
                  )}
              />
              <span>Hidden from Players</span>
            </label>
          {:else if displayCategory === "light"}
            <label>
              <span>Lighting Projection Type:</span>
              <select
                value={activeConf.type || "point"}
                onchange={(e) =>
                  handlePropChange("light", "type", e.target.value)}
              >
                <option value="point">Omni-directional Source</option>
                <option value="directional">Directional Beam/Cone</option>
              </select>
            </label>
            <label>
              <span>Z-Axis Elevation (Grid Units):</span>
              <input
                type="number"
                step="0.5"
                value={activeConf.position?.z ?? 0}
                onchange={(e) =>
                  handlePropChange(
                    "light",
                    "position.z",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Hex Color:</span>
              <input
                type="color"
                value={activeConf.properties?.color || "#ffffff"}
                onchange={(e) =>
                  handlePropChange("light", "properties.color", e.target.value)}
              />
            </label>
            <label>
              <span>Intensity:</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5.0"
                value={activeConf.properties?.intensity ?? 1.0}
                onchange={(e) =>
                  handlePropChange(
                    "light",
                    "properties.intensity",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Decay Model:</span>
              <select
                value={activeConf.properties?.decay_model || "inverse_square"}
                onchange={(e) =>
                  handlePropChange(
                    "light",
                    "properties.decay_model",
                    e.target.value,
                  )}
              >
                <option value="inverse_square"
                  >Inverse Square (Realistic)</option
                >
                <option value="linear">Linear Fade</option>
                <option value="none">None (Solid Block)</option>
              </select>
            </label>
            <label>
              <span>Bright Radius:</span>
              <input
                type="number"
                step="0.5"
                value={activeConf.properties?.radius?.bright ?? 5}
                onchange={(e) =>
                  handlePropChange(
                    "light",
                    "properties.radius.bright",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Dim Radius:</span>
              <input
                type="number"
                step="0.5"
                value={activeConf.properties?.radius?.dim ?? 10}
                onchange={(e) =>
                  handlePropChange(
                    "light",
                    "properties.radius.dim",
                    parseFloat(e.target.value),
                  )}
              />
            </label>

            <label>
              <span>Animation Profile:</span>
              <select
                value={activeConf.properties?.animation?.profile || "none"}
                onchange={(e) =>
                  handlePropChange(
                    "light",
                    "properties.animation.profile",
                    e.target.value,
                  )}
              >
                <option value="none">Static Light</option>
                <option value="flicker">Flicker (Torch/Fire)</option>
                <option value="pulse">Pulse (Magic/Heartbeat)</option>
                <option value="strobe">Strobe (Warning/Alarm)</option>
              </select>
            </label>
            {#if activeConf.properties?.animation?.profile !== "none"}
              <div style="display: flex; gap: 8px;">
                <label style="flex: 1; min-width: 0;">
                  <span>Speed:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={activeConf.properties?.animation?.speed ?? 0.5}
                    onchange={(e) =>
                      handlePropChange(
                        "light",
                        "properties.animation.speed",
                        parseFloat(e.target.value),
                      )}
                  />
                </label>
                <label style="flex: 1; min-width: 0;">
                  <span>Variance:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={activeConf.properties?.animation
                      ?.intensity_variance ?? 0.2}
                    onchange={(e) =>
                      handlePropChange(
                        "light",
                        "properties.animation.intensity_variance",
                        parseFloat(e.target.value),
                      )}
                  />
                </label>
              </div>
            {/if}

            {#if activeConf.type === "directional"}
              <label>
                <span>Beam Rotation (Degrees):</span>
                <div class="slider-row">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={activeConf.properties?.rotation ?? 0}
                    oninput={(e) =>
                      handlePropChange(
                        "light",
                        "properties.rotation",
                        parseFloat(e.target.value),
                      )}
                  />
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={activeConf.properties?.rotation ?? 0}
                    onchange={(e) =>
                      handlePropChange(
                        "light",
                        "properties.rotation",
                        parseFloat(e.target.value),
                      )}
                  />
                </div>
              </label>
              <label>
                <span>Beam Angle (Cone Width):</span>
                <div class="slider-row">
                  <input
                    type="range"
                    min="10"
                    max="360"
                    value={activeConf.properties?.cone_angle ?? 60}
                    oninput={(e) =>
                      handlePropChange(
                        "light",
                        "properties.cone_angle",
                        parseFloat(e.target.value),
                      )}
                  />
                  <input
                    type="number"
                    min="10"
                    max="360"
                    value={activeConf.properties?.cone_angle ?? 60}
                    onchange={(e) =>
                      handlePropChange(
                        "light",
                        "properties.cone_angle",
                        parseFloat(e.target.value),
                      )}
                  />
                </div>
              </label>
            {/if}
          {:else if displayCategory === "spawn"}
            <label>
              <span>Spawn Point Name:</span>
              <input
                type="text"
                value={activeConf.name || "New Spawn"}
                oninput={(e) =>
                  handlePropChange("spawn", "name", e.target.value)}
              />
            </label>
            <label>
              <span>Footprint Shape:</span>
              <select
                value={activeConf.shape || "circle"}
                onchange={(e) =>
                  handlePropChange("spawn", "shape", e.target.value)}
              >
                <option value="circle">Circle (1 Grid Tile)</option>
                <option value="rectangle">Square (1 Grid Tile)</option>
              </select>
            </label>
            <label>
              <span>Token Arrival Heading (Degrees):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={activeConf.heading_degrees ?? 0}
                  oninput={(e) =>
                    handlePropChange(
                      "spawn",
                      "heading_degrees",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={activeConf.heading_degrees ?? 0}
                  onchange={(e) =>
                    handlePropChange(
                      "spawn",
                      "heading_degrees",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={activeConf.is_default || false}
                onchange={(e) =>
                  handlePropChange("spawn", "is_default", e.target.checked)}
              />
              <span>Set as Default Landing Zone</span>
            </label>
          {:else if displayCategory === "event"}
            <label>
              <span>Event Name:</span>
              <input
                type="text"
                value={activeConf.name || "New Event"}
                oninput={(e) =>
                  handlePropChange("event", "name", e.target.value)}
              />
            </label>
            <label>
              <span>Trigger Radius (Grid Tiles):</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={activeConf.trigger_bounds?.radius ?? 0.5}
                onchange={(e) =>
                  handlePropChange(
                    "event",
                    "trigger_bounds.radius",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Event Type:</span>
              <select
                value={activeConf.eventType || "Trap/Door Trigger"}
                onchange={(e) =>
                  handlePropChange("event", "eventType", e.target.value)}
              >
                <option value="Trap/Door Trigger">Trap/Door Trigger</option>
                <option value="Teleport">Teleport</option>
                <option value="Stairs/Ladder">Stairs/Ladder</option>
              </select>
            </label>
            <label>
              <span>Activation Method:</span>
              <select
                value={activeConf.activation || "proximity"}
                onchange={(e) =>
                  handlePropChange("event", "activation", e.target.value)}
              >
                <option value="proximity">Proximity (Walk Over)</option>
                <option value="interaction">Interaction (Click to Use)</option>
                <option value="locked">Locked (GM Only)</option>
              </select>
            </label>

            {#if activeConf.eventType === "Teleport" || activeConf.eventType === "Stairs/Ladder"}
              <label>
                <span>Destination (Spawn Point):</span>
                <select
                  value={activeConf.targetSpawnId || ""}
                  onchange={(e) =>
                    handlePropChange("event", "targetSpawnId", e.target.value)}
                  disabled={activeConf.autoCreateMatch &&
                    selectedItems.length === 0}
                >
                  <option value="">-- Select Destination --</option>
                  {#each catalog as mapLevel}
                    {#each mapLevel.manifest?.entities?.landing_zones || [] as spawn}
                      <option value={spawn.id}
                        >[{mapLevel.name || mapLevel.filename.split(".")[0]}] {spawn.name ||
                          "Unnamed Spawn"}</option
                      >
                    {/each}
                  {/each}
                </select>
              </label>

              {#if selectedItems.length === 0}
                <div class="auto-match-panel">
                  <label class="checkbox-row" style="margin-top: 0;">
                    <input
                      type="checkbox"
                      checked={activeConf.autoCreateMatch || false}
                      onchange={(e) =>
                        handlePropChange(
                          "event",
                          "autoCreateMatch",
                          e.target.checked,
                        )}
                    />
                    <span style="color: #00f0ff; font-weight: bold;"
                      >Full Reciprocal Auto-Match</span
                    >
                  </label>
                  {#if activeConf.autoCreateMatch}
                    <label style="margin-top: 8px;">
                      <span>Target Floor:</span>
                      <select
                        value={activeConf.targetFloorId || ""}
                        onchange={(e) =>
                          handlePropChange(
                            "event",
                            "targetFloorId",
                            e.target.value,
                          )}
                      >
                        <option value="">-- Select Target Floor --</option>
                        {#each catalog as mapLevel}
                          <option value={mapLevel.id}
                            >{mapLevel.filename}</option
                          >
                        {/each}
                      </select>
                    </label>
                    <p
                      class="helper-text"
                      style="margin-top: 6px; font-size: 10px; color: #94a3b8;"
                    >
                      Placing an event will auto-generate paired stairs and safe
                      return spawns on both floors instantly.
                    </p>
                  {/if}
                </div>
              {/if}
            {/if}
          {:else if displayCategory === "audio"}
            <label>
              <span>Audio Track:</span>
              <select
                value={activeConf.track || ""}
                onchange={(e) =>
                  handlePropChange("audio", "track", e.target.value)}
              >
                <option value="">-- Select Track --</option>
                {#each Object.keys(mapStore.audioBlobs) as track}
                  <option value={track}>{track}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>Base Volume (%):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activeConf.volume ?? 100}
                  oninput={(e) =>
                    handlePropChange(
                      "audio",
                      "volume",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeConf.volume ?? 100}
                  onchange={(e) =>
                    handlePropChange(
                      "audio",
                      "volume",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label>
              <span>Max Range (Fade to 0%):</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={activeConf.radius ?? 5}
                onchange={(e) =>
                  handlePropChange(
                    "audio",
                    "radius",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Inner Core (100% Volume):</span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={activeConf.inner_radius ?? 2.5}
                onchange={(e) =>
                  handlePropChange(
                    "audio",
                    "inner_radius",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={activeConf.muffledByWalls ?? true}
                onchange={(e) =>
                  handlePropChange("audio", "muffledByWalls", e.target.checked)}
              />
              <span>Muffled by Walls (Occlusion)</span>
            </label>
          {:else if displayCategory === "emitter"}
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={activeConf.isGlobal || false}
                onchange={(e) =>
                  handlePropChange("emitter", "isGlobal", e.target.checked)}
              />
              <span>Map-Wide (Global Emitter)</span>
            </label>
            <label>
              <span>Emitter Category:</span>
              <select
                value={activeConf.type || "weather"}
                onchange={(e) =>
                  handlePropChange("emitter", "type", e.target.value)}
              >
                <option value="weather">Weather</option>
                <option value="environment">Environment (Fire, Smoke)</option>
                <option value="magic">Magic / Spells</option>
                <option value="custom">Custom Particle</option>
              </select>
            </label>
            {#if activeConf.type === "weather"}
              <label>
                <span>Weather Style:</span>
                <select
                  value={activeConf.style || "rain"}
                  onchange={(e) =>
                    handlePropChange("emitter", "style", e.target.value)}
                >
                  <option value="rain">Rain</option>
                  <option value="snow">Snow</option>
                  <option value="fog">Fog / Mist</option>
                  <option value="ash">Ash</option>
                </select>
              </label>
            {:else if activeConf.type === "custom"}
              <label>
                <span>Custom Graphic Asset (URL/Name):</span>
                <input
                  type="text"
                  value={activeConf.graphic || ""}
                  oninput={(e) =>
                    handlePropChange("emitter", "graphic", e.target.value)}
                  placeholder="e.g., sparks.png"
                />
              </label>
            {/if}
            <label>
              <span>Z-Axis Elevation:</span>
              <input
                type="number"
                step="0.5"
                value={activeConf.position?.z ?? 0}
                onchange={(e) =>
                  handlePropChange(
                    "emitter",
                    "position.z",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Z-Index Layering:</span>
              <select
                value={activeConf.layering || "above"}
                onchange={(e) =>
                  handlePropChange("emitter", "layering", e.target.value)}
              >
                <option value="above">Above Roofs & Tokens</option>
                <option value="below">Below Roofs & Tokens</option>
              </select>
            </label>
            {#if activeConf.type === "magic" || activeConf.type === "custom"}
              <label>
                <span>Particle Tint / Color:</span>
                <input
                  type="color"
                  value={activeConf.tint || "#ffffff"}
                  onchange={(e) =>
                    handlePropChange("emitter", "tint", e.target.value)}
                />
              </label>
            {/if}
            <label>
              <span>Particle Scale (%):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="10"
                  max="300"
                  value={activeConf.scale ?? 100}
                  oninput={(e) =>
                    handlePropChange(
                      "emitter",
                      "scale",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={activeConf.scale ?? 100}
                  onchange={(e) =>
                    handlePropChange(
                      "emitter",
                      "scale",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label>
              <span>Direction (Degrees):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={activeConf.direction ?? 180}
                  oninput={(e) =>
                    handlePropChange(
                      "emitter",
                      "direction",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={activeConf.direction ?? 180}
                  onchange={(e) =>
                    handlePropChange(
                      "emitter",
                      "direction",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label>
              <span>Speed:</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activeConf.speed ?? 50}
                  oninput={(e) =>
                    handlePropChange(
                      "emitter",
                      "speed",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeConf.speed ?? 50}
                  onchange={(e) =>
                    handlePropChange(
                      "emitter",
                      "speed",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label>
              <span>Intensity (Density):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activeConf.intensity ?? 50}
                  oninput={(e) =>
                    handlePropChange(
                      "emitter",
                      "intensity",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeConf.intensity ?? 50}
                  onchange={(e) =>
                    handlePropChange(
                      "emitter",
                      "intensity",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
            <label>
              <span>Variance (Fluctuation %):</span>
              <div class="slider-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activeConf.variance ?? 10}
                  oninput={(e) =>
                    handlePropChange(
                      "emitter",
                      "variance",
                      parseFloat(e.target.value),
                    )}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={activeConf.variance ?? 10}
                  onchange={(e) =>
                    handlePropChange(
                      "emitter",
                      "variance",
                      parseFloat(e.target.value),
                    )}
                />
              </div>
            </label>
          {:else}
            <p class="helper-text">
              Basic clone/translate capabilities active. Specific properties
              coming soon.
            </p>
          {/if}

          {#if selectedItems.length > 0}
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              {#if displayCategory === "wall" || displayCategory === "portal"}
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

  <!-- CAD STATUS BAR -->
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

  /* --- EXISTING TOOLBAR STYLES --- */
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
    width: 110px;
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

  .auto-match-panel {
    background: rgba(0, 240, 255, 0.05);
    border: 1px dashed rgba(0, 240, 255, 0.3);
    padding: 10px;
    border-radius: 6px;
    margin-top: 5px;
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

  .checkbox-row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
    cursor: pointer;
  }

  input[type="text"],
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

  input[type="checkbox"] {
    cursor: pointer;
    width: 14px;
    height: 14px;
    accent-color: #00f0ff;
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
    gap: 8px;
    transition: all 0.2s;
    font-size: 13px;
  }

  button:hover {
    background: #334155;
  }

  button.active {
    background: #00f0ff22;
    border-color: #00f0ff;
    color: #00f0ff;
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

  .action-btn.secure {
    background: #a855f722;
    border-color: #a855f7;
    color: #d8b4fe;
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
