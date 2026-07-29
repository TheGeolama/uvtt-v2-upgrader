<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * Toggles the Main Map designation.
   * Enforces the "Highlander Rule" (exactly one map must be the default).
   */
  function setMainMap(targetId) {
    // SVELTE 5 FIX: Reassigning the array guarantees the reactivity tracker fires,
    // even if the is_default property didn't exist on the object previously.
    mapStore.catalog = mapStore.catalog.map((mapDef) => {
      mapDef.is_default = mapDef.id === targetId;
      return mapDef;
    });

    mapStore.triggerAutoSave();
  }
</script>

<div class="panel-section">
  <h3>📑 COMPOUND LEVELS</h3>

  <button
    class="action-btn positive"
    style="justify-content: center; margin-bottom: 8px;"
    onclick={() => mapStore.addMapLevel()}
    title="Add a new map level"
  >
    ➕ Add New Floor
  </button>

  {#if mapStore.catalog.length === 0}
    <p
      class="helper-text"
      style="text-align: center; margin: 15px 0; padding: 20px; border: 2px dashed #334155; border-radius: 8px;"
    >
      No levels exist. Add a floor to begin.
    </p>
  {:else}
    <ul class="level-list custom-scrollbar">
      {#each mapStore.catalog as map (map.id)}
        <li
          class="level-item {mapStore.activeMapId === map.id ? 'active' : ''}"
        >
          <!-- Semantic background button covering the entire row -->
          <div
            class="level-info"
            onclick={() => mapStore.switchMap(map.id)}
            role="button"
            tabindex="0"
            onkeypress={(e) => {
              if (e.key === "Enter") mapStore.switchMap(map.id);
            }}
          >
            <!-- Svelte 5 Direct 2-Way Binding for renaming maps -->
            <input
              type="text"
              bind:value={map.filename}
              onchange={() => mapStore.triggerAutoSave()}
              class="level-rename"
              title="Click to rename"
              onclick={(e) => e.stopPropagation()}
            />
            <span class="z-index-label">Z-Index: {map.z_index || 0}</span>
          </div>

          <!-- Quick Actions -->
          <div class="level-actions">
            <button
              class="icon-btn star {map.is_default ? 'is-default' : ''}"
              title={map.is_default
                ? "Main Map (Loads First in VTT)"
                : "Set as Main Map"}
              onclick={(e) => {
                e.stopPropagation();
                setMainMap(map.id);
              }}
            >
              ⭐
            </button>

            <button
              class="icon-btn delete"
              title="Delete Level"
              onclick={(e) => {
                e.stopPropagation();
                mapStore.deleteMapLevel(map.id);
              }}
            >
              🗑️
            </button>
          </div>
        </li>
      {/each}
    </ul>
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
  .action-btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
    font-size: 13px;
  }
  .action-btn:hover {
    background: #334155;
  }
  .action-btn.positive {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.4);
    color: #4ade80;
  }
  .action-btn.positive:hover {
    background: rgba(34, 197, 94, 0.2);
  }

  /* List & Row Styles */
  .level-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    margin: 0;
    list-style: none;
    max-height: 400px;
    overflow-y: auto;
  }
  .level-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #05080e;
    border: 1px solid #1e293b;
    padding: 8px;
    border-radius: 6px;
    transition:
      border-color 0.2s,
      background 0.2s;
    cursor: pointer;
  }
  .level-item:hover {
    border-color: rgba(56, 189, 248, 0.5);
  }
  .level-item.active {
    background: rgba(0, 240, 255, 0.05);
    border-color: #00f0ff;
  }

  /* Info & Rename Input */
  .level-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .level-rename {
    background: transparent;
    border: none;
    color: #e2e8f0;
    font-weight: bold;
    font-size: 13px;
    outline: none;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: text;
    padding: 2px 0;
  }
  .level-rename:focus {
    border-bottom: 1px solid #00f0ff;
    margin-bottom: -1px;
  }
  .z-index-label {
    font-size: 10px;
    color: #64748b;
    font-family: monospace;
  }

  /* Actions */
  .level-actions {
    display: flex;
    gap: 4px;
    margin-left: 12px;
  }
  .icon-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 14px;
    opacity: 0.6;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover {
    opacity: 1;
    background: #1e293b;
  }
  .icon-btn.star.is-default {
    opacity: 1;
    text-shadow: 0 0 8px rgba(250, 204, 21, 0.8);
  }
  .icon-btn.delete:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  /* Scrollbar */
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(30, 41, 59, 0.5);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
</style>
