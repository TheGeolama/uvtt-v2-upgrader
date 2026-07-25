# 🗺️ UVTT v2 Upgrader Web App

**The official graphic conversion tool and CAD workspace for the Universal Virtual Tabletop v2 Specification.**

The **UVTT v2 Upgrader** is a high-performance, WebGPU-accelerated Svelte and PixiJS web application designed to bridge the gap between fragile legacy v1 map files and the robust UVTT v2 standard. It operates on an In-Memory Normalized Model (IMNM) router and allows gamemasters to graphically upgrade maps with advanced features. The application now features a Desktop Pro version injected with Wails/Go bindings to securely mount local OS folders and bypass browser storage limits.

---

## 🚀 Architectural Pillars

The Upgrader is built around four core architectural tenets:

### 1. In-Memory Normalized Model (IMNM) Ingestion

The Upgrader parses incoming map formats into an absolute master in-memory state tree managed via a reactive Svelte store. This reactive state is powered by modern Svelte 5 Runes like `$state` and `$derived` to efficiently track catalog arrays and active map manifests.

### 2. High-Performance WebGPU Viewport

The rendering pipeline utilizes PixiJS v8 to natively support WebGPU while gracefully falling back to WebGL2 on older hardware. This prevents UI lag when rendering thousands of wall vertices, dynamic light boundaries, and complex particle systems.

### 3. Sweep-Line Line-of-Sight Engine

Calculates real-time dynamic lighting and line-of-sight using a mathematical 2D sweep-line raycasting algorithm. This engine intersects light rays with architectural geometry to punch precise visibility "holes" into a global Fog of War darkness mask using WebGL RenderTextures and the `erase` blend mode.

### 4. Split-Resolution DRM & Desktop File Mounting

The exporter decouples structural data from premium high-resolution binary files and generates cryptographically secure signatures to protect assets. Furthermore, Desktop Pro users can securely mount entire hard drive directories directly into memory, bypassing standard HTML5 drag-and-drop payload restrictions by storing asset references globally.

---

## ✨ Core Features

### 1. Project Management & Export Pipeline

- **Compound Dungeon Export:** The file manager can package an entire multi-floor map catalog into a single compound ZIP archive.

- **Platform-Specific Compilers:** Built-in compilers dynamically translate the generic UVTT schema into bespoke formats required by specific platforms like Foundry, Roll20, and Fantasy Grounds.

- **Time-Travel History:** A visual interface for the non-linear undo/redo state machine allows chronological time-travel or clearing the history cache to free up system RAM during heavy editing sessions.

### 2. CAD-Style Drafting & Grid Alignment

- **Grid Rubber Sheeting:** Gamemasters can precisely align a map image's baked-in grid with the mathematical VTT coordinate system.

- **Calibration Tools:** Users can tweak DPI scaling manually, micro-nudge offsets via pixel steps, or use an automatic "best fit" algorithm based on drawn calibration boxes.

- **Environment Settings:** Maps support configurable foundational variables like grid topology (Square, Hexagonal, Isometric), visual line thickness, and map-wide ambient audio soundtracks.

### 3. Advanced Interactive Entities Layer

- **Interactive Event Wiring:** Triggers can be wired to target entities to toggle visibility, open/close doors, or trigger audio via multi-select shift-clicking.

- **Advanced Teleportation:** Teleport triggers support complex routing to target Landing Zones across different map levels in the catalog, including an option to auto-create reciprocal return links.

- **Lighting Configuration:** Gamemasters can drop dynamic light sources that support omni-directional points or directional beam/cones with customizable decay models (inverse square, linear) and animations (flicker, pulse, strobe).

- **Weather & Particle Emitters:** Emitters support weather, magic, and custom graphic assets with adjustable density, speed, Z-axis layering, and directional angles.

### 4. Wind-Vector Inheritance Model

Emitters support a global wind-vector inheritance schema. GMs can define global weather forces at the manifest level, and individual particle emitters can blend these with their base direction using a linear combination on the GPU:

$$v_{\text{particle}} = v_{\text{emitter\_base}} + (\text{influence\_scale} \times v_{\text{global\_wind}})$$

This allows localized effects (like indoor tavern smoke) to ignore wind forces entirely, while outdoor courtyard rain matches a raging storm.

---

## 📂 SvelteKit Project Architecture

The application has been restructured to leverage standard SvelteKit Client-Side Routing and Vite build pipelines:

```
uvtt-v2-upgrader/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte         # Root DOM wrapper and global CSS injection
│   │   └── +page.svelte           # State-machine orchestrator (Loader -> Uploader -> Workspace)
│   ├── components/
│   │   ├── canvas/                # PixiJS v8 render layers (Grid, Shadow, Overlay)
│   │   └── panels/                # Contextual floating UI (Grid Align, Events, File Export)
│   ├── stores/
│   │   └── mapStore.svelte.js     # IMNM State Manager
│   └── utils/
│       ├── VisionEngine.js        # Raycasting and Fog of War rendering logic
│       └── exporters.js           # Compilation logic for JSZip and VTT platforms
├── vite.config.js                 # Optimized Vite bundler targeting 'esnext' for WebGPU compatibility
├── svelte.config.js               # SvelteKit SPA adapter configuration and directory aliases
└── package.json                   # Project dependencies and compile targets

```

_Architecture Reference:_

---

## 🛠️ Tech Stack & Dependencies

- **UI Framework:** Svelte 5 / SvelteKit

- **Build Tooling:** Vite (Targeting `esnext`)

- **Rendering Pipeline:** PixiJS v8 (Native WebGPU with WebGL2 fallback)

- **Archive Compression:** JSZip

---

## 🖥️ Build Configuration & Deployment

The repository is configured to build as a **Single Page Application (SPA)** using the SvelteKit static adapter.

### Vite & SvelteKit Optimizations

- **Client-Side Rendering (CSR):** The `svelte.config.js` adapter fallback creates a pure SPA environment, which is mandatory for WebGPU canvas rendering and deploying within Desktop wrappers.

- **ESNext Targeting:** The `vite.config.js` pipeline targets `esnext` to ensure top-level await and advanced graphics APIs compile correctly.

- **Strict Port Binding:** Development servers run on a strict port (3000) to ensure seamless communication with Wails/Go desktop backend APIs.

- **GitHub Pages Pathing:** SvelteKit automatically adjusts the base route pathing (`/uvtt-v2-upgrader`) during production builds to resolve correctly on GitHub Pages CDNs.

---

## 📄 License

This project is open-source and released under the MIT License, permitting commercial use, modification, distribution, and hosting.
