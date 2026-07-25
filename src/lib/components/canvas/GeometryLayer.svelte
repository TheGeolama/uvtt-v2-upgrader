<!-- 
  @component GeometryLayer
  PixiJS rendering layer responsible for drawing all architectural vectors on the canvas[cite: 17].
  Handles rendering Walls (line-of-sight blocks), Portals (doors, windows, secret passages), 
  and Overhead Roofs (polygons)[cite: 17]. Reacts dynamically to selection states, applying 
  interactive vertex nodes and highlight halos when a user edits the geometry[cite: 17].
-->
<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * @type {{ parentContainer: PIXI.Container }}
   * Svelte 5 props passed down from the master CanvasWorkspace[cite: 17].
   */
  let { parentContainer } = $props();

  /** @type {PIXI.Container} The primary layer container for all vector graphics[cite: 17]. */
  let geometryContainer = new PIXI.Container();

  /** @type {boolean} Prevents the render loop from firing before PixiJS is mounted[cite: 17]. */
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

  /**
   * Calculates the canvas render opacity based on the item's GM visibility state[cite: 17].
   *
   * @param {Object} item - The geometry entity object[cite: 17].
   * @returns {number} Float between 0.0 and 1.0[cite: 17].
   */
  function getVisAlpha(item) {
    if (!item || !item.properties) return 1.0;
    if (item.properties.visibility === "hidden") return 0.2; // Barely visible outline[cite: 17]
    if (item.properties.visibility === "gm_only") return 0.5; // Ghosted appearance[cite: 17]
    return 1.0;
  }

  /**
   * Helper utility to mathematically trace normalized map coordinates into absolute
   * PixiJS pixel coordinates[cite: 17].
   *
   * @param {PIXI.Graphics} gfx - The Pixi graphics context[cite: 17].
   * @param {Array<{x: number, y: number}>} path - The normalized vector node array[cite: 17].
   * @param {number} gridX - Pixels per grid (X axis)[cite: 17].
   * @param {number} gridY - Pixels per grid (Y axis)[cite: 17].
   * @param {number} originX - Normalized map origin offset (X)[cite: 17].
   * @param {number} originY - Normalized map origin offset (Y)[cite: 17].
   * @param {boolean} [closePath=false] - Whether to connect the final point back to the first (used for Roofs)[cite: 17].
   */
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
      // Convert normalized grid coordinates to pixel-perfect canvas coordinates[cite: 17]
      const px = (Number(path[i].x) - originX) * gridX;
      const py = (Number(path[i].y) - originY) * gridY;

      if (isNaN(px) || isNaN(py)) continue;

      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    if (closePath && path.length > 2) gfx.closePath();
  }

  /**
   * CORE RENDER LOOP
   * Executes whenever the map store triggers a redraw tick (e.g., node added, object selected)[cite: 17].
   */
  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity[cite: 17]
    if (!isReady || !mapStore.activeMap) return;

    // Clear previous geometry graphics to prevent memory leaks[cite: 17]
    geometryContainer.removeChildren().forEach((c) => c.destroy());

    const manifest = mapStore.activeMap.manifest;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;
    const selectedIds = new Set(mapStore.selectedItemIds);

    // ----------------------------------------------------------------------
    // 1. Draw Roofs (Overhead Environment Geometry)
    // ----------------------------------------------------------------------
    (manifest.geometry.overhead || []).forEach((roof) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);

      const tint = roof.properties?.tint || "#475569";
      const opacity = (roof.properties?.opacity ?? 100) / 100;
      const isHidden = roof.properties?.hidden || false;
      const vAlpha = getVisAlpha(roof);
      const renderOpacity = (isHidden ? opacity * 0.5 : opacity) * vAlpha;
      const strokeColor = isHidden ? 0xef4444 : tint;

      // Draw Selection Highlight (Thick white halo + Vertex nodes)[cite: 17]
      if (selectedIds.has(roof.id)) {
        tracePath(gfx, roof.path, gridX, gridY, originX, originY, true);
        gfx.stroke({
          width: 10,
          color: 0xffffff,
          alpha: 0.8 * vAlpha,
          join: "round",
          cap: "round",
        });

        // Draw interactive circular handles for every vertex node[cite: 17]
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

      // Draw the actual filled polygon for the roof[cite: 17]
      tracePath(gfx, roof.path, gridX, gridY, originX, originY, true);
      if (roof.path && roof.path.length > 2) {
        gfx.fill({ color: tint, alpha: renderOpacity });
        gfx.stroke({
          width: 2,
          color: strokeColor,
          alpha: (isHidden ? 0.8 : renderOpacity) * vAlpha,
        });
      } else {
        // Fallback for incomplete roofs (e.g. while actively drawing the first line)[cite: 17]
        gfx.stroke({ width: 4, color: tint, alpha: renderOpacity });
      }
    });

    // ----------------------------------------------------------------------
    // 2. Draw Walls (Line of Sight Geometry)
    // ----------------------------------------------------------------------
    (manifest.geometry.walls || []).forEach((wall) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);
      const vAlpha = getVisAlpha(wall);

      // Draw Selection Highlight (Thick white halo + Cyan vertex nodes)[cite: 17]
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

      // Draw standard wall vector (5px Cyan)[cite: 17]
      tracePath(gfx, wall.path, gridX, gridY, originX, originY);
      gfx.stroke({
        width: 5,
        color: 0x00f0ff,
        alpha: 0.9 * vAlpha,
        join: "round",
        cap: "round",
      });
    });

    // ----------------------------------------------------------------------
    // 3. Draw Portals (Doors, Windows, Secret Passages)
    // ----------------------------------------------------------------------
    (manifest.geometry.portals || []).forEach((portal) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);

      // Determine semantic color coding based on portal type[cite: 17]
      let pColor = 0xffa500; // Orange = Door (Default)[cite: 17]
      if (portal.properties?.type === "window")
        pColor = 0x3b82f6; // Blue = Window[cite: 17]
      else if (portal.properties?.type === "secret") pColor = 0xa855f7; // Purple = Secret Door[cite: 17]

      const vAlpha = getVisAlpha(portal);

      // Draw Selection Highlight[cite: 17]
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

      // Draw standard portal vector[cite: 17]
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
