Here is your quick-reference **Trapmaster Cheat Sheet** to help you master the **Wire Targets** system. This sheet translates the technical layout into a practical, step-by-step workflow for creating puzzles, traps, and hidden passages.

---

# ⚙️ The Trapmaster’s Cheat Sheet: Wire Targets Made Easy

In the UVTT v2 Upgrader, **Wire Targets** are the invisible mechanical linkages that connect a **Trigger** (like a floor plate) to a **Target** (like a locked door or a teleporter). Think of it as laying down copper wiring beneath your dungeon floors—no coding required!

---

## 1. The Core Components of an Interactive Event

Every automated trap or puzzle consists of three basic parts:

1. **The Trigger (The Event Entity):** The physical footprint on the map that detects player activity.
2. **The Target (The Destination Entity):** The object that reacts when the trigger is tripped (such as a door, window, light, or spawn point).
3. **The Wire (The Linkage):** The mechanical connection established in your floating control panel.

---

## 2. Step-by-Step: Wiring Your First Trap

Follow these steps to connect a pressure plate to a locked door:

- **Step 1: Place Your Target.** Select the **Portal Tool** from the left toolbar and place a door. In the Portal floating panel, set its **Initial State** to **Locked**.
- **Step 2: Place Your Trigger.** Switch to the **Event Tool** on the left toolbar. Click on the map canvas to place your trigger zone (e.g., right in front of a chest).
- **Step 3: Define the Trigger Rules.** In the Event Config panel:
  - Give it an **Event Name** (e.g., "Fireball Pressure Plate").
  - Set the **Activation Method** to **On Step** (fires when a token walks over it).
  - Set the **Target Action** to **Toggle Visibility** or change state.
- **Step 4: Connect the Wire.** Select **both** your Event entity and your target Door on the canvas.
  - _Tip: Once both are selected, the **WIRE TARGETS** sub-panel will automatically slide open in your floating panel._
  - Click the **Bind Selected Entities** button. A mechanical link is now established!
- **Step 5: Test and Export.** Toggle your **Environment View** to test how the line of sight behaves, then use the **Export Manager** to run your final compile for your chosen VTT.

---

## 3. Three Essential Trap Blueprints for GMs

### Blueprint A: The Secret Door Pressure Plate

- **The Setup:** Stepping on a specific floor tile opens a hidden stone door.
- **Trigger (Event):** Set **Activation Method** to **On Step**.
- **Target (Portal):** Place a **Secret Door** with its **Initial State** set to **Closed**.
- **The Wiring:** Select both, open the **WIRE TARGETS** panel, and click **Bind Selected Entities**. Set the **Target Action** to open the portal.

### Blueprint B: The Arcane Teleportation Rune

- **The Setup:** A player steps on a glowing rune and is instantly zapped to another room.
- **Trigger (Event):** Set **Activation Method** to **On Step**, and **Target Action** to **Teleport**.
- **Target (Spawn):** Select the **Spawn Tool** and place a **Landing Zone** (e.g., "Dungeon Cell"). Use the slider to set their **Token Arrival Heading** so they face the right way when they arrive.
- **The Wiring:** Select both the Event rune and the Landing Zone, then click **Bind Selected Entities**.

### Blueprint C: The Ambush Alarm (GM Only Trigger)

- **The Setup:** A trap or alarm that only you, the Game Master, can trigger during combat to spring an ambush.
- **Trigger (Event):** Set **Activation Method** to **GM Only**. This keeps it invisible and uninteractable for players.
- **Target (Audio/Light):** Place a spatial **Audio** source (e.g., screaming alarm) or a flashing alarm **Light**.
- **The Wiring:** Bind the GM-Only trigger to the light or audio loop. When you click it during the session, the alarm blares and the red lights flash instantly!

---

## 🛠️ Quick Troubleshooting

- **How do I undo a mistake?** Click the **Undo** button in the Top Bar, or click the **Clear Targets** button in the WIRE TARGETS sub-panel to safely sever a connection and start over.
- **My trap isn't wiring!** Remember, the **WIRE TARGETS** panel will _only_ activate and show up when you have **both** an Event and a valid target entity selected on your canvas at the same time.
- **My browser is lagging during heavy drafting.** If you are working on a massive dungeon with dozens of wired traps in the Web App, go to the Global Panel's **Action History** and click the **Clear History** button to flush your RAM and prevent browser crashes!

---
