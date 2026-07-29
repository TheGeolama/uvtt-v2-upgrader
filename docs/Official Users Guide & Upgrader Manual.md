Here is the fully updated **UVTT v2 Upgrader User Guide**.

I have meticulously revised the structure to reflect your newly unified interface (Top Nav, Left Toolbar, Right Global Panels, and Bottom Status Bar) and integrated the latest features like Visibility Overrides and Simulated Sight. Most importantly, I have correctly moved the **Topology Validation Queue** into the Desktop Pro section, reflecting the architectural split we just finalized!

---

# 🗺️ UVTT v2: Official User’s Guide & Upgrader Manual

Welcome to the next generation of Virtual Tabletop cartography. The UVTT v2 Upgrader is designed to take your static battlemaps and legacy files and supercharge them with dynamic lighting, interactive events, and flawless topology.

Whether you are using the Web Upgrader to quickly patch a map, or running the Desktop Pro Engine to compile massive encrypted campaigns, this guide will walk you through everything you need to know.

---

## PART I: THE CORE ENGINE (WEB & DESKTOP)

_Available for free in your browser or natively in the Desktop Pro app. Powered by local JavaScript and a high-performance WebGPU/WebGL pipeline._

### 1. Interface Overview

The Upgrader features a unified, highly contextual Heads-Up Display (HUD) designed to keep your workspace clean:

- **Top Navigation Bar:** Manage your compound dungeon levels, instantly swap between floors, access Undo/Redo history, and import new files.
- **Left Toolbar & Properties:** Select your active drafting tool (Architecture, Entities, Environment). The panel dynamically morphs to show properties and actions _only_ for the objects you currently have selected.
- **Right Global Panels:** Toggle your Level Manager, Validation Queue, Map Settings, and Export controls.
- **Bottom CAD Status Bar:** Tracks your exact X/Y coordinates, zoom scale, and provides a dynamic list of hidden keyboard shortcuts based on your currently active tool.

### 2. Getting Started & Importing

- **Importing Legacy Maps:** Drag and drop an older V1 `.uvtt`, `.dd2vtt` (Dungeondraft), or `.df2vtt` (Dungeonfog) file, or a flat image (`.png`, `.jpg`, `.webp`) directly onto the canvas. The engine will automatically parse the DPI and generate a base resolution.
- **Navigating the Canvas:** Hold the Middle Mouse Button (or Spacebar) to pan around the map. Use the Scroll Wheel to seamlessly zoom in and out of the high-performance PixiJS viewport.

### 3. The CAD Toolkit

Forget the clunky drawing tools of the past. The Upgrader uses genuine CAD (Computer-Aided Design) vector mathematics.

- **Drawing Walls, Portals, & Roofs:** Select the Wall, Portal, or Roof tool. Click to drop nodes. The engine automatically snaps to the grid using smart tolerances to prevent micro-gaps.
- **Advanced Architecture:** Portals can be designated as secret doors or windows, and you can instantly set their physical state to open, closed, locked, or broken. Walls can be configured as illusory or one-way line-of-sight blockers.
- **Rubber-Sheet Grid Alignment:** Did you import a map where the grid doesn't quite line up? Use the Grid Align tool to draw a bounding box over a 3x3 square on the image. The engine’s "Rubber-Sheet" math will instantly recalibrate the entire map—shifting and scaling your existing walls and tokens so they never desync from the background.

### 4. Object Management & Visibility

- **Selection & Clipboard:** Use the Select tool to click any object. Hold `Shift` to multi-select. You can duplicate (`Ctrl+D`), copy (`Ctrl+C`), and paste (`Ctrl+V`) complex geometry and entities across your map.
- **Visibility Overrides:** Select any entity or geometry and use the universal visibility dropdown to set it to **Visible to Everyone**, **GM Only** (hidden from players until triggered), or **Completely Disabled**.

### 5. Lighting, Vision & Simulation

- **Dynamic Lighting:** Drop point lights or directional cones. Adjust the bright/dim radius, color, and intensity to set the perfect mood.
- **Player View & Simulated Sight:** Toggle the Player View raycaster and select a specific sight profile from the dropdown (Infinite, Darkvision 60ft, Torch 40ft, Lantern 60ft). Drag the Vision Token around the map to watch shadows cast dynamically against your walls.
- **VTT Simulation Mode:** Click the clapperboard icon to lock your CAD tools and interact with the map exactly as a player would in a live Virtual Tabletop environment.

### 6. Dynamic Entities

Make your maps breathe with interactive elements.

- **Audio Zones & Emitters:** Place localized soundscapes (e.g., a rushing river) or weather emitters (rain, snow) that seamlessly blend into the map.
- **Events & Spawns:** Build interactive staircases or teleport pads. When placing a Teleport or Stairs/Ladder Event, you can command the engine to automatically generate a reciprocal Spawn (landing point) right next to it.
- **Default Landing Zones:** Designate any Spawn point as the "Default Landing Zone." This guarantees that when players load into a new map, they always arrive exactly where you want them.

### 7. Time-Travel: The History Engine

Mistakes happen. The Upgrader features a robust, memory-safe History Engine to protect your work.

- **50-Step Deep-Cloned Memory:** The engine maintains a strict 50-step memory cache per map level. Because it saves deep-cloned JSON snapshots, jumping backward completely restores deleted geometry and exact grid settings without any ghosting.
- **Smart Debouncing:** If you smoothly slide a lighting radius or drag a token, the engine intelligently groups those rapid micro-updates into a single history state. You will never have to hit Undo 60 times just because you moved a single prop!
- **The History Panel:** Open the History tool to see a chronological log of your actions. Click any specific state in the list to instantly time-travel your map back to that exact moment.

### 8. Saving & Exporting

- **Saving Your Work (`.uvtt-proj`):** Click Save Project to download your work-in-progress as a local project file. This preserves your entire workspace—including unbaked geometry, undo/redo history, and layer states—so you can pick up exactly where you left off.
- **Standard Export:** Click Export to generate a standard, schema-compliant `map.uvtt` JSON file, ready to be ingested by any modern VTT. _(Note: Standard web exports are subject to your browser's maximum file size limits)._

---

## PART II: UNLEASHING THE ENGINE (DESKTOP PRO)

_Browser sandboxes hold you back. Upgrade to the Desktop Pro App to unlock raw OS-level performance, cinematic video rendering, and limitless campaign packaging._

### 🛠️ The Topology Validation Queue

Before you export, run the Validator. This powerful offline tool mathematically scans your map for microscopic gaps, overlapping wall segments, or dangling vertices that would cause light leaks in a VTT.

- Click the **Locate (📍)** button on any issue in the queue to instantly pan your camera to the exact coordinates of the error.
- Use the **Ignore (🙈)** button to dismiss intentional architectural choices.

### 🎬 Cinematic Video Rendering (Built-in FFmpeg)

Web browsers choke when trying to encode high-definition video. The Desktop Pro engine comes with a pre-compiled, embedded hardware video encoder.

- **Export to MP4/WebM:** Added rain, fog, and flickering torches to your map? Click render to generate a seamless, high-definition video loop of your animated battlemap.
- **Zero Configuration:** There is no third-party software to download and no command-line tools to configure. The rendering engine is baked directly into the core application.

### 🚀 The Global Asset Library (Live-Sync)

Browsers force you to upload tokens one by one, constantly crashing if you run out of RAM. With Desktop Pro, you bypass the browser entirely.

- **Live Folder Mounting:** Mount any folder on your hard drive directly into the engine. Drop a new token into that folder on your computer, and it magically appears in the Upgrader UI in real-time.
- **Limitless Performance:** Search, filter, and drag-and-drop massive 4K assets directly onto the map without a single stutter, easily handling libraries 50+ Gigabytes in size.

### 📦 Compound Assets (`.uvtt2a`)

Why build the same campfire over and over?

- Select a prop (like a campfire image), attach a flickering light, a smoke emitter, and a crackling audio track, and package them together into a single `.uvtt2a` (Universal VTT Asset) file.
- Drag these files onto any future map to instantly spawn the prop and all its attached effects perfectly positioned.

### 🗄️ Unlimited Campaign Archives (`.uvtt2z`)

Web browsers crash when trying to zip multi-level, high-resolution campaigns. Desktop Pro utilizes Native OS Chunked Streaming.

- Compile 10-level mega-dungeons complete with hundreds of custom assets and audio tracks into a single, unified `.uvtt2z` archive. The Go-powered backend streams the data directly to your hard drive, ignoring all browser memory limits.

### 🔒 Secure Campaign Encryption (AES-GCM)

Are you a Patreon creator protecting premium content? Desktop Pro allows you to export your campaign using military-grade AES-GCM Encryption.

- The engine generates two files: a locked archive (`.uvtt2z`) and a cryptographic key (`.uvtt2k`).
- Distribute the locked archive publicly, and give the key only to your paying subscribers. Your hard work remains perfectly safe from unauthorized ripping.
