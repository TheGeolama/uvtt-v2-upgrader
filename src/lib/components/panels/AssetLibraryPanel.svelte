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
    const extractGenre = (item) => {
      // Fallback to name if path isn't explicitly provided by the Go struct
      const pathString = item.path || item.name || "";
      const cleanPath = pathString.replace(/^[/\\]/, "");
      const parts = cleanPath.split(/[/\\]/);

      // If the file is inside a subfolder, treat that top-level folder as the Genre
      if (parts.length > 1) {
        genres.add(parts[0]);
      }
    };

    (mapStore.globalAssets?.audio || []).forEach(extractGenre);
    (mapStore.globalAssets?.images || []).forEach(extractGenre);

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
      const pathString = a.path || a.name || "";
      const cleanPath = pathString.replace(/^[/\\]/, "");
      return (
        cleanPath.startsWith(selectedGenre + "/") ||
        cleanPath.startsWith(selectedGenre + "\\")
      );
    }),
  );

  let filteredImages = $derived(
    (mapStore.globalAssets?.images || []).filter((img) => {
      if (selectedGenre === "All") return true;
      const pathString = img.path || img.name || "";
      const cleanPath = pathString.replace(/^[/\\]/, "");
      return (
        cleanPath.startsWith(selectedGenre + "/") ||
        cleanPath.startsWith(selectedGenre + "\\")
      );
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
              {(aud.name || aud.path || "Audio Track").split(/[/\\]/).pop()}
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
              .split(/[/\\]/)
              .pop()}
            <img
              src={img.data}
              alt={filename}
              title={img.name || img.path}
              draggable="true"
              ondragstart={(e) => {
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({
                    type: "asset_prop",
                    image: img.data,
                    name: filename,
                  }),
                );
                e.dataTransfer.effectAllowed = "copy";
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
    background: #3b82f622;
    border-color: #3b82f6;
    color: #93c5fd;
  }
  .action-btn.secure {
    background: #a855f722;
    border-color: #a855f7;
    color: #d8b4fe;
  }

  /* Genre Filter Styles */
  .genre-filter {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 12px;
    font-size: 11px;
    color: #cbd5e1;
    font-weight: 600;
  }
  .genre-filter select {
    background: #0f172a;
    border: 1px solid #334155;
    color: #e2e8f0;
    padding: 6px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }
  .genre-filter select:focus {
    border-color: #00f0ff;
  }
</style>
