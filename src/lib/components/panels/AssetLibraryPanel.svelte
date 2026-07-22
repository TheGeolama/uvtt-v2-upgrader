<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let isDesktopPro = $derived(
    typeof window !== "undefined" && !!window?.go?.main,
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

    {#if mapStore.globalAssets.audio.length > 0}
      <div style="margin-top: 15px;">
        <span style="font-size: 10px; font-weight: bold; color: #00f0ff;"
          >AUDIO LOADED ({mapStore.globalAssets.audio.length})</span
        >
        <ul
          style="font-size: 11px; color: #e2e8f0; padding-left: 15px; margin-top: 4px; max-height: 100px; overflow-y: auto;"
        >
          {#each mapStore.globalAssets.audio as aud}
            <li>{aud.name}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if mapStore.globalAssets.images.length > 0}
      <div style="margin-top: 15px;">
        <span style="font-size: 10px; font-weight: bold; color: #00f0ff;"
          >PROPS & TOKENS ({mapStore.globalAssets.images.length})</span
        >
        <div
          style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; max-height: 150px; overflow-y: auto; padding-right: 4px;"
        >
          {#each mapStore.globalAssets.images as img}
            <img
              src={img.data}
              alt={img.name}
              draggable="true"
              ondragstart={(e) => {
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({
                    type: "asset_prop",
                    image: img.data,
                    name: img.name,
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
</style>
