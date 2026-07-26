<!-- 
  @component SimulationLayer
  A headless PixiJS rendering engine for VTT Simulation Mode.
  Handles global ambient darkness, dynamic lighting generation, real-time animations,
  and WebGL 2D Shadow Raycasting for dynamic Line of Sight.
-->
<script>
  import { onMount, onDestroy } from "svelte";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import * as PIXI from "pixi.js";

  let { parentContainer } = $props();

  let simContainer;
  let ambientOverlay;
  let lightsContainer;

  let activeLights = [];
  let animationTicker;
  let isReady = $state(false);

  onMount(() => {
    if (!parentContainer) return;

    simContainer = new PIXI.Container();
    parentContainer.addChild(simContainer);

    // BULLETPROOF DARKNESS
    ambientOverlay = new PIXI.Sprite(PIXI.Texture.WHITE);
    ambientOverlay.tint = 0x05080e; // Deep dungeon blue/black
    ambientOverlay.alpha = 0.85;

    // CULLING BYPASS HACK
    ambientOverlay.width = 100000;
    ambientOverlay.height = 100000;
    ambientOverlay.anchor.set(0.5);
    ambientOverlay.getLocalBounds = () => ({
      x: 0,
      y: 0,
      width: 999999,
      height: 999999,
    });

    simContainer.addChild(ambientOverlay);

    lightsContainer = new PIXI.Container();
    simContainer.addChild(lightsContainer);

    animationTicker = new PIXI.Ticker();
    animationTicker.add(animateLights);
    animationTicker.start();

    isReady = true;
    setTimeout(() => mapStore.updateTrigger++, 50);
  });

  onDestroy(() => {
    if (animationTicker) {
      animationTicker.stop();
      animationTicker.destroy();
    }
    if (simContainer && parentContainer) {
      parentContainer.removeChild(simContainer);
      simContainer.destroy({ children: true });
    }
  });

  // ==========================================
  // RAYCASTING MATH ENGINE
  // ==========================================

  function getIntersection(ray, segment) {
    const rPx = ray.a.x,
      rPy = ray.a.y;
    const rDx = ray.b.x - ray.a.x,
      rDy = ray.b.y - ray.a.y;
    const sPx = segment.a.x,
      sPy = segment.a.y;
    const sDx = segment.b.x - segment.a.x,
      sDy = segment.b.y - segment.a.y;

    const rMag = Math.sqrt(rDx * rDx + rDy * rDy);
    if (rMag === 0) return null;

    const T2 = rDx * sDy - rDy * sDx;
    if (T2 === 0) return null; // Lines are parallel

    const T1 = (sPx - rPx) * sDy - (sPy - rPy) * sDx;
    const U = ((sPx - rPx) * rDy - (sPy - rPy) * rDx) / T2;
    const T = T1 / T2;

    // T > 0 means the intersection is strictly IN FRONT of the ray source
    // 0 <= U <= 1 means the intersection falls strictly ON the wall segment
    if (T > 0 && U >= 0 && U <= 1) {
      return {
        x: rPx + rDx * T,
        y: rPy + rDy * T,
        param: T,
      };
    }
    return null;
  }

  function calculateSightPolygon(lightX, lightY, radius, baseSegments) {
    // 1. Add bounding box segments for the light so it doesn't cast to infinity
    const r = radius;
    const bounds = [
      {
        a: { x: lightX - r, y: lightY - r },
        b: { x: lightX + r, y: lightY - r },
      },
      {
        a: { x: lightX + r, y: lightY - r },
        b: { x: lightX + r, y: lightY + r },
      },
      {
        a: { x: lightX + r, y: lightY + r },
        b: { x: lightX - r, y: lightY + r },
      },
      {
        a: { x: lightX - r, y: lightY + r },
        b: { x: lightX - r, y: lightY - r },
      },
    ];

    const allSegments = [...baseSegments, ...bounds];

    // 2. Gather all unique endpoints from all segments
    const points = [];
    allSegments.forEach((seg) => {
      points.push(seg.a, seg.b);
    });

    // 3. Cast 3 rays per endpoint (Center, Slightly Left, Slightly Right)
    const uniqueAngles = new Set();
    points.forEach((p) => {
      const angle = Math.atan2(p.y - lightY, p.x - lightX);
      uniqueAngles.add(angle - 0.00001);
      uniqueAngles.add(angle);
      uniqueAngles.add(angle + 0.00001);
    });

    const intersects = [];
    uniqueAngles.forEach((angle) => {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const ray = {
        a: { x: lightX, y: lightY },
        b: { x: lightX + dx, y: lightY + dy },
      };

      let closestIntersect = null;
      allSegments.forEach((seg) => {
        const intersect = getIntersection(ray, seg);
        if (!intersect) return;
        if (!closestIntersect || intersect.param < closestIntersect.param) {
          closestIntersect = intersect;
        }
      });

      if (closestIntersect) {
        closestIntersect.angle = angle;
        intersects.push(closestIntersect);
      }
    });

    // 4. Sort intersections clockwise to form a valid polygon
    intersects.sort((a, b) => a.angle - b.angle);
    return intersects;
  }

  // ==========================================
  // MAIN RENDER LOOP
  // ==========================================
  $effect(() => {
    const trigger = mapStore.updateTrigger;
    const activeMap = mapStore.activeMap;

    if (!isReady || !activeMap) return;

    try {
      const manifest = activeMap.manifest;
      const res = manifest.resolution;
      const gridX = Number(res.pixels_per_grid) || 70;
      const gridY = Number(res.pixels_per_grid_y) || gridX;
      const originX = Number(res.map_origin?.[0]) || 0;
      const originY = Number(res.map_origin?.[1]) || 0;

      // Clear Existing Lights and Masks
      lightsContainer.removeChildren().forEach((child) => child.destroy());
      activeLights = [];

      // --- ASSEMBLE BLOCKING GEOMETRY ---
      let blockingSegments = [];
      const geometry = manifest.geometry || {
        walls: [],
        portals: [],
        overhead: [],
      };

      const addSegments = (items) => {
        items.forEach((item) => {
          const propsStr = JSON.stringify(item.properties || {}).toLowerCase();
          const typeStr = String(item.type || "").toLowerCase();
          const statusStr = String(item.status || "").toLowerCase();
          const isExplicitlyOpen =
            item.closed === false || item.properties?.closed === false;

          // Exclude windows, transparent walls, and broken/open doors from casting shadows
          if (
            typeStr.includes("window") ||
            statusStr.includes("window") ||
            propsStr.includes("window") ||
            typeStr.includes("transparent") ||
            propsStr.includes("transparent") ||
            typeStr.includes("invisible") ||
            propsStr.includes("invisible") ||
            statusStr.includes("open") ||
            propsStr.includes("open") ||
            statusStr.includes("broken") ||
            propsStr.includes("broken") ||
            isExplicitlyOpen ||
            propsStr.includes('"blocksvision":false') ||
            propsStr.includes('"blocks_vision":false') ||
            propsStr.includes('"blockslight":false') ||
            propsStr.includes('"blocks_light":false') ||
            propsStr.includes('"light":"pass"')
          ) {
            return;
          }

          if (!item.path || item.path.length < 2) return;
          for (let i = 0; i < item.path.length - 1; i++) {
            blockingSegments.push({
              a: {
                x: (item.path[i].x - originX) * gridX,
                y: (item.path[i].y - originY) * gridY,
              },
              b: {
                x: (item.path[i + 1].x - originX) * gridX,
                y: (item.path[i + 1].y - originY) * gridY,
              },
            });
          }
        });
      };

      addSegments(geometry.walls || []);
      addSegments(geometry.portals || []);

      // --- RENDER LIGHTS WITH SHADOW MASKS ---
      const lights = manifest.entities?.lights || [];

      lights.forEach((light) => {
        if (light.properties?.visibility === "hidden") return;

        const px = (Number(light.position.x) - originX) * gridX;
        const py = (Number(light.position.y) - originY) * gridY;

        const brightRadPx = Math.max(
          (Number(light.properties?.radius?.bright) || 0) * gridX,
          1,
        );
        const dimRadPx = Math.max(
          (Number(light.properties?.radius?.dim) || 5) * gridX,
          brightRadPx + 1,
        );
        const hexColor = light.properties?.color || "#ffffff";
        const intensity = Number(light.properties?.intensity) || 1.0;

        const lightGfx = new PIXI.Graphics();

        // CULLING BYPASS
        lightGfx.getLocalBounds = () => ({
          x: 0,
          y: 0,
          width: 999999,
          height: 999999,
        });
        lightGfx.x = px;
        lightGfx.y = py;
        lightGfx.blendMode = "add";

        // Draw Concentric Gradient Circles
        lightGfx
          .circle(0, 0, dimRadPx)
          .fill({ color: hexColor, alpha: intensity * 0.1 });
        lightGfx
          .circle(0, 0, (brightRadPx + dimRadPx) / 2)
          .fill({ color: hexColor, alpha: intensity * 0.3 });
        lightGfx
          .circle(0, 0, brightRadPx)
          .fill({ color: hexColor, alpha: intensity * 0.8 });

        const blurFilter = new PIXI.BlurFilter({ strength: 25, quality: 3 });
        lightGfx.filters = [blurFilter];

        // GENERATE AND APPLY RAYCAST MASK
        const sightPolygon = calculateSightPolygon(
          px,
          py,
          dimRadPx,
          blockingSegments,
        );

        if (sightPolygon.length > 2) {
          const maskGfx = new PIXI.Graphics();
          maskGfx.getLocalBounds = () => ({
            x: 0,
            y: 0,
            width: 999999,
            height: 999999,
          });

          maskGfx.moveTo(sightPolygon[0].x, sightPolygon[0].y);
          for (let i = 1; i < sightPolygon.length; i++) {
            maskGfx.lineTo(sightPolygon[i].x, sightPolygon[i].y);
          }
          maskGfx.lineTo(sightPolygon[0].x, sightPolygon[0].y);
          maskGfx.fill({ color: 0xffffff, alpha: 1.0 });

          // Mask must be added to the stage to work properly in WebGL
          lightsContainer.addChild(maskGfx);
          lightGfx.mask = maskGfx;
        }

        lightsContainer.addChild(lightGfx);

        // Register Animations
        const animProfile = light.properties?.animation?.profile || "none";
        if (animProfile !== "none") {
          activeLights.push({
            sprite: lightGfx,
            baseAlpha: 1.0,
            animProfile,
            animSpeed: Number(light.properties?.animation?.speed) || 0.5,
            animVariance:
              Number(light.properties?.animation?.intensity_variance) || 0.2,
            seed: Math.random() * 10000, // UNIQUE TIME OFFSET
          });
        }
      });
    } catch (err) {
      console.error("Simulation Loop Error:", err);
    }
  });

  // --- THE ANIMATION TICKER ---
  function animateLights() {
    if (activeLights.length === 0) return;
    const now = Date.now();

    activeLights.forEach((light) => {
      const speed = light.animSpeed;
      const variance = light.animVariance;

      // Calculate a unique time for this specific light
      const localTime = now + light.seed;

      if (light.animProfile === "flicker") {
        const t = localTime * 0.02 * Math.max(0.01, speed);
        const organicNoise =
          (Math.sin(t) + Math.sin(t * 1.73) + Math.sin(t * 2.47)) / 3;
        light.sprite.alpha = Math.max(
          0.1,
          light.baseAlpha + organicNoise * variance,
        );
      } else if (light.animProfile === "pulse") {
        const sine = Math.sin(localTime * 0.005 * speed) * variance;
        light.sprite.alpha = Math.max(0.1, light.baseAlpha + sine);
        light.sprite.scale.set(1 + sine * 0.15);
      } else if (light.animProfile === "strobe") {
        const period = 1000 / Math.max(0.1, speed);
        const isFlash = localTime % period < period * 0.1;
        light.sprite.alpha = isFlash ? light.baseAlpha + variance : 0.1;
      }
    });
  }
</script>
