The UVTT v2 Upgrader allows you to package entire multi-floor dungeons into a single project file and set up seamless transitions between them. To set up a teleportation link that whisks players from a pressure plate on one floor to a completely different map layer, follow this step-by-step workflow:

### 1. Place the Destination Landing Zone

First, you need to create the spot where players will arrive.

- **Switch Floors:** Use the globe icon or dropdown menu in the **Top Bar** (or manage it via the **Map Levels** sub-panel in the **Global Panel**) to navigate to your target destination floor.
- **Drop the Spawn Point:** Select the **Spawn Tool** from the left-hand toolbar.
- **Configure the Destination:** Click on the canvas to place a **Landing Zone**. In its floating panel, give it a descriptive name (e.g., "Dungeon Cell Arrival") and use the **Token Arrival Heading** slider to specify which direction the players will face when they spawn.

### 2. Draw the Starting Trigger

Now, go back and set up the interactive "trap" or rune that initiates the teleport.

- **Switch Back:** Return to your starting floor layer using the **Top Bar** dropdown.
- **Place the Event:** Select the **Event Tool** from the left toolbar.
- **Configure the Trigger:** Click on the canvas to draw your trigger zone. In the **Event Config** panel, set your **Activation Method** (such as **On Step** to trigger when a player steps on it, or **On Click** if they have to interact with it).
- **Set the Action:** Change the **Target Action** dropdown to **Teleport**.
- **Link the Event:** Connect your starting trigger directly to the named destination **Landing Zone** you created in Step 1.

### 3. Enable Internal Multi-Floor Routing

This is the most critical step for multi-floor dungeons.

- Open the **Global Panel** in the top right and look under **File & Export**.
- Check the **Package Catalog as Compound Dungeon** checkbox.
- **Why this matters:** When this box is checked, the compiler automatically rewrites all of your teleportation links to route internally across the floors in your catalog during export. If you leave this unchecked, the maps export in "Federated Mode" as independent files and your cross-floor links will not connect.

Once everything is wired and the compound setting is checked, head to the **Export Manager** in the bottom right, select your target VTT platform profile, and click the green **Run Compile & EXPORT** button.

---

🚩 Every map requires a single Default Landing Zone so your VTT knows where to drop players when they first load in.
