<!-- 
  @component EventPanel
  The dedicated property inspector for Interactive Events.
  Includes advanced interactive wiring UI for binding logic triggers to target entities
  and establishing multi-level teleportation routes.
-->
<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * Dispatches property updates to the central map store.
   * If items are actively selected, it applies the change to all selected items.
   * Otherwise, it updates the default settings blueprint for the active placement tool.
   *
   * @param {string} keyPath - The dot-notation JSON path pointing to the specific property.
   * @param {any} value - The new value to apply.
   */
  function handlePropChange(keyPath, value) {
    if (mapStore.selectedItemIds.length > 0) {
      mapStore.selectedItemIds.forEach((id) =>
        mapStore.updateItemProperty(id, keyPath, value),
      );
    } else {
      mapStore.updateDefaultSetting("event", keyPath, value);
    }
  }

  /**
   * Determines the data context for the property panel by scanning the active map manifest.
   * Optimized specifically to fetch Event logic.
   */
  function getSelectionContext() {
    const ids = mapStore.selectedItemIds;

    // Fallback to the active tool's default settings if nothing is selected
    if (!ids || ids.length === 0) {
      return mapStore.defaultSettings.event || {};
    }

    const id = ids[0];
    const m = mapStore.activeMap?.manifest;
    if (!m) return {};

    const eventItem = m.entities?.events?.find((i) => i.id === id);
    if (eventItem) return eventItem;

    return mapStore.defaultSettings.event || {};
  }

  // --- SVELTE 5 REACTIVE BINDINGS ---
  let activeConf = $derived.by(() => {
    let _ = mapStore.updateTrigger; // Hooks into the mapStore's manual update trigger
    return getSelectionContext();
  });
</script>

<label>
  <span>Event Name:</span>
  <input
    type="text"
    value={activeConf.name || "New Event"}
    oninput={(e) => handlePropChange("name", e.target.value)}
  />
</label>

<label>
  <span>Event Type:</span>
  <select
    value={activeConf.eventType || "State Toggle"}
    onchange={(e) => handlePropChange("eventType", e.target.value)}
  >
    <option value="State Toggle">State Toggle (Doors/Lights)</option>
    <option value="Teleport">Teleport</option>
    <option value="Stairs/Ladder">Stairs / Ladder</option>
    <option value="Audio Trigger">Audio Trigger</option>
  </select>
</label>

<label>
  <span>Activation Method:</span>
  <select
    value={activeConf.activation || "proximity"}
    onchange={(e) => handlePropChange("activation", e.target.value)}
  >
    <option value="proximity">Proximity (Enter Zone)</option>
    <option value="click">Manual Click</option>
  </select>
</label>

<!-- ========================================== -->
<!-- EVENT: WIRING TARGETS LOGIC                -->
<!-- ========================================== -->
{#if activeConf.eventType === "State Toggle" || activeConf.eventType === "Audio Trigger"}
  <label>
    <span>Target Action:</span>
    <select
      value={activeConf.target_action || "toggle_visibility"}
      onchange={(e) => handlePropChange("target_action", e.target.value)}
    >
      <option value="toggle_visibility">Toggle Visibility</option>
      <option value="enable_event">Enable / Disable Event</option>
      <option value="open_close">Open / Close (Doors)</option>
      <option value="lock_unlock">Lock / Unlock</option>
      <option value="turn_on_off">Turn On / Off (Lights)</option>
      <option value="play_stop">Play / Stop (Audio)</option>
    </select>
  </label>

  <div class="routing-box">
    <span class="routing-title">Wire Targets</span>
    <p class="helper-text">
      Currently Bound: <strong style="color:#00f0ff;"
        >{activeConf.target_entity_ids?.length || 0}</strong
      > entities
    </p>

    {#if mapStore.selectedItemIds.length > 1}
      <button
        class="wire-btn"
        onclick={() => {
          const targets = mapStore.selectedItemIds.filter(
            (id) => id !== activeConf.id,
          );
          handlePropChange("target_entity_ids", targets);
        }}
      >
        🔗 Bind {mapStore.selectedItemIds.length - 1} Selected Entities
      </button>
    {:else}
      <p class="helper-text" style="font-style: italic; margin-top: 4px;">
        Shift-click other entities (lights, doors, props) while this event is
        selected to bind them.
      </p>
    {/if}

    {#if activeConf.target_entity_ids?.length > 0}
      <button
        class="clear-btn"
        onclick={() => handlePropChange("target_entity_ids", [])}
        >❌ Clear Targets</button
      >
    {/if}
  </div>
{/if}

<!-- ========================================== -->
<!-- EVENT: TELEPORT ROUTING LOGIC              -->
<!-- ========================================== -->
{#if activeConf.eventType === "Teleport" || activeConf.eventType === "Stairs/Ladder"}
  {@const targetLevel = mapStore.catalog.find(
    (m) => m.id === (activeConf.targetFloorId || mapStore.activeMapId),
  )}

  {#if mapStore.selectedItemIds.length === 0}
    <label class="checkbox-row">
      <input
        type="checkbox"
        checked={activeConf.autoCreateMatch || false}
        onchange={(e) => handlePropChange("autoCreateMatch", e.target.checked)}
      />
      <span>Auto-Create Reciprocal Return Link</span>
    </label>
  {/if}

  <div class="routing-box">
    <span class="routing-title">Destination Routing</span>
    <label>
      <span>Target Map/Floor:</span>
      <select
        value={activeConf.targetFloorId || mapStore.activeMapId}
        onchange={(e) => {
          handlePropChange("targetFloorId", e.target.value);
          // Reset the spawn selection when the map level changes
          handlePropChange("targetSpawnId", "");
        }}
      >
        {#each mapStore.catalog as level}
          <option value={level.id}>{level.filename || "Unnamed Level"}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Target Landing Zone:</span>
      <select
        value={activeConf.targetSpawnId || ""}
        onchange={(e) => handlePropChange("targetSpawnId", e.target.value)}
      >
        <option value="">-- Select Spawn --</option>
        {#each targetLevel?.manifest?.entities?.landing_zones || [] as spawn}
          <option value={spawn.id}>{spawn.name || "Unnamed Spawn"}</option>
        {/each}
      </select>
    </label>
  </div>
{/if}

<style>
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 8px;
  }
  .checkbox-row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
    cursor: pointer;
  }
  input[type="text"],
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
  .helper-text {
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.4;
  }

  /* Routing UI Styles */
  .routing-box {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 10px;
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .routing-title {
    font-size: 12px;
    font-weight: bold;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .wire-btn {
    background: #0ea5e9;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 8px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
  }
  .wire-btn:hover {
    background: #0284c7;
  }
  .clear-btn {
    background: transparent;
    color: #ef4444;
    border: 1px solid #ef4444;
    border-radius: 4px;
    padding: 6px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 4px;
  }
  .clear-btn:hover {
    background: rgba(239, 68, 68, 0.1);
  }
</style>
