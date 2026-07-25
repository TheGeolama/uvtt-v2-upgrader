<!-- 
  @component EntitiesLayer
  PixiJS rendering layer responsible for drawing all non-architectural objects on the canvas[cite: 16].
  This includes image-based Props (tokens, assets) as well as abstract vector representations 
  for Lights, Audio Zones, Event Triggers, Emitters, and Spawns[cite: 16].
-->
<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * @type {{ parentContainer: PIXI.Container, panX: number, panY: number, scale: number }}
   * Svelte 5 props passed down from the master CanvasWorkspace[cite: 16].
   */
  let { parentContainer, panX, panY, scale } = $props();

  /** @type {PIXI.Container} The primary layer container[cite: 16]. */
  let entitiesContainer = new PIXI.Container();
  // Ensure PixiJS evaluates mathematical z-index rather than drawing order[cite: 16]
  entitiesContainer.sortableChildren = true;

  /** @type {boolean} Prevents the effect loop from firing before PixiJS is mounted[cite: 16]. */
  let isReady = $state(false);

  /**
   * @type {Map<string, PIXI.Texture>}
   * Local memory cache to prevent reloading the same image binary multiple times per frame[cite: 16].
   */
  const textureCache = new Map();

  /**
   * Retrieves a PixiJS texture from the cache or asynchronously loads it[cite: 16].
   *
   * @param {string} src - The image URI or Base64 string[cite: 16].
   * @returns {PIXI.Texture} The texture (returns an empty placeholder immediately while loading)[cite: 16].
   */
  function getTexture(src) {
    if (textureCache.has(src)) return textureCache.get(src);

    const tex = PIXI.Texture.EMPTY;
    textureCache.set(src, tex);

    PIXI.Assets.load(src)
      .then((loadedTex) => {
        textureCache.set(src, loadedTex);
        // Force the Svelte effect to re-run and draw the newly loaded texture[cite: 16]
        mapStore.updateTrigger++;
        mapStore.redrawTick++;
      })
      .catch((e) => console.warn("Texture failed to load:", src));

    return tex;
  }

  /**
   * Safely flushes the texture cache and drops WebGL memory references[cite: 16].
   */
  function clearTextureCache() {
    for (const [src, tex] of textureCache.entries()) {
      PIXI.Assets.unload(src);
      if (tex !== PIXI.Texture.EMPTY) {
        tex.destroy(true);
      }
    }
    textureCache.clear();
  }

  /**
   * Calculates the canvas render opacity based on the item's GM visibility state[cite: 16].
   *
   * @param {Object} item - The entity object[cite: 16].
   * @returns {number} Float between 0.0 and 1.0[cite: 16].
   */
  function getVisAlpha(item) {
    if (!item || !item.properties) return 1.0;
    if (item.properties.visibility === "hidden") return 0.2; // Barely visible outline[cite: 16]
    if (item.properties.visibility === "gm_only") return 0.5; // Ghosted appearance[cite: 16]
    return 1.0;
  }

  /**
   * Universal centroid calculator[cite: 16].
   * Scans the entire manifest to find the mathematical center of ANY object by its UUID.
   * Crucial for drawing dynamic linking lines between Event Triggers and their Target objects[cite: 16].
   *
   * @param {string} id - The UUID of the target item[cite: 16].
   * @param {Object} manifest - The current map manifest[cite: 16].
   * @returns {{x: number, y: number}|null} The coordinate center, or null if not found[cite: 16].
   */
  function getEntityCenter(id, manifest) {
    if (!id || !manifest) return null;

    // Check Geometry arrays (average out all vector nodes to find the centroid)[cite: 16]
    for (const cat of ["walls", "portals", "overhead"]) {
      const item = manifest.geometry?.[cat]?.find((i) => i.id === id);
      if (item && item.path && item.path.length > 0) {
        let sumX = 0,
          sumY = 0;
        item.path.forEach((pt) => {
          sumX += Number(pt.x);
          sumY += Number(pt.y);
        });
        return { x: sumX / item.path.length, y: sumY / item.path.length };
      }
    }

    // Check Entity arrays (direct coordinate extraction)[cite: 16]
    const prop = manifest.entities?.props?.find((i) => i.id === id);
    if (prop) return { x: Number(prop.position.x), y: Number(prop.position.y) };

    const light = manifest.entities?.lights?.find((i) => i.id === id);
    if (light)
      return { x: Number(light.position.x), y: Number(light.position.y) };

    const audio = manifest.entities?.audio?.zones?.find((i) => i.id === id);
    if (audio) return { x: Number(audio.center.x), y: Number(audio.center.y) };

    const event = manifest.entities?.events?.find((i) => i.id === id);
    if (event)
      return {
        x: Number(event.trigger_bounds.center.x),
        y: Number(event.trigger_bounds.center.y),
      };

    const spawn = manifest.entities?.landing_zones?.find((i) => i.id === id);
    if (spawn)
      return {
        x: Number(spawn.coordinates[0]),
        y: Number(spawn.coordinates[1]),
      };

    const emitter = manifest.entities?.emitters?.find((i) => i.id === id);
    if (emitter)
      return { x: Number(emitter.position.x), y: Number(emitter.position.y) };

    return null;
  }

  onMount(() => {
    parentContainer.addChild(entitiesContainer);
    isReady = true;
  });

  onDestroy(() => {
    clearTextureCache();
    if (entitiesContainer) {
      entitiesContainer.destroy({ children: true });
    }
  });

  /**
   * CORE RENDER LOOP
   * Executes whenever the camera moves, scale changes, or the map store triggers an update[cite: 16].
   */
  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity on user interaction (panning/zooming)[cite: 16]
    let __ = mapStore.updateTrigger; // Force reactivity instantly when items are dragged or loaded[cite: 16]

    if (!isReady || !mapStore.activeMap) return;

    // Clear previous frame[cite: 16]
    entitiesContainer.removeChildren().forEach((c) => c.destroy());

    const manifest = mapStore.activeMap.manifest;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;

    const selectedIds = new Set(mapStore.selectedItemIds);

    // Abstract system vectors (Lights, Audio, Spawns) are pinned above ALL graphic tokens[cite: 16].
    const entGfx = new PIXI.Graphics();
    entGfx.zIndex = 9999;
    entitiesContainer.addChild(entGfx);

    // Viewport Culling: Only draw entities that currently intersect with the active camera bounds[cite: 16]
    const viewportBounds = {
      x: -panX / scale / gridX + originX,
      y: -panY / scale / gridY + originY,
      w: window.innerWidth / scale / gridX,
      h: window.innerHeight / scale / gridY,
    };
    const visibleEntities = mapStore.quadtree?.retrieve(viewportBounds) || [];

    // ----------------------------------------------------------------------
    // 1. Draw Props (Images)
    // Using individual parent containers allows for synced Z-Index grouping
    // ----------------------------------------------------------------------
    (manifest.entities?.props || []).forEach((prop) => {
      // Cull offscreen props[cite: 16]
      if (!visibleEntities.find((v) => v.id === prop.id)) return;

      const px = (Number(prop.position.x) - originX) * gridX;
      const py = (Number(prop.position.y) - originY) * gridY;
      const vAlpha = getVisAlpha(prop);

      try {
        const propContainer = new PIXI.Container();
        propContainer.x = px;
        propContainer.y = py;
        propContainer.zIndex = Number(prop.properties?.z_index) || 0;

        const texture = getTexture(prop.image);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.rotation = (Number(prop.rotation) || 0) * (Math.PI / 180);
        sprite.scale.set((Number(prop.scale) || 100) / 100);
        sprite.alpha = vAlpha;

        propContainer.addChild(sprite);

        // Draw selection highlight bounding box[cite: 16]
        if (selectedIds.has(prop.id)) {
          const boundsGfx = new PIXI.Graphics();
          const isLocked = prop.properties?.locked;
          const strokeColor = isLocked ? 0xef4444 : 0x00f0ff; // Red outline if locked[cite: 16]

          boundsGfx
            .rect(
              -sprite.width / 2,
              -sprite.height / 2,
              sprite.width,
              sprite.height,
            )
            .stroke({ width: 3, color: strokeColor, alpha: 0.4 });
          boundsGfx.rotation = sprite.rotation;
          propContainer.addChild(boundsGfx);
        }

        entitiesContainer.addChild(propContainer);
      } catch (e) {
        console.warn("Failed to render prop sprite", e);
      }
    });

    // ----------------------------------------------------------------------
    // 2. Draw Abstract System Entities
    // ----------------------------------------------------------------------
    const visibleEntityObjects = visibleEntities
      .map((v) => {
        return (
          manifest.entities?.lights?.find((e) => e.id === v.id) ||
          manifest.entities?.audio?.zones?.find((e) => e.id === v.id) ||
          manifest.entities?.events?.find((e) => e.id === v.id) ||
          manifest.entities?.landing_zones?.find((e) => e.id === v.id) ||
          manifest.entities?.emitters?.find((e) => e.id === v.id)
        );
      })
      .filter(Boolean);

    visibleEntityObjects.forEach((ent) => {
      const vAlpha = getVisAlpha(ent);

      if (ent.properties?.radius) {
        // --- LIGHTS ---[cite: 16]
        const px = (Number(ent.position.x) - originX) * gridX;
        const py = (Number(ent.position.y) - originY) * gridY;
        const bRad = (Number(ent.properties.radius.bright) || 5) * gridX;
        const dRad = (Number(ent.properties.radius.dim) || 10) * gridX;
        const color = ent.properties.color || "#ffffff";

        if (ent.type === "directional") {
          const rot = (Number(ent.properties.rotation) || 0) * (Math.PI / 180);
          const cone =
            (Number(ent.properties.cone_angle) || 60) * (Math.PI / 180);
          const startAngle = rot - cone / 2;
          const endAngle = rot + cone / 2;

          entGfx
            .moveTo(px, py)
            .arc(px, py, dRad, startAngle, endAngle)
            .lineTo(px, py)
            .fill({ color, alpha: 0.05 * vAlpha })
            .stroke({ width: 1, color, alpha: 0.2 * vAlpha });

          entGfx
            .moveTo(px, py)
            .arc(px, py, bRad, startAngle, endAngle)
            .lineTo(px, py)
            .fill({ color, alpha: 0.1 * vAlpha })
            .stroke({ width: 1.5, color, alpha: 0.4 * vAlpha });
        } else {
          entGfx
            .circle(px, py, dRad)
            .fill({ color, alpha: 0.05 * vAlpha })
            .stroke({ width: 1, color, alpha: 0.2 * vAlpha });

          entGfx
            .circle(px, py, bRad)
            .fill({ color, alpha: 0.1 * vAlpha })
            .stroke({ width: 1.5, color, alpha: 0.4 * vAlpha });
        }

        entGfx
          .circle(px, py, 4)
          .fill({ color: "#ffffff", alpha: 0.9 * vAlpha });

        if (selectedIds.has(ent.id)) {
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
        }
      } else if (ent.center) {
        // --- AUDIO ZONES ---[cite: 16]
        const px = (Number(ent.center.x) - originX) * gridX;
        const py = (Number(ent.center.y) - originY) * gridY;
        const rad = (Number(ent.radius) || 5) * gridX;

        entGfx
          .circle(px, py, rad)
          .fill({ color: 0x3b82f6, alpha: 0.05 * vAlpha })
          .stroke({ width: 2, color: 0x3b82f6, alpha: 0.4 * vAlpha });

        entGfx
          .circle(px, py, 4)
          .fill({ color: "#ffffff", alpha: 0.9 * vAlpha });

        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      } else if (ent.trigger_bounds) {
        // --- EVENTS & TRIGGERS ---[cite: 16]
        const px = (Number(ent.trigger_bounds.center.x) - originX) * gridX;
        const py = (Number(ent.trigger_bounds.center.y) - originY) * gridY;
        const w = (Number(ent.trigger_bounds.width) || 1) * gridX;
        const h = (Number(ent.trigger_bounds.height) || 1) * gridY;

        entGfx
          .rect(px - w / 2, py - h / 2, w, h)
          .fill({ color: 0xa855f7, alpha: 0.1 * vAlpha })
          .stroke({ width: 2, color: 0xa855f7, alpha: 0.6 * vAlpha });

        entGfx
          .circle(px, py, 4)
          .fill({ color: "#ffffff", alpha: 0.9 * vAlpha });

        if (selectedIds.has(ent.id)) {
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });

          entGfx
            .rect(px - w / 2, py - h / 2, w, h)
            .stroke({ width: 2, color: 0x00f0ff, alpha: 1, dash: [4, 4] });
        }
      } else if (ent.coordinates) {
        // --- SPAWNS / LANDING ZONES ---[cite: 16]
        const px = (Number(ent.coordinates[0]) - originX) * gridX;
        const py = (Number(ent.coordinates[1]) - originY) * gridY;
        const halfX = gridX / 2;
        const halfY = gridY / 2;
        const color = ent.is_default ? 0x22c55e : 0xeab308;

        if (ent.shape === "rectangle") {
          entGfx
            .rect(px - halfX, py - halfY, gridX, gridY)
            .fill({ color, alpha: 0.2 * vAlpha })
            .stroke({ width: 2, color, alpha: 0.8 * vAlpha });
        } else {
          // Defaults to circle gracefully[cite: 16]
          entGfx
            .ellipse(px, py, halfX, halfY)
            .fill({ color, alpha: 0.2 * vAlpha })
            .stroke({ width: 2, color, alpha: 0.8 * vAlpha });
        }

        entGfx
          .circle(px, py, 4)
          .fill({ color: "#ffffff", alpha: 0.9 * vAlpha });

        if (selectedIds.has(ent.id)) {
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
        }
      } else if (ent.position && ent.scale !== undefined) {
        // --- EMITTERS (Weather/Particles) ---[cite: 16]
        const px = (Number(ent.position.x) - originX) * gridX;
        const py = (Number(ent.position.y) - originY) * gridY;
        entGfx.moveTo(px - 10, py).lineTo(px + 10, py);
        entGfx.moveTo(px, py - 10).lineTo(px, py + 10);
        entGfx.stroke({ width: 3, color: 0x06b6d4, alpha: 0.9 * vAlpha });

        entGfx
          .circle(px, py, 4)
          .fill({ color: "#ffffff", alpha: 0.9 * vAlpha });

        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      }
    });

    // ----------------------------------------------------------------------
    // 3. Draw Event Linking Lines
    // Inter-object relationship visualizers (e.g. Trigger -> Target Door)
    // ----------------------------------------------------------------------
    const linkGfx = new PIXI.Graphics();
    linkGfx.zIndex = 10000; // Pinned above absolutely everything[cite: 16]
    entitiesContainer.addChild(linkGfx);

    (manifest.entities?.events || []).forEach((evt) => {
      // Only draw links if the specific event is currently selected[cite: 16]
      if (selectedIds.has(evt.id)) {
        const ex = (Number(evt.trigger_bounds?.center?.x) - originX) * gridX;
        const ey = (Number(evt.trigger_bounds?.center?.y) - originY) * gridY;
        if (isNaN(ex) || isNaN(ey)) return;

        // Draw connections to target entities (Visibility/State Toggles)[cite: 16]
        if (evt.target_entity_ids && evt.target_entity_ids.length > 0) {
          evt.target_entity_ids.forEach((tid) => {
            const tCenter = getEntityCenter(tid, manifest);
            if (tCenter) {
              const tx = (tCenter.x - originX) * gridX;
              const ty = (tCenter.y - originY) * gridY;
              linkGfx
                .moveTo(ex, ey)
                .lineTo(tx, ty)
                .stroke({
                  width: 2,
                  color: 0xa855f7,
                  alpha: 0.8,
                  dash: [8, 6],
                });
              linkGfx
                .circle(tx, ty, 8)
                .stroke({ width: 2, color: 0xa855f7, alpha: 1 });
            }
          });
        }

        // Draw connections to target Spawn Points (Teleportation nodes)[cite: 16]
        if (
          evt.targetSpawnId &&
          (!evt.targetFloorId || evt.targetFloorId === mapStore.activeMapId)
        ) {
          const tCenter = getEntityCenter(evt.targetSpawnId, manifest);
          if (tCenter) {
            const tx = (tCenter.x - originX) * gridX;
            const ty = (tCenter.y - originY) * gridY;
            linkGfx
              .moveTo(ex, ey)
              .lineTo(tx, ty)
              .stroke({ width: 2, color: 0x3b82f6, alpha: 0.8, dash: [8, 6] });

            linkGfx
              .circle(tx, ty, 8)
              .stroke({ width: 2, color: 0x3b82f6, alpha: 1 });
          }
        }
      }
    });
  });
</script>
