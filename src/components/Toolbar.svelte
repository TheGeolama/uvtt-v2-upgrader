<script>
  import { mapStore, mapActions } from "../stores/mapStore.js";

  $: selectedItems = $mapStore.manifest
    ? getSelectedItems($mapStore.selectedItemIds)
    : [];
  $: canMerge =
    selectedItems.length > 1 &&
    selectedItems.every((item) => item.category === "wall");
  $: canSmooth =
    selectedItems.length === 1 &&
    selectedItems[0].category === "wall" &&
    selectedItems[0].data.path.length > 2;
  $: isBulkSession = $mapStore.catalog && $mapStore.catalog.length > 1;

  function getSelectedItems(ids) {
    if (!ids || ids.length === 0) return [];
    const items = [];

    ids.forEach((id) => {
      const wall = $mapStore.manifest.geometry.walls?.find((w) => w.id === id);
      if (wall) {
        items.push({ category: "wall", data: wall });
        return;
      }

      const portal = $mapStore.manifest.geometry.portals?.find(
        (p) => p.id === id,
      );
      if (portal) {
        items.push({ category: "portal", data: portal });
        return;
      }

      const light = $mapStore.manifest.lights?.find((l) => l.id === id);
      if (light) {
        items.push({ category: "light", data: light });
        return;
      }

      const event = $mapStore.manifest.events?.find((e) => e.id === id);
      if (event) {
        items.push({ category: "event", data: event });
        return;
      }

      const audio = $mapStore.manifest.audio?.find((a) => a.id === id);
      if (audio) {
        items.push({ category: "audio", data: audio });
        return;
      }

      const overhead = $mapStore.manifest.geometry.overhead?.find(
        (o) => o.id === id,
      );
      if (overhead) {
        items.push({ category: "overhead", data: overhead });
        return;
      }

      const spawn = $mapStore.manifest.landing_zones?.find((z) => z.id === id);
      if (spawn) {
        items.push({ category: "spawn", data: spawn });
        return;
      }

      const emitter = $mapStore.manifest.emitters?.find((em) => em.id === id);
      if (emitter) items.push({ category: "emitter", data: emitter });
    });

    return items;
  }

  function toggleTool(tool) {
    mapActions.setTool(tool);
  }

  function handleEdit(propertyPath, event) {
    if (selectedItems.length !== 1) return;
    const singleItem = selectedItems[0];

    let value = event.target.value;
    if (event.target.type === "checkbox") value = event.target.checked;
    if (event.target.type === "number") value = parseFloat(value) || 0;

    mapActions.updateItemProperty(
      singleItem.data.id,
      singleItem.category,
      propertyPath,
      value,
    );
  }

  function handleManifestEdit(propertyPath, event) {
    let value = event.target.value;
    if (event.target.type === "number") value = parseFloat(value) || 0;
    mapActions.updateManifestProperty(propertyPath, value);
  }

  function handleAudioUpload(propertyPath, event, isManifest = false) {
    const file = event.target.files[0];
    if (!file) return;

    mapActions.addAudioAsset(file.name, file);

    const simulatedEvent = { target: { value: `assets/${file.name}` } };
    if (isManifest) {
      handleManifestEdit(propertyPath, simulatedEvent);
    } else {
      handleEdit(propertyPath, simulatedEvent);
    }
  }

  function parseUri(uri) {
    if (!uri) return { map: "", zone: "" };
    const cleaned = uri.replace("relative://", "");
    const parts = cleaned.split("#");
    return { map: parts[0] || "", zone: parts[1] || "" };
  }

  function getUnifiedDestinationValue(destination, catalog) {
    if (!destination) return "raw";
    if (destination.type === "intra_map") {
      if (destination.target_zone_id)
        return `intra|${destination.target_zone_id}`;
      return "raw";
    }
    if (destination.type === "inter_map") {
      const parsed = parseUri(destination.uri);
      const mapExists =
        catalog && catalog.some((m) => m.filename === parsed.map);
      if (mapExists) return `inter|${parsed.map}|${parsed.zone}`;
      return "custom";
    }
    return "raw";
  }

  function handleUnifiedDestinationChange(id, category, value) {
    if (value === "raw") {
      mapActions.updateItemProperty(
        id,
        category,
        "destination.type",
        "intra_map",
      );
      mapActions.updateItemProperty(
        id,
        category,
        "destination.target_zone_id",
        "",
      );
      mapActions.updateItemProperty(id, category, "destination.uri", "");
    } else if (value === "custom") {
      mapActions.updateItemProperty(
        id,
        category,
        "destination.type",
        "inter_map",
      );
      mapActions.updateItemProperty(
        id,
        category,
        "destination.target_zone_id",
        "",
      );
    } else if (value.startsWith("intra|")) {
      const zoneId = value.split("|")[1];
      mapActions.updateItemProperty(
        id,
        category,
        "destination.type",
        "intra_map",
      );
      mapActions.updateItemProperty(
        id,
        category,
        "destination.target_zone_id",
        zoneId,
      );
      mapActions.updateItemProperty(id, category, "destination.uri", "");
    } else if (value.startsWith("inter|")) {
      const parts = value.split("|");
      const mapFile = parts[1];
      const zoneId = parts[2] || "";
      const compiledUri = `relative://${mapFile}${zoneId ? "#" + zoneId : ""}`;

      mapActions.updateItemProperty(
        id,
        category,
        "destination.type",
        "inter_map",
      );
      mapActions.updateItemProperty(
        id,
        category,
        "destination.uri",
        compiledUri,
      );
      mapActions.updateItemProperty(
        id,
        category,
        "destination.target_zone_id",
        "",
      );
    }
  }
</script>

<div class="toolbar-container">
  {#if isBulkSession}
    <div class="catalog-switcher">
      <label for="map-switcher" style="display:none;">Switch Map</label>
      <select
        id="map-switcher"
        value={$mapStore.activeMapIndex}
        on:change={(e) => mapActions.switchMap(parseInt(e.target.value))}
      >
        {#each $mapStore.catalog as catalogMap, index}
          <option value={index}>MAP: {catalogMap.filename}</option>
        {/each}
      </select>
    </div>
  {/if}

  <div class="tool-group">
    <button
      class:active={$mapStore.activeTool === "pan"}
      on:click={() => toggleTool("pan")}
      title="Pan Camera">✋ Pan</button
    >
    <button
      class:active={$mapStore.activeTool === "select"}
      on:click={() => toggleTool("select")}
      title="Select & Edit Elements">↖️ Select</button
    >
    <div class="divider"></div>
    <button
      class:active={$mapStore.showGrid}
      on:click={mapActions.toggleGrid}
      title="Toggle Drafting Grid">🌐 Grid</button
    >
    <div class="divider"></div>
    <button
      class:active={$mapStore.activeTool === "light"}
      on:click={() => toggleTool("light")}
      title="Drop Point Lights">💡 Light</button
    >
    <button
      class:active={$mapStore.activeTool === "event"}
      on:click={() => toggleTool("event")}
      title="Drop Teleports & Traps">🚪 Event</button
    >
    <button
      class:active={$mapStore.activeTool === "audio"}
      on:click={() => toggleTool("audio")}
      title="Drop Localized Audio">🔊 Audio</button
    >
    <button
      class:active={$mapStore.activeTool === "overhead"}
      on:click={() => toggleTool("overhead")}
      title="Drop Roofs & Canopies">🌳 Roof</button
    >
    <button
      class:active={$mapStore.activeTool === "emitter"}
      on:click={() => toggleTool("emitter")}
      title="Drop Particle Weather/Effects">☁️ Emitter</button
    >
    <button
      class:active={$mapStore.activeTool === "spawn"}
      on:click={() => toggleTool("spawn")}
      title="Set Map Entry Points">🚩 Spawn</button
    >
  </div>

  {#if selectedItems.length === 0 && $mapStore.manifest}
    <div class="edit-menu">
      <h3>MAP TOPOLOGY</h3>
      <p class="info-text">Global resolution settings</p>

      <div class="input-group">
        <label
          >Grid Type
          <select
            value={$mapStore.manifest.resolution.topology?.type ?? "square"}
            on:change={(e) => handleManifestEdit("resolution.topology.type", e)}
          >
            <option value="square">Square</option>
            <option value="hex">Hexagonal</option>
            <option value="isometric">Isometric</option>
          </select>
        </label>
      </div>

      {#if $mapStore.manifest.resolution.topology?.type === "hex"}
        <div class="split-group">
          <div class="input-group">
            <label
              >Orientation
              <select
                value={$mapStore.manifest.resolution.topology?.orientation ??
                  "flat_top"}
                on:change={(e) =>
                  handleManifestEdit("resolution.topology.orientation", e)}
              >
                <option value="flat_top">Flat Top</option>
                <option value="pointy_top">Pointy Top</option>
              </select>
            </label>
          </div>
          <div class="input-group">
            <label
              >Offset Rule
              <select
                value={$mapStore.manifest.resolution.topology?.offset ??
                  "odd_row"}
                on:change={(e) =>
                  handleManifestEdit("resolution.topology.offset", e)}
              >
                <option value="odd_row">Odd Row</option>
                <option value="even_row">Even Row</option>
                <option value="odd_col">Odd Col</option>
                <option value="even_col">Even Col</option>
              </select>
            </label>
          </div>
        </div>
      {/if}

      {#if $mapStore.manifest.resolution.topology?.type === "isometric"}
        <div class="input-group">
          <label
            >Isometric Ratio <input
              type="number"
              step="0.1"
              value={$mapStore.manifest.resolution.topology?.isometric_ratio ??
                0.5}
              on:change={(e) =>
                handleManifestEdit("resolution.topology.isometric_ratio", e)}
            /></label
          >
        </div>
      {/if}

      <div class="split-group">
        <div class="input-group">
          <label
            >Grid Size X (px) <input
              type="number"
              step="1"
              value={$mapStore.manifest.resolution.grid_size.x}
              on:change={(e) => handleManifestEdit("resolution.grid_size.x", e)}
            /></label
          >
        </div>
        <div class="input-group">
          <label
            >Grid Size Y (px) <input
              type="number"
              step="1"
              value={$mapStore.manifest.resolution.grid_size.y}
              on:change={(e) => handleManifestEdit("resolution.grid_size.y", e)}
            /></label
          >
        </div>
      </div>
      <div class="input-group">
        <label
          >Physical Units per Grid <input
            type="number"
            step="1"
            value={$mapStore.manifest.resolution.units_per_grid}
            on:change={(e) =>
              handleManifestEdit("resolution.units_per_grid", e)}
          /></label
        >
      </div>
    </div>

    <div class="edit-menu">
      <h3>GLOBAL AUDIO (TIER 1 & 2)</h3>
      <p class="info-text">Background music and ambient loops</p>

      <div class="input-group">
        <label
          >Music Track (URI)
          <div class="file-upload-row">
            <input
              type="text"
              placeholder="e.g. assets/music.ogg"
              value={$mapStore.manifest.music?.uri ?? ""}
              on:change={(e) => handleManifestEdit("music.uri", e)}
            />
            <input
              type="file"
              id="musicUpload"
              accept="audio/*"
              style="display:none;"
              on:change={(e) => handleAudioUpload("music.uri", e, true)}
            />
            <button
              class="icon-btn"
              on:click={() => document.getElementById("musicUpload").click()}
              title="Upload Audio File">📁</button
            >
          </div>
        </label>
      </div>
      <div class="split-group">
        <div class="input-group">
          <label
            >Music Volume <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={$mapStore.manifest.music?.volume ?? 1.0}
              on:change={(e) => handleManifestEdit("music.volume", e)}
            /></label
          >
        </div>
        <div class="input-group">
          <label
            >Crossfade (s) <input
              type="number"
              step="0.5"
              min="0"
              value={$mapStore.manifest.music?.crossfade_duration ?? 2.0}
              on:change={(e) =>
                handleManifestEdit("music.crossfade_duration", e)}
            /></label
          >
        </div>
      </div>

      <hr style="border: none; border-top: 1px solid #444; margin: 4px 0;" />

      <div class="input-group">
        <label
          >Ambience Track (URI)
          <div class="file-upload-row">
            <input
              type="text"
              placeholder="e.g. assets/rain.ogg"
              value={$mapStore.manifest.ambience?.uri ?? ""}
              on:change={(e) => handleManifestEdit("ambience.uri", e)}
            />
            <input
              type="file"
              id="ambienceUpload"
              accept="audio/*"
              style="display:none;"
              on:change={(e) => handleAudioUpload("ambience.uri", e, true)}
            />
            <button
              class="icon-btn"
              on:click={() => document.getElementById("ambienceUpload").click()}
              title="Upload Audio File">📁</button
            >
          </div>
        </label>
      </div>
      <div class="split-group">
        <div class="input-group">
          <label
            >Ambience Volume <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={$mapStore.manifest.ambience?.volume ?? 1.0}
              on:change={(e) => handleManifestEdit("ambience.volume", e)}
            /></label
          >
        </div>
        <div class="input-group">
          <label
            >Crossfade (s) <input
              type="number"
              step="0.5"
              min="0"
              value={$mapStore.manifest.ambience?.crossfade_duration ?? 2.0}
              on:change={(e) =>
                handleManifestEdit("ambience.crossfade_duration", e)}
            /></label
          >
        </div>
      </div>
    </div>

    <div class="edit-menu">
      <h3>GLOBAL ENVIRONMENT</h3>
      <p class="info-text">Atmospheric and weather physics</p>

      <div class="split-group">
        <div class="input-group">
          <label
            >Wind Speed <input
              type="number"
              step="0.5"
              value={$mapStore.manifest.environment?.global_wind?.speed ?? 5.0}
              on:change={(e) =>
                handleManifestEdit("environment.global_wind.speed", e)}
            /></label
          >
        </div>
        <div class="input-group">
          <label
            >Wind Angle (Deg) <input
              type="number"
              step="5"
              min="-360"
              max="360"
              value={$mapStore.manifest.environment?.global_wind?.angle ?? 45.0}
              on:change={(e) =>
                handleManifestEdit("environment.global_wind.angle", e)}
            /></label
          >
        </div>
        <div class="input-group">
          <label
            >Gust Variance <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={$mapStore.manifest.environment?.global_wind
                ?.gust_variance ?? 0.15}
              on:change={(e) =>
                handleManifestEdit("environment.global_wind.gust_variance", e)}
            /></label
          >
        </div>
      </div>
    </div>
  {/if}

  {#if selectedItems.length === 1}
    <div class="edit-menu">
      <h3>{selectedItems[0].category.toUpperCase()} PROPERTIES</h3>
      <p class="id-label">ID: {selectedItems[0].data.id}</p>

      {#if selectedItems[0].category === "portal"}
        <div class="input-group">
          <label
            >Portal Type
            <select
              value={selectedItems[0].data.type}
              on:change={(e) => handleEdit("type", e)}
            >
              <option value="door">Door</option>
              <option value="window">Window</option>
              <option value="secret">Secret Door</option>
            </select>
          </label>
        </div>
      {/if}

      {#if selectedItems[0].category === "wall"}
        <div class="input-group">
          <label
            >Wall Type
            <select
              value={selectedItems[0].data.type}
              on:change={(e) => handleEdit("type", e)}
            >
              <option value="standard">Standard Wall</option>
              <option value="terrain"
                >Terrain (Blocks Sight, Allows Movement)</option
              >
              <option value="illusory">Illusory</option>
            </select>
          </label>
        </div>
        <div class="split-group">
          <div class="input-group">
            <label
              >Top (ft) <input
                type="number"
                step="0.5"
                value={selectedItems[0].data.height?.top ?? 10}
                on:change={(e) => handleEdit("height.top", e)}
              /></label
            >
          </div>
          <div class="input-group">
            <label
              >Bottom (ft) <input
                type="number"
                step="0.5"
                value={selectedItems[0].data.height?.bottom ?? 0}
                on:change={(e) => handleEdit("height.bottom", e)}
              /></label
            >
          </div>
        </div>
        <div class="checkbox-group">
          <label
            ><input
              type="checkbox"
              checked={selectedItems[0].data.states?.ethereal ?? false}
              on:change={(e) => handleEdit("states.ethereal", e)}
            /> Ethereal Phase</label
          >
        </div>

        {#if canSmooth}
          <button
            class="action-btn smooth-btn"
            on:click={mapActions.smoothSelectedWalls}>🌊 Smooth Curve</button
          >
        {/if}
      {/if}

      {#if selectedItems[0].category === "light"}
        <div class="input-group">
          <label
            >Light Color <input
              type="color"
              value={selectedItems[0].data.color}
              on:change={(e) => handleEdit("color", e)}
              style="padding: 0; height: 32px; width: 100%; cursor: pointer;"
            /></label
          >
        </div>
        <div class="split-group">
          <div class="input-group">
            <label
              >Bright <input
                type="number"
                step="5"
                value={selectedItems[0].data.radius?.bright ?? 20}
                on:change={(e) => handleEdit("radius.bright", e)}
              /></label
            >
          </div>
          <div class="input-group">
            <label
              >Dim <input
                type="number"
                step="5"
                value={selectedItems[0].data.radius?.dim ?? 40}
                on:change={(e) => handleEdit("radius.dim", e)}
              /></label
            >
          </div>
        </div>
        <div class="input-group">
          <label
            >Decay Physics
            <select
              value={selectedItems[0].data.decay}
              on:change={(e) => handleEdit("decay", e)}
            >
              <option value="inverse_square">Inverse Square (Realistic)</option>
              <option value="linear">Linear (Even Fade)</option>
            </select>
          </label>
        </div>
      {/if}

      {#if selectedItems[0].category === "overhead"}
        <div class="input-group">
          <label
            >Asset Source (URI) <input
              type="text"
              placeholder="e.g. assets/roof.webp"
              value={selectedItems[0].data.image?.uri ?? ""}
              on:change={(e) => handleEdit("image.uri", e)}
            /></label
          >
        </div>
        <div class="split-group">
          <div class="input-group">
            <label
              >Bottom Z (ft) <input
                type="number"
                step="0.5"
                value={selectedItems[0].data.height?.bottom ?? 10}
                on:change={(e) => handleEdit("height.bottom", e)}
              /></label
            >
          </div>
          <div class="input-group">
            <label
              >Top Z (ft) <input
                type="number"
                step="0.5"
                value={selectedItems[0].data.height?.top ?? 25}
                on:change={(e) => handleEdit("height.top", e)}
              /></label
            >
          </div>
        </div>
      {/if}

      {#if selectedItems[0].category === "emitter"}
        <div class="input-group">
          <label
            >Particle Type
            <select
              value={selectedItems[0].data.type}
              on:change={(e) => handleEdit("type", e)}
            >
              <option value="rain">Rain</option>
              <option value="snow">Snow</option>
              <option value="fog">Fog / Mists</option>
              <option value="embers">Floating Embers</option>
              <option value="magic">Magical Sparkles</option>
            </select>
          </label>
        </div>

        <div class="input-group">
          <label
            >Collision Mode
            <select
              value={selectedItems[0].data.properties?.collision_mode ?? "none"}
              on:change={(e) => handleEdit("properties.collision_mode", e)}
            >
              <option value="none">None (Pass Through)</option>
              <option value="mask_under_overhead"
                >Mask Under Overhead (Roofs)</option
              >
              <option value="ground_terminate"
                >Ground Terminate (Puddles/Snow)</option
              >
              <option value="wall_bounce">Wall Bounce (Wind Tunnels)</option>
            </select>
          </label>
        </div>

        <div class="input-group">
          <label
            >Particle Color <input
              type="color"
              value={selectedItems[0].data.properties?.color ?? "#ffffff"}
              on:change={(e) => handleEdit("properties.color", e)}
              style="padding: 0; height: 32px; width: 100%; cursor: pointer;"
            /></label
          >
        </div>
        <div class="split-group">
          <div class="input-group">
            <label
              >Intensity/Density <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={selectedItems[0].data.properties?.intensity ?? 0.5}
                on:change={(e) => handleEdit("properties.intensity", e)}
              /></label
            >
          </div>
          <div class="input-group">
            <label
              >Base Speed <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={selectedItems[0].data.properties?.speed ?? 1.0}
                on:change={(e) => handleEdit("properties.speed", e)}
              /></label
            >
          </div>
        </div>
        <div class="input-group">
          <label
            >Base Angle (Degrees) <input
              type="number"
              step="5"
              min="-360"
              max="360"
              value={selectedItems[0].data.properties?.angle ?? 45.0}
              on:change={(e) => handleEdit("properties.angle", e)}
            /></label
          >
        </div>

        <div class="checkbox-group">
          <label
            ><input
              type="checkbox"
              checked={selectedItems[0].data.properties?.wind_influence
                ?.inherit_global ?? false}
              on:change={(e) =>
                handleEdit("properties.wind_influence.inherit_global", e)}
            /> Inherit Global Wind Physics</label
          >
        </div>

        {#if selectedItems[0].data.properties?.wind_influence?.inherit_global}
          <div
            class="input-group"
            style="margin-top: 4px; padding-left: 8px; border-left: 2px solid #00bcd4;"
          >
            <label
              >Global Influence Scalar <input
                type="number"
                step="0.1"
                value={selectedItems[0].data.properties?.wind_influence
                  ?.influence_scale ?? 1.0}
                on:change={(e) =>
                  handleEdit("properties.wind_influence.influence_scale", e)}
              /></label
            >
            <p class="info-text" style="font-size: 10px; margin-top: 4px;">
              0.0 = Ignore Global Wind<br />1.0 = Match Global Wind<br />>1.0 =
              Amplified Wind (e.g. Tunnels)
            </p>
          </div>
        {/if}
      {/if}

      {#if selectedItems[0].category === "spawn"}
        <div class="input-group">
          <label
            >Zone Name <input
              type="text"
              value={selectedItems[0].data.name ?? ""}
              on:change={(e) => handleEdit("name", e)}
            /></label
          >
        </div>

        <div class="checkbox-group">
          <label
            ><input
              type="checkbox"
              checked={selectedItems[0].data.is_default ?? false}
              on:change={(e) => handleEdit("is_default", e)}
            /> Set as Default Map Spawn</label
          >
        </div>

        <div class="split-group">
          <div class="input-group">
            <label
              >Pos X <input
                type="number"
                step="0.5"
                value={selectedItems[0].data.position?.x ?? 0}
                on:change={(e) => handleEdit("position.x", e)}
              /></label
            >
          </div>
          <div class="input-group">
            <label
              >Pos Y <input
                type="number"
                step="0.5"
                value={selectedItems[0].data.position?.y ?? 0}
                on:change={(e) => handleEdit("position.y", e)}
              /></label
            >
          </div>
          <div class="input-group">
            <label
              >Pos Z <input
                type="number"
                step="0.5"
                value={selectedItems[0].data.position?.z ?? 0}
                on:change={(e) => handleEdit("position.z", e)}
              /></label
            >
          </div>
        </div>
        <div class="split-group">
          <div class="input-group">
            <label
              >Face Vector X <input
                type="number"
                min="-1"
                max="1"
                step="0.1"
                value={selectedItems[0].data.facing?.x ?? 0}
                on:change={(e) => handleEdit("facing.x", e)}
              /></label
            >
          </div>
          <div class="input-group">
            <label
              >Face Vector Y <input
                type="number"
                min="-1"
                max="1"
                step="0.1"
                value={selectedItems[0].data.facing?.y ?? 1}
                on:change={(e) => handleEdit("facing.y", e)}
              /></label
            >
          </div>
        </div>

        <div class="input-group">
          <label
            >Arrival Zoom Level <input
              type="number"
              step="0.1"
              value={selectedItems[0].data.properties?.camera_zoom_level ?? 1.0}
              on:change={(e) => handleEdit("properties.camera_zoom_level", e)}
            /></label
          >
        </div>
        <div class="input-group">
          <label
            >Description <input
              type="text"
              placeholder="e.g. Dungeon entrance"
              value={selectedItems[0].data.properties?.description ?? ""}
              on:change={(e) => handleEdit("properties.description", e)}
            /></label
          >
        </div>
      {/if}

      {#if ["event", "audio", "overhead", "emitter"].includes(selectedItems[0].category)}
        {#if selectedItems[0].category === "audio"}
          <div class="input-group">
            <label
              >Audio Source (URL / Asset)
              <div class="file-upload-row">
                <input
                  type="text"
                  placeholder="e.g. assets/fire.ogg"
                  value={selectedItems[0].data.source ?? ""}
                  on:change={(e) => handleEdit("source", e)}
                />
                <input
                  type="file"
                  id={`audioUpload_${selectedItems[0].data.id}`}
                  accept="audio/*"
                  style="display:none;"
                  on:change={(e) => handleAudioUpload("source", e, false)}
                />
                <button
                  class="icon-btn"
                  on:click={() =>
                    document
                      .getElementById(`audioUpload_${selectedItems[0].data.id}`)
                      .click()}
                  title="Upload Audio File">📁</button
                >
              </div>
            </label>
          </div>
          <div class="split-group">
            <div class="input-group">
              <label
                >Base Volume <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={selectedItems[0].data.volume ?? 1.0}
                  on:change={(e) => handleEdit("volume", e)}
                /></label
              >
            </div>
            <div class="input-group">
              <label
                >Fade Dist (units) <input
                  type="number"
                  step="0.5"
                  value={selectedItems[0].data.fade_distance ?? 1.0}
                  on:change={(e) => handleEdit("fade_distance", e)}
                /></label
              >
            </div>
          </div>
        {/if}

        {#if selectedItems[0].category === "event"}
          <div class="input-group">
            <label
              >Event Category
              <select
                value={selectedItems[0].data.type}
                on:change={(e) => handleEdit("type", e)}
              >
                <option value="teleport">Teleport / Portal</option>
                <option value="trap">Trap / Trigger</option>
              </select>
            </label>
          </div>
        {/if}

        <div class="input-group">
          <label
            >Boundary Shape
            <select
              value={selectedItems[0].category === "event"
                ? selectedItems[0].data.trigger_bounds?.shape
                : selectedItems[0].data.bounds?.shape}
              on:change={(e) =>
                mapActions.changeBoundaryShape(
                  selectedItems[0].data.id,
                  selectedItems[0].category,
                  e.target.value,
                )}
            >
              <option value="rectangle">Rectangle (Square)</option>
              <option value="circle">Circle</option>
            </select>
          </label>
        </div>

        {@const boundsPath =
          selectedItems[0].category === "event" ? "trigger_bounds" : "bounds"}
        {@const bounds =
          selectedItems[0].category === "event"
            ? selectedItems[0].data.trigger_bounds
            : selectedItems[0].data.bounds}

        {#if bounds?.shape === "rectangle"}
          <div class="split-group">
            <div class="input-group">
              <label
                >Width (units) <input
                  type="number"
                  step="0.5"
                  value={bounds?.width ?? 1.0}
                  on:change={(e) => handleEdit(`${boundsPath}.width`, e)}
                /></label
              >
            </div>
            <div class="input-group">
              <label
                >Height (units) <input
                  type="number"
                  step="0.5"
                  value={bounds?.height ?? 1.0}
                  on:change={(e) => handleEdit(`${boundsPath}.height`, e)}
                /></label
              >
            </div>
          </div>
        {:else}
          <div class="input-group">
            <label
              >Radius (units) <input
                type="number"
                step="0.5"
                value={bounds?.radius ?? 1.0}
                on:change={(e) => handleEdit(`${boundsPath}.radius`, e)}
              /></label
            >
          </div>
        {/if}

        {#if selectedItems[0].category === "event" && selectedItems[0].data.type === "teleport"}
          {@const currentMapFilename =
            $mapStore.catalog[$mapStore.activeMapIndex]?.filename}
          {@const destVal = getUnifiedDestinationValue(
            selectedItems[0].data.destination,
            $mapStore.catalog,
          )}

          <div class="input-group">
            <label
              >Target Destination
              <select
                value={destVal}
                on:change={(e) =>
                  handleUnifiedDestinationChange(
                    selectedItems[0].data.id,
                    selectedItems[0].category,
                    e.target.value,
                  )}
              >
                <option value="raw"
                  >-- Use Raw X/Y/Z Coordinates (This Map) --</option
                >
                <option value="custom"
                  >-- Manual Custom URI (External Map) --</option
                >

                <optgroup label="📍 This Map (Local)">
                  {#each $mapStore.manifest?.landing_zones || [] as lz}
                    <option value={`intra|${lz.id}`}
                      >Zone: {lz.name || lz.id}</option
                    >
                  {/each}
                </optgroup>

                {#if isBulkSession}
                  {#each $mapStore.catalog as catalogMap}
                    {#if catalogMap.filename !== currentMapFilename}
                      <optgroup label={`🗺️ ${catalogMap.filename}`}>
                        <option value={`inter|${catalogMap.filename}|`}
                          >File: {catalogMap.filename} (Default Spawn)</option
                        >
                        {#each catalogMap.manifest?.landing_zones || [] as lz}
                          <option
                            value={`inter|${catalogMap.filename}|${lz.id}`}
                            >Zone: {lz.name || lz.id}</option
                          >
                        {/each}
                      </optgroup>
                    {/if}
                  {/each}
                {/if}
              </select>
            </label>
          </div>

          {#if destVal === "raw"}
            <div class="split-group">
              <div class="input-group">
                <label
                  >Target X <input
                    type="number"
                    step="1"
                    value={selectedItems[0].data.destination?.target_coordinates
                      ?.x ?? 0}
                    on:change={(e) =>
                      handleEdit("destination.target_coordinates.x", e)}
                  /></label
                >
              </div>
              <div class="input-group">
                <label
                  >Target Y <input
                    type="number"
                    step="1"
                    value={selectedItems[0].data.destination?.target_coordinates
                      ?.y ?? 0}
                    on:change={(e) =>
                      handleEdit("destination.target_coordinates.y", e)}
                  /></label
                >
              </div>
              <div class="input-group">
                <label
                  >Target Z <input
                    type="number"
                    step="1"
                    value={selectedItems[0].data.destination?.target_coordinates
                      ?.z ?? 0}
                    on:change={(e) =>
                      handleEdit("destination.target_coordinates.z", e)}
                  /></label
                >
              </div>
            </div>
          {/if}

          {#if destVal === "custom"}
            <div class="input-group">
              <label
                >Custom URI <input
                  type="text"
                  placeholder="relative://other.uvtt2z#lz_1"
                  value={selectedItems[0].data.destination?.uri ?? ""}
                  on:change={(e) => handleEdit("destination.uri", e)}
                /></label
              >
            </div>
          {/if}

          {#if selectedItems[0].data.destination?.type === "inter_map" && destVal !== "custom"}
            <div class="uri-preview">
              Compiled URI: {selectedItems[0].data.destination?.uri || "None"}
            </div>
          {/if}
        {/if}

        {#if selectedItems[0].category === "event"}
          <div class="checkbox-group">
            <label
              ><input
                type="checkbox"
                checked={selectedItems[0].data.conditions
                  ?.requires_interaction ?? false}
                on:change={(e) =>
                  handleEdit("conditions.requires_interaction", e)}
              /> Requires Manual Click</label
            >
          </div>
        {/if}
      {/if}

      {#if selectedItems[0].category === "wall" || selectedItems[0].category === "portal"}
        <button
          class="action-btn convert-btn"
          on:click={() =>
            mapActions.convertCategory(
              selectedItems[0].data.id,
              selectedItems[0].category,
            )}
          >🔄 Convert to {selectedItems[0].category === "wall"
            ? "Portal"
            : "Wall"}</button
        >
        <button
          class="action-btn reverse-btn"
          on:click={() =>
            mapActions.reverseVector(
              selectedItems[0].data.id,
              selectedItems[0].category,
            )}>↔️ Reverse Direction (Flip Normal)</button
        >
      {/if}

      {#if !["wall", "portal"].includes(selectedItems[0].category)}
        <button
          class="action-btn"
          style="background-color: #d32f2f;"
          on:click={mapActions.deleteSelectedItem}>🗑️ Delete Selected</button
        >
      {/if}
    </div>
  {:else if selectedItems.length > 1}
    <div class="edit-menu">
      <h3>MULTI-SELECT</h3>
      <p class="info-text">{selectedItems.length} items selected</p>
      {#if canMerge}
        <button
          class="action-btn merge-btn"
          on:click={mapActions.mergeSelectedWalls}
          >🔗 Merge Selected Walls</button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .toolbar-container {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 15px;
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  }

  .catalog-switcher {
    background-color: #333;
    padding: 6px;
    border-radius: 8px;
    border: 1px solid #007acc;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }
  .catalog-switcher select {
    margin-top: 0;
    background-color: #1e1e1e;
    font-weight: bold;
    color: #4caf50;
    font-size: 14px;
  }

  .tool-group {
    display: flex;
    align-items: center;
    background-color: #252526;
    border-radius: 8px;
    padding: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    border: 1px solid #3c3c3c;
    gap: 4px;
  }
  .divider {
    width: 1px;
    height: 24px;
    background-color: #555;
    margin: 0 4px;
  }
  button {
    background: transparent;
    border: none;
    color: #cccccc;
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s;
  }
  button:hover {
    background-color: #333333;
    color: white;
  }
  button.active {
    background-color: #007acc;
    color: white;
  }

  .edit-menu {
    background-color: #252526;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    border: 1px solid #3c3c3c;
    color: #e0e0e0;
    width: 260px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .edit-menu h3 {
    margin: 0;
    font-size: 13px;
    letter-spacing: 1px;
    color: #aaaaaa;
    border-bottom: 1px solid #444;
    padding-bottom: 6px;
  }

  .id-label {
    font-size: 11px;
    font-family: monospace;
    color: #007acc;
    margin: 0;
    word-break: break-all;
  }
  .info-text {
    font-size: 13px;
    color: #4caf50;
    margin: 0;
  }
  .warning-text {
    font-size: 12px;
    color: #ff9800;
    font-style: italic;
    margin: 0;
    line-height: 1.4;
  }
  .uri-preview {
    font-size: 11px;
    color: #00bcd4;
    font-family: monospace;
    background: #111;
    padding: 6px;
    border-radius: 4px;
    word-break: break-all;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .split-group {
    display: flex;
    gap: 12px;
  }
  .split-group .input-group {
    flex: 1;
  }

  .file-upload-row {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    margin-top: 4px;
  }
  .file-upload-row input[type="text"] {
    flex: 1;
    margin-top: 0;
  }
  .icon-btn {
    background-color: #333;
    border: 1px solid #555;
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    font-size: 14px;
  }
  .icon-btn:hover {
    background-color: #007acc;
    border-color: #007acc;
  }

  label {
    font-size: 12px;
    color: #cccccc;
    font-weight: bold;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  select,
  input[type="text"],
  input[type="number"] {
    background-color: #1e1e1e;
    color: white;
    border: 1px solid #555;
    padding: 8px;
    border-radius: 4px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    margin-top: 4px;
    font-family: monospace;
  }
  select:focus,
  input[type="text"]:focus,
  input[type="number"]:focus {
    border-color: #007acc;
  }

  .checkbox-group {
    margin-top: 8px;
    background-color: #1e1e1e;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #555;
  }
  .checkbox-group label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: normal;
  }

  .action-btn {
    background-color: #007acc;
    color: white;
    padding: 10px;
    width: 100%;
    border-radius: 4px;
    margin-top: 8px;
  }
  .action-btn:hover {
    background-color: #005f9e;
  }
  .merge-btn {
    background-color: #9c27b0;
  }
  .merge-btn:hover {
    background-color: #7b1fa2;
  }
  .convert-btn {
    background-color: #e65100;
  }
  .convert-btn:hover {
    background-color: #ef6c00;
  }
  .smooth-btn {
    background-color: #0288d1;
  }
  .smooth-btn:hover {
    background-color: #0277bd;
  }
  .reverse-btn {
    background-color: #607d8b;
  }
  .reverse-btn:hover {
    background-color: #455a64;
  }
</style>
