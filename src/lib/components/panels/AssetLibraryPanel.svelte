<!-- 
  @component AssetLibraryPanel
  The Desktop-native Local Asset Library UI.
  Allows Pro users running the Wails/Go desktop application to securely mount 
  entire hard drive directories (gigabytes of tokens/audio) directly into memory 
  without traditional browser upload limits. 
  Includes dynamic genre parsing, text search, high-performance drag-and-drop,
  and Live-Sync OS folder watching.
-->
<script>
  import { onMount, onDestroy } from "svelte";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  // WAILS BINDINGS - Hooking into the Go backend we just built!
  // WAILS BINDINGS - Corrected relative paths!
  import {
    SelectAssetFolder,
    GetAssets,
    GetImageBase64,
  } from "../../../../wailsjs/go/main/AssetManager.js";
  import { EventsOn, EventsOff } from "../../../../wailsjs/runtime/runtime.js";

  /**
   * Evaluates true if the app is running in the Wails Desktop environment
   */
  let isDesktopPro = $derived(
    typeof window !== "undefined" && !!window?.go?.main,
  );

  // --- FILTERING STATE ---
  let selectedGenre = $state("All");
  let searchQuery = $state("");

  // NEW: State for the background image loader
  let isScanning = $state(false);

  // --- WAILS INTEGRATION ---

  async function mountLiveFolder() {
    isScanning = true;
    const result = await SelectAssetFolder();
    if (result) {
      await processLiveAssets(result);
    }
    isScanning = false;
  }

  async function refreshLiveFolder() {
    isScanning = true;
    const result = await GetAssets();
    if (result) {
      await processLiveAssets(result);
    }
    isScanning = false;
  }

  // Converts the lightweight Go references into the rich objects your UI expects,
  // while fetching the base64 data to bypass browser CORS/memory limits.
  async function processLiveAssets(assetList) {
    let newImages = [];

    // In a production app with 10,000 assets, you'd paginate this.
    // For now, we batch load them to interface cleanly with your existing UI.
    for (const asset of assetList) {
      const base64 = await GetImageBase64(asset.path);
      newImages.push({
        name: asset.name,
        path: asset.path,
        data: base64,
      });
    }

    // Preserve existing audio if any, but overwrite the live-synced images
    mapStore.globalAssets = {
      audio: mapStore.globalAssets?.audio || [],
      images: newImages,
    };
  }

  // Hook into the Go fsnotify background thread!
  onMount(() => {
    if (isDesktopPro) {
      EventsOn("assets_changed", refreshLiveFolder);
    }
  });

  onDestroy(() => {
    if (isDesktopPro) {
      EventsOff("assets_changed");
    }
  });

  /**
   * Dynamically extracts unique top-level folders (Genres) from the loaded assets.
   */
  let availableGenres = $derived.by(() => {
    const genres = new Set();
    const allAssets = [
      ...(mapStore.globalAssets?.audio || []),
      ...(mapStore.globalAssets?.images || []),
    ];

    if (allAssets.length === 0) return [];

    const paths = allAssets.map((a) =>
      (a.path || a.name || "").replace(/\\/g, "/"),
    );

    const splitPaths = paths.map((p) => p.split("/"));
    let common = [];
    for (let i = 0; i < splitPaths[0].length - 1; i++) {
      const part = splitPaths[0][i];
      if (splitPaths.every((p) => p.length > i && p[i] === part)) {
        common.push(part);
      } else {
        break;
      }
    }
    const prefix = common.join("/") + (common.length > 0 ? "/" : "");

    const rootFolders = ["Audio", "Maps", "Props", "Tokens"];

    allAssets.forEach((item) => {
      const fullPath = (item.path || item.name || "").replace(/\\/g, "/");
      const relativePath = fullPath.startsWith(prefix)
        ? fullPath.slice(prefix.length)
        : fullPath;
      const parts = relativePath.split("/");

      if (parts.length > 1) {
        if (rootFolders.includes(parts[0]) && parts.length > 2) {
          genres.add(parts[1]);
        } else {
          genres.add(parts[0]);
        }
      }
    });

    return Array.from(genres).sort();
  });

  $effect(() => {
    if (
      selectedGenre !== "All" &&
      availableGenres.length > 0 &&
      !availableGenres.includes(selectedGenre)
    ) {
      selectedGenre = "All";
    }
  });

  /** Filtered Audio */
  let filteredAudio = $derived(
    (mapStore.globalAssets?.audio || []).filter((a) => {
      const normalized = (a.path || a.name || "").replace(/\\/g, "/");
      const matchesGenre =
        selectedGenre === "All" || normalized.includes(`/${selectedGenre}/`);
      const matchesSearch =
        searchQuery.trim() === "" ||
        normalized.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesGenre && matchesSearch;
    }),
  );

  /** Filtered Images */
  let filteredImages = $derived(
    (mapStore.globalAssets?.images || []).filter((img) => {
      const normalized = (img.path || img.name || "").replace(/\\/g, "/");
      const matchesGenre =
        selectedGenre === "All" || normalized.includes(`/${selectedGenre}/`);
      const matchesSearch =
        searchQuery.trim() === "" ||
        normalized.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesGenre && matchesSearch;
    }),
  );
</script>

<div class="panel-section">
  <h3>📦 LOCAL ASSET LIBRARY</h3>

  <!-- DESKTOP PRO UI -->
  {#if isDesktopPro}
    <div style="display: flex; gap: 8px;">
      <button
        class="action-btn wave"
        onclick={mountLiveFolder}
        disabled={isScanning}
      >
        {isScanning ? "⏳ Scanning..." : "📁 Mount Local Folder"}
      </button>

      {#if mapStore.globalAssets?.images?.length > 0 || mapStore.globalAssets?.audio?.length > 0}
        <button
          class="action-btn"
          style="flex: 0.2; justify-content: center;"
          onclick={refreshLiveFolder}
          disabled={isScanning}
          title="Force Refresh Directory"
        >
          🔄
        </button>
      {/if}
    </div>

    <p class="helper-text" style="margin-top: 8px;">
      Select a directory on your hard drive to instantly load custom tokens,
      props, and audio tracks into the engine without uploading.
    </p>

    <!-- SEARCH & FILTER CONTROLS -->
    {#if mapStore.globalAssets?.images?.length > 0 || mapStore.globalAssets?.audio?.length > 0}
      <div class="filters-container">
        {#if availableGenres.length > 0}
          <label class="genre-filter">
            <span>Filter by Genre:</span>
            <select bind:value={selectedGenre}>
              <option value="All">All Genres</option>
              {#each availableGenres as genre}
                <option value={genre}>{genre}</option>
              {/each}
            </select>
          </label>
        {/if}

        <input
          type="text"
          class="search-input"
          placeholder="🔍 Search assets..."
          bind:value={searchQuery}
        />
      </div>
    {/if}

    <!-- AUDIO ASSET LIST -->
    {#if filteredAudio.length > 0}
      <div style="margin-top: 15px;">
        <span style="font-size: 10px; font-weight: bold; color: #00f0ff;"
          >AUDIO LOADED ({filteredAudio.length})</span
        >
        <ul
          style="font-size: 11px; color: #e2e8f0; padding-left: 15px; margin-top: 4px; max-height: 100px; overflow-y: auto;"
        >
          {#each filteredAudio as aud}
            <li title={aud.name || aud.path}>
              {(aud.name || aud.path || "Audio Track")
                .replace(/\\/g, "/")
                .split("/")
                .pop()}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- IMAGE/PROP ASSET GRID -->
    {#if filteredImages.length > 0}
      <div style="margin-top: 15px;">
        <span style="font-size: 10px; font-weight: bold; color: #00f0ff;"
          >PROPS & TOKENS ({filteredImages.length})</span
        >
        <div
          style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; max-height: 150px; overflow-y: auto; padding-right: 4px;"
        >
          {#each filteredImages as img}
            {@const filename = (img.name || img.path || "Prop")
              .replace(/\\/g, "/")
              .split("/")
              .pop()}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <img
              src={img.data}
              alt={filename}
              title={img.name || img.path}
              draggable="true"
              ondragstart={(e) => {
                window.__uvttDraggedAsset = {
                  type: "asset_prop",
                  image: img.data,
                  name: filename,
                  naturalWidth: e.target.naturalWidth,
                  naturalHeight: e.target.naturalHeight,
                };
                e.dataTransfer.setData("text/plain", "uvtt_internal_asset");
                e.dataTransfer.effectAllowed = "copy";
              }}
              ondragend={() => {
                window.__uvttDraggedAsset = null;
              }}
              style="width: 48px; height: 48px; object-fit: cover; border: 1px solid #334155; border-radius: 4px; cursor: grab;"
            />
          {/each}
        </div>
      </div>
    {/if}

    {#if searchQuery.trim() !== "" && filteredImages.length === 0 && filteredAudio.length === 0}
      <p
        class="helper-text"
        style="margin-top: 15px; text-align: center; font-style: italic;"
      >
        No assets matched your search.
      </p>
    {/if}

    <!-- WEB/BROWSER FALLBACK UI -->
  {:else}
    <button
      class="action-btn secure"
      style="cursor: not-allowed; opacity: 0.8; font-weight: bold;"
    >
      🔒 Upgrade to Pro
    </button>
    <p class="helper-text" style="margin-top: 12px;">
      The Global Asset Library requires unrestricted local file system access.
      Upgrade to the Desktop Pro version to securely mount local OS folders and
      drag-and-drop gigabytes of assets instantly.
    </p>
  {/if}
</div>

<style>
  /* All of your existing styles are preserved perfectly */
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
    white-space: nowrap;
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
    background: rgba(56, 189, 248, 0.1);
    border-color: rgba(56, 189, 248, 0.4);
    color: #38bdf8;
  }
  .action-btn.wave:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.2);
  }
  .action-btn.secure {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.4);
    color: #fcd34d;
  }

  /* FILTER AND SEARCH STYLES */
  .filters-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    background: rgba(15, 23, 42, 0.6);
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #1e293b;
  }
  .genre-filter {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #94a3b8;
  }
  .genre-filter select {
    background: #05080e;
    border: 1px solid #334155;
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    outline: none;
    flex: 1;
  }
  .search-input {
    width: 100%;
    background: #05080e;
    border: 1px solid #334155;
    color: #fff;
    padding: 6px 8px;
    border-radius: 4px;
    outline: none;
    font-size: 12px;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }
  .search-input:focus {
    border-color: #00f0ff;
  }
  .search-input::placeholder {
    color: #64748b;
  }
</style>
