<!-- 
  @component GeometryPanel
  Handles the Sidebar UI configuration for map geometry tools (Walls, Portals, Roofs).
  Provides dynamic control inputs based on the currently selected item or the default 
  tool settings if nothing is selected.
-->
<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * Universal dispatcher for applying property updates.
   * If items are actively selected on the canvas, the change is applied to all of them.
   * If nothing is selected, the change updates the "future default" for the active tool.
   *
   * @param {string} category - "wall", "portal", or "roof"
   * @param {string} keyPath - Dot notation path for nested objects (e.g. "properties.bottom")
   * @param {any} value - The new value to apply
   */
  function handlePropChange(category, keyPath, value) {
    if (mapStore.selectedItemIds.length > 0) {
      mapStore.selectedItemIds.forEach((id) =>
        mapStore.updateItemProperty(id, keyPath, value),
      );
    } else {
      mapStore.updateDefaultSetting(category, keyPath, value);
    }
  }

  /**
   * Scans the mapStore to determine what UI context should be rendered.
   * Returns an object { cat: string, data: object } containing the item properties.
   */
  function getSelectionContext() {
    const ids = mapStore.selectedItemIds;
    const tool = mapStore.activeTool;

    // Fallback to default tool settings if canvas is empty
    if (!ids || ids.length === 0)
      return { cat: tool, data: mapStore.defaultSettings[tool] || {} };

    const id = ids[0];
    const m = mapStore.activeMap?.manifest;
    if (!m) return { cat: tool, data: {} };

    let item;
    if ((item = m.geometry?.walls?.find((i) => i.id === id)))
      return { cat: "wall", data: item };
    if ((item = m.geometry?.portals?.find((i) => i.id === id)))
      return { cat: "portal", data: item };
    if ((item = m.geometry?.overhead?.find((i) => i.id === id)))
      return { cat: "roof", data: item };

    return { cat: tool, data: mapStore.defaultSettings[tool] || {} };
  }

  // Reactive derivations bound to the mapStore trigger
  let ctx = $derived.by(() => {
    let _ = mapStore.updateTrigger;
    return getSelectionContext();
  });

  let displayCategory = $derived(ctx.cat);
  let activeConf = $derived(ctx.data);
</script>

{#if displayCategory === "wall"}
  {@const hasWallSelected = mapStore.selectedItemIds.length > 0}
  {@const pointCount = activeConf.path ? activeConf.path.length : 0}
  {@const canSmooth = pointCount >= 3}

  <!-- 
    ITERATIVE BEZIER ACTION BUTTON 
    Functions identically to a 3D Subdivision Surface tool (SubD). 
    Clicking it recursively runs Chaikin's corner-cutting algorithm via mapStore.smoothSelectedWalls().
  -->
  <div
    style="margin-bottom: 12px; background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.2); padding: 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;"
  >
    <button
      style="background: #0ea5e9; color: #fff; border: none; border-radius: 4px; padding: 8px; font-size: 12px; font-weight: bold; cursor: {!hasWallSelected ||
      !canSmooth
        ? 'not-allowed'
        : 'pointer'}; opacity: {!hasWallSelected || !canSmooth
        ? 0.5
        : 1}; transition: background 0.2s;"
      disabled={!hasWallSelected || !canSmooth}
      onmouseover={(e) => {
        if (hasWallSelected && canSmooth) e.target.style.background = "#0284c7";
      }}
      onmouseout={(e) => {
        if (hasWallSelected && canSmooth) e.target.style.background = "#0ea5e9";
      }}
      onclick={() => {
        handlePropChange("wall", "isBezier", true);
        mapStore.smoothSelectedWalls();
        mapStore.updateTrigger++;
      }}
    >
      〰️ Apply Smoothing Pass
    </button>

    {#if !hasWallSelected}
      <p
        style="font-size: 11px; font-style: italic; color: #94a3b8; margin: 0; line-height: 1.4;"
      >
        Select an existing wall to apply smoothing.
      </p>
    {:else if !canSmooth}
      <p
        style="font-size: 11px; font-style: italic; color: #ef4444; margin: 0; line-height: 1.4;"
      >
        ⚠️ Curves require a wall with at least 3 points.
      </p>
    {:else}
      <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.4;">
        Click to subdivide and smooth. Adjust points, then click again to
        refine!
      </p>
    {/if}
  </div>

  <label>
    <span>Wall Collision Presets:</span>
    <select
      onchange={(e) =>
        handlePropChange("wall", "properties.type", e.target.value)}
    >
      <option
        value="standard"
        selected={activeConf.properties?.type !== "terrain" &&
          activeConf.properties?.type !== "invisible"}
        >Standard Solid Wall</option
      >
      <option
        value="terrain"
        selected={activeConf.properties?.type === "terrain"}
        >Terrain Ridge</option
      >
      <option
        value="invisible"
        selected={activeConf.properties?.type === "invisible"}
        >Invisible Block (Sight Only)</option
      >
    </select>
  </label>
  <label>
    <span>Directional Blocking (Line-of-Sight):</span>
    <select
      onchange={(e) =>
        handlePropChange("wall", "properties.directional_mode", e.target.value)}
    >
      <option
        value="two_way"
        selected={activeConf.properties?.directional_mode !== "one_way_lr" &&
          activeConf.properties?.directional_mode !== "one_way_rl"}
        >Two-Way (Blocks Both Directions)</option
      >
      <option
        value="one_way_lr"
        selected={activeConf.properties?.directional_mode === "one_way_lr"}
        >One-Way (Blocks Left-to-Right)</option
      >
      <option
        value="one_way_rl"
        selected={activeConf.properties?.directional_mode === "one_way_rl"}
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
{:else if displayCategory === "portal"}
  <label>
    <span>Portal Architecture:</span>
    <select
      onchange={(e) =>
        handlePropChange("portal", "properties.type", e.target.value)}
    >
      <option
        value="door"
        selected={activeConf.properties?.type !== "window" &&
          activeConf.properties?.type !== "secret"}>Solid Door</option
      >
      <option value="window" selected={activeConf.properties?.type === "window"}
        >Transparent Window</option
      >
      <option value="secret" selected={activeConf.properties?.type === "secret"}
        >Secret Door (Hidden)</option
      >
    </select>
  </label>
  <label>
    <span>Initial State:</span>
    <select
      onchange={(e) =>
        handlePropChange("portal", "properties.state", e.target.value)}
    >
      <option
        value="closed"
        selected={activeConf.properties?.state !== "open" &&
          activeConf.properties?.state !== "locked" &&
          activeConf.properties?.state !== "broken"}
        >Closed (Blocks Movement)</option
      >
      <option value="open" selected={activeConf.properties?.state === "open"}
        >Open (Passable)</option
      >
      <option
        value="locked"
        selected={activeConf.properties?.state === "locked"}>Locked</option
      >
      <option
        value="broken"
        selected={activeConf.properties?.state === "broken"}
        >Broken (Passable/Lets Light In)</option
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
    <div class="slider-row" style="display: flex; gap: 8px;">
      <input
        type="range"
        min="10"
        max="100"
        style="flex: 1; accent-color: #00f0ff;"
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
        style="width: 50px; text-align: center;"
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
  <label
    style="display: flex; flex-direction: row; align-items: center; gap: 8px; margin-top: 5px; cursor: pointer;"
  >
    <input
      type="checkbox"
      style="cursor: pointer; width: 14px; height: 14px; accent-color: #00f0ff;"
      checked={activeConf.properties?.hidden || false}
      onchange={(e) =>
        handlePropChange("roof", "properties.hidden", e.target.checked)}
    />
    <span>Hidden from Players</span>
  </label>
{/if}

<style>
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 10px;
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
