<!-- 
  @component Uploader
  The initial landing screen and global file dropzone[cite: 15].
  Acts as the primary ingestion router for the application, intercepting dropped 
  files and routing them to either the Project Loader (for .zip/.uvtt-proj archives) 
  or the Legacy Parser (for older .dd2vtt or .uvtt formats)[cite: 15].
-->
<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { upgradeLegacyMap } from "$lib/utils/legacyParser.js";
  import { uiStore } from "$lib/stores/uiStore.svelte.js";

  /** @type {HTMLInputElement} Reference to the hidden file input element[cite: 15]. */
  let fileInput;

  /** @type {boolean} Tracks drag state to trigger CSS visual feedback[cite: 15]. */
  let isDragging = $state(false);

  /**
   * Core ingestion router. Iterates over dropped/selected files and determines
   * how the mapStore should process them based on their file extension[cite: 15].
   *
   * @param {File[]} files - Array of HTML5 File objects provided by the drop/input event[cite: 15].
   */
  async function handleFiles(files) {
    if (!files || files.length === 0) return;

    const parsedMaps = [];
    let projectLoaded = false;

    for (const file of files) {
      const fileName = file.name.toLowerCase();

      try {
        // 1. Intercept Secure Archives and Native Project files[cite: 15]
        if (fileName.endsWith(".zip") || fileName.endsWith(".uvtt-proj")) {
          // Loading a full project overwrites the entire store, so we execute it and halt the loop[cite: 15]
          await mapStore.loadProjectFromFile(file);
          projectLoaded = true;
          uiStore.addToast(
            `Successfully loaded project: ${file.name}`,
            "success",
          );
          break;
        }
        // 2. Route standard legacy files to the parser[cite: 15]
        else {
          const text = await file.text();
          const parsedMap = upgradeLegacyMap(text, file.name);
          if (parsedMap) parsedMaps.push(parsedMap);
        }
      } catch (err) {
        console.error("Error reading file:", err);
        uiStore.addToast(`Failed to read file: ${file.name}`, "error");
      }
    }

    // Only set the catalog if we parsed individual legacy maps and didn't load a full project[cite: 15]
    if (!projectLoaded && parsedMaps.length > 0) {
      mapStore.setCatalog(parsedMaps);
      uiStore.addToast(
        `Successfully loaded ${parsedMaps.length} map(s).`,
        "success",
      );
    } else if (!projectLoaded && parsedMaps.length === 0) {
      // Graceful error handling for unsupported file types[cite: 15]
      uiStore.addToast(
        "Failed to parse map files. Ensure they are valid .dd2vtt, .uvtt, or .zip files.",
        "error",
      );
    }

    // Reset the input so the user can re-select the same file later if needed[cite: 15]
    if (fileInput) fileInput.value = "";
  }

  /** Delegate for the manual file browser button[cite: 15]. */
  function onFileChange(event) {
    handleFiles(Array.from(event.target.files));
  }

  /** Intercepts files dropped directly onto the window[cite: 15]. */
  function onDrop(event) {
    event.preventDefault();
    isDragging = false;

    // Modern DataTransferItemList API support with a fallback for older browsers[cite: 15]
    if (event.dataTransfer.items) {
      const files = Array.from(event.dataTransfer.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile());
      handleFiles(files);
    } else {
      handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  /** Activates the glowing CSS border when dragging a file over the window[cite: 15]. */
  function onDragOver(event) {
    event.preventDefault();
    isDragging = true;
  }

  /** Deactivates the dragging CSS state[cite: 15]. */
  function onDragLeave(event) {
    event.preventDefault();
    isDragging = false;
  }
</script>

<div
  class="dropzone {isDragging ? 'dragging' : ''}"
  ondrop={onDrop}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  role="button"
  tabindex="0"
>
  <div class="dropzone-content">
    <div class="icon">📁</div>
    <h2>Drag & Drop your maps here</h2>
    <p>Supports .dd2vtt, .uvtt, .uvtt-proj, and Secure .zip Archives</p>

    <label class="upload-btn">
      <span>Or click to browse</span>
      <input
        type="file"
        multiple
        accept=".dd2vtt,.uvtt,.json,.txt,.zip,.uvtt-proj"
        onchange={onFileChange}
        bind:this={fileInput}
        hidden
      />
    </label>
  </div>
</div>

<style>
  .dropzone {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #0f172a;
    z-index: 20;
    transition: all 0.2s ease-in-out;
  }

  .dropzone.dragging {
    background-color: #1e293b;
    box-shadow: inset 0 0 0 4px #00f0ff;
  }

  .dropzone-content {
    text-align: center;
    border: 2px dashed #334155;
    border-radius: 16px;
    padding: 60px 100px;
    background: #0b1329ee;
    transition: all 0.2s ease-in-out;
  }

  .dropzone.dragging .dropzone-content {
    border-color: #00f0ff;
    transform: scale(1.02);
  }

  .icon {
    font-size: 64px;
    margin-bottom: 20px;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));
  }

  h2 {
    color: #e2e8f0;
    margin: 0 0 10px 0;
    font-size: 24px;
  }

  p {
    color: #94a3b8;
    margin: 0 0 30px 0;
    font-size: 14px;
  }

  .upload-btn {
    background: #00f0ff22;
    border: 1px solid #00f0ff;
    color: #00f0ff;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s;
    display: inline-block;
  }

  .upload-btn:hover {
    background: #00f0ff44;
    box-shadow: 0 0 15px #00f0ff44;
  }
</style>
