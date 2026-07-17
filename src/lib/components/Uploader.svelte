<script>
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { upgradeLegacyMap } from "$lib/utils/legacyParser.js";

  let fileInput;
  let isDragging = $state(false);

  async function handleFiles(files) {
    if (!files || files.length === 0) return;

    const parsedMaps = [];
    let projectLoaded = false;

    for (const file of files) {
      const fileName = file.name.toLowerCase();

      // 1. Intercept our new Secure Archives and Project files
      if (fileName.endsWith(".zip") || fileName.endsWith(".uvtt-proj")) {
        await mapStore.loadProjectFromFile(file);
        projectLoaded = true;
        break; // A project/zip overwrites the store, so we stop parsing other files
      }
      // 2. Route standard legacy files to the parser
      else {
        const text = await file.text();
        const parsedMap = upgradeLegacyMap(text, file.name);
        if (parsedMap) parsedMaps.push(parsedMap);
      }
    }

    // Only set the catalog if we parsed individual legacy maps and didn't load a full project
    if (!projectLoaded && parsedMaps.length > 0) {
      mapStore.setCatalog(parsedMaps);
    } else if (!projectLoaded && parsedMaps.length === 0) {
      alert(
        "Failed to parse map files. Ensure they are valid .dd2vtt, .uvtt, or .zip files.",
      );
    }

    if (fileInput) fileInput.value = "";
  }

  function onFileChange(event) {
    handleFiles(Array.from(event.target.files));
  }

  function onDrop(event) {
    event.preventDefault();
    isDragging = false;
    if (event.dataTransfer.items) {
      const files = Array.from(event.dataTransfer.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile());
      handleFiles(files);
    } else {
      handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  function onDragOver(event) {
    event.preventDefault();
    isDragging = true;
  }

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
