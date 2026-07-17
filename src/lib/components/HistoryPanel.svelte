<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let activeMap = $derived(mapStore.activeMap);
  let history = $derived(activeMap?.history || []);
  let historyIndex = $derived(activeMap?.historyIndex ?? -1);

  // Global Keyboard Shortcuts for Undo/Redo
  function handleKeydown(e) {
    // Ignore keystrokes if the user is typing in a text box
    const tagName = e.target.tagName;
    if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          mapStore.redo();
        } else {
          mapStore.undo();
        }
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        mapStore.redo();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if activeMap && history.length > 0}
  <div class="history-panel">
    <div class="header">
      <div class="title-group">
        <span class="icon">🕒</span> HISTORY
      </div>
      <div class="actions">
        <button
          class="quick-btn"
          disabled={historyIndex <= 0}
          onclick={() => mapStore.undo()}
          title="Undo (Ctrl+Z)"
          aria-label="Undo">↩️</button
        >
        <button
          class="quick-btn"
          disabled={historyIndex >= history.length - 1}
          onclick={() => mapStore.redo()}
          title="Redo (Ctrl+Y)"
          aria-label="Redo">↪️</button
        >
      </div>
    </div>
    <div class="history-list">
      {#each history as item, i}
        <button
          class="history-item"
          class:active={i === historyIndex}
          class:undone={i > historyIndex}
          onclick={() => mapStore.jumpToHistory(i)}
        >
          <span class="bullet"></span>
          {item.actionName}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .history-panel {
    position: absolute;
    top: 80px;
    right: 20px;
    width: 240px;
    background: #0b1329ee;
    border: 1px solid #1e293b;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    max-height: 400px;
    pointer-events: auto;
    z-index: 10;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3);
    font-family: system-ui, sans-serif;
  }
  .header {
    font-size: 11px;
    font-weight: bold;
    color: #00f0ff;
    letter-spacing: 0.5px;
    padding: 8px 12px;
    border-bottom: 1px solid #1e293b;
    background: rgba(0, 0, 0, 0.2);
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .actions {
    display: flex;
    gap: 4px;
  }
  .quick-btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 4px;
    cursor: pointer;
    padding: 4px 6px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  .quick-btn:hover:not(:disabled) {
    background: #334155;
    border-color: #00f0ff;
  }
  .quick-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .history-list {
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .history-item {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    padding: 6px 8px;
    text-align: left;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.1s;
  }
  .history-item:hover {
    background: #1e293b;
    color: #e2e8f0;
  }
  .history-item.active {
    background: #00f0ff22;
    color: #00f0ff;
    font-weight: bold;
  }
  .history-item.active .bullet {
    background: #00f0ff;
    box-shadow: 0 0 4px #00f0ff;
  }
  .history-item.undone {
    opacity: 0.4;
  }
  .bullet {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #475569;
    flex-shrink: 0;
  }

  /* Scrollbar styling */
  .history-list::-webkit-scrollbar {
    width: 6px;
  }
  .history-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .history-list::-webkit-scrollbar-thumb {
    background: #334155;
    border-radius: 3px;
  }
</style>
