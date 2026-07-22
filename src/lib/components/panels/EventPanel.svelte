<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  // Derive all our state natively inside the component instead of using {@const} in the markup
  let selectedEventId = $derived(
    mapStore.selectedItemIds.length === 1 ? mapStore.selectedItemIds[0] : null,
  );
  let evt = $derived(
    selectedEventId
      ? (mapStore.activeMap?.manifest?.entities?.events || []).find(
          (e) => e.id === selectedEventId,
        )
      : null,
  );

  let evtName = $derived(
    evt ? evt.name || "" : mapStore.defaultSettings.event.name || "",
  );
  let evtType = $derived(
    evt ? evt.eventType : mapStore.defaultSettings.event.eventType,
  );
  let evtWidth = $derived(evt ? evt.trigger_bounds?.width || 1 : 1);
  let evtHeight = $derived(evt ? evt.trigger_bounds?.height || 1 : 1);
  let evtAction = $derived(
    evt ? evt.target_action : mapStore.defaultSettings.event.target_action,
  );
  let evtTargets = $derived(
    evt
      ? evt.target_entity_ids || []
      : mapStore.defaultSettings.event.target_entity_ids || [],
  );
  let evtFloor = $derived(
    evt ? evt.targetFloorId : mapStore.defaultSettings.event.targetFloorId,
  );
  let evtSpawn = $derived(
    evt ? evt.targetSpawnId : mapStore.defaultSettings.event.targetSpawnId,
  );
  let evtAuto = $derived(
    evt ? evt.autoCreateMatch : mapStore.defaultSettings.event.autoCreateMatch,
  );
</script>

<div
  class="panel-section"
  style="border-color: rgba(168, 85, 247, 0.4); background: rgba(168, 85, 247, 0.02);"
>
  <h3 style="color: #a855f7;">📝 EVENT CONFIG</h3>

  <label
    style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;"
  >
    Event Name
    <input
      type="text"
      placeholder="e.g., Hidden Spike Trap"
      style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px; width: 100%; box-sizing: border-box;"
      value={evtName}
      onchange={(e) => {
        if (evt) mapStore.updateItemProperty(evt.id, "name", e.target.value);
        else mapStore.updateDefaultSetting("event", "name", e.target.value);
      }}
    />
  </label>

  <div
    style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;"
  >
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
    >
      Width (X)
      <input
        type="number"
        step="0.5"
        min="0.1"
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
        value={evtWidth}
        onchange={(e) => {
          if (evt)
            mapStore.updateItemProperty(
              evt.id,
              "trigger_bounds.width",
              Number(e.target.value),
            );
        }}
      />
    </label>
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
    >
      Height (Y)
      <input
        type="number"
        step="0.5"
        min="0.1"
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
        value={evtHeight}
        onchange={(e) => {
          if (evt)
            mapStore.updateItemProperty(
              evt.id,
              "trigger_bounds.height",
              Number(e.target.value),
            );
        }}
      />
    </label>
  </div>

  <label
    style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px;"
  >
    Trigger Type
    <select
      style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px; width: 100%; box-sizing: border-box;"
      value={evtType}
      onchange={(e) => {
        if (evt)
          mapStore.updateItemProperty(evt.id, "eventType", e.target.value);
        else
          mapStore.updateDefaultSetting("event", "eventType", e.target.value);
      }}
    >
      <option value="Trap/Door Trigger">Trap/Door Trigger</option>
      <option value="Teleport">Teleport</option>
      <option value="Stairs/Ladder">Stairs/Ladder</option>
      <option value="State Toggle">State Toggle (Reveal/Hide/Open)</option>
    </select>
  </label>

  {#if evtType === "State Toggle"}
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;"
    >
      Target Action
      <select
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
        value={evtAction}
        onchange={(e) => {
          if (evt)
            mapStore.updateItemProperty(
              evt.id,
              "target_action",
              e.target.value,
            );
          else
            mapStore.updateDefaultSetting(
              "event",
              "target_action",
              e.target.value,
            );
        }}
      >
        <option value="toggle_visibility"
          >Toggle Visibility (GM Only ↔ Visible)</option
        >
        <option value="set_visible">Force Reveal (Set Visible)</option>
        <option value="set_hidden">Force Hide (Set GM Only)</option>
        <option value="toggle_portal">Toggle Door/Window (Open/Close)</option>
      </select>
    </label>

    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;"
    >
      Target Entities (Hold Ctrl/Cmd to Multi-Select)
      <select
        multiple
        value={evtTargets}
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px; height: 110px;"
        onchange={(e) => {
          const selectedOptions = Array.from(e.target.selectedOptions).map(
            (opt) => opt.value,
          );
          if (evt)
            mapStore.updateItemProperty(
              evt.id,
              "target_entity_ids",
              selectedOptions,
            );
          else
            mapStore.updateDefaultSetting(
              "event",
              "target_entity_ids",
              selectedOptions,
            );
        }}
      >
        <optgroup label="Props / Tokens">
          {#each mapStore.activeMap?.manifest?.entities?.props || [] as prop}
            <option value={prop.id}>
              {prop.name || "Unnamed Prop"} @ Grid {Math.round(
                prop.position?.x || 0,
              )},{Math.round(prop.position?.y || 0)}
            </option>
          {/each}
        </optgroup>
        <optgroup label="Portals (Doors/Windows)">
          {#each mapStore.activeMap?.manifest?.geometry?.portals || [] as portal}
            <option value={portal.id}>
              {portal.properties?.type || "Portal"} @ Grid {Math.round(
                portal.path?.[0]?.x || 0,
              )},{Math.round(portal.path?.[0]?.y || 0)}
            </option>
          {/each}
        </optgroup>
        <optgroup label="Audio Zones">
          {#each mapStore.activeMap?.manifest?.entities?.audio?.zones || [] as audio}
            <option value={audio.id}>
              {audio.track || "Unnamed Audio"} @ Grid {Math.round(
                audio.center?.x || 0,
              )},{Math.round(audio.center?.y || 0)}
            </option>
          {/each}
        </optgroup>
      </select>
    </label>
  {:else if ["Teleport", "Stairs/Ladder"].includes(evtType)}
    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;"
    >
      Target Floor
      <select
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
        value={evtFloor}
        onchange={(e) => {
          if (evt)
            mapStore.updateItemProperty(
              evt.id,
              "targetFloorId",
              e.target.value,
            );
          else
            mapStore.updateDefaultSetting(
              "event",
              "targetFloorId",
              e.target.value,
            );
        }}
      >
        <option value="">-- Same Floor --</option>
        {#each mapStore.catalog as level}
          <option value={level.id}>{level.filename}</option>
        {/each}
      </select>
    </label>

    <label
      style="font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;"
    >
      Destination Spawn Point
      <select
        style="background: #0f172a; border: 1px solid #334155; color: #fff; padding: 4px; border-radius: 4px;"
        value={evtSpawn}
        onchange={(e) => {
          if (evt)
            mapStore.updateItemProperty(
              evt.id,
              "targetSpawnId",
              e.target.value,
            );
          else
            mapStore.updateDefaultSetting(
              "event",
              "targetSpawnId",
              e.target.value,
            );
        }}
      >
        <option value="">-- Select Destination --</option>
        {#each mapStore.catalog as level}
          {#if !evtFloor || evtFloor === level.id}
            <optgroup label={level.filename}>
              {#each level.manifest.entities?.landing_zones || [] as spawn}
                <option value={spawn.id}>{spawn.name || "Unnamed Spawn"}</option
                >
              {/each}
            </optgroup>
          {/if}
        {/each}
      </select>
    </label>

    <label class="checkbox-row" style="margin-top: 8px;">
      <input
        type="checkbox"
        checked={evtAuto}
        onchange={(e) => {
          if (evt)
            mapStore.updateItemProperty(
              evt.id,
              "autoCreateMatch",
              e.target.checked,
            );
          else
            mapStore.updateDefaultSetting(
              "event",
              "autoCreateMatch",
              e.target.checked,
            );
        }}
      />
      <span>Auto-Create Return Spawn</span>
    </label>
  {/if}
</div>

<style>
  /* Localized scoped styling to ensure the panel renders perfectly on its own */
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  .checkbox-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
    cursor: pointer;
  }
  input[type="checkbox"] {
    cursor: pointer;
    width: 14px;
    height: 14px;
    accent-color: #00f0ff;
  }
</style>
