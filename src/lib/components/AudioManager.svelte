<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let activeMap = $derived(mapStore.activeMap);
  let audioBlobs = $derived(mapStore.audioBlobs);
  let trackNames = $derived(Object.keys(audioBlobs));

  let currentlyPlaying = $state(null);
  let audioPlayer = $state(null);

  function handleAudioUpload(event) {
    const files = Array.from(event.target.files);
    for (const file of files) {
      // Add directly to the deeply reactive proxy store
      mapStore.audioBlobs[file.name] = file;
    }
    event.target.value = "";
  }

  function togglePlay(trackName) {
    if (currentlyPlaying === trackName) {
      audioPlayer.pause();
      currentlyPlaying = null;
    } else {
      if (audioPlayer) {
        audioPlayer.pause();
        URL.revokeObjectURL(audioPlayer.src);
      }
      const blob = audioBlobs[trackName];
      audioPlayer = new Audio(URL.createObjectURL(blob));
      audioPlayer.play();
      audioPlayer.onended = () => {
        currentlyPlaying = null;
        URL.revokeObjectURL(audioPlayer.src);
      };
      currentlyPlaying = trackName;
    }
  }

  function removeTrack(trackName) {
    if (currentlyPlaying === trackName && audioPlayer) {
      audioPlayer.pause();
      currentlyPlaying = null;
    }
    delete mapStore.audioBlobs[trackName];
  }
</script>

{#if activeMap}
  <div class="audio-panel">
    <div class="header">
      <span class="icon">🔊</span> AUDIO ASSETS
    </div>

    <div class="upload-section">
      <label class="upload-btn">
        <span>➕ Upload Track (.ogg, .mp3)</span>
        <input
          type="file"
          multiple
          accept=".ogg,.mp3,audio/*"
          onchange={handleAudioUpload}
          hidden
        />
      </label>
    </div>

    <div class="track-list">
      {#if trackNames.length === 0}
        <div class="empty-state">No audio tracks bundled yet.</div>
      {:else}
        {#each trackNames as track}
          <div class="track-item">
            <button
              class="play-btn"
              onclick={() => togglePlay(track)}
              title="Play/Pause"
            >
              {currentlyPlaying === track ? "⏸️" : "▶️"}
            </button>
            <span class="track-name" title={track}>{track}</span>
            <button
              class="delete-btn"
              onclick={() => removeTrack(track)}
              title="Delete Track">❌</button
            >
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .audio-panel {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 240px;
    background: #0b1329ee;
    border: 1px solid #1e293b;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    max-height: 300px;
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
    gap: 6px;
  }
  .upload-section {
    padding: 10px;
    border-bottom: 1px solid #1e293b;
  }
  .upload-btn {
    background: #1e293b;
    border: 1px dashed #3b82f6;
    color: #93c5fd;
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    display: flex;
    justify-content: center;
    transition: all 0.2s;
  }
  .upload-btn:hover {
    background: #3b82f622;
    border-color: #00f0ff;
    color: #00f0ff;
  }
  .track-list {
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .empty-state {
    font-size: 11px;
    color: #64748b;
    text-align: center;
    padding: 10px;
  }
  .track-item {
    background: #1e293b;
    border-radius: 4px;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .track-name {
    flex: 1;
    font-size: 11px;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .play-btn,
  .delete-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 10px;
    padding: 2px;
    border-radius: 3px;
  }
  .play-btn:hover,
  .delete-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .track-list::-webkit-scrollbar {
    width: 6px;
  }
  .track-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .track-list::-webkit-scrollbar-thumb {
    background: #334155;
    border-radius: 3px;
  }
</style>
