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
    // Entities
    if ((item = m.entities?.lights?.find((i) => i.id === id)))
      return { cat: "light", data: item };
    if ((item = m.entities?.audio?.zones?.find((i) => i.id === id)))
      return { cat: "audio", data: item };
    if ((item = m.entities?.emitters?.find((i) => i.id === id)))
      return { cat: "emitter", data: item };
    if ((item = m.entities?.landing_zones?.find((i) => i.id === id)))
      return { cat: "spawn", data: item };
    if ((item = m.entities?.props?.find((i) => i.id === id)))
      return { cat: "prop", data: item };
    if ((item = m.entities?.events?.find((i) => i.id === id)))
      return { cat: "event", data: item };
    // Geometry
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
          handlePropChange("prop", "rotation", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="0"
        max="360"
        value={activeConf.rotation ?? 0}
        onchange={(e) =>
          handlePropChange("prop", "rotation", parseFloat(e.target.value))}
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
          handlePropChange("prop", "scale", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="10"
        max="500"
        value={activeConf.scale ?? 100}
        onchange={(e) =>
          handlePropChange("prop", "scale", parseFloat(e.target.value))}
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
        handlePropChange("prop", "position.z", parseFloat(e.target.value))}
    />
  </label>
  <!-- LAYER & LOCK CONFIGURATION -->
  <label>
    <span>Z-Index (Rendering Layer):</span>
    <input
      type="number"
      step="1"
      value={activeConf.properties?.z_index ?? 0}
      onchange={(e) =>
        handlePropChange(
          "prop",
          "properties.z_index",
          parseInt(e.target.value),
        )}
    />
  </label>
  <label class="checkbox-row">
    <input
      type="checkbox"
      checked={activeConf.properties?.locked || false}
      onchange={(e) =>
        handlePropChange("prop", "properties.locked", e.target.checked)}
    />
    <span>Locked (Prevent Dragging & Movement)</span>
  </label>
{:else if displayCategory === "wall"}
  <label class="checkbox-row">
    <input
      type="checkbox"
      checked={activeConf.isBezier || false}
      onchange={(e) => {
        if (e.target.checked) {
          mapStore.smoothSelectedWalls();
        } else {
          handlePropChange("wall", "isBezier", false);
        }
      }}
    />
    <span>Smooth Path (Bezier Curve)</span>
  </label>
  <label>
    <span>Wall Type:</span>
    <select
      value={activeConf.properties?.type || "standard"}
      onchange={(e) =>
        handlePropChange("wall", "properties.type", e.target.value)}
    >
      <option value="standard">Standard (Blocks Movement & Vision)</option>
      <option value="invisible">Invisible (Blocks Movement Only)</option>
      <option value="terrain">Terrain (Blocks Movement, Partial Vision)</option>
      <option value="ethereal">Ethereal (Blocks Vision, Allows Movement)</option
      >
    </select>
  </label>
  <label>
    <span>Bottom Elevation:</span>
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
  <label>
    <span>Top Elevation:</span>
    <input
      type="number"
      step="0.5"
      value={activeConf.properties?.top ?? 10.0}
      onchange={(e) =>
        handlePropChange("wall", "properties.top", parseFloat(e.target.value))}
    />
  </label>
{:else if displayCategory === "portal"}
  <label>
    <span>Portal Type:</span>
    <select
      value={activeConf.properties?.type || "door"}
      onchange={(e) =>
        handlePropChange("portal", "properties.type", e.target.value)}
    >
      <option value="door">Standard Door</option>
      <option value="window">Window</option>
      <option value="secret">Secret Door</option>
    </select>
  </label>
  <label>
    <span>State:</span>
    <select
      value={activeConf.properties?.state || "closed"}
      onchange={(e) =>
        handlePropChange("portal", "properties.state", e.target.value)}
    >
      <option value="closed">Closed</option>
      <option value="open">Open</option>
      <option value="locked">Locked</option>
      <option value="broken">Broken / Smashed</option>
    </select>
  </label>
  <label>
    <span>Bottom Elevation:</span>
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
  <label>
    <span>Top Elevation:</span>
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
{:else if displayCategory === "roof"}
  <label class="checkbox-row">
    <input
      type="checkbox"
      checked={activeConf.properties?.hidden || false}
      onchange={(e) =>
        handlePropChange("roof", "properties.hidden", e.target.checked)}
    />
    <span>Hidden (GM Only)</span>
  </label>
  <label>
    <span>Roof Tint:</span>
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
        min="0"
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
        min="0"
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
  <label>
    <span>Bottom Elevation:</span>
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
  <label>
    <span>Top Elevation:</span>
    <input
      type="number"
      step="0.5"
      value={activeConf.properties?.top ?? 20.0}
      onchange={(e) =>
        handlePropChange("roof", "properties.top", parseFloat(e.target.value))}
    />
  </label>
{:else if displayCategory === "event"}
  <label>
    <span>Event Name:</span>
    <input
      type="text"
      value={activeConf.name || "New Event"}
      oninput={(e) => handlePropChange("event", "name", e.target.value)}
    />
  </label>
  <label>
    <span>Event Type:</span>
    <select
      value={activeConf.eventType || "State Toggle"}
      onchange={(e) => handlePropChange("event", "eventType", e.target.value)}
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
      onchange={(e) => handlePropChange("event", "activation", e.target.value)}
    >
      <option value="proximity">Proximity (Enter Zone)</option>
      <option value="click">Manual Click</option>
    </select>
  </label>

  {#if activeConf.eventType === "State Toggle" || activeConf.eventType === "Audio Trigger"}
    <label>
      <span>Target Action (When Triggered):</span>
      <select
        value={activeConf.target_action || "toggle_visibility"}
        onchange={(e) =>
          handlePropChange("event", "target_action", e.target.value)}
      >
        <option value="toggle_visibility">Toggle Visibility</option>
        <option value="open_close">Open / Close (Doors)</option>
        <option value="lock_unlock">Lock / Unlock</option>
        <option value="turn_on_off">Turn On / Off (Lights)</option>
        <option value="play_stop">Play / Stop (Audio)</option>
        <option value="enable_event">Enable Event (Linked)</option>
        <option value="disable_event">Disable Event (Linked)</option>
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
            handlePropChange("event", "target_entity_ids", targets);
          }}
        >
          🔗 Bind {mapStore.selectedItemIds.length - 1} Selected Entities
        </button>
      {:else}
        <p class="helper-text" style="font-style: italic; margin-top: 4px;">
          Shift-click other entities (lights, doors) while this event is
          selected to bind them.
        </p>
      {/if}

      {#if activeConf.target_entity_ids?.length > 0}
        <button
          class="clear-btn"
          onclick={() => handlePropChange("event", "target_entity_ids", [])}
          >❌ Clear Targets</button
        >
      {/if}
    </div>
  {/if}

  {#if activeConf.eventType === "Teleport" || activeConf.eventType === "Stairs/Ladder"}
    {@const targetLevel = mapStore.catalog.find(
      (m) => m.id === (activeConf.targetFloorId || mapStore.activeMapId),
    )}

    {#if mapStore.selectedItemIds.length === 0}
      <label class="checkbox-row">
        <input
          type="checkbox"
          checked={activeConf.autoCreateMatch || false}
          onchange={(e) =>
            handlePropChange("event", "autoCreateMatch", e.target.checked)}
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
            handlePropChange("event", "targetFloorId", e.target.value);
            handlePropChange("event", "targetSpawnId", ""); // Reset spawn when map changes
          }}
        >
          {#each mapStore.catalog as level}
            <option value={level.id}>{level.filename || "Unnamed Level"}</option
            >
          {/each}
        </select>
      </label>
      <label>
        <span>Target Landing Zone:</span>
        <select
          value={activeConf.targetSpawnId || ""}
          onchange={(e) =>
            handlePropChange("event", "targetSpawnId", e.target.value)}
        >
          <option value="">-- Select Spawn --</option>
          {#each targetLevel?.manifest?.entities?.landing_zones || [] as spawn}
            <option value={spawn.id}>{spawn.name || "Unnamed Spawn"}</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}
{:else if displayCategory === "light"}
  <label>
    <span>Lighting Projection Type:</span>
    <select
      value={activeConf.type || "point"}
      onchange={(e) => handlePropChange("light", "type", e.target.value)}
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
        handlePropChange("light", "position.z", parseFloat(e.target.value))}
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
        handlePropChange("light", "properties.decay_model", e.target.value)}
    >
      <option value="inverse_square">Inverse Square (Realistic)</option>
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
  {#if activeConf.properties?.animation?.profile !== "none" && activeConf.properties?.animation?.profile}
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
          value={activeConf.properties?.animation?.intensity_variance ?? 0.2}
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
      oninput={(e) => handlePropChange("spawn", "name", e.target.value)}
    />
  </label>
  <label>
    <span>Footprint Shape:</span>
    <select
      value={activeConf.shape || "circle"}
      onchange={(e) => handlePropChange("spawn", "shape", e.target.value)}
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
{:else if displayCategory === "audio"}
  <label>
    <span>Audio Track:</span>
    <select
      value={activeConf.track || ""}
      onchange={(e) => handlePropChange("audio", "track", e.target.value)}
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
          handlePropChange("audio", "volume", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="0"
        max="100"
        value={activeConf.volume ?? 100}
        onchange={(e) =>
          handlePropChange("audio", "volume", parseFloat(e.target.value))}
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
        handlePropChange("audio", "radius", parseFloat(e.target.value))}
    />
  </label>
  <label>
    <span>Inner Core (100% Volume):</span>
    <input
      type="number"
      step="0.5"
      min="0.5"
      value={activeConf.inner_radius ?? 2.5}
      onchange={(e) =>
        handlePropChange("audio", "inner_radius", parseFloat(e.target.value))}
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
      onchange={(e) => handlePropChange("emitter", "type", e.target.value)}
    >
      <option value="weather">Weather</option>
      <option value="environment">Environment (Fire, Smoke)</option>
      <option value="magic">Magic / Spells</option>
      <option value="custom">Custom Particle</option>
    </select>
  </label>
  {#if activeConf.type === "weather" || !activeConf.type}
    <label>
      <span>Weather Style:</span>
      <select
        value={activeConf.style || "rain"}
        onchange={(e) => handlePropChange("emitter", "style", e.target.value)}
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
        oninput={(e) => handlePropChange("emitter", "graphic", e.target.value)}
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
        handlePropChange("emitter", "position.z", parseFloat(e.target.value))}
    />
  </label>
  <label>
    <span>Z-Index Layering:</span>
    <select
      value={activeConf.layering || "above"}
      onchange={(e) => handlePropChange("emitter", "layering", e.target.value)}
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
        onchange={(e) => handlePropChange("emitter", "tint", e.target.value)}
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
          handlePropChange("emitter", "scale", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="10"
        max="300"
        value={activeConf.scale ?? 100}
        onchange={(e) =>
          handlePropChange("emitter", "scale", parseFloat(e.target.value))}
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
          handlePropChange("emitter", "direction", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="0"
        max="360"
        value={activeConf.direction ?? 180}
        onchange={(e) =>
          handlePropChange("emitter", "direction", parseFloat(e.target.value))}
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
          handlePropChange("emitter", "speed", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="0"
        max="100"
        value={activeConf.speed ?? 50}
        onchange={(e) =>
          handlePropChange("emitter", "speed", parseFloat(e.target.value))}
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
          handlePropChange("emitter", "intensity", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="0"
        max="100"
        value={activeConf.intensity ?? 50}
        onchange={(e) =>
          handlePropChange("emitter", "intensity", parseFloat(e.target.value))}
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
          handlePropChange("emitter", "variance", parseFloat(e.target.value))}
      />
      <input
        type="number"
        min="0"
        max="100"
        value={activeConf.variance ?? 10}
        onchange={(e) =>
          handlePropChange("emitter", "variance", parseFloat(e.target.value))}
      />
    </div>
  </label>
{:else}
  <p class="helper-text">
    Basic clone/translate capabilities active. Specific properties coming soon.
  </p>
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
