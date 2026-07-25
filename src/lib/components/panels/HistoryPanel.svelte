<!-- 
  @component HistoryPanel
  Visual interface for the non-linear undo/redo history state machine[cite: 18].
  Allows the user to view a chronological log of their actions, instantly time-travel 
  by jumping to specific states in the stack, and clear the history cache to free 
  up system RAM during heavy sessions[cite: 18].
-->
<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  // --- SVELTE 5 REACTIVE BINDINGS ---[cite: 18]
  let activeMap = $derived(mapStore.activeMap);
</script>

<div class="panel-section">
  <h3>⏪ ACTION HISTORY</h3>

  <!-- Safely check if the active map has an initialized history stack[cite: 18] -->
  {#if activeMap && activeMap.history && activeMap.history.length > 0}
    <div class="history-list">
      {#each activeMap.history as step, index}
        <!-- 
          Dynamic class assignment: 
          - 'active' highlights the exact current state.
          - 'future' dims actions that have been undone, showing they will be overwritten if a new action is taken[cite: 18].
        -->
        <button
          class="history-item {index === activeMap.historyIndex
            ? 'active'
            : ''} {index > activeMap.historyIndex ? 'future' : ''}"
          onclick={() => mapStore.jumpToHistory(index)}
        >
          <span class="indicator">
            {index === activeMap.historyIndex ? "▶" : ""}
          </span>
          <span class="action-name">{step.actionName}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="helper-text">No history recorded yet.</p>
  {/if}

  <!-- 
    Memory Management Utility:
    Deep-copying massive manifest JSONs for history takes RAM. This allows users to flush it[cite: 18].
  -->
  <button
    class="action-btn"
    style="justify-content: center; color: #f87171; border-color: rgba(248, 113, 113, 0.3); margin-top: 8px;"
    onclick={() => {
      if (
        confirm(
          "Clear undo/redo history? This cannot be undone, but will free up system memory.",
        )
      ) {
        mapStore.clearHistory();
      }
    }}
  >
    🧹 Clear History (Free Memory)
  </button>
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
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
    background: #05080e;
    border: 1px solid #1e293b;
    border-radius: 4px;
    padding: 4px;
  }
  .history-item {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }
  .history-item:hover {
    background: #1e293b;
    color: #e2e8f0;
  }
  .history-item.active {
    background: rgba(0, 240, 255, 0.1);
    color: #00f0ff;
    font-weight: bold;
  }
  .history-item.future {
    color: #475569;
    font-style: italic;
  }
  .indicator {
    width: 12px;
    color: #00f0ff;
    font-size: 10px;
  }
  .action-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
    font-size: 13px;
  }
  .action-btn:hover {
    background: #334155;
  }
</style>
