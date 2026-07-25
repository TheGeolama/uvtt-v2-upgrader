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
</style>
