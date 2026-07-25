<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  function handlePropChange(category, keyPath, value) {
    if (mapStore.selectedItemIds.length > 0) {
      mapStore.selectedItemIds.forEach((id) =>
        mapStore.updateItemProperty(id, keyPath, value),
      );
    } else {
      mapStore.updateDefaultSetting(category, keyPath, value);
    }
  }

  function getSelectionContext() {
    const ids = mapStore.selectedItemIds;
    const tool = mapStore.activeTool;
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

  <!-- BULLETPROOF BEZIER CHECKBOX -->
  <div
    style="margin-bottom: 12px; background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.2); padding: 10px; border-radius: 6px;"
  >
    <label
      style="display: flex; flex-direction: row; align-items: center; gap: 8px; margin: 0; cursor: {!hasWallSelected ||
      !canSmooth
        ? 'not-allowed'
        : 'pointer'}; opacity: {!hasWallSelected || !canSmooth ? 0.5 : 1};"
    >
      <input
        type="checkbox"
        style="cursor: pointer; width: 14px; height: 14px; accent-color: #00f0ff;"
        checked={!!activeConf.isBezier}
        disabled={!hasWallSelected || !canSmooth}
        onchange={(e) => {
          if (e.target.checked) {
            handlePropChange("wall", "isBezier", true);
            mapStore.smoothSelectedWalls();
          } else {
            handlePropChange("wall", "isBezier", false);
          }
          // FORCE PIXIJS CANVAS TO IMMEDIATELY RE-RENDER
          mapStore.updateTrigger++;
          mapStore.redrawTick++;
        }}
      />
      <span style="color: #00f0ff; font-weight: bold; font-size: 12px;"
        >Smooth Path (Bezier Curve)</span
      >
    </label>

    {#if !hasWallSelected}
      <p
        style="font-size: 11px; font-style: italic; color: #94a3b8; margin: 6px 0 0 0; line-height: 1.4;"
      >
        Select an existing wall to apply smoothing.
      </p>
    {:else if !canSmooth}
      <p
        style="font-size: 11px; font-style: italic; color: #ef4444; margin: 6px 0 0 0; line-height: 1.4;"
      >
        ⚠️ Curves require a wall with at least 3 points.
      </p>
    {:else}
      <p
        style="font-size: 11px; color: #94a3b8; margin: 6px 0 0 0; line-height: 1.4;"
      >
        Applies a cubic Bezier smoothing algorithm.
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
