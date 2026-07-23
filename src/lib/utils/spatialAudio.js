export class SpatialAudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.buffers = new Map(); // Stores decoded AudioBuffers by filename
    this.activeNodes = new Map(); // Stores playing Web Audio nodes by Zone ID
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    
    // Browsers strictly require the Audio Context to be created after a user interaction
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.masterGain.gain.value = 1.0;
    
    this.isInitialized = true;
  }

  resume() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  async loadTrack(trackName, rawData, onComplete) {
    if (!this.context) return;
    if (this.buffers.has(trackName)) return; 

    // Set to "loading" to prevent duplicate asynchronous decode calls
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
        // Strip data URI headers if Wails sent Base64
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
      
      // Kick Svelte so it immediately re-evaluates the audio nodes!
      if (onComplete) onComplete();

    } catch (err) {
      console.error(`[AudioEngine] Failed to decode track: ${trackName}`, err);
      this.buffers.delete(trackName); // Delete the "loading" lock so it can be retried
    }
  }

  // Standard line-intersection math for Raycasting
  _linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return false; // Parallel lines
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    return t > 0 && t < 1 && u > 0 && u < 1;
  }

  _isOccluded(lx, ly, ex, ey, geometry) {
    // 1. Check Walls
    const walls = geometry?.walls || [];
    for (const wall of walls) {
      if (!wall.path || wall.path.length < 2) continue;
      
      // Spec compliance: Invisible/Ethereal walls only block movement/vision, not sound
      if (wall.properties?.type === "invisible" || wall.properties?.type === "ethereal") continue; 

      for (let i = 0; i < wall.path.length - 1; i++) {
        const p1 = wall.path[i];
        const p2 = wall.path[i+1];
        if (this._linesIntersect(lx, ly, ex, ey, p1.x, p1.y, p2.x, p2.y)) {
          return true; // Raycast hit a solid wall
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
          return true; // Raycast hit a closed door/window
        }
      }
    }

    return false;
  }

  /**
   * The core audio loop. Call this on every render tick or drag event.
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
      
      // Calculate distance between Listener (Ear) and Emitter (Source)
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
        // Linear fade between the inner core and the max radius edge
        const fadeRatio = 1 - ((distance - innerRadius) / (fadeRadius - innerRadius));
        targetVolume = baseVolume * fadeRatio;
      }

      // 2. Panning Math (Left/Right ear based on X-axis difference)
      // Clamped between -1 (Hard Left) and 1 (Hard Right)
      let panValue = dx / fadeRadius; 
      panValue = Math.max(-1, Math.min(1, panValue));

      // 3. Occlusion Math (Acoustic Muffling via Lowpass Filter AND Volume Drop)
      const isMuffled = (zone.muffledByWalls ?? true) && this._isOccluded(listenerX, listenerY, ex, ey, geometry);
      const targetFrequency = isMuffled ? 600 : 22050; // 600Hz simulates hearing through a heavy door

      // Apply a heavy volume penalty for shooting straight through a wall or closed window
      if (isMuffled) {
        targetVolume *= 0.25; // 75% volume reduction
      }

      // If out of range (or muffled to absolute zero), stop the Web Audio node completely to save CPU
      if (targetVolume <= 0.01) {
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
        // RAMPING: We use setTargetAtTime so the audio shifts smoothly over 100ms
        const currentTime = this.context.currentTime;
        nodeState.gain.gain.setTargetAtTime(targetVolume, currentTime, 0.1);
        nodeState.panner.pan.setTargetAtTime(panValue, currentTime, 0.1);
        nodeState.filter.frequency.setTargetAtTime(targetFrequency, currentTime, 0.2);
      }
    });

    // Cleanup: If an audio zone was deleted from the map, or we moved out of range, nuke the nodes
    for (const [zoneId, nodeState] of this.activeNodes.entries()) {
      if (!currentZoneIds.has(zoneId)) {
        this.stopZone(zoneId);
      }
    }
  }

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

  stopAll() {
    for (const zoneId of this.activeNodes.keys()) {
      this.stopZone(zoneId);
    }
  }
}

// Export a singleton instance so it can be easily shared and driven by Svelte components
export const audioEngine = new SpatialAudioEngine();