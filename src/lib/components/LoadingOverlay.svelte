<!-- 
  @component ExportMenu
  Floating UI panel that manages map compilation and exporting[cite: 14].
  Handles translating the in-memory map store into downloadable archives, 
  supporting both the modern UVTT v2 (.uvtt2z) compound folder structure and 
  the legacy V1 (.dd2vtt) monolithic JSON structure[cite: 14].
-->
<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { UvttMigrationEngine } from "$utils/migrationEngine.js";
  import JSZip from "jszip";

  /** @type {string} Target export profile format ('v2' or 'v1')[cite: 14]. */
  let targetProfile = $state("v2");

  /** @type {boolean} Toggle for compiling all maps in the catalog into a single zip[cite: 14]. */
  let packageAsCompound = $state(true);

  /** @type {boolean} UI lock flag to prevent duplicate export triggers[cite: 14]. */
  let isCompiling = $state(false);

  /**
   * Cryptographic SHA-256 fingerprinting utility[cite: 14].
   * Used to generate manifest.hash receipts to ensure archive integrity for split-resolution maps[cite: 14].
   *
   * @param {Blob} blob - The binary file to hash[cite: 14].
   * @returns {Promise<string>} The generated hex string[cite: 14].
   */
  async function generateSha256Hash(blob) {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * OS-safe string formatting utility[cite: 14].
   * Converts user-defined map names into safe directory folder names[cite: 14].
   *
   * @param {string} text - The raw filename[cite: 14].
   * @returns {string} The slugified string[cite: 14].
   */
  function slugify(text) {
    return text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]+/g, "")
      .replace(/\-\-+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
  }

  /**
   * Appends an invisible anchor tag to the DOM to force the browser to download the compiled blob[cite: 14].
   *
   * @param {Blob} blob - The compiled file or archive[cite: 14].
   * @param {string} filename - The target output filename[cite: 14].
   */
  async function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Main export handler triggered by the UI button[cite: 14].
   * Routes the payload to the appropriate compilation pipeline based on the selected profile[cite: 14].
   */
  async function handleExport() {
    if (!$mapStore.manifest) return;
    isCompiling = true;

    try {
      if (targetProfile === "v1") {
        await exportV1();
      } else {
        await exportV2();
      }
    } catch (err) {
      console.error("Compilation error:", err);
      alert(`Asset compilation failed: ${err.message}`);
    } finally {
      isCompiling = false;
    }
  }

  /**
   * Legacy Export Pipeline (v1.0.0)[cite: 14].
   * Flattens curves, strips advanced 3D/audio data, and embeds the image as a Base64 string directly in the JSON[cite: 14].
   */
  async function exportV1() {
    // Convert in-memory manifest to legacy structure[cite: 14]
    const masterState = {
      versionSource: "2.0.0",
      dimensions: {
        widthPx: $mapStore.manifest.resolution?.width_pixels || 1000,
        heightPx: $mapStore.manifest.resolution?.height_pixels || 1000,
        pxPerGrid: $mapStore.manifest.resolution?.pixels_per_grid || 70,
      },
      landingZones: $mapStore.manifest.entities?.landing_zones || [],
      vectors: $mapStore.manifest.geometry?.walls || [],
    };

    const legacyPayload = UvttMigrationEngine.compileToTarget(
      masterState,
      "1.0.0",
    );

    // Re-embed image Base64 payload since V1 does not support external binary assets[cite: 14]
    const activeFilename =
      mapStore.catalog.find((m) => m.id === $mapStore.manifest.id)?.filename ||
      "map.dd2vtt";
    const mapData = mapStore.catalog.find(
      (m) => m.id === $mapStore.manifest.id,
    );

    if (mapData && mapData.image_url) {
      const response = await fetch(mapData.image_url);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result.toString().split(",")[1];
        legacyPayload.image = base64data;

        const fileBlob = new Blob([JSON.stringify(legacyPayload, null, 2)], {
          type: "application/json",
        });
        triggerDownload(
          fileBlob,
          activeFilename.replace(".uvtt2z", "").replace(".dd2vtt", "") +
            "_legacy.dd2vtt",
        );
      };
    }
  }

  /**
   * Modern Export Pipeline (v2.0.0)[cite: 14].
   * Packages the map(s) and binary assets into a secure JSZip archive[cite: 14].
   */
  async function exportV2() {
    const zip = new JSZip();

    if (packageAsCompound && mapStore.catalog.length > 1) {
      // COMPOUND ARCHIVE MODE: Bundles the entire catalog into a multi-level dungeon[cite: 14]
      const rootManifest = {
        uvtt_version: "2.0.0",
        type: "compound",
        sub_maps: mapStore.catalog.map((m) => {
          const slug = slugify(
            m.filename
              .replace(".dd2vtt", "")
              .replace(".df2vtt", "")
              .replace(".uvtt", ""),
          );
          return {
            id: m.id,
            name: m.filename,
            folder: `maps/${slug}`,
          };
        }),
      };

      zip.file("manifest.json", JSON.stringify(rootManifest, null, 2));
      const mapsFolder = zip.folder("maps");

      const hashEntries = [];

      for (const m of mapStore.catalog) {
        const slug = slugify(
          m.filename
            .replace(".dd2vtt", "")
            .replace(".df2vtt", "")
            .replace(".uvtt", ""),
        );
        const mapSubFolder = mapsFolder.folder(slug);

        // Extract image asset and calculate hashes for secure verification[cite: 14]
        const res = await fetch(m.image_url);
        const imgBlob = await res.blob();
        const imgHash = await generateSha256Hash(imgBlob);

        mapSubFolder.file("map.webp", imgBlob);
        hashEntries.push(`maps/${slug}/map.webp: ${imgHash}`);

        // Deep copy manifest to perform local URI transformations without mutating the active store[cite: 14]
        const manifestClone = JSON.parse(JSON.stringify(m.manifest));
        manifestClone.image = `internal://${slug}/map.webp`;

        // Rewrite teleport URLs: Converts relative URLs to internal compound references[cite: 14]
        if (manifestClone.entities?.events) {
          manifestClone.entities.events.forEach((ev) => {
            if (
              ev.destination?.uri &&
              ev.destination.uri.startsWith("relative://")
            ) {
              const destParts = ev.destination.uri
                .replace("relative://", "")
                .split("#");
              const destFilename = destParts[0].replace(".uvtt2z", "");
              const destSlug = slugify(destFilename);

              // Rewrite federated reference into internal compound reference[cite: 14]
              const matchingMap = mapStore.catalog.find(
                (cat) =>
                  slugify(
                    cat.filename
                      .replace(".dd2vtt", "")
                      .replace(".df2vtt", "")
                      .replace(".uvtt", ""),
                  ) === destSlug,
              );
              if (matchingMap) {
                ev.destination.uri = `internal://${destSlug}#${destParts[1]}`;
              }
            }
          });
        }

        // Isolate files into discrete sub-schemas (geometry vs entities)[cite: 14]
        const geometry = manifestClone.geometry || {
          walls: [],
          portals: [],
          overhead: [],
        };
        const entities = manifestClone.entities || {
          lights: [],
          landing_zones: [],
          events: [],
          audio: { zones: [] },
          emitters: [],
        };

        // Delete references from global index to prevent duplication[cite: 14]
        delete manifestClone.geometry;
        delete manifestClone.entities;

        mapSubFolder.file(
          "manifest.json",
          JSON.stringify(manifestClone, null, 2),
        );
        mapSubFolder.file("geometry.json", JSON.stringify(geometry, null, 2));
        mapSubFolder.file("entities.json", JSON.stringify(entities, null, 2));
      }

      zip.file("manifest.hash", hashEntries.join("\n"));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerDownload(zipBlob, "campaign_compound_dungeon.uvtt2z");
    } else {
      // FEDERATED ARCHIVE MODE: Exports a single map directory[cite: 14]
      const activeMap = mapStore.catalog.find(
        (m) => m.id === $mapStore.manifest.id,
      );
      if (!activeMap) return;

      const res = await fetch(activeMap.image_url);
      const imgBlob = await res.blob();
      const imgHash = await generateSha256Hash(imgBlob);

      zip.file("assets/map.webp", imgBlob);

      // Copy sound blobs into asset directory[cite: 14]
      const hashEntries = [`assets/map.webp: ${imgHash}`];
      const assetsFolder = zip.folder("assets");

      for (const [filename, blob] of Object.entries(mapStore.audioBlobs)) {
        assetsFolder.file(filename.replace("assets/", ""), blob);
        const audioHash = await generateSha256Hash(blob);
        hashEntries.push(`${filename}: ${audioHash}`);
      }

      const manifestClone = JSON.parse(JSON.stringify(activeMap.manifest));
      manifestClone.image = "assets/map.webp";

      const geometry = manifestClone.geometry || {
        walls: [],
        portals: [],
        overhead: [],
      };
      const entities = manifestClone.entities || {
        lights: [],
        landing_zones: [],
        events: [],
        audio: { zones: [] },
        emitters: [],
      };

      delete manifestClone.geometry;
      delete manifestClone.entities;

      zip.file("manifest.json", JSON.stringify(manifestClone, null, 2));
      zip.file("geometry.json", JSON.stringify(geometry, null, 2));
      zip.file("entities.json", JSON.stringify(entities, null, 2));
      zip.file("manifest.hash", hashEntries.join("\n"));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerDownload(
        zipBlob,
        activeMap.filename
          .replace(".dd2vtt", "")
          .replace(".df2vtt", "")
          .replace(".uvtt", "") + ".uvtt2z",
      );
    }
  }
</script>

<div class="export-menu">
  <span class="menu-title">💾 Export Manager</span>

  <div class="field-row">
    <span>Exporter Profile:</span>
    <select
      value={targetProfile}
      onchange={(e) => (targetProfile = e.target.value)}
      class="dark-select"
    >
      <option value="v2">Universal VTT v2 (.uvtt2z)</option>
      <option value="v1">Legacy V1 (.dd2vtt)</option>
    </select>
  </div>

  {#if targetProfile === "v2" && mapStore.catalog.length > 1}
    <label class="checkbox-row">
      <input type="checkbox" bind:checked={packageAsCompound} />
      <span>Package Catalog as Compound Dungeon</span>
    </label>
  {/if}

  <button class="compile-btn" onclick={handleExport} disabled={isCompiling}>
    {#if isCompiling}
      ⏳ Compiling...
    {:else}
      🚀 Run Compile & Export
    {/if}
  </button>
</div>

<style>
  .export-menu {
    position: absolute;
    bottom: 15px;
    right: 15px;
    width: 280px;
    background: rgba(13, 20, 30, 0.95);
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 15px;
    color: #f8fafc;
    font-family: system-ui, sans-serif;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }

  .menu-title {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #00f0ff;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: #cbd5e1;
    margin-bottom: 12px;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #94a3b8;
    margin-bottom: 15px;
    cursor: pointer;
  }

  .dark-select {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 6px;
    color: #f8fafc;
    font-size: 12px;
    outline: none;
  }

  .compile-btn {
    width: 100%;
    background: #00f0ff;
    border: none;
    border-radius: 4px;
    padding: 10px;
    color: #0f172a;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .compile-btn:hover:not(:disabled) {
    background: #38bdf8;
    transform: translateY(-1px);
  }

  .compile-btn:disabled {
    background: #475569;
    color: #94a3b8;
    cursor: not-allowed;
  }
</style>
