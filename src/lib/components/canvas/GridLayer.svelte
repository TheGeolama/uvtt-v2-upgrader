<!-- 
  @component GridLayer
  PixiJS rendering layer responsible for drawing the map's Cartesian coordinate system[cite: 18].
  Dynamically renders the primary map grid and the finer sub-grid based on the 
  `pixels_per_grid` and `units_per_grid` specifications in the active map manifest[cite: 18].
  Also handles the visual crosshair UI when the GM is using the Grid Alignment tool[cite: 18].
-->
<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * @type {{ parentContainer: PIXI.Container }}
   * Accepts the parent PIXI container from the master CanvasWorkspace[cite: 18].
   */
  let { parentContainer } = $props();

  /** @type {PIXI.Container} Create this layer's specific isolated PIXI container[cite: 18]. */
  let gridContainer = new PIXI.Container();

  /** @type {boolean} Prevents the render loop from firing before PixiJS is mounted to the DOM[cite: 18]. */
  let isReady = $state(false);

  onMount(() => {
    parentContainer.addChild(gridContainer);
    isReady = true;
  });

  onDestroy(() => {
    if (gridContainer) {
      gridContainer.destroy({ children: true });
    }
  });

  /**
   * CORE RENDER LOOP
   * Automatically redraws the grid when the mapStore triggers an update (e.g., scale/offset changes)[cite: 18].
   */
  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity[cite: 18]
    if (!isReady || !mapStore.activeMap) return;

    const manifest = mapStore.activeMap.manifest;
    const activeTool = mapStore.activeTool;

    // Clear previous grid graphics to prevent overlapping draws and memory leaks[cite: 18]
    gridContainer.removeChildren().forEach((c) => c.destroy());

    // Extract core resolution and sizing metrics from the manifest[cite: 18]
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const unitsPerGrid = Math.max(1, Number(res.units_per_grid) || 5);
    const mapWidth = res.map_size[0] * gridX;
    const mapHeight = res.map_size[1] * gridY;

    // ----------------------------------------------------------------------
    // 1. Draw Origin Mark for Grid Alignment Tool
    // ----------------------------------------------------------------------
    // Only rendered when the GM is actively calibrating the map grid[cite: 18]
    if (activeTool === "grid_align") {
      const originMark = new PIXI.Graphics();
      gridContainer.addChild(originMark);

      // Draw a highly visible red/white crosshair at the mathematical (0,0) coordinate[cite: 18]
      originMark
        .circle(0, 0, 5)
        .fill({ color: 0xef4444, alpha: 1 })
        .stroke({ width: 2, color: 0xffffff, alpha: 1 });
      originMark
        .moveTo(-20, 0)
        .lineTo(20, 0)
        .stroke({ width: 2, color: 0xef4444, alpha: 0.8 });
      originMark
        .moveTo(0, -20)
        .lineTo(0, 20)
        .stroke({ width: 2, color: 0xef4444, alpha: 0.8 });
    }

    // Apply global map offsets[cite: 18]
    const offX = Number(res.map_offset_x) || 0;
    const offY = Number(res.map_offset_y) || 0;
    const minX = offX;
    const maxX = offX + mapWidth;
    const minY = offY;
    const maxY = offY + mapHeight;

    // ----------------------------------------------------------------------
    // 2. Draw Sub-Grid
    // ----------------------------------------------------------------------
    const subGridGfx = new PIXI.Graphics();
    gridContainer.addChild(subGridGfx);

    // Calculate subdivision sizing (e.g., 5ft standard grid divided into 1ft sub-squares)[cite: 18]
    const subGridSizeX = gridX / unitsPerGrid;
    const subGridSizeY = gridY / unitsPerGrid;
    const subStartX = Math.floor(minX / subGridSizeX) * subGridSizeX;
    const subStartY = Math.floor(minY / subGridSizeY) * subGridSizeY;
    const subEndX = Math.ceil(maxX / subGridSizeX) * subGridSizeX;
    const subEndY = Math.ceil(maxY / subGridSizeY) * subGridSizeY;

    for (let x = subStartX; x <= subEndX; x += subGridSizeX) {
      subGridGfx.moveTo(x, subStartY).lineTo(x, subEndY);
    }
    for (let y = subStartY; y <= subEndY; y += subGridSizeY) {
      subGridGfx.moveTo(subStartX, y).lineTo(subEndX, y);
    }

    // Sub-grid is drawn with extremely low opacity (5%) to avoid cluttering the view[cite: 18]
    subGridGfx.stroke({
      width: 1,
      color: res.grid_color || 0xffffff,
      alpha: 0.05,
    });

    // ----------------------------------------------------------------------
    // 3. Draw Main Grid
    // ----------------------------------------------------------------------
    const mainGridGfx = new PIXI.Graphics();
    gridContainer.addChild(mainGridGfx);

    const startX = Math.floor(minX / gridX) * gridX;
    const startY = Math.floor(minY / gridY) * gridY;
    const endX = Math.ceil(maxX / gridX) * gridX;
    const endY = Math.ceil(maxY / gridY) * gridY;

    for (let x = startX; x <= endX; x += gridX) {
      mainGridGfx.moveTo(x, startY).lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridY) {
      mainGridGfx.moveTo(startX, y).lineTo(endX, y);
    }

    // Main grid is drawn with a thicker line and slightly higher opacity (20%)[cite: 18]
    mainGridGfx.stroke({
      width: 1.5,
      color: res.grid_color || 0xffffff,
      alpha: 0.2,
    });
  });
</script>
