# 🗺️ UVTT v2 Upgrader Web App

**The official graphic conversion tool and CAD workspace for the Universal Virtual Tabletop v2 Specification.**

The **UVTT v2 Upgrader** is a high-performance, WebGPU-accelerated Svelte and PixiJS web application designed to bridge the gap between fragile legacy v1 map files (`.dd2vtt` / `.df2vtt`) and the robust, multi-floor UVTT v2 standard (`.uvtt2z` / `.uvtt2`) [274]. Operating on an **In-Memory Normalized Model (IMNM)** router [274], the application enables gamemasters and cartographers to ingest legacy maps [113], graphically upgrade them with advanced modern mechanical features (like spatial audio [91], complex light decay [73], and particle weather [215]), and compile them into streamable, cryptographically-signed packages [248, 274, 275].

---

## 🚀 Architectural Pillars

The Upgrader is built around three core architectural tenets:

### 1. In-Memory Normalized Model (IMNM) Ingestion
Rather than attempting complex, error-prone direct translation between diverse file versions, the Upgrader parses any incoming map format (Legacy V1 or interim V2 schemas) upward into an absolute, master in-memory state tree managed via a reactive Svelte store [152, 153]. Editing commands manipulate this normalized model [134, 140], and the exporters down-sample the master state to fit the rules of the selected output target [152, 154].

### 2. High-Performance WebGPU Viewport
To support rendering thousands of wall vertices, dynamic light boundaries, overhead masks, and complex particle systems without UI lag, the rendering pipeline has been upgraded to **PixiJS v8** [278, 279, 282]. The application utilizes WebGPU natively while gracefully falling back to WebGL2 on older hardware, drastically reducing CPU overhead [279].

### 3. Split-Resolution DRM Topology
The exporter decouples system-neutral structural data (walls, light nodes, and teleport triggers inside `geometry.json` and `entities.json`) from premium high-resolution binary files (artwork and audio loops inside the `assets/` directory) [136, 139, 247]. Using the browser's native **Web Crypto API**, the app generates cryptographically secure SHA-256 signatures stored inside a `manifest.hash` root file, protecting creators' assets from unauthorized modification or swapping [248, 249, 275].

---

## ✨ Core Features

### 1. Memory-Safe Ingest Pipeline
*   **Chunky Base64 Decoding:** Legacy files store massive map images as Base64 strings inside JSON payloads, causing standard browser parsers to throw Out-Of-Memory (OOM) or `InvalidCharacterError` exceptions [233, 261]. The Upgrader decodes these payloads in safe **512-byte chunks** directly into binary Blobs [68, 261].
*   **Vertex Snapping (Light Leak Prevention):** To eliminate the microscopic gaps (e.g., $x: 10.00$ vs $x: 10.02$) that cause players' dynamic vision to pierce solid corners, the ingestion engine passes all lines through a **Vertex Snapping (Tolerance) Algorithm** [20, 21, 23]. Endpoints within a `SNAP_TOLERANCE` of 0.05 map units are merged to identical coordinates [21, 23].

### 2. CAD-Style Drafting Viewport
*   **Dual-Layer Drafting Grid:** Renders a prominent **Macro-Grid** (for standard 5-foot tabletop movement) alongside a faint, high-precision **Micro-Grid** (subdivided to 1-foot increments based on the map's scale) [40, 41, 69].
*   **Bulletproof Hit-Testing:** Standard WebGL/WebGL2 engines do not perform mouse hit-testing on empty stroke lines [1, 3, 4]. The Upgrader bypasses this by generating invisible **20-pixel filled circular "Selection Nodes"** at endpoints and centers of lines, ensuring effortless click selections on high-resolution screens [2, 4, 6].
*   **Interaction Tolerance:** Replaces raw click listeners with PixiJS's native `pointertap` to handle "Micro-Drags" (natural mouse shifts of 1-2 pixels during clicking) without cancelling actions [1, 2].
*   **LoS Directional Midpoint Pointers:** Evaluates wall paths using the mathematical **Right-Hand Rule** to lock "left" and "right" half-spaces for one-way walls or illusions [18, 54, 113, 227]. The canvas draws a 15-pixel perpendicular tick-mark at the exact midpoint of each wall segment to visualize orientation [19, 28, 69].

### 3. Vector Manipulation & Geometry Tools
*   **Alt+Click Surgical Split:** Allows users to split walls at precise micro-grid intersections [37, 42, 70]. The line projection math finds the closest segment, snaps the mouse coordinates, slices the array, and spawns colinear sub-vectors, preventing the creation of light leaks during door placements [37, 42, 43, 44].
*   **Shift+Click Multi-Select & Merge:** Supports selection of multiple fragmented vectors and stitches their path arrays together [29, 30]. The merge action runs **Collinear Simplification**, deleting redundant `move` commands and stripping intermediate points on straight trajectories to ensure a clean line with a single LoS handle [115, 116, 117].
*   **One-Click Category Conversion:** Seamlessly swap a wall to a portal (door, window, secret door) and vice-versa [36, 38, 39].
*   **Automated Curve Smoothing:** Employs spline-to-cubic-bezier conversion (Catmull-Rom math) to take jagged, multi-segment legacy cave walls and mathematically smooth them into lightweight, native SVG curves with `cp1` and `cp2` control points, reducing final file weight and rendering load [64, 65, 66].

### 4. Advanced Interactive Entities Layer
*   **💡 Lighting Tool:** Drop and select dynamic light sources [75]. Supports point and directional cones with configurable bright/dim radii (visualized via bounding rings), hex color sanitization, and inverse-square decay logic [73, 74, 75, 78, 113].
*   **🚪 Event / Trap Tool:** Place interactive trigger zones (Circles or Rectangles) to handle traps or teleportation [81, 84, 85]. Teleport triggers support both **Intra-Map** (local elevations/stairs) and **Inter-Map** (world portal transitions) routing, linking directly to target Landing Zones [81, 82, 113, 128].
*   **🔊 Sound Tool:** Define localized acoustic zones (Circles or Rectangles) [91, 95]. GMs can attach local audio file URIs, set maximum volume bounds, and configure a linear `fade_radius` falloff boundary [92, 95, 113, 228].
*   **🌳 Roof/Overhead Tool:** Draw green bounding polygons with defined Z-axis bottom and top elevations [92, 93, 109, 110]. Compliant VTT engines read this layer to automatically fade roof opacity when player tokens walk underneath [92, 109, 113].
*   **🚩 Spawn Tool (Landing Zones):** Set deterministic starting targets (with custom compass headings, description tooltips, and zoom-level overrides) [130, 131, 222]. Enforces a strict schema validation rule: exactly one default landing zone (`is_default: true`) is permitted per map layout [143, 146, 226].
*   **☁️ Weather / Particle Emitters:** Create weather hazard boundaries (Rain, Snow, Fog, Embers, Magic) with adjustable density/intensity, speed, angle, color, and dynamic physical interaction options (`none`, `mask_under_overhead`, `ground_terminate`, `wall_bounce`) [215, 216, 222, 228, 301].

### 5. Wind-Vector Inheritance Model
Emitters support a global wind-vector inheritance schema [284]. GMs can define global weather forces at the manifest level (speed, angle, gust variance) [284, 285], and individual particle emitters can blend these with their base direction using a linear combination on the GPU [285, 286]:

$$v_{\text{particle}} = v_{\text{emitter\_base}} + (\text{influence\_scale} \times v_{\text{global\_wind}})$$

This allows localized effects (like indoor tavern smoke) to ignore wind forces entirely ($\text{influence\_scale} = 0.0$), while outdoor courtyard rain matches a raging storm ($\text{influence\_scale} = 1.0$) [285, 286].

### 6. Relational Campaign Catalog & Archiving
*   **Federated vs. Compound Export Modes:**
    *   **Federated Mode:** Packages maps as independent files interlinked via `relative://` URIs (e.g., `relative://undermountain_lvl2.uvtt2z#lz_arrival`), protecting browser memory during massive campaigns [172, 178].
    *   **Compound Mode:** Compiles multiple maps into a single `.uvtt2z` ZIP archive using safe slugified directory paths (e.g., `tavern-floor-2`) [191, 193, 194, 196, 197]. The compiler automatically rewrites all `relative://` links into `internal://` URIs right before compression [194, 197, 198].
*   **Unified Dropdown Router:** Features a single "Target Destination" interface that scans the entire loaded catalog of maps, grouping every map and landing zone together so GMs never have to manually type raw coordinate strings [189].
*   **Bi-directional Migration Engine:** Upgraded with full graceful degradation pathways, allowing creators to downgrade modern V2 maps back to Legacy V1 `.dd2vtt` files [152, 154, 162]. It automatically flattens SVG Bezier curves back into segmented line strings, strips advanced properties, and embeds a fallback comment tracking its history [152, 155, 156, 162].

---

## 📂 Project Architecture

```
uvtt-v2-upgrader/
├── .github/
│   └── workflows/
│       └── deploy-upgrader.yml    # GitHub Actions automated Pages build & deploy
├── src/
│   ├── components/
│   │   ├── CanvasWorkspace.svelte # WebGL Viewport (PixiJS v8 interaction/drawing)
│   │   ├── Toolbar.svelte         # Contextual HUD & Vector properties editing
│   │   ├── ExportMenu.svelte      # Cryptographic signatures & ZIP compilation
│   │   └── Uploader.svelte        # Multi-file drag-and-drop ingestion interface
│   ├── stores/
│   │   └── mapStore.js            # IMNM State Manager (Catalog, selection, undo)
│   ├── utils/
│   │   ├── legacyParser.js        # V1 Base64 chunker, geometry parser, corner snapper
│   │   └── migrationEngine.js     # Bi-directional migration (Bezier flattener, V1 exporter)
│   ├── App.svelte                 # Master layout & application orchestrator
│   └── main.js                    # WebApp entry-point
├── vite.config.js                 # Optimized Vite bundler with dynamic base routing
├── package.json                   # Project dependencies and compile targets
└── index.html                     # HTML5 canvas container
```

---

## 🛠️ Tech Stack & Dependencies

*   **UI Framework:** [Svelte 4](https://svelte.dev/)
*   **Build Tooling:** [Vite](https://vitejs.dev/)
*   **Rendering Pipeline:** [PixiJS v8](https://pixijs.com/) (Native WebGPU with WebGL2 fallback)
*   **Archive Compression:** [JSZip](https://stuk.github.io/jszip/)

---

## 📦 Exported Package Structure (`.uvtt2z`)

A compiled `.uvtt2z` file is a standard ZIP archive structured to support lazy loading and quick catalog indexing [113, 138, 225]:

```
tavern.uvtt2z (ZIP)
├── manifest.json                  # Global metadata, grid resolution, and global audio
├── manifest.hash                  # Cryptographic SHA-256 signatures for DRM assets
├── geometry.json                  # Vector paths for walls, portals, and overhead zones
├── entities.json                  # Interactive triggers, lights, sounds, and spawn anchors
└── assets/                        # Standalone binary folder
    ├── base_map.webp              # Highly compressed raster basemap
    └── fire_crackle.ogg           # Premium localized audio loop asset
```

---

## 🚀 Getting Started

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18+)
*   [npm](https://www.npmjs.com/)

### Installation & Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/TheGeolama/uvtt-v2-upgrader.git
   cd uvtt-v2-upgrader
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Boot up the local development server:
   ```bash
   npm run dev
   ```
4. Navigate to `http://localhost:3000` in your web browser [307].

---

## 🖥️ CI/CD & Deployment (GitHub Pages)

The repository is configured with a fully automated continuous deployment pipeline:

### 1. GitHub Actions Workflow
The `.github/workflows/deploy-upgrader.yml` action triggers on every push to the `main` branch [304, 305]. It provisions an Ubuntu environment, installs dependencies, builds static production files, and streams them directly into GitHub's content delivery network (CDN) [304].

### 2. Dynamic Base Path Resolution
Vite uses an optimized, dynamic base path configuration inside `vite.config.js` [304]:
```javascript
const base = process.env.VITE_BASE_PATH || './';
```
This enables the local dev server to run at `/` while automatically resolving nested subfolders (such as `https://<your-username>.github.io/uvtt-v2-upgrader/`) once hosted live, preventing fatal MIME-type checking errors [306, 307].

### 3. Enabling Deployments
To activate the live site on GitHub:
1. Navigate to your fork/repository on GitHub.
2. Select **Settings** $\rightarrow$ **Pages** in the left sidebar [308].
3. Under **Build and deployment** $\rightarrow$ **Source**, toggle the dropdown from "Deploy from a branch" to **GitHub Actions** [308].
4. Push a change to `main` and watch the pipeline build your WebGPU editor! [308]

---

## 📄 License

This project is open-source and released under the [MIT License](LICENSE), permitting commercial use, modification, distribution, and hosting.
