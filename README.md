Here is a complete, professional `README.md` tailored specifically for your newly decoupled **UVTT v2 Upgrader** repository.

You can drop this directly into the root of your `uvtt-v2-upgrader` project folder.

---

# 🗺️ UVTT v2 Upgrader Web App

**The official graphic conversion tool and CAD workspace for the Universal Virtual Tabletop v2 Specification.**

The UVTT v2 Upgrader is a high-performance Svelte & WebGL web application designed to bridge the gap between fragile legacy v1 map files (`.dd2vtt` / `.df2vtt`) and the robust, multi-floor UVTT v2 standard (`.uvtt2z`). It operates as an **In-Memory Normalized Model (IMNM)** router, allowing Gamemasters to ingest legacy maps, graphically upgrade them with modern mechanical features, and compile them into streamable, cryptographically-signed archives.

---

## ✨ Core Features

- **Memory-Safe v1 Ingestion:** Safely decodes massive legacy Base64 image payloads into binary Blobs in 512-byte chunks, completely preventing the browser Out-Of-Memory (OOM) crashes that plague older VTT tools.
- **Vector Normalization & CAD:** Automatically snaps unsealed legacy vertices to prevent dynamic light leaks, flattens paths using Collinear Simplification, and lets users manipulate directional Line-of-Sight vectors via the mathematical "Right-Hand Rule".
- **The v2 Entity HUD:** A fully interactive PixiJS drafting grid to place advanced UVTT v2 mechanics:
- 💡 **Lighting:** Point and directional cones with configurable decay physics.
- 🔊 **Spatial Audio:** Tier 3 localized acoustic zones with linear boundary falloffs.
- 🚪 **Teleportation Events:** Connect zones via pinpoint coordinates or offset matrices.
- ☁️ **Weather Emitters:** Bounded particle generation zones (Rain, Snow, Fog, Embers).
- 🚩 **Landing Zones:** Deterministic viewport instantiation targets.

- **Compound & Federated Archiving:** Export a single map file (Federated) or compile your entire session's map catalog into a single Mega-Dungeon `.uvtt2z` zip file (Compound) with automatically resolved `internal://` URIs.
- **WebCrypto DRM Integration:** Automatically hashes premium assets (images, audio) via AES-256 Web Crypto API to generate a `manifest.hash` root file, protecting Split-Resolution map bundles.
- **Graceful Degradation:** A bi-directional engine that can cleanly downgrade v2 maps back to v1 formats for legacy support.

---

## 🛠️ Tech Stack

- **Framework:** [Svelte 4](https://svelte.dev/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Renderer:** [PixiJS v7](https://pixijs.com/) (Hardware-accelerated WebGL)
- **Archive Compiler:** [JSZip](https://stuk.github.io/jszip/)

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v18+) installed.

### Installation & Development

1. Clone this repository:

```bash
git clone https://github.com/TheGeolama/uvtt-v2-upgrader.git
cd uvtt-v2-upgrader

```

2. Install dependencies:

```bash
npm install

```

3. Start the local development server:

```bash
npm run dev

```

4. Open your browser to `http://localhost:3000` (or the port specified in your terminal).

### Building for Production

To compile the app into static HTML/JS/CSS for deployment (e.g., GitHub Pages, Vercel, Netlify):

```bash
npm run build

```

The optimized files will be output to the `dist/` directory.

---

## 📂 Project Structure

```text
uvtt-v2-upgrader/
├── package.json                 # Node dependencies
├── vite.config.js               # Vite build configuration
├── index.html                   # HTML Entry Point
└── src/
    ├── App.svelte               # Root Layout Controller
    ├── stores/
    │   └── mapStore.js          # The IMNM Central State Manager
    ├── utils/
    │   ├── legacyParser.js      # Base64 extractor & v1 geometry normalizer
    │   └── migrationEngine.js   # Graceful degradation logic for v2 -> v1
    └── components/
        ├── Uploader.svelte      # Landing page / Drag-and-drop ingestion zone
        ├── Toolbar.svelte       # Interactive Property Editor & Entity HUD
        ├── CanvasWorkspace.svelte # PixiJS Viewport & Vector rendering
        └── ExportMenu.svelte    # .uvtt2z Compiler & DRM Asset Signer

```

---

## 🤝 Relationship to the Specification

This application is a **Reference Tooling Implementation** of the UVTT v2 Standard.

For documentation regarding the actual `.uvtt2z` file structures, JSON schemas, topological routing formats, and the overarching DRM philosophy, please visit the primary standard repository:
👉 **[UVTT v2 Specification Repository](https://www.google.com/search?q=https://github.com/TheGeolama/uvtt-v2-specification)**

---

## 📄 License

The code within this repository (the Upgrader App) is open source and available under the standard MIT License, allowing community members to fork, modify, and host their own variants of the tool.
