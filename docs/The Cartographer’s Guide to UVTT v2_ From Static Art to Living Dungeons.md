### The Cartographer’s Guide to UVTT v2: From Static Art to Living Dungeons

#### Step 1: Welcome to Your Virtual Carpentry Workshop

##### The Big Picture

Welcome to the UVTT v2 Upgrader, a high-performance, CAD-style environment designed to transform your maps from flat, static images into the "living" blueprints of the Universal Virtual Tabletop v2 specification. Think of this application as your  **digital drafting table** . In the past, map files were often rigid and lifeless; the v2 specification allows you to take those legacy blueprints and breathe life into them, evolving a simple image into a dynamic, interactive space complete with architectural logic and spatial atmosphere.

##### Web vs. Desktop Pro (The Power Choice)

Before you begin your work, you must choose the right environment for your project. While both versions offer the same powerful drafting tools, they handle your computer’s resources and assets differently.| Feature | Web Application (Browser) | Desktop Pro (Native) || \------ | \------ | \------ || **Access Method** | Instant access via modern web browser. | Native executable (Windows/Mac/Linux). || **Memory Management** | Uses browser RAM; limited by HTML5 caps. | Natively streams gigabytes of assets. || **Asset Library Access** | Manual drag-and-drop or uploads required. | Native streaming of tokens/textures from local folders. || **Best For...** | Quick edits or single-floor upgrades. | Massive, multi-floor megadungeons. |

##### A Guided Tour of the Workspace

The interface is organized into four distinct zones to keep your drafting surface clean and your creative focus sharp:

* **The Canvas Viewport (The Crafting Surface):**  The central area where your map is rendered using WebGPU technology. Use the mouse wheel to zoom and the  **Toggle Grid Coordinate Cursor**  in the bottom right to pinpoint exact X/Y locations for precision placement.  
* **The Top Bar (The Active Blueprint):**  Your navigation hub. Here you can switch between floors using the globe icon/layer dropdown, rename your active layer, and use the  **Undo/Redo**  controls to manage your drafting history.  
* **The Global Panel (The Master Command Center):**  Located on the right, this panel manages the "behind-the-scenes" data. It includes menus for file management, platform-specific exports (Foundry, Roll20, etc.), and global environmental configuration like grid topology and background music.  
* **The Drafting Toolbar (The Tool Belt):**  Your primary set of instruments located on the left. It is divided into sub-panels for  **Architecture**  (structural geometry),  **Entities**  (interactive elements),  **Assets**  (Desktop Pro only), and  **Environment**  (visualization toggles).With your workshop organized and your tools at the ready, you are prepared to begin laying the physical foundation and defining the tactical flow of your dungeon.

#### Step 2: Drawing Walls, Doors, and Roofs (The Structural Toolkit)

##### The Wall Tool (The Foundation)

The Wall tool is used to define the physical boundaries and line-of-sight of your environment.

* **Mathematical Smoothing:**  To create curved walls, you must have at least three points (forming two segments). Single straight lines cannot be curved.  
* **Wall Collision Presets:**  Quickly assign standard properties, such as  **Solid**  (blocking movement and light) or  **Ethereal**  (allowing passage while blocking sight).  
* **Directional Blocking:**  Using the  **Right-Hand Rule** , you can configure one-way visibility to create features like one-way mirrors or high-ground ledges where players can see down but not up.

##### The Portal Tool (Doors and Windows)

Portals are interactive entryways. When placing a portal, you define its architectural integrity:

1. **Architecture Type:**  Choose if the portal is a standard Door, Window, Secret Door, or Portcullis.  
2. **Initial State:**  Decide if the entryway spawns as  **Open** ,  **Closed** , or  **Locked** .  
3. **Z-Height Bounds:**  Define the elevation limits—critical for placing high-clerestory windows that players can see through but cannot climb.

##### The Roof Tool (The Overhead Canopy)

Roofs create overhead structures such as forest canopies or second stories, adding verticality to your design.**Tip: Dynamic Fade**  In compliant VTTs, roofs will automatically fade or vanish when a player’s token steps underneath them, revealing the interior without the GM needing to manually toggle visibility.You can adjust the  **Tint** ,  **Opacity** , and  **Z-Height**  (bottom and top elevation) to ensure the canopy sits correctly relative to your architectural layers.

##### Grid Alignment (The 'Rubber Sheeter')

"Rubber Sheeting" is the process of mathematically syncing your artwork's baked-in grid with the digital coordinate system of the VTT.

1. **Pin Origin:**  Click the top-left intersection of a map square on your canvas to lock the mathematical origin.  
2. **Scale:**  Adjust the DPI inputs to stretch the VTT grid  **away from your pin**  until it matches the artwork. For pixel-perfect adjustments, use the nudge buttons ( **→ Step \+X** ,  **← Step \-X** ,  **↓ Step \+Y** ,  **↑ Step \-Y** ).  
3. **Auto-Align:**  For the fastest results, drag a green bounding box over a single 1x1 map square; the tool will automatically calculate the optimal DPI and offset.Now that the physical shell of your map is established, it is time to populate it with the interactive elements that choreograph the player experience.

#### Step 3: Creating Ambiance & Traps (The Interactive Toolkit)

##### Universal Editing (The Master Control)

When you click any existing entity, the interface enters  **Editing Mode** . This exposes a  **Clipboard**  for cloning or deleting objects and  **Universal Player Visibility**  overrides. This allows GMs to hide the  *source*  of an effect (like a light orb or speaker icon) while keeping the effect itself visible to the players.

##### The Light Tool (Illumination)

Light sources allow you to sculpt the mood and tactical visibility of a scene.| Property | Description || \------ | \------ || **Decay Models** | Choose  **Inverse Square**  for realistic torchlight or  **Linear**  for gameplay-first visibility. || **Radius Logic** | Set the  **Bright**  radius (full light) and  **Dim**  radius (shadowy light). || **Animation** | Apply  **Profiles**  like Flicker or Pulse to add atmospheric resonance. |

##### The Audio Tool (Spatial Soundscapes)

Define "Acoustic Falloff" by setting an  **Inner Core**  (100% volume) and a  **Max Range**  (where the sound fades to silence). Enable the  **Muffled by Walls (Acoustic Occlusion)**  toggle to ensure realism, preventing players from hearing a room's secrets until the door is opened.

##### The Event Tool (The Trapmaster's Blueprint)

Events are the mechanical "brains" of your map.

1. **Choose a Trigger:**  Set the activation to  **On Step**  (pressure plates) or  **On Click**  (levers).  
2. **Choose an Outcome:**  Define the result, such as  **Teleport** ,  **Toggle Visibility** , or  **Play Sound** .  
3. **Wire the Target:**  The  **Wire Targets**  sub-panel is context-sensitive; it activates only when you have selected both an Event and a valid target (like a Door). Click  **Bind Selected Entities**  to mechanically link them.

##### The Spawn Tool (The Landing Zone)

**Mandatory Rule:**  Every map  **must**  have one  **Default Landing Zone**  so the VTT knows where to drop players upon entry. Set the  **Arrival Heading**  (in degrees) to ensure players are facing the correct direction when they arrive.

##### The Emitter Tool (Atmospheric Particles)

Emitters add weather or magical effects. Use the  **Weather Style**  presets (Rain, Snow, Embers) and fine-tune the atmospheric mood with controls for  **Density** ,  **Speed** ,  **Scale** ,  **Direction** , and  **Variance**  (to ensure natural fluctuation). Set the  **Z-Index**  to position weather correctly relative to roofs.Managing the "invisible" data of these interactive features is the final step in ensuring a professional, bug-free game night.

#### Step 4: Managing Map Layers and Browser Memory

##### Map Levels (The Catalog)

Manage multi-story towers via the  **Map Levels**  panel. Here you can rename layers for organizational clarity (e.g., "Vaults," "Great Hall") or delete entire floors that are no longer part of the adventure.

##### The 'Clear History' RAM Savior

**Pro-Tip: Managing Memory**  Every edit saves a data snapshot for the Undo/Redo state machine. During long sessions, especially in the Web version, this can exhaust your browser's RAM. Use the  **Clear History**  button in the Global Panel to flush the cache and prevent crashes without losing your current progress.

##### Global Ambience (Environment Config)

Before finalizing, verify your foundational settings:

* **Grid Topology:**  Select Square, Hex (Horizontal/Vertical), or Isometric.  
* **Grid Size:**  Define the explicit DPI (e.g., 70px or 100px).  
* **Global Audio:**  Attach a map-wide  **Background Soundtrack**  or  **Ambient Soundscape**  that plays regardless of player position.With your map optimized and the atmosphere set, you are ready to package your creation for the digital tabletop.

#### Step 5: Exporting for Game Night

##### Project vs. Compile

* **Project File:**  Use  **Save Project**  to download a working file that preserves your editable Bezier curves and event wiring. This is your "source code."  
* **Compiling:**  This translates your drafting work into a final, read-only format for VTT consumption.

##### The Compound Dungeon Decision

* **Compound Mode:**  Checking "Package Catalog as Compound Dungeon" bundles all floors into a single .uvtt2z ZIP. The engine  **automatically rewrites all teleport links**  to function internally between floors.  
* **Federated Mode:**  If unchecked, floors export as independent, standalone files.

##### The Export Manager (Final Selection)

Option,Purpose  
v1 Downgrade,Migrates the file back to the legacy .dd2vtt format.  
v2 Standard,The modern schema for full interactive compatibility.  
Secure Archive,"A .uvtt2z ZIP that uses a manifest.hash to decouple structural data from premium assets, protecting your IP."  
Platform Specific,"Tailors the export for  Foundry VTT ,  Roll20 , or  Fantasy Grounds ."

##### Final Step

Select your profile in the Export Manager and click  **Run Compile & EXPORT** . The engine will apply the necessary cryptographic signatures and deliver the final file, completing the journey from a static blueprint to a living dungeon.  
