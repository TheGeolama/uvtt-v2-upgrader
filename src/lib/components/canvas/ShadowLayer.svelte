<!-- 
  @component ShadowLayer
  Advanced PixiJS rendering layer for calculating and rendering real-time dynamic lighting and line-of-sight[cite: 19].
  Uses a mathematical 2D sweep-line raycasting algorithm to intersect light rays with architectural 
  wall and portal geometry, punching "holes" (cutouts) in a global darkness overlay mask[cite: 19].
  Only active when the GM toggles the 'Player View' or 'Lighting' preview modes.
-->
<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * @type {{ parentContainer: PIXI.Container }}
   * Passed from the master CanvasWorkspace[cite: 19].
   */
  let { parentContainer } = $props();

  /** @type {PIXI.Container} The isolated rendering container for the darkness mask[cite: 19]. */
  let shadowContainer = new PIXI.Container();
  let isReady = $state(false);

  onMount(() => {
    parentContainer.addChild(shadowContainer);
    isReady = true;
  });

  onDestroy(() => {
    if (shadowContainer) {
      shadowContainer.destroy({ children: true });
    }
  });

  /**
   * Translates the active map manifest's normalized geometry into absolute pixel collision segments[cite: 19].
   *
   * @param {Object} manifest - The current map data payload[cite: 19].
   * @param {number} originX - Normalized map X offset[cite: 19].
   * @param {number} originY - Normalized map Y offset[cite: 19].
   * @param {number} gridX - Pixels per grid (X)[cite: 19].
   * @param {number} gridY - Pixels per grid (Y)[cite: 19].
   * @param {number} mapWidth - Absolute pixel width of the map bounds[cite: 19].
   * @param {number} mapHeight - Absolute pixel height of the map bounds[cite: 19].
   * @returns {Array<{p1: {x,y}, p2: {x,y}}>} An array of rigid line segments that block light/vision[cite: 19].
   */
  function buildCollisionSegments(
    manifest,
    originX,
    originY,
    gridX,
    gridY,
    mapWidth,
    mapHeight,
  ) {
    const segments = [];

    // 1. Establish the outer boundary box of the map to stop rays from traveling to infinity[cite: 19]
    segments.push({ p1: { x: 0, y: 0 }, p2: { x: mapWidth, y: 0 } });
    segments.push({
      p1: { x: mapWidth, y: 0 },
      p2: { x: mapWidth, y: mapHeight },
    });
    segments.push({
      p1: { x: mapWidth, y: mapHeight },
      p2: { x: 0, y: mapHeight },
    });
    segments.push({ p1: { x: 0, y: mapHeight }, p2: { x: 0, y: 0 } });

    // 2. Add structural walls[cite: 19]
    (manifest.geometry?.walls || []).forEach((w) => {
      // Invisible/Ethereal walls block movement but NOT light/vision[cite: 19]
      if (!w.path || w.path.length < 2 || w.properties?.type === "invisible")
        return;

      for (let i = 0; i < w.path.length - 1; i++) {
        segments.push({
          p1: {
            x: (w.path[i].x - originX) * gridX,
            y: (w.path[i].y - originY) * gridY,
          },
          p2: {
            x: (w.path[i + 1].x - originX) * gridX,
            y: (w.path[i + 1].y - originY) * gridY,
          },
        });
      }
    });

    // 3. Add dynamic portals (doors/windows)[cite: 19]
    (manifest.geometry?.portals || []).forEach((p) => {
      // If a door is open, broken, or made of glass, light rays should pass right through it[cite: 19]
      const isPassableForLight =
        p.properties?.state === "open" ||
        p.properties?.state === "broken" ||
        p.properties?.type === "window";

      if (!p.path || p.path.length < 2 || isPassableForLight) return;

      for (let i = 0; i < p.path.length - 1; i++) {
        segments.push({
          p1: {
            x: (p.path[i].x - originX) * gridX,
            y: (p.path[i].y - originY) * gridY,
          },
          p2: {
            x: (p.path[i + 1].x - originX) * gridX,
            y: (p.path[i + 1].y - originY) * gridY,
          },
        });
      }
    });
    return segments;
  }

  /**
   * 2D Sweep-Line Raycasting Algorithm.
   * Calculates the exact geometric polygon representing the illuminated/visible area from a light source[cite: 19].
   *
   * @param {number} ox - Origin X (Light/Token center)[cite: 19].
   * @param {number} oy - Origin Y (Light/Token center)[cite: 19].
   * @param {number} radius - Maximum range of the light/vision[cite: 19].
   * @param {Array} segments - Array of collision segments from `buildCollisionSegments`[cite: 19].
   * @returns {Array<{x, y, angle}>} The sorted vertices of the visibility polygon[cite: 19].
   */
  function calculateVisibilityPolygon(ox, oy, radius, segments) {
    const angles = [];

    // Step 1: Collect ray angles by sweeping through every vertex of every collision segment[cite: 19]
    for (const seg of segments) {
      // Bounding box culling: Ignore segments completely outside the light's max radius[cite: 19]
      const minX = Math.min(seg.p1.x, seg.p2.x),
        maxX = Math.max(seg.p1.x, seg.p2.x);
      const minY = Math.min(seg.p1.y, seg.p2.y),
        maxY = Math.max(seg.p1.y, seg.p2.y);

      if (
        maxX < ox - radius ||
        minX > ox + radius ||
        maxY < oy - radius ||
        minY > oy + radius
      )
        continue;

      const a1 = Math.atan2(seg.p1.y - oy, seg.p1.x - ox);
      const a2 = Math.atan2(seg.p2.y - oy, seg.p2.x - ox);

      // Cast 3 rays per vertex: directly at it, and fractionally offset to the left and right.
      // This allows the algorithm to "see past" corners to hit the wall behind them[cite: 19].
      angles.push(a1 - 0.0001, a1, a1 + 0.0001);
      angles.push(a2 - 0.0001, a2, a2 + 0.0001);
    }

    const intersects = [];

    // Step 2: Fire rays at all collected angles and find the closest intersection point[cite: 19]
    for (let a of angles) {
      const normA = Math.atan2(Math.sin(a), Math.cos(a));
      const dx = Math.cos(normA),
        dy = Math.sin(normA);
      const r_dx = dx * radius,
        r_dy = dy * radius;

      let minT1 = 1; // Tracks the closest intersection (1.0 = Max Radius)[cite: 19]
      let intersectPt = { x: ox + r_dx, y: oy + r_dy, angle: normA };

      // Test this specific ray against EVERY structural wall segment[cite: 19]
      for (const seg of segments) {
        const s_dx = seg.p2.x - seg.p1.x,
          s_dy = seg.p2.y - seg.p1.y;

        const T2 = r_dx * s_dy - r_dy * s_dx;
        if (T2 === 0) continue; // Lines are perfectly parallel[cite: 19]

        const T1 = (seg.p1.x - ox) * s_dy - (seg.p1.y - oy) * s_dx;
        const t1 = T1 / T2; // Ray distance percentage
        const t2 = ((seg.p1.x - ox) * r_dy - (seg.p1.y - oy) * r_dx) / T2; // Wall segment percentage

        // If the ray hits this segment BEFORE hitting a previously tested segment, save it[cite: 19]
        if (t1 > 0 && t1 < minT1 && t2 >= 0 && t2 <= 1) {
          minT1 = t1;
          intersectPt = { x: ox + r_dx * t1, y: oy + r_dy * t1, angle: normA };
        }
      }
      intersects.push(intersectPt);
    }

    // Step 3: Sort the intersection vertices radially to form a continuous, drawable polygon shape[cite: 19]
    intersects.sort((a, b) => a.angle - b.angle);
    return intersects;
  }

  /**
   * CORE RENDER LOOP
   * Translates mathematically calculated polygons into visual PixiJS cutouts[cite: 19].
   */
  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity[cite: 19]
    if (!isReady || !mapStore.activeMap) return;

    shadowContainer.removeChildren().forEach((c) => c.destroy());

    const visionEnabled = mapStore.vision?.enabled;
    const lightingPreview = mapStore.lightingPreview;

    // Fast-exit: If neither preview mode is active, don't waste CPU cycles drawing shadows[cite: 19]
    if (!visionEnabled && !lightingPreview) return;

    const manifest = mapStore.activeMap.manifest;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;
    const mapWidth = res.map_size[0] * gridX;
    const mapHeight = res.map_size[1] * gridY;

    const shadowGfx = new PIXI.Graphics();
    shadowContainer.addChild(shadowGfx);

    // Build the master collision array once per frame[cite: 19]
    const segments = buildCollisionSegments(
      manifest,
      originX,
      originY,
      gridX,
      gridY,
      mapWidth,
      mapHeight,
    );

    // PixiJS Math Trick: To create "holes", we first draw a giant clockwise rectangle covering
    // the entire map, and then draw counter-clockwise polygons inside of it[cite: 19].
    shadowGfx
      .moveTo(0, 0)
      .lineTo(mapWidth, 0)
      .lineTo(mapWidth, mapHeight)
      .lineTo(0, mapHeight)
      .closePath();

    // --- PLAYER TOKEN VISION MODE ---[cite: 19]
    if (visionEnabled) {
      const tx = (mapStore.vision.token.x - originX) * gridX;
      const ty = (mapStore.vision.token.y - originY) * gridY;
      const radius = (mapStore.vision.token.radius || 20) * gridX;

      const intersects = calculateVisibilityPolygon(tx, ty, radius, segments);

      // Draw counter-clockwise cutout[cite: 19]
      if (intersects.length > 0) {
        shadowGfx.moveTo(
          intersects[intersects.length - 1].x,
          intersects[intersects.length - 1].y,
        );
        for (let i = intersects.length - 2; i >= 0; i--) {
          shadowGfx.lineTo(intersects[i].x, intersects[i].y);
        }
        shadowGfx.closePath();
      }

      shadowGfx.fill({ color: 0x000000, alpha: 0.92 });

      // Draw a visual token indicator to represent the player[cite: 19]
      const tokenGfx = new PIXI.Graphics();
      shadowContainer.addChild(tokenGfx);
      tokenGfx
        .circle(tx, ty, gridX * 0.4)
        .fill({ color: 0x3b82f6, alpha: 0.8 })
        .stroke({ width: 3, color: 0xffffff, alpha: 1 });
      tokenGfx.circle(tx, ty, gridX * 0.1).fill({ color: 0xffffff });
    }
    // --- GLOBAL LIGHTING PREVIEW MODE ---[cite: 19]
    else if (lightingPreview) {
      (manifest.entities?.lights || []).forEach((light) => {
        const lx = (Number(light.position?.x) - originX) * gridX;
        const ly = (Number(light.position?.y) - originY) * gridY;
        if (isNaN(lx) || isNaN(ly)) return;

        const radius = (Number(light.properties?.radius?.dim) || 10) * gridX;
        const intersects = calculateVisibilityPolygon(lx, ly, radius, segments);

        if (intersects.length > 0) {
          if (light.type === "directional") {
            // Complex geometry for Flashlights/Spotlights (Cone Culling)[cite: 19]
            const rot =
              (Number(light.properties?.rotation) || 0) * (Math.PI / 180);
            const cone =
              (Number(light.properties?.cone_angle) || 60) * (Math.PI / 180);

            shadowGfx.moveTo(lx, ly);
            for (let i = intersects.length - 1; i >= 0; i--) {
              // Only draw polygon vertices that fall within the specified cone angle sweep[cite: 19]
              let diff = Math.atan2(
                Math.sin(intersects[i].angle - rot),
                Math.cos(intersects[i].angle - rot),
              );
              if (Math.abs(diff) <= cone / 2 + 0.001)
                shadowGfx.lineTo(intersects[i].x, intersects[i].y);
            }
            shadowGfx.lineTo(lx, ly);
            shadowGfx.closePath();
          } else {
            // Standard 360-degree point light cutout[cite: 19]
            shadowGfx.moveTo(
              intersects[intersects.length - 1].x,
              intersects[intersects.length - 1].y,
            );
            for (let i = intersects.length - 2; i >= 0; i--)
              shadowGfx.lineTo(intersects[i].x, intersects[i].y);
            shadowGfx.closePath();
          }
        }
      });
      // Global darkness overlay applied after all cutouts are traced[cite: 19]
      shadowGfx.fill({ color: 0x000000, alpha: 0.85 });
    }
  });
</script>
