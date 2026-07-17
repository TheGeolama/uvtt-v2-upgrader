<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let activeMap = $derived(mapStore.activeMap);
  let catalog = $derived(mapStore.catalog);
  let activeTool = $derived(mapStore.activeTool);
  let lightingPreview = $derived(mapStore.lightingPreview);
  let manifest = $derived(activeMap?.manifest);

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

        return null;
      })
      .filter(Boolean),
  );

  function selectTool(tool) {
    mapStore.setTool(tool);
  }

  function updateProperty(key, val) {
    if (selectedItems.length === 0 || val === "") return;
    selectedItems.forEach((item) => {
      mapStore.updateItemProperty(item.id, key, val);
    });
  }

  function triggerFileImport(e) {
    const file = e.target.files[0];
    if (file) mapStore.loadProjectFromFile(file);
    e.target.value = null;
  }
</script>

{#if activeMap}
  <div class="toolbar-wrapper">
    <div class="tool-selector">
      <div class="tool-group">
        <span class="group-label">📐 ARCHITECTURE</span>
        <button
          class:active={activeTool === "select"}
          onclick={() => selectTool("select")}
          aria-label="Selection Tool"><span>🔍</span> Select</button
        >
        <button
          class:active={activeTool === "wall"}
          onclick={() => selectTool("wall")}
          aria-label="Draw Walls"><span>🧱</span> Wall</button
        >
        <button
          class:active={activeTool === "portal"}
          onclick={() => selectTool("portal")}
          aria-label="Draw Portals"><span>🚪</span> Portal</button
        >
        <button
          class:active={activeTool === "roof"}
          onclick={() => selectTool("roof")}
          aria-label="Draw Roofs"><span>🌳</span> Roof</button
        >
      </div>

      <div class="tool-group">
        <span class="group-label">💡 ENTITIES</span>
        <button
          class:active={activeTool === "light"}
          onclick={() => selectTool("light")}
          aria-label="Place Lights"><span>💡</span> Light</button
        >
        <button
          class:active={activeTool === "audio"}
          onclick={() => selectTool("audio")}
          aria-label="Place Audio"><span>🎵</span> Audio</button
        >
        <button
          class:active={activeTool === "event"}
          onclick={() => selectTool("event")}
          aria-label="Place Event"><span>⚡</span> Event</button
        >
        <button
          class:active={activeTool === "spawn"}
          onclick={() => selectTool("spawn")}
          aria-label="Place Spawn"><span>🚩</span> Spawn</button
        >
        <button
          class:active={activeTool === "emitter"}
          onclick={() => selectTool("emitter")}
          aria-label="Place Emitter"><span>🌧️</span> Emitter</button
        >
      </div>

      <div class="tool-group">
        <span class="group-label">🌍 ENVIRONMENT</span>
        <button
          class:active={lightingPreview}
          onclick={() => mapStore.toggleLightingPreview()}
          aria-label="Toggle Lighting Preview"><span>🌓</span> Preview</button
        >
      </div>
    </div>

    <div class="properties-panel">
      {#if selectedItems.length === 0}
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
                }}>❌ Close</button
              >
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
          <p class="helper-text" style="margin-top: 5px;">
            Your work is continuously auto-saved to your browser's local cache.
          </p>
        </div>

        <div class="panel-section">
          <h3>🌍 ENVIRONMENT CONFIG</h3>
          {#if catalog.length > 1}
            <label>
              <span>📍 Level Switcher:</span>
              <select
                value={activeMap.id}
                onchange={(e) => mapStore.switchMap(e.target.value)}
              >
                {#each catalog as map}
                  <option value={map.id}>{map.filename}</option>
                {/each}
              </select>
            </label>
          {/if}
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

          <label>
            <span>Image X Offset:</span>
            <input
              type="number"
              value={manifest.resolution?.map_offset_x}
              onchange={(e) =>
                mapStore.updateItemProperty(
                  activeMap.id,
                  "resolution.map_offset_x",
                  parseFloat(e.target.value),
                )}
            />
          </label>
          <label>
            <span>Image Y Offset:</span>
            <input
              type="number"
              value={manifest.resolution?.map_offset_y}
              onchange={(e) =>
                mapStore.updateItemProperty(
                  activeMap.id,
                  "resolution.map_offset_y",
                  parseFloat(e.target.value),
                )}
            />
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
      {:else}
        {@const item = selectedItems[0]}
        <div class="panel-section">
          <h3>📝 {item.category.toUpperCase()} CONFIG</h3>

          {#if item.category === "wall"}
            <label>
              <span>Wall Collision Presets:</span>
              <select
                value={item.properties?.type || "standard"}
                onchange={(e) =>
                  updateProperty("properties.type", e.target.value)}
              >
                <option value="standard">Standard Solid Wall</option>
                <option value="terrain">Terrain Ridge</option>
                <option value="invisible">Invisible Block (Sight Only)</option>
              </select>
            </label>
          {:else if item.category === "portal"}
            <label>
              <span>Portal Architecture:</span>
              <select
                value={item.properties?.type || "door"}
                onchange={(e) =>
                  updateProperty("properties.type", e.target.value)}
              >
                <option value="door">Solid Door</option>
                <option value="window">Transparent Window</option>
                <option value="secret">Secret Door (Hidden)</option>
              </select>
            </label>
            <label>
              <span>Initial State:</span>
              <select
                value={item.properties?.state || "closed"}
                onchange={(e) =>
                  updateProperty("properties.state", e.target.value)}
              >
                <option value="closed">Closed (Blocks Movement)</option>
                <option value="open">Open (Passable)</option>
                <option value="locked">Locked</option>
                <option value="broken">Broken (Passable/Lets Light In)</option>
              </select>
            </label>
          {:else if item.category === "light"}
            <label>
              <span>Lighting Projection Type:</span>
              <select
                value={item.type || "point"}
                onchange={(e) => updateProperty("type", e.target.value)}
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
                value={item.position?.z ?? 0}
                onchange={(e) =>
                  updateProperty("position.z", parseFloat(e.target.value))}
              />
            </label>
            <label>
              <span>Hex Color:</span>
              <input
                type="color"
                value={item.properties?.color || "#ffffff"}
                onchange={(e) =>
                  updateProperty("properties.color", e.target.value)}
              />
            </label>
            <label>
              <span>Intensity:</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5.0"
                value={item.properties?.intensity ?? 1.0}
                onchange={(e) =>
                  updateProperty(
                    "properties.intensity",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Decay Model:</span>
              <select
                value={item.properties?.decay_model || "inverse_square"}
                onchange={(e) =>
                  updateProperty("properties.decay_model", e.target.value)}
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
                value={item.properties?.radius?.bright ?? 5}
                onchange={(e) =>
                  updateProperty(
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
                value={item.properties?.radius?.dim ?? 10}
                onchange={(e) =>
                  updateProperty(
                    "properties.radius.dim",
                    parseFloat(e.target.value),
                  )}
              />
            </label>

            <label>
              <span>Animation Profile:</span>
              <select
                value={item.properties?.animation?.profile || "none"}
                onchange={(e) =>
                  updateProperty(
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
            {#if item.properties?.animation?.profile !== "none"}
              <div style="display: flex; gap: 8px;">
                <label style="flex: 1; min-width: 0;">
                  <span>Speed:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={item.properties?.animation?.speed ?? 0.5}
                    onchange={(e) =>
                      updateProperty(
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
                    value={item.properties?.animation?.intensity_variance ??
                      0.2}
                    onchange={(e) =>
                      updateProperty(
                        "properties.animation.intensity_variance",
                        parseFloat(e.target.value),
                      )}
                  />
                </label>
              </div>
            {/if}

            {#if item.type === "directional"}
              <label>
                <span>Beam Rotation (Degrees):</span>
                <div class="slider-row">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={item.properties?.rotation || 0}
                    oninput={(e) =>
                      updateProperty(
                        "properties.rotation",
                        parseFloat(e.target.value),
                      )}
                  />
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={item.properties?.rotation || 0}
                    onchange={(e) =>
                      updateProperty(
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
                    value={item.properties?.cone_angle || 60}
                    oninput={(e) =>
                      updateProperty(
                        "properties.cone_angle",
                        parseFloat(e.target.value),
                      )}
                  />
                  <input
                    type="number"
                    min="10"
                    max="360"
                    value={item.properties?.cone_angle || 60}
                    onchange={(e) =>
                      updateProperty(
                        "properties.cone_angle",
                        parseFloat(e.target.value),
                      )}
                  />
                </div>
              </label>
            {/if}
          {:else if item.category === "spawn"}
            <label>
              <span>Spawn Point Name:</span>
              <input
                type="text"
                value={item.name || "New Spawn"}
                oninput={(e) => updateProperty("name", e.target.value)}
              />
            </label>
            <label>
              <span>Footprint Shape:</span>
              <select
                value={item.shape || "circle"}
                onchange={(e) => updateProperty("shape", e.target.value)}
              >
                <option value="circle">Circle (1 Grid Tile)</option>
                <option value="rectangle">Square (1 Grid Tile)</option>
              </select>
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={item.is_default || false}
                onchange={(e) => updateProperty("is_default", e.target.checked)}
              />
              <span>Set as Default Landing Zone</span>
            </label>
          {:else if item.category === "event"}
            <label>
              <span>Event Name:</span>
              <input
                type="text"
                value={item.name || "New Event"}
                oninput={(e) => updateProperty("name", e.target.value)}
              />
            </label>
            <label>
              <span>Trigger Radius (Grid Tiles):</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={item.trigger_bounds?.radius || 0.5}
                onchange={(e) =>
                  updateProperty(
                    "trigger_bounds.radius",
                    parseFloat(e.target.value),
                  )}
              />
            </label>
            <label>
              <span>Event Type:</span>
              <select
                value={item.eventType || "Trap/Door Trigger"}
                onchange={(e) => updateProperty("eventType", e.target.value)}
              >
                <option value="Trap/Door Trigger">Trap/Door Trigger</option>
                <option value="Teleport">Teleport</option>
                <option value="Stairs/Ladder">Stairs/Ladder</option>
              </select>
            </label>
            {#if item.eventType === "Teleport" || item.eventType === "Stairs/Ladder"}
              <label>
                <span>Destination (Spawn Point):</span>
                <select
                  value={item.targetSpawnId || ""}
                  onchange={(e) =>
                    updateProperty("targetSpawnId", e.target.value)}
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
            {/if}
          {:else if item.category === "audio"}
            <label>
              <span>Audio Track:</span>
              <select
                value={item.track || ""}
                onchange={(e) => updateProperty("track", e.target.value)}
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
                  value={item.volume ?? 100}
                  oninput={(e) =>
                    updateProperty("volume", parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.volume ?? 100}
                  onchange={(e) =>
                    updateProperty("volume", parseFloat(e.target.value))}
                />
              </div>
            </label>
            <label>
              <span>Max Range (Fade to 0%):</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={item.radius || 5}
                onchange={(e) =>
                  updateProperty("radius", parseFloat(e.target.value))}
              />
            </label>
            <label>
              <span>Inner Core (100% Volume):</span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={item.inner_radius ?? 2.5}
                onchange={(e) =>
                  updateProperty("inner_radius", parseFloat(e.target.value))}
              />
            </label>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={item.muffledByWalls ?? true}
                onchange={(e) =>
                  updateProperty("muffledByWalls", e.target.checked)}
              />
              <span>Muffled by Walls (Occlusion)</span>
            </label>
          {:else if item.category === "emitter"}
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={item.isGlobal ?? false}
                onchange={(e) => updateProperty("isGlobal", e.target.checked)}
              />
              <span>Map-Wide (Global Emitter)</span>
            </label>
            <label>
              <span>Emitter Category:</span>
              <select
                value={item.type || "weather"}
                onchange={(e) => updateProperty("type", e.target.value)}
              >
                <option value="weather">Weather</option>
                <option value="environment">Environment (Fire, Smoke)</option>
                <option value="magic">Magic / Spells</option>
                <option value="custom">Custom Particle</option>
              </select>
            </label>
            {#if item.type === "weather"}
              <label>
                <span>Weather Style:</span>
                <select
                  value={item.style || "rain"}
                  onchange={(e) => updateProperty("style", e.target.value)}
                >
                  <option value="rain">Rain</option>
                  <option value="snow">Snow</option>
                  <option value="fog">Fog / Mist</option>
                  <option value="ash">Ash</option>
                </select>
              </label>
            {:else if item.type === "custom"}
              <label>
                <span>Custom Graphic Asset (URL/Name):</span>
                <input
                  type="text"
                  value={item.graphic || ""}
                  oninput={(e) => updateProperty("graphic", e.target.value)}
                  placeholder="e.g., sparks.png"
                />
              </label>
            {/if}
            <label>
              <span>Z-Axis Elevation:</span>
              <input
                type="number"
                step="0.5"
                value={item.position?.z ?? 0}
                onchange={(e) =>
                  updateProperty("position.z", parseFloat(e.target.value))}
              />
            </label>
            <label>
              <span>Z-Index Layering:</span>
              <select
                value={item.layering || "above"}
                onchange={(e) => updateProperty("layering", e.target.value)}
              >
                <option value="above">Above Roofs & Tokens</option>
                <option value="below">Below Roofs & Tokens</option>
              </select>
            </label>
            {#if item.type === "magic" || item.type === "custom"}
              <label>
                <span>Particle Tint / Color:</span>
                <input
                  type="color"
                  value={item.tint || "#ffffff"}
                  onchange={(e) => updateProperty("tint", e.target.value)}
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
                  value={item.scale ?? 100}
                  oninput={(e) =>
                    updateProperty("scale", parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={item.scale ?? 100}
                  onchange={(e) =>
                    updateProperty("scale", parseFloat(e.target.value))}
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
                  value={item.direction ?? 180}
                  oninput={(e) =>
                    updateProperty("direction", parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={item.direction ?? 180}
                  onchange={(e) =>
                    updateProperty("direction", parseFloat(e.target.value))}
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
                  value={item.speed ?? 50}
                  oninput={(e) =>
                    updateProperty("speed", parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.speed ?? 50}
                  onchange={(e) =>
                    updateProperty("speed", parseFloat(e.target.value))}
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
                  value={item.intensity ?? 50}
                  oninput={(e) =>
                    updateProperty("intensity", parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.intensity ?? 50}
                  onchange={(e) =>
                    updateProperty("intensity", parseFloat(e.target.value))}
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
                  value={item.variance ?? 10}
                  oninput={(e) =>
                    updateProperty("variance", parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.variance ?? 10}
                  onchange={(e) =>
                    updateProperty("variance", parseFloat(e.target.value))}
                />
              </div>
            </label>
          {:else}
            <p class="helper-text">
              Basic clone/translate capabilities active. Specific properties
              coming soon.
            </p>
          {/if}

          <div style="display: flex; gap: 8px; margin-top: 10px;">
            {#if item.category === "wall" || item.category === "portal"}
              <button
                class="action-btn"
                onclick={() => mapStore.convertCategory(item.id)}
                >🔄 Convert</button
              >
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
        </div>
      {/if}

      {#if activeTool === "wall" || activeTool === "portal" || activeTool === "roof"}
        <div class="panel-section drafting-mode">
          <p class="helper-text">
            <b>Left-Click</b> points to draw.<br />Hold <b>Shift</b> to bypass
            grid snap.<br /><b>Right-Click</b> or <b>Enter</b> to finish.
          </p>
        </div>
      {/if}
      {#if activeTool === "select"}
        <div class="panel-section drafting-mode">
          <p class="helper-text">
            Use <b>Ctrl+C</b> to copy, <b>Ctrl+V</b> to paste at cursor, or
            <b>Ctrl+D</b> to clone.
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
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

  .drafting-mode {
    background: rgba(0, 240, 255, 0.05);
    padding: 10px;
    border: 1px dashed rgba(0, 240, 255, 0.2);
    border-radius: 6px;
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
</style>
