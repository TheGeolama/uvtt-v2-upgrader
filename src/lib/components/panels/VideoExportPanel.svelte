<script>
  import {
    SelectSaveLocation,
    StartExport,
    AddFrame,
    AddAudio,
    FinishExport,
  } from "../../../../wailsjs/go/main/VideoExporter.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { audioEngine } from "$lib/utils/spatialAudio.js";

  let isDesktopPro = $derived(
    typeof window !== "undefined" && !!window?.go?.main,
  );

  let isExporting = $state(false);
  let progress = $state(0);
  let duration = $state(5);
  let fps = $state(30);
  let statusText = $state("");

  /** Converts a raw Web Audio buffer into a standard WAV Base64 string */
  function audioBufferToWavBase64(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const wav = new ArrayBuffer(44 + buffer.length * blockAlign);
    const view = new DataView(wav);

    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + buffer.length * blockAlign, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, "data");
    view.setUint32(40, buffer.length * blockAlign, true);

    const offset = 44;
    const left = buffer.getChannelData(0);
    const right = numChannels > 1 ? buffer.getChannelData(1) : left;

    let pos = offset;
    for (let i = 0; i < buffer.length; i++) {
      let sampleL = Math.max(-1, Math.min(1, left[i]));
      view.setInt16(
        pos,
        sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7fff,
        true,
      );
      pos += 2;
      if (numChannels > 1) {
        let sampleR = Math.max(-1, Math.min(1, right[i]));
        view.setInt16(
          pos,
          sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7fff,
          true,
        );
        pos += 2;
      }
    }

    let binary = "";
    const bytes = new Uint8Array(wav);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** The Audio Pass: Instantly renders the soundscape into memory */
  async function generateOfflineAudioTrack() {
    const activeMap = mapStore.activeMap;
    const audioZones = activeMap?.manifest?.entities?.audio?.zones || [];

    if (audioZones.length === 0) {
      console.log("[Audio Export] No spatial audio zones found on map.");
      return false;
    }

    // THE FIX: Directly grab the native Grid Coordinates we exposed in CanvasWorkspace
    const listenerX = mapStore.cameraX !== undefined ? mapStore.cameraX : 0;
    const listenerY = mapStore.cameraY !== undefined ? mapStore.cameraY : 0;

    console.log(
      `[Audio Export] Commencing scan. Virtual microphone stationed at X:${listenerX.toFixed(2)}, Y:${listenerY.toFixed(2)}`,
    );

    const geometry = activeMap.manifest.geometry;

    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(
      2,
      sampleRate * duration,
      sampleRate,
    );
    let hasRenderedSomething = false;

    // Set to false for mathematically accurate production renders.
    const FORCE_AUDIO_BYPASS = false;

    for (const zone of audioZones) {
      if (!zone.track) continue;

      const buffer = audioEngine.buffers.get(zone.track);

      if (!buffer || buffer === "loading") {
        console.warn(
          `[Audio Export] ⚠️ Skipped '${zone.track}' - Audio buffer was not decoded in memory. Did you click the map to unlock Web Audio first?`,
        );
        continue;
      }

      const ex = Number(zone.center?.x) || 0;
      const ey = Number(zone.center?.y) || 0;
      const dx = ex - listenerX;
      const dy = ey - listenerY;

      // Distance is now natively measured in Grid Units
      const distance = Math.sqrt(dx * dx + dy * dy);

      // NO MULTIPLIER: We use native grid units directly
      const innerRadius = Number(zone.inner_radius) || 2.5;
      const fadeRadius = Number(zone.radius) || 5.0;
      const baseVolume = (Number(zone.volume) || 100) / 100;

      let targetVolume = 0;
      if (distance <= innerRadius) {
        targetVolume = baseVolume;
      } else if (distance < fadeRadius) {
        const fadeRatio =
          1 - (distance - innerRadius) / (fadeRadius - innerRadius);
        targetVolume = baseVolume * fadeRatio;
      }

      console.log(
        `[Audio Export] Checking '${zone.track}': Distance is ${distance.toFixed(2)} units / Max Radius is ${fadeRadius.toFixed(2)} units`,
      );

      if (targetVolume < 0.005 && !FORCE_AUDIO_BYPASS) {
        console.log(
          `[Audio Export] 🔇 '${zone.track}' is out of range (Volume: ${targetVolume.toFixed(3)}). Skipping.`,
        );
        continue;
      }

      const shouldMuffle = zone.muffledByWalls ?? true;
      const occlusionCount = shouldMuffle
        ? audioEngine._getOcclusionCount(listenerX, listenerY, ex, ey, geometry)
        : 0;
      const targetFrequency = occlusionCount > 0 ? 600 : 22050;

      if (occlusionCount === 1) targetVolume *= 0.1;
      else if (occlusionCount === 2) targetVolume *= 0.05;
      else if (occlusionCount >= 3) targetVolume *= 0.01;

      if (targetVolume < 0.005 && !FORCE_AUDIO_BYPASS) {
        console.log(
          `[Audio Export] 🧱 '${zone.track}' was completely muffled by ${occlusionCount} solid walls. Skipping.`,
        );
        continue;
      }

      if (FORCE_AUDIO_BYPASS) {
        targetVolume = baseVolume;
      }

      console.log(
        `[Audio Export] 🔊 Rendering '${zone.track}' into offline buffer (Vol: ${targetVolume.toFixed(2)}, Occlusion: ${occlusionCount} walls)`,
      );
      hasRenderedSomething = true;

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = offlineCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = FORCE_AUDIO_BYPASS ? 22050 : targetFrequency;

      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, dx / fadeRadius));

      const gainNode = offlineCtx.createGain();
      gainNode.gain.value = targetVolume;

      source.connect(filter);
      filter.connect(panner);
      panner.connect(gainNode);
      gainNode.connect(offlineCtx.destination);
      source.start(0);
    }

    if (!hasRenderedSomething) {
      console.warn(
        "[Audio Export] No zones were loud enough to be heard. Exporting silent video.",
      );
      return false;
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const base64Wav = audioBufferToWavBase64(renderedBuffer);

    await AddAudio(base64Wav);
    return true;
  }

  async function generateCinematic() {
    const pixiApp = mapStore.pixiApp;
    if (!pixiApp) return;

    isExporting = true;
    progress = 0;

    const originalDateNow = Date.now;
    let simulatedDateNow = originalDateNow();
    Date.now = () => simulatedDateNow;

    pixiApp.ticker.stop();
    let simulatedPerfTime = performance.now();

    try {
      const savePath = await SelectSaveLocation();
      if (!savePath) return;

      // 1. PRIME VIDEO PIPELINE FIRST
      await StartExport(savePath, fps);

      // 2. THE AUDIO PASS
      statusText = "🎧 Rendering spatial audio...";
      await new Promise((r) => setTimeout(r, 50));
      const hasAudioTrack = await generateOfflineAudioTrack();

      // 3. THE VIDEO PASS
      statusText = "🎥 Rendering video frames...";
      const totalFrames = fps * duration;
      const frameDelay = 1000 / fps;
      const extractOptions = { target: pixiApp.stage, frame: pixiApp.screen };

      for (let i = 0; i < totalFrames; i++) {
        simulatedDateNow += frameDelay;
        simulatedPerfTime += frameDelay;

        pixiApp.ticker.update(simulatedPerfTime);
        pixiApp.render();

        const base64 = await pixiApp.renderer.extract.base64(extractOptions);
        await AddFrame(base64);

        progress = Math.round(((i + 1) / totalFrames) * 100);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // 4. THE MUXING PASS
      statusText = hasAudioTrack
        ? "🎬 Muxing audio & finalizing MP4..."
        : "🎬 Finalizing silent MP4...";
      await new Promise((r) => setTimeout(r, 50));

      await FinishExport();
    } catch (err) {
      console.error("Video Export Failed:", err);
    } finally {
      Date.now = originalDateNow;
      if (pixiApp && !pixiApp.ticker.started) {
        pixiApp.ticker.start();
      }
      isExporting = false;
      progress = 0;
      statusText = "";
    }
  }
</script>

<div class="panel-section">
  <h3>🎬 CINEMATIC EXPORT</h3>

  {#if isDesktopPro}
    <p class="helper-text">
      Render a perfectly looping, high-definition MP4 of your map with dynamic
      lighting and weather effects.
    </p>

    <div class="controls">
      <label>
        <span>Duration (sec):</span>
        <input
          type="number"
          min="1"
          max="60"
          bind:value={duration}
          disabled={isExporting}
        />
      </label>
      <label>
        <span>Framerate:</span>
        <select bind:value={fps} disabled={isExporting}>
          <option value={24}>24 FPS (Cinematic)</option>
          <option value={30}>30 FPS (Standard)</option>
          <option value={60}>60 FPS (Ultra Smooth)</option>
        </select>
      </label>
    </div>

    <button
      class="action-btn wave"
      onclick={generateCinematic}
      disabled={isExporting}
    >
      {#if isExporting}
        ⏳ Exporting ({progress}%)...
      {:else}
        🎥 Export MP4 Map
      {/if}
    </button>

    {#if isExporting}
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progress}%"></div>
      </div>
      <p class="helper-text status" style="color: #38bdf8;">
        {statusText}
      </p>
      <p class="helper-text warning">
        Please do not interact with the map while the camera is rolling!
      </p>
    {/if}
  {:else}
    <button class="action-btn secure" disabled> 🔒 Upgrade to Pro </button>
    <p class="helper-text">
      Video exporting requires native FFmpeg acceleration. Upgrade to Pro to
      unlock cinematic map renders.
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
  .helper-text.warning {
    color: #fcd34d;
    text-align: center;
    font-weight: bold;
    margin-top: 4px;
  }
  .helper-text.status {
    text-align: center;
    font-weight: bold;
    margin-top: 4px;
  }
  .controls {
    display: flex;
    gap: 10px;
    margin: 8px 0;
  }
  .controls label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: #94a3b8;
    flex: 1;
  }
  .controls input,
  .controls select {
    background: #05080e;
    border: 1px solid #334155;
    color: #fff;
    padding: 6px;
    border-radius: 4px;
    outline: none;
  }
  button {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    text-align: center;
    transition: all 0.2s;
  }
  button:hover:not(:disabled) {
    background: #334155;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .action-btn.wave {
    background: rgba(56, 189, 248, 0.1);
    border-color: rgba(56, 189, 248, 0.4);
    color: #38bdf8;
  }
  .action-btn.wave:hover:not(:disabled) {
    background: rgba(56, 189, 248, 0.2);
  }
  .progress-bar {
    width: 100%;
    height: 6px;
    background: #05080e;
    border-radius: 3px;
    overflow: hidden;
    margin-top: 4px;
  }
  .progress-fill {
    height: 100%;
    background: #00f0ff;
    transition: width 0.1s linear;
  }
</style>
