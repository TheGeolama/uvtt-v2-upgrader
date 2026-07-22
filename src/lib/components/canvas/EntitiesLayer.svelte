<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  let { parentContainer, panX, panY, scale } = $props();
  let entitiesContainer = new PIXI.Container();
  let isReady = $state(false);

  const textureCache = new Map();

  function getTexture(src) {
    if (textureCache.has(src)) return textureCache.get(src);

    const tex = PIXI.Texture.EMPTY;
    textureCache.set(src, tex);

    PIXI.Assets.load(src)
      .then((loadedTex) => {
        textureCache.set(src, loadedTex);
        mapStore.updateTrigger++;
      })
      .catch((e) => console.warn("Texture failed to load:", src));

    return tex;
  }

  function clearTextureCache() {
    for (const [src, tex] of textureCache.entries()) {
      PIXI.Assets.unload(src);
      if (tex !== PIXI.Texture.EMPTY) {
        tex.destroy(true);
      }
    }
    textureCache.clear();
  }

  function getVisAlpha(item) {
    if (!item || !item.properties) return 1.0;
    if (item.properties.visibility === "hidden") return 0.2;
    if (item.properties.visibility === "gm_only") return 0.5;
    return 1.0;
  }

  function getEntityCenter(id, manifest) {
    if (!id || !manifest) return null;

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

  $effect(() => {
    let _ = mapStore.redrawTick; // Force reactivity
    if (!isReady || !mapStore.activeMap) return;

    entitiesContainer.removeChildren().forEach((c) => c.destroy());

    const manifest = mapStore.activeMap.manifest;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;

    const selectedIds = new Set(mapStore.selectedItemIds);
    const entGfx = new PIXI.Graphics();
    entitiesContainer.addChild(entGfx);

    const viewportBounds = {
      x: -panX / scale / gridX + originX,
      y: -panY / scale / gridY + originY,
      w: window.innerWidth / scale / gridX,
      h: window.innerHeight / scale / gridY,
    };
    const visibleEntities = mapStore.quadtree?.retrieve(viewportBounds) || [];

    // 1. Draw Props (Images)
    (manifest.entities?.props || []).forEach((prop) => {
      if (!visibleEntities.find((v) => v.id === prop.id)) return;

      const px = (Number(prop.position.x) - originX) * gridX;
      const py = (Number(prop.position.y) - originY) * gridY;
      const vAlpha = getVisAlpha(prop);

      try {
        const texture = getTexture(prop.image);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.x = px;
        sprite.y = py;
        sprite.rotation = (Number(prop.rotation) || 0) * (Math.PI / 180);
        sprite.scale.set((Number(prop.scale) || 100) / 100);
        sprite.alpha = vAlpha;
        entitiesContainer.addChild(sprite);

        if (selectedIds.has(prop.id)) {
          const boundsGfx = new PIXI.Graphics();
          boundsGfx
            .rect(
              -sprite.width / 2,
              -sprite.height / 2,
              sprite.width,
              sprite.height,
            )
            .stroke({ width: 3, color: 0x00f0ff, alpha: 1 });
          boundsGfx.x = px;
          boundsGfx.y = py;
          boundsGfx.rotation = sprite.rotation;
          entitiesContainer.addChild(boundsGfx);
        }
      } catch (e) {
        console.warn("Failed to render prop sprite", e);
      }
    });

    // 2. Draw Entities
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
        // LIGHTS
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
        // AUDIO
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
        // EVENTS
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
        // SPAWNS
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
          // Defaults to circle gracefully
          entGfx
            .ellipse(px, py, halfX, halfY)
            .fill({ color, alpha: 0.2 * vAlpha })
            .stroke({ width: 2, color, alpha: 0.8 * vAlpha });
        }

        entGfx
          .circle(px, py, 4)
          .fill({ color: "#ffffff", alpha: 0.9 * vAlpha });
        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      } else if (ent.position && ent.scale !== undefined) {
        // EMITTERS
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

    // 3. Draw Event Linking Lines
    const linkGfx = new PIXI.Graphics();
    entitiesContainer.addChild(linkGfx);

    (manifest.entities?.events || []).forEach((evt) => {
      if (selectedIds.has(evt.id)) {
        const ex = (Number(evt.trigger_bounds?.center?.x) - originX) * gridX;
        const ey = (Number(evt.trigger_bounds?.center?.y) - originY) * gridY;
        if (isNaN(ex) || isNaN(ey)) return;

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
