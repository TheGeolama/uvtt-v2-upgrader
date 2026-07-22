<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let activeMap = $derived(mapStore.activeMap);
  let manifest = $derived(activeMap?.manifest);
</script>

<div
  class="panel-section"
  style="border-color: rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.02);"
>
  <h3 style="color: #22c55e;">📐 GRID RUBBER SHEETING</h3>

  <div
    style="margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"
  >
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
    >
      Grid X (DPI)
      <input
        type="number"
        step="0.1"
        value={manifest?.resolution?.pixels_per_grid || 70}
        onchange={(e) =>
          mapStore.updateManualGrid(
            parseFloat(e.target.value),
            null,
            null,
            null,
          )}
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
      />
    </label>
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
    >
      Grid Y (DPI)
      <input
        type="number"
        step="0.1"
        value={manifest?.resolution?.pixels_per_grid_y ||
          manifest?.resolution?.pixels_per_grid ||
          70}
        onchange={(e) =>
          mapStore.updateManualGrid(
            null,
            parseFloat(e.target.value),
            null,
            null,
          )}
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
      />
    </label>
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
    >
      X Offset (px)
      <input
        type="number"
        step="0.5"
        value={manifest?.resolution?.map_offset_x || 0}
        onchange={(e) =>
          mapStore.updateManualGrid(
            null,
            null,
            parseFloat(e.target.value),
            null,
          )}
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
      />
    </label>
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
    >
      Y Offset (px)
      <input
        type="number"
        step="0.5"
        value={manifest?.resolution?.map_offset_y || 0}
        onchange={(e) =>
          mapStore.updateManualGrid(
            null,
            null,
            null,
            parseFloat(e.target.value),
          )}
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
      />
    </label>
  </div>

  <p
    class="helper-text"
    style="margin-bottom: 12px; font-size: 12px; line-height: 1.4;"
  >
    <strong>1. Pin Origin:</strong> Click on the top-left intersection of a map
    square to lock the origin.<br /><br />
    <strong>2. Scale:</strong> Adjust the DPI inputs above to stretch the grid
    away from your pin.<br /><br />
    <strong>Or Auto-Align:</strong> Drag green boxes over 1x1 map squares.
  </p>

  <div
    style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;"
  >
    <div style="display: flex; gap: 4px;">
      <button
        class="action-btn"
        style="flex: 1; justify-content: center;"
        onclick={() => mapStore.stepGridOffset(1, 0)}>➡ Step +X</button
      >
      <button
        class="action-btn"
        style="flex: 1; justify-content: center;"
        onclick={() => mapStore.stepGridOffset(-1, 0)}>⬅ Step -X</button
      >
    </div>
    <div style="display: flex; gap: 4px;">
      <button
        class="action-btn"
        style="flex: 1; justify-content: center;"
        onclick={() => mapStore.stepGridOffset(0, 1)}>⬇ Step +Y</button
      >
      <button
        class="action-btn"
        style="flex: 1; justify-content: center;"
        onclick={() => mapStore.stepGridOffset(0, -1)}>⬆ Step -Y</button
      >
    </div>
  </div>

  <div style="display: flex; flex-direction: column; gap: 8px;">
    <button
      class="action-btn wave"
      style="justify-content: center; font-weight: bold; border-color: #22c55e; color: #22c55e;"
      onclick={() => mapStore.calculateGridAlignment()}
      disabled={mapStore.gridAlignBoxes.length === 0}
    >
      ✅ Apply Best Fit Grid
    </button>
    <button
      class="action-btn"
      style="justify-content: center;"
      onclick={() => mapStore.clearGridAlignment()}
      disabled={mapStore.gridAlignBoxes.length === 0}
    >
      🗑️ Clear Drawn Boxes
    </button>
  </div>
</div>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    color: #00f0ff;
    text-transform: uppercase;
  }
  .helper-text {
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.4;
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
  }
  button:hover:not(:disabled) {
    background: #334155;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .action-btn {
    flex: 1;
    font-size: 12px;
    padding: 8px;
    justify-content: center;
  }
  .action-btn.wave {
    background: #3b82f622;
    border-color: #3b82f6;
    color: #93c5fd;
  }
</style>
