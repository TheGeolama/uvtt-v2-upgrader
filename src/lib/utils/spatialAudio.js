/**
 * @fileoverview Spatial Audio Engine (Web Audio API Wrapper)
 * Provides real-time, hardware-accelerated ambient audio processing.
 * Handles dynamic distance-based volume falloff, Left/Right stereo panning, 
 * and geometric acoustic occlusion (muffling sounds behind walls/closed doors).
 */

export class SpatialAudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    /** @type {Map<string, AudioBuffer|string>} Stores decoded audio data, or "loading" locks */
    this.buffers = new Map(); 
    /** @type {Map<string, Object>} Stores active Web Audio routing graphs by Zone ID */
    this.activeNodes = new Map(); 
    this.isInitialized = false;
  }

  /**
   * Initializes the Web Audio Context.
   * Note: Modern browsers strictly require the AudioContext to be created or 
   * resumed ONLY after a direct user interaction (like a click or drag).
   */
  init() {
    if (this.isInitialized) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.masterGain.gain.value = 1.0;
    
    this.isInitialized = true;
  }

  /**
   * Safely wakes up the audio context if the browser suspended it.
   */
  resume() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  /**
   * Asynchronously decodes raw binary audio data into playable Web Audio Buffers.
   * 
   * @param {string} trackName - The unique filename/identifier of the track.
   * @param {Blob|ArrayBuffer|Uint8Array|string} rawData - The raw audio data from the store or OS.
   * @param {Function} onComplete - Callback fired the millisecond decoding finishes to trigger a Svelte re-render.
   */
  async loadTrack(trackName, rawData, onComplete) {
    if (!this.context) return;
    if (this.buffers.has(trackName)) return; 

    // Set to "loading" to prevent duplicate asynchronous decode calls for the same file
    this.buffers.set(trackName, "loading");

    try {
      let arrayBuffer;
      
      // Intelligently parse whatever data format Wails or the Browser provides
      if (rawData instanceof Blob) {
        arrayBuffer = await rawData.arrayBuffer();
      } else if (rawData instanceof ArrayBuffer) {
        arrayBuffer = rawData;
      } else if (rawData instanceof Uint8Array) {
        arrayBuffer = rawData.buffer;
      } else if (typeof rawData === "string") {
        // Strip data URI headers if Wails/FileReader sent a Base64 string
        let base64 = rawData;
        if (rawData.startsWith("data:")) {
           base64 = rawData.split(',')[1];
        }
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      } else {
         throw new Error("Unknown audio data format provided by store.");
      }

      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(trackName, audioBuffer);
      console.log(`[AudioEngine] Successfully decoded track: ${trackName}`);
      
      // Kick Svelte so it immediately re-evaluates and plays the new audio nodes!
      if (onComplete) onComplete();

    } catch (err) {
      console.error(`[AudioEngine] Failed to decode track: ${trackName}`, err);
      this.buffers.delete(trackName); // Delete the "loading" lock so it can be retried later
    }
  }

  /**
   * Mathematical raycasting utility to check if an audio path crosses a physical line segment.
   */
  _linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return false; // Parallel lines
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    return t > 0 && t < 1 && u > 0 && u < 1;
  }

  /**
   * Casts a ray from the Listener (Ear) to the Emitter (Audio Zone) and counts how 
   * many sound-blocking architectural barriers it passes through.
   * 
   * @param {number} lx - Listener X
   * @param {number} ly - Listener Y
   * @param {number} ex - Emitter X
   * @param {number} ey - Emitter Y
   * @param {Object} geometry - The map's walls and portals.
   * @returns {number} The total count of intersecting solid barriers.
   */
  _getOcclusionCount(lx, ly, ex, ey, geometry) {
    let intersections = 0;

    // 1. Check Standard Walls
    const walls = geometry?.walls || [];
    for (const wall of walls) {
      if (!wall.path || wall.path.length < 2) continue;
      
      // Spec compliance: Invisible/Ethereal walls only block movement/vision, not sound
      if (wall.properties?.type === "invisible" || wall.properties?.type === "ethereal") continue; 

      for (let i = 0; i < wall.path.length - 1; i++) {
        const p1 = wall.path[i];
        const p2 = wall.path[i+1];
        if (this._linesIntersect(lx, ly, ex, ey, p1.x, p1.y, p2.x, p2.y)) {
          intersections++;
        }
      }
    }

    // 2. Check Portals (Doors & Windows)
    const portals = geometry?.portals || [];
    for (const portal of portals) {
      if (!portal.path || portal.path.length < 2) continue;
      
      // Only block sound if the door/window is actually closed or locked
      const state = portal.properties?.state || "closed";
      if (state !== "closed" && state !== "locked") continue;

      for (let i = 0; i < portal.path.length - 1; i++) {
        const p1 = portal.path[i];
        const p2 = portal.path[i+1];
        if (this._linesIntersect(lx, ly, ex, ey, p1.x, p1.y, p2.x, p2.y)) {
          intersections++;
        }
      }
    }

    return intersections;
  }

  /**
   * The core continuous audio processing loop. 
   * Called automatically by Svelte $effects whenever the camera pans, zooms, or the map updates.
   * 
   * @param {Array} audioZones - Active audio zones in the map manifest.
   * @param {Object} audioBlobs - Store reference to raw localized tracks.
   * @param {number} listenerX - Camera center or Player Token X coordinate.
   * @param {number} listenerY - Camera center or Player Token Y coordinate.
   * @param {Object} geometry - Map walls/portals for occlusion math.
   * @param {Function} onDecodeComplete - Callback to trigger Svelte state changes.
   */
  syncZones(audioZones, audioBlobs, listenerX, listenerY, geometry, onDecodeComplete) {
    if (!this.isInitialized || !this.context) return;

    const currentZoneIds = new Set();

    audioZones.forEach(zone => {
      if (!zone.track) return;
      currentZoneIds.add(zone.id);

      const bufferStatus = this.buffers.get(zone.track);

      // JIT Loading: Trigger the decode and exit. It will call onDecodeComplete when finished.
      if (!bufferStatus && audioBlobs[zone.track]) {
        this.loadTrack(zone.track, audioBlobs[zone.track], onDecodeComplete);
        return; 
      }

      if (bufferStatus === "loading") return; // Still decoding
      if (!bufferStatus) return; // Decoding failed

      const ex = Number(zone.center?.x) || 0;
      const ey = Number(zone.center?.y) || 0;
      
      // Calculate absolute distance between Listener (Ear) and Emitter (Source)
      const dx = ex - listenerX;
      const dy = ey - listenerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const innerRadius = Number(zone.inner_radius) || 2.5;
      const fadeRadius = Number(zone.radius) || 5.0;
      const baseVolume = (Number(zone.volume) || 100) / 100;

      // 1. Distance Falloff Math
      let targetVolume = 0;
      if (distance <= innerRadius) {
        targetVolume = baseVolume; // 100% Volume inside the core
      } else if (distance < fadeRadius) {
        // Linear fade between the inner core boundary and the absolute max radius edge
        const fadeRatio = 1 - ((distance - innerRadius) / (fadeRadius - innerRadius));
        targetVolume = baseVolume * fadeRatio;
      }

      // 2. Panning Math (Left/Right ear based on X-axis difference)
      // Clamped between -1.0 (Hard Left) and 1.0 (Hard Right)
      let panValue = dx / fadeRadius; 
      panValue = Math.max(-1, Math.min(1, panValue));

      // 3. Occlusion Math (Acoustic Layer Penetration)
      const shouldMuffle = zone.muffledByWalls ?? true;
      const occlusionCount = shouldMuffle ? this._getOcclusionCount(listenerX, listenerY, ex, ey, geometry) : 0;
      
      // Apply Lowpass filter (muffling) if the sound hits AT LEAST one solid wall
      const targetFrequency = occlusionCount > 0 ? 600 : 22050; 

      // Apply Custom Tiered Volume Penalty based on architectural density
      if (occlusionCount === 1) {
        targetVolume *= 0.10; // 10% volume remaining through 1 wall
      } else if (occlusionCount === 2) {
        targetVolume *= 0.05; // 5% volume remaining through 2 walls
      } else if (occlusionCount >= 3) {
        targetVolume *= 0.01; // 1% volume remaining through 3+ walls
      }

      // If out of range (or muffled to absolute zero), cleanly stop the node to save CPU
      // Threshold is < 0.005 so the 3rd wall (0.01) audio survives the cull
      if (targetVolume < 0.005) {
        if (this.activeNodes.has(zone.id)) {
          this.stopZone(zone.id);
        }
        return;
      }

      let nodeState = this.activeNodes.get(zone.id);
      
      if (!nodeState) {
        // BUILD THE ROUTING GRAPH: Source -> Filter -> Panner -> Volume Gain -> Master Audio Out
        const source = this.context.createBufferSource();
        source.buffer = bufferStatus;
        source.loop = true;

        const filter = this.context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = targetFrequency;

        const panner = this.context.createStereoPanner();
        panner.pan.value = panValue;

        const gainNode = this.context.createGain();
        gainNode.gain.value = targetVolume;

        source.connect(filter);
        filter.connect(panner);
        panner.connect(gainNode);
        gainNode.connect(this.masterGain);

        source.start(0);
        
        nodeState = { source, filter, panner, gain: gainNode };
        this.activeNodes.set(zone.id, nodeState);
      } else {
        // AUDIO RAMPING: We use setTargetAtTime so the audio shifts smoothly over 100ms.
        // This prevents violent audio "popping" or "clicking" when a user drags the camera quickly.
        const currentTime = this.context.currentTime;
        nodeState.gain.gain.setTargetAtTime(targetVolume, currentTime, 0.1);
        nodeState.panner.pan.setTargetAtTime(panValue, currentTime, 0.1);
        nodeState.filter.frequency.setTargetAtTime(targetFrequency, currentTime, 0.2);
      }
    });

    // Cleanup Loop: If an audio zone was deleted from the map, nuke the orphaned Web Audio nodes
    for (const [zoneId, nodeState] of this.activeNodes.entries()) {
      if (!currentZoneIds.has(zoneId)) {
        this.stopZone(zoneId);
      }
    }
  }

  /**
   * Safely disconnects and destroys a running audio routing graph.
   * @param {string} zoneId - The map manifest UUID of the audio zone.
   */
  stopZone(zoneId) {
    const nodeState = this.activeNodes.get(zoneId);
    if (nodeState) {
      try {
        nodeState.source.stop();
        nodeState.source.disconnect();
        nodeState.filter.disconnect();
        nodeState.panner.disconnect();
        nodeState.gain.disconnect();
      } catch (e) {}
      this.activeNodes.delete(zoneId);
    }
  }

  /**
   * Shuts down all active audio zones. Used during map/level switching.
   */
  stopAll() {
    for (const zoneId of this.activeNodes.keys()) {
      this.stopZone(zoneId);
    }
  }
}

// Export a singleton instance so it can be easily shared and driven by Svelte $effects
export const audioEngine = new SpatialAudioEngine();