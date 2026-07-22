<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let { parentContainer } = $props();
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

    (manifest.geometry?.walls || []).forEach((w) => {
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

    (manifest.geometry?.portals || []).forEach((p) => {
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

  function calculateVisibilityPolygon(ox, oy, radius, segments) {
    const angles = [];
    for (const seg of segments) {
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

      angles.push(a1 - 0.0001, a1, a1 + 0.0001);
      angles.push(a2 - 0.0001, a2, a2 + 0.0001);
    }

    const intersects = [];
    for (let a of angles) {
      const normA = Math.atan2(Math.sin(a), Math.cos(a));
      const dx = Math.cos(normA),
        dy = Math.sin(normA);
      const r_dx = dx * radius,
        r_dy = dy * radius;

      let minT1 = 1;
      let intersectPt = { x: ox + r_dx, y: oy + r_dy, angle: normA };

      for (const seg of segments) {
        const s_dx = seg.p2.x - seg.p1.x,
          s_dy = seg.p2.y - seg.p1.y;
        const T2 = r_dx * s_dy - r_dy * s_dx;
        if (T2 === 0) continue;

        const T1 = (seg.p1.x - ox) * s_dy - (seg.p1.y - oy) * s_dx;
        const t1 = T1 / T2;
        const t2 = ((seg.p1.x - ox) * r_dy - (seg.p1.y - oy) * r_dx) / T2;

        if (t1 > 0 && t1 < minT1 && t2 >= 0 && t2 <= 1) {
          minT1 = t1;
          intersectPt = { x: ox + r_dx * t1, y: oy + r_dy * t1, angle: normA };
        }
      }
      intersects.push(intersectPt);
    }

    intersects.sort((a, b) => a.angle - b.angle);
    return intersects;
  }

  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity
    if (!isReady || !mapStore.activeMap) return;

    shadowContainer.removeChildren().forEach((c) => c.destroy());

    const visionEnabled = mapStore.vision?.enabled;
    const lightingPreview = mapStore.lightingPreview;

    // If neither preview mode is active, don't waste cycles drawing shadows
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

    const segments = buildCollisionSegments(
      manifest,
      originX,
      originY,
      gridX,
      gridY,
      mapWidth,
      mapHeight,
    );

    // Draw full map shadow block
    shadowGfx
      .moveTo(0, 0)
      .lineTo(mapWidth, 0)
      .lineTo(mapWidth, mapHeight)
      .lineTo(0, mapHeight)
      .closePath();

    if (visionEnabled) {
      const tx = (mapStore.vision.token.x - originX) * gridX;
      const ty = (mapStore.vision.token.y - originY) * gridY;
      const radius = (mapStore.vision.token.radius || 20) * gridX;

      const intersects = calculateVisibilityPolygon(tx, ty, radius, segments);

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

      const tokenGfx = new PIXI.Graphics();
      shadowContainer.addChild(tokenGfx);
      tokenGfx
        .circle(tx, ty, gridX * 0.4)
        .fill({ color: 0x3b82f6, alpha: 0.8 })
        .stroke({ width: 3, color: 0xffffff, alpha: 1 });
      tokenGfx.circle(tx, ty, gridX * 0.1).fill({ color: 0xffffff });
    } else if (lightingPreview) {
      (manifest.entities?.lights || []).forEach((light) => {
        const lx = (Number(light.position?.x) - originX) * gridX;
        const ly = (Number(light.position?.y) - originY) * gridY;
        if (isNaN(lx) || isNaN(ly)) return;

        const radius = (Number(light.properties?.radius?.dim) || 10) * gridX;
        const intersects = calculateVisibilityPolygon(lx, ly, radius, segments);

        if (intersects.length > 0) {
          if (light.type === "directional") {
            const rot =
              (Number(light.properties?.rotation) || 0) * (Math.PI / 180);
            const cone =
              (Number(light.properties?.cone_angle) || 60) * (Math.PI / 180);
            shadowGfx.moveTo(lx, ly);
            for (let i = intersects.length - 1; i >= 0; i--) {
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
      shadowGfx.fill({ color: 0x000000, alpha: 0.85 });
    }
  });
</script>
