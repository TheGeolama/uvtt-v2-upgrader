<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let {
    parentContainer,
    isBoxSelecting,
    boxSelectStart,
    boxSelectEnd,
    isGridAligning,
    alignBoxStart,
    alignBoxEnd,
    draftingPath,
    draftingPreview,
  } = $props();

  let layerContainer = new PIXI.Container();
  let isReady = $state(false);

  onMount(() => {
    parentContainer.addChild(layerContainer);
    isReady = true;
  });

  onDestroy(() => {
    if (layerContainer) {
      layerContainer.destroy({ children: true });
    }
  });

  $effect(() => {
    let _ = mapStore.redrawTick; // Tie into master refresh cycle
    if (!isReady || !mapStore.activeMap) return;

    // Clear all previous overlay graphics
    layerContainer.removeChildren().forEach((c) => c.destroy());

    const manifest = mapStore.activeMap.manifest;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;
    const activeTool = mapStore.activeTool;

    // 1. Draw Bounding Box Selection
    if (isBoxSelecting && boxSelectStart && boxSelectEnd) {
      const boxGfx = new PIXI.Graphics();
      layerContainer.addChild(boxGfx);

      const sx = (boxSelectStart.x - originX) * gridX;
      const sy = (boxSelectStart.y - originY) * gridY;
      const ex = (boxSelectEnd.x - originX) * gridX;
      const ey = (boxSelectEnd.y - originY) * gridY;

      boxGfx.rect(
        Math.min(sx, ex),
        Math.min(sy, ey),
        Math.abs(ex - sx),
        Math.abs(ey - sy),
      );
      boxGfx.fill({ color: 0x00f0ff, alpha: 0.1 });
      boxGfx.stroke({ width: 1, color: 0x00f0ff, alpha: 0.8 });
    }

    // 2. Draw Grid Alignment Tool Boxes
    if (
      mapStore.gridAlignBoxes.length > 0 ||
      (isGridAligning && alignBoxStart && alignBoxEnd)
    ) {
      const alignGfx = new PIXI.Graphics();
      layerContainer.addChild(alignGfx);

      const offX = Number(res.map_offset_x) || 0;
      const offY = Number(res.map_offset_y) || 0;

      mapStore.gridAlignBoxes.forEach((b) => {
        alignGfx.rect(
          Math.min(b.sx, b.ex) + offX,
          Math.min(b.sy, b.ey) + offY,
          Math.abs(b.ex - b.sx),
          Math.abs(b.ey - b.sy),
        );
        alignGfx.fill({ color: 0x22c55e, alpha: 0.2 });
        alignGfx.stroke({ width: 2, color: 0x22c55e, alpha: 0.8 });
      });

      if (isGridAligning && alignBoxStart && alignBoxEnd) {
        alignGfx.rect(
          Math.min(alignBoxStart.x, alignBoxEnd.x) + offX,
          Math.min(alignBoxStart.y, alignBoxEnd.y) + offY,
          Math.abs(alignBoxEnd.x - alignBoxStart.x),
          Math.abs(alignBoxEnd.y - alignBoxStart.y),
        );
        alignGfx.fill({ color: 0xeab308, alpha: 0.3 });
        alignGfx.stroke({
          width: 2,
          color: 0xeab308,
          alpha: 0.9,
          dash: [5, 5],
        });
      }
    }

    // 3. Draw Drafting Lines (Walls, Portals, Roofs in progress)
    if (draftingPath.length > 0) {
      const draftGfx = new PIXI.Graphics();
      layerContainer.addChild(draftGfx);

      const pts = draftingPreview
        ? [...draftingPath, draftingPreview]
        : [...draftingPath];
      const dColor =
        activeTool === "wall"
          ? 0x00f0ff
          : activeTool === "roof"
            ? 0x22c55e
            : 0xffa500;

      if (pts.length >= 2) {
        for (let i = 0; i < pts.length; i++) {
          const px = (Number(pts[i].x) - originX) * gridX;
          const py = (Number(pts[i].y) - originY) * gridY;
          if (isNaN(px) || isNaN(py)) continue;
          if (i === 0) draftGfx.moveTo(px, py);
          else draftGfx.lineTo(px, py);
        }

        if (activeTool === "roof" && pts.length > 2) draftGfx.closePath();

        draftGfx.stroke({
          width: 4,
          color: dColor,
          alpha: 0.6,
          join: "round",
          cap: "round",
        });

        if (activeTool === "roof" && pts.length > 2) {
          draftGfx.fill({ color: dColor, alpha: 0.2 });
        }
      }
    }
  });
</script>
