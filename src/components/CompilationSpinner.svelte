<script>
  import { onMount, onDestroy } from 'svelte';

  export let active = false;
  export let progress = 0; // Optional percentage (0 to 100)

  let currentPhaseIndex = 0;
  let phaseTimer;

  const compilationPhases = [
    "Decrypting package archive...",
    "Extracting Base64 image layers...",
    "Sealing material geometry corners...",
    "Flattening SVG Bézier curves...",
    "Simplifying collinear vectors...",
    "Resolving multi-level portal URIs...",
    "Injecting weather particle emitters...",
    "Compiling secure AES-256-GCM assets...",
    "Signing root manifest.hash receipt..."
  ];

  $: currentPhase = compilationPhases[currentPhaseIndex];

  onMount(() => {
    phaseTimer = setInterval(() => {
      if (active) {
        currentPhaseIndex = (currentPhaseIndex + 1) % compilationPhases.length;
      }
    }, 2800);
  });

  onDestroy(() => {
    if (phaseTimer) clearInterval(phaseTimer);
  });
</script>

{#if active}
  <div class="spinner-overlay" aria-live="polite">
    <div class="hud-box">
      <!-- High-Tech Coordinate Grid Background -->
      <div class="grid-bg"></div>

      <!-- Neon Vector Target Spinner -->
      <div class="spinner-container">
        <!-- Outer Topology Ring (Neon Purple/Blue) -->
        <svg class="ring outer-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" stroke="url(#purpleGrad)" stroke-width="2" fill="none" stroke-dasharray="210" stroke-dashoffset="50" />
          <defs>
            <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#7e22ce" />
              <stop offset="100%" stop-color="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>

        <!-- Inner Emitter Ring (Neon Orange/Amber) -->
        <svg class="ring inner-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="32" stroke="url(#orangeGrad)" stroke-width="3" fill="none" stroke-dasharray="120" stroke-dashoffset="30" />
          <defs>
            <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f97316" />
              <stop offset="100%" stop-color="#e11d48" />
            </linearGradient>
          </defs>
        </svg>

        <!-- Core Coordinate Node -->
        <div class="core-node">
          <div class="pulse-dot"></div>
          <!-- Tiny X-Y-Z Axis Indicators -->
          <svg class="axes" viewBox="0 0 40 40">
            <line x1="20" y1="20" x2="35" y2="20" stroke="#06b6d4" stroke-width="1.5" /> <!-- X-Axis (Cyan) -->
            <line x1="20" y1="20" x2="20" y2="5" stroke="#10b981" stroke-width="1.5" /> <!-- Y-Axis (Green) -->
            <line x1="20" y1="20" x2="10" y2="30" stroke="#f43f5e" stroke-width="1.5" /> <!-- Z-Axis (Rose) -->
          </svg>
        </div>
      </div>

      <!-- HUD Text Data Display -->
      <div class="metadata-hud">
        <div class="hud-title">UVTT v2 SYSTEM COMPILATION</div>
        <div class="hud-phase">{currentPhase}</div>
        
        {#if progress > 0}
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: {progress}%"></div>
          </div>
          <div class="hud-percentage">{progress}% Complete</div>
        {:else}
          <div class="loading-bar-marquee"></div>
          <div class="hud-status">COMPILING 8K ASSETS...</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .spinner-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(9, 9, 11, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: 'Courier New', Courier, monospace;
    color: #e2e8f0;
    user-select: none;
    backdrop-filter: blur(8px);
  }

  .hud-box {
    position: relative;
    width: 440px;
    padding: 40px;
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 8px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
  }

  /* Grid Background Effect */
  .hud-box::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: center;
    pointer-events: none;
  }

  .spinner-container {
    position: relative;
    width: 160px;
    height: 160px;
    margin-bottom: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .outer-ring {
    animation: rotateCW 6s linear infinite;
  }

  .inner-ring {
    animation: rotateCCW 4s linear infinite;
  }

  .core-node {
    position: relative;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pulse-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    background-color: #06b6d4;
    border-radius: 50%;
    box-shadow: 0 0 12px #06b6d4;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .axes {
    position: absolute;
    width: 100%;
    height: 100%;
    animation: jitter 3s ease-in-out infinite;
    opacity: 0.65;
  }

  .metadata-hud {
    width: 100%;
    text-align: center;
    z-index: 2;
  }

  .hud-title {
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 2px;
    color: #a1a1aa;
    margin-bottom: 8px;
  }

  .hud-phase {
    font-size: 13px;
    color: #38bdf8;
    height: 20px;
    margin-bottom: 24px;
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.35);
  }

  /* Progress Bar styling */
  .progress-bar-container {
    width: 100%;
    height: 4px;
    background: #27272a;
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #06b6d4);
    box-shadow: 0 0 8px #06b6d4;
    transition: width 0.3s ease-out;
  }

  .hud-percentage, .hud-status {
    font-size: 11px;
    letter-spacing: 1px;
    color: #71717a;
  }

  /* Marquee/Scan loading effect if no numeric progress is provided */
  .loading-bar-marquee {
    width: 100%;
    height: 2px;
    background: #27272a;
    position: relative;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .loading-bar-marquee::after {
    content: '';
    position: absolute;
    top: 0;
    left: -50%;
    width: 50%;
    height: 100%;
    background: linear-gradient(90deg, transparent, #06b6d4, transparent);
    animation: marquee 1.8s infinite linear;
  }

  /* Animations */
  @keyframes rotateCW {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes rotateCCW {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 18px #06b6d4; }
  }

  @keyframes jitter {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(0.5px, -0.5px) rotate(0.2deg); }
  }

  @keyframes marquee {
    from { left: -50%; }
    to { left: 100%; }
  }
</style>
