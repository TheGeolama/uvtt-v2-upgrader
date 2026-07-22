<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  // Accept the parent PIXI container from the CanvasWorkspace
  let { parentContainer } = $props();

  // Create this layer's specific PIXI container
  let gridContainer = new PIXI.Container();
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

  // Automatically redraw the grid when mapStore updates
  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity
    if (!isReady || !mapStore.activeMap) return;

    const manifest = mapStore.activeMap.manifest;
    const activeTool = mapStore.activeTool;

    // Clear previous grid graphics
    gridContainer.removeChildren().forEach((c) => c.destroy());

    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const unitsPerGrid = Math.max(1, Number(res.units_per_grid) || 5);
    const mapWidth = res.map_size[0] * gridX;
    const mapHeight = res.map_size[1] * gridY;

    // 1. Draw Origin Mark for Grid Alignment Tool
    if (activeTool === "grid_align") {
      const originMark = new PIXI.Graphics();
      gridContainer.addChild(originMark);

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

    const offX = Number(res.map_offset_x) || 0;
    const offY = Number(res.map_offset_y) || 0;
    const minX = offX;
    const maxX = offX + mapWidth;
    const minY = offY;
    const maxY = offY + mapHeight;

    // 2. Draw Sub-Grid
    const subGridGfx = new PIXI.Graphics();
    gridContainer.addChild(subGridGfx);

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
    subGridGfx.stroke({
      width: 1,
      color: res.grid_color || 0xffffff,
      alpha: 0.05,
    });

    // 3. Draw Main Grid
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
    mainGridGfx.stroke({
      width: 1.5,
      color: res.grid_color || 0xffffff,
      alpha: 0.2,
    });
  });
</script>
