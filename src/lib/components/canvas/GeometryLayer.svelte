<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let { parentContainer } = $props();
  let geometryContainer = new PIXI.Container();
  let isReady = $state(false);

  onMount(() => {
    parentContainer.addChild(geometryContainer);
    isReady = true;
  });

  onDestroy(() => {
    if (geometryContainer) {
      geometryContainer.destroy({ children: true });
    }
  });

  function getVisAlpha(item) {
    if (!item || !item.properties) return 1.0;
    if (item.properties.visibility === "hidden") return 0.2;
    if (item.properties.visibility === "gm_only") return 0.5;
    return 1.0;
  }

  function tracePath(
    gfx,
    path,
    gridX,
    gridY,
    originX,
    originY,
    closePath = false,
  ) {
    if (!path || path.length < 2) return;
    for (let i = 0; i < path.length; i++) {
      const px = (Number(path[i].x) - originX) * gridX;
      const py = (Number(path[i].y) - originY) * gridY;
      if (isNaN(px) || isNaN(py)) continue;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    if (closePath && path.length > 2) gfx.closePath();
  }

  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity
    if (!isReady || !mapStore.activeMap) return;

    // Clear previous geometry graphics
    geometryContainer.removeChildren().forEach((c) => c.destroy());

    const manifest = mapStore.activeMap.manifest;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;
    const selectedIds = new Set(mapStore.selectedItemIds);

    // 1. Draw Roofs
    (manifest.geometry.overhead || []).forEach((roof) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);
      const tint = roof.properties?.tint || "#475569";
      const opacity = (roof.properties?.opacity ?? 100) / 100;
      const isHidden = roof.properties?.hidden || false;
      const vAlpha = getVisAlpha(roof);
      const renderOpacity = (isHidden ? opacity * 0.5 : opacity) * vAlpha;
      const strokeColor = isHidden ? 0xef4444 : tint;

      if (selectedIds.has(roof.id)) {
        tracePath(gfx, roof.path, gridX, gridY, originX, originY, true);
        gfx.stroke({
          width: 10,
          color: 0xffffff,
          alpha: 0.8 * vAlpha,
          join: "round",
          cap: "round",
        });
        if (roof.path) {
          roof.path.forEach((pt) => {
            const px = (Number(pt.x) - originX) * gridX;
            const py = (Number(pt.y) - originY) * gridY;
            gfx
              .circle(px, py, 6)
              .fill({ color: 0xffffff })
              .stroke({ width: 2, color: 0x22c55e });
          });
        }
      }

      tracePath(gfx, roof.path, gridX, gridY, originX, originY, true);
      if (roof.path && roof.path.length > 2) {
        gfx.fill({ color: tint, alpha: renderOpacity });
        gfx.stroke({
          width: 2,
          color: strokeColor,
          alpha: (isHidden ? 0.8 : renderOpacity) * vAlpha,
        });
      } else {
        gfx.stroke({ width: 4, color: tint, alpha: renderOpacity });
      }
    });

    // 2. Draw Walls
    (manifest.geometry.walls || []).forEach((wall) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);
      const vAlpha = getVisAlpha(wall);

      if (selectedIds.has(wall.id)) {
        tracePath(gfx, wall.path, gridX, gridY, originX, originY);
        gfx.stroke({
          width: 12,
          color: 0xffffff,
          alpha: 0.5 * vAlpha,
          join: "round",
          cap: "round",
        });
        if (wall.path) {
          wall.path.forEach((pt) => {
            const px = (Number(pt.x) - originX) * gridX;
            const py = (Number(pt.y) - originY) * gridY;
            gfx
              .circle(px, py, 6)
              .fill({ color: 0xffffff })
              .stroke({ width: 2, color: 0x00f0ff });
          });
        }
      }

      tracePath(gfx, wall.path, gridX, gridY, originX, originY);
      gfx.stroke({
        width: 5,
        color: 0x00f0ff,
        alpha: 0.9 * vAlpha,
        join: "round",
        cap: "round",
      });
    });

    // 3. Draw Portals
    (manifest.geometry.portals || []).forEach((portal) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);
      let pColor = 0xffa500;
      if (portal.properties?.type === "window") pColor = 0x3b82f6;
      else if (portal.properties?.type === "secret") pColor = 0xa855f7;
      const vAlpha = getVisAlpha(portal);

      if (selectedIds.has(portal.id)) {
        tracePath(gfx, portal.path, gridX, gridY, originX, originY);
        gfx.stroke({
          width: 12,
          color: 0xffffff,
          alpha: 0.5 * vAlpha,
          join: "round",
          cap: "round",
        });
        if (portal.path) {
          portal.path.forEach((pt) => {
            const px = (Number(pt.x) - originX) * gridX;
            const py = (Number(pt.y) - originY) * gridY;
            gfx
              .circle(px, py, 6)
              .fill({ color: 0xffffff })
              .stroke({ width: 2, color: pColor });
          });
        }
      }

      tracePath(gfx, portal.path, gridX, gridY, originX, originY);
      gfx.stroke({
        width: 5,
        color: pColor,
        alpha: 0.9 * vAlpha,
        join: "round",
        cap: "round",
      });
    });
  });
</script>
