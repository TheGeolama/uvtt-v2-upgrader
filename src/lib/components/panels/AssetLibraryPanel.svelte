<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let isDesktopPro = $derived(
    typeof window !== "undefined" && !!window?.go?.main,
  );

  // --- GENRE FILTERING STATE ---
  let selectedGenre = $state("All");

  // Dynamically extract unique top-level folders (Genres) from the loaded assets
  let availableGenres = $derived.by(() => {
    const genres = new Set();
    const allAssets = [
      ...(mapStore.globalAssets?.audio || []),
      ...(mapStore.globalAssets?.images || []),
    ];

    if (allAssets.length === 0) return [];

    // Normalize paths to forward slashes
    const paths = allAssets.map((a) =>
      (a.path || a.name || "").replace(/\\/g, "/"),
    );

    // Find the common root directory across ALL loaded assets
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

    // Known top-level asset directories (so we don't accidentally list 'Props' as a genre)
    const rootFolders = ["Audio", "Maps", "Props", "Tokens"];

    allAssets.forEach((item) => {
      const fullPath = (item.path || item.name || "").replace(/\\/g, "/");
      // Strip the absolute root path to get the relative folder structure
      const relativePath = fullPath.startsWith(prefix)
        ? fullPath.slice(prefix.length)
        : fullPath;
      const parts = relativePath.split("/");

      if (parts.length > 1) {
        // If the first folder is an asset category, the Genre is the NEXT folder
        if (rootFolders.includes(parts[0]) && parts.length > 2) {
          genres.add(parts[1]);
        } else {
          // Otherwise, treat the first relative folder as the Genre
          genres.add(parts[0]);
        }
      }
    });

    return Array.from(genres).sort();
  });

  // Reset the dropdown if the user mounts a new folder that doesn't have the currently selected genre
  $effect(() => {
    if (
      selectedGenre !== "All" &&
      availableGenres.length > 0 &&
      !availableGenres.includes(selectedGenre)
    ) {
      selectedGenre = "All";
    }
  });

  // --- FILTERED ASSET ARRAYS ---
  let filteredAudio = $derived(
    (mapStore.globalAssets?.audio || []).filter((a) => {
      if (selectedGenre === "All") return true;
      const normalized = (a.path || a.name || "").replace(/\\/g, "/");
      return normalized.includes(`/${selectedGenre}/`);
    }),
  );

  let filteredImages = $derived(
    (mapStore.globalAssets?.images || []).filter((img) => {
      if (selectedGenre === "All") return true;
      const normalized = (img.path || img.name || "").replace(/\\/g, "/");
      return normalized.includes(`/${selectedGenre}/`);
    }),
  );
</script>

<div class="panel-section">
  <h3>📂 LOCAL ASSET LIBRARY</h3>

  {#if isDesktopPro}
    <button
      class="action-btn wave"
      onclick={() => mapStore.mountAssetLibrary()}
    >
      📁 Mount Local Folder
    </button>
    <p class="helper-text" style="margin-top: 8px;">
      Select a directory on your hard drive to instantly load custom tokens,
      props, and audio tracks into the engine without uploading.
    </p>

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
            <img
              src={img.data}
              alt={filename}
              title={img.name || img.path}
              draggable="true"
              ondragstart={(e) => {
                // 1. Bypass HTML5 payload limits by storing in window memory
                window.__uvttDraggedAsset = {
                  type: "asset_prop",
                  image: img.data,
                  name: filename,
                };

                // 2. We still must set some data to satisfy the HTML5 Drag-and-Drop API rules
                e.dataTransfer.setData("text/plain", "uvtt_internal_asset");
                e.dataTransfer.effectAllowed = "copy";
              }}
              ondragend={() => {
                // Clean up memory when the drag finishes (or drops)
                window.__uvttDraggedAsset = null;
              }}
              style="width: 48px; height: 48px; object-fit: cover; border: 1px solid #334155; border-radius: 4px; cursor: grab;"
            />
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <button
      class="action-btn secure"
      style="cursor: not-allowed; opacity: 0.8; font-weight: bold;"
    >
      ⭐ Upgrade to Pro
    </button>
    <p class="helper-text" style="margin-top: 12px;">
      The Global Asset Library requires unrestricted local file system access.
      Upgrade to the Desktop Pro version to securely mount local OS folders and
      drag-and-drop gigabytes of assets instantly.
    </p>
  {/if}
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
    white-space: nowrap;
  }
  button:hover {
    background: #334155;
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
  .action-btn.wave:hover {
    background: rgba(56, 189, 248, 0.2);
  }
  .action-btn.secure {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.4);
    color: #fcd34d;
  }
  .genre-filter {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #94a3b8;
    margin-top: 12px;
  }
  .genre-filter select {
    background: #0f172a;
    border: 1px solid #334155;
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    outline: none;
    flex: 1;
  }
</style>
