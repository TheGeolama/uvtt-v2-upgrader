<script>
  import { onMount, onDestroy } from "svelte";
  import * as PIXI from "pixi.js";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";

  /**
   * @type {{ parentContainer: PIXI.Container }}
   * Notice: We no longer accept panX/panY! Svelte will ignore camera movement.
   */
  let { parentContainer } = $props();

  let entitiesContainer = new PIXI.Container();
  entitiesContainer.label = "EntitiesLayer"; // Tagged for the CanvasWorkspace hardware ticker
  entitiesContainer.sortableChildren = true;

  let isReady = $state(false);
  const textureCache = new Map();

  function getTexture(src) {
    if (textureCache.has(src)) return textureCache.get(src);
    const tex = PIXI.Texture.EMPTY;
    textureCache.set(src, tex);

    PIXI.Assets.load(src)
      .then((loadedTex) => {
        textureCache.set(src, loadedTex);
        mapStore.updateTrigger++; // Force redraw once texture hits memory
      })
      .catch((e) => console.warn("Texture failed to load:", src));
    return tex;
  }

  function clearTextureCache() {
    for (const [src, tex] of textureCache.entries()) {
      PIXI.Assets.unload(src);
      if (tex !== PIXI.Texture.EMPTY) tex.destroy(true);
    }
    textureCache.clear();
  }

  function getVisAlpha(item, isSimMode) {
    if (!item || !item.properties) return 1.0;
    if (item.properties.visibility === "hidden") return isSimMode ? 0.0 : 0.2;
    if (item.properties.visibility === "gm_only") return isSimMode ? 0.0 : 0.5;
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
    if (entitiesContainer) entitiesContainer.destroy({ children: true });
  });

  /**
   * CORE BUILD LOOP
   * Executes ONLY when data changes (updateTrigger) or Simulation Mode is toggled.
   */
  $effect(() => {
    let _ = mapStore.updateTrigger;
    let isSimulationModeActive = mapStore.isSimulationModeActive;

    if (!isReady || !mapStore.activeMap) return;

    // Nuke and rebuild (Only happens on data mutations, not panning!)
    entitiesContainer.removeChildren().forEach((c) => c.destroy());

    const manifest = mapStore.activeMap.manifest;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;
    const selectedIds = new Set(mapStore.selectedItemIds);

    // 1. BUILD GRAPHIC PROPS
    (manifest.entities?.props || []).forEach((prop) => {
      const vAlpha = getVisAlpha(prop, isSimulationModeActive);
      if (vAlpha <= 0) return; // Completely skip rendering if invisible

      try {
        const propContainer = new PIXI.Container();
        propContainer.x = (Number(prop.position.x) - originX) * gridX;
        propContainer.y = (Number(prop.position.y) - originY) * gridY;
        propContainer.zIndex = Number(prop.properties?.z_index) || 0;

        const texture = getTexture(prop.image);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.rotation = (Number(prop.rotation) || 0) * (Math.PI / 180);

        const scaleDec = (Number(prop.scale) || 100) / 100;
        sprite.scale.set(scaleDec);
        sprite.alpha = Math.max(0.01, vAlpha);

        // Hardware Culling Radius: Longest dimension of the scaled image
        propContainer.cullingRadius =
          Math.max(texture.width, texture.height) * scaleDec;

        propContainer.addChild(sprite);

        if (!isSimulationModeActive && selectedIds.has(prop.id)) {
          const boundsGfx = new PIXI.Graphics();
          const strokeColor = prop.properties?.locked ? 0xef4444 : 0x00f0ff;
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

    // 2. BUILD ABSTRACT SYSTEM ENTITIES (Lights, Zones, Events)
    if (!isSimulationModeActive) {
      const allAbstractEntities = [
        ...(manifest.entities?.lights || []),
        ...(manifest.entities?.audio?.zones || []),
        ...(manifest.entities?.events || []),
        ...(manifest.entities?.landing_zones || []),
        ...(manifest.entities?.emitters || []),
      ];

      allAbstractEntities.forEach((ent) => {
        const vAlpha = getVisAlpha(ent, isSimulationModeActive);
        if (vAlpha <= 0) return;

        const entCont = new PIXI.Container();
        entCont.zIndex = 9999; // Abstract entities float above graphics
        const gfx = new PIXI.Graphics();
        entCont.addChild(gfx);

        if (ent.properties?.radius) {
          // --- LIGHTS ---
          entCont.x = (Number(ent.position.x) - originX) * gridX;
          entCont.y = (Number(ent.position.y) - originY) * gridY;
          const bRad = (Number(ent.properties.radius.bright) || 5) * gridX;
          const dRad = (Number(ent.properties.radius.dim) || 10) * gridX;
          const color = ent.properties.color || "#ffffff";

          entCont.cullingRadius = dRad; // Hardware culling

          // NEW FIX: Force WebGL Additive Blending so lights glow cinematically!
          gfx.blendMode = "add";

          if (ent.type === "directional") {
            const rot =
              (Number(ent.properties.rotation) || 0) * (Math.PI / 180);
            const cone =
              (Number(ent.properties.cone_angle) || 60) * (Math.PI / 180);
            gfx
              .moveTo(0, 0)
              .arc(0, 0, dRad, rot - cone / 2, rot + cone / 2)
              .lineTo(0, 0)
              .fill({ color, alpha: 0.05 * vAlpha })
              .stroke({ width: 1, color, alpha: 0.2 * vAlpha });
            gfx
              .moveTo(0, 0)
              .arc(0, 0, bRad, rot - cone / 2, rot + cone / 2)
              .lineTo(0, 0)
              .fill({ color, alpha: 0.1 * vAlpha })
              .stroke({ width: 1.5, color, alpha: 0.4 * vAlpha });
          } else {
            gfx
              .circle(0, 0, dRad)
              .fill({ color, alpha: 0.05 * vAlpha })
              .stroke({ width: 1, color, alpha: 0.2 * vAlpha });
            gfx
              .circle(0, 0, bRad)
              .fill({ color, alpha: 0.1 * vAlpha })
              .stroke({ width: 1.5, color, alpha: 0.4 * vAlpha });
          }
          gfx.circle(0, 0, 4).fill({ color: "#ffffff", alpha: 0.9 * vAlpha });
          if (selectedIds.has(ent.id))
            gfx
              .circle(0, 0, 8)
              .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
        } else if (ent.center) {
          // --- AUDIO ZONES ---
          entCont.x = (Number(ent.center.x) - originX) * gridX;
          entCont.y = (Number(ent.center.y) - originY) * gridY;
          const rad = (Number(ent.radius) || 5) * gridX;

          entCont.cullingRadius = rad;

          gfx
            .circle(0, 0, rad)
            .fill({ color: 0x3b82f6, alpha: 0.05 * vAlpha })
            .stroke({ width: 2, color: 0x3b82f6, alpha: 0.4 * vAlpha });
          gfx.circle(0, 0, 4).fill({ color: "#ffffff", alpha: 0.9 * vAlpha });
          if (selectedIds.has(ent.id))
            gfx
              .circle(0, 0, 8)
              .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
        } else if (ent.trigger_bounds) {
          // --- EVENTS & TRIGGERS ---
          entCont.x = (Number(ent.trigger_bounds.center.x) - originX) * gridX;
          entCont.y = (Number(ent.trigger_bounds.center.y) - originY) * gridY;
          const w = (Number(ent.trigger_bounds.width) || 1) * gridX;
          const h = (Number(ent.trigger_bounds.height) || 1) * gridY;

          entCont.cullingRadius = Math.max(w, h);

          gfx
            .rect(-w / 2, -h / 2, w, h)
            .fill({ color: 0xa855f7, alpha: 0.1 * vAlpha })
            .stroke({ width: 2, color: 0xa855f7, alpha: 0.6 * vAlpha });
          gfx.circle(0, 0, 4).fill({ color: "#ffffff", alpha: 0.9 * vAlpha });
          if (selectedIds.has(ent.id)) {
            gfx
              .circle(0, 0, 8)
              .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
            gfx
              .rect(-w / 2, -h / 2, w, h)
              .stroke({ width: 2, color: 0x00f0ff, alpha: 1, dash: [4, 4] });
          }
        } else if (ent.coordinates) {
          // --- SPAWNS / LANDING ZONES ---
          entCont.x = (Number(ent.coordinates[0]) - originX) * gridX;
          entCont.y = (Number(ent.coordinates[1]) - originY) * gridY;
          const halfX = gridX / 2;
          const halfY = gridY / 2;

          entCont.cullingRadius = Math.max(gridX, gridY);

          const color = ent.is_default ? 0x22c55e : 0xeab308;
          if (ent.shape === "rectangle") {
            gfx
              .rect(-halfX, -halfY, gridX, gridY)
              .fill({ color, alpha: 0.2 * vAlpha })
              .stroke({ width: 2, color, alpha: 0.8 * vAlpha });
          } else {
            gfx
              .ellipse(0, 0, halfX, halfY)
              .fill({ color, alpha: 0.2 * vAlpha })
              .stroke({ width: 2, color, alpha: 0.8 * vAlpha });
          }
          gfx.circle(0, 0, 4).fill({ color: "#ffffff", alpha: 0.9 * vAlpha });
          if (selectedIds.has(ent.id))
            gfx
              .circle(0, 0, 8)
              .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
        } else if (ent.position && ent.scale !== undefined) {
          // --- EMITTERS ---
          entCont.x = (Number(ent.position.x) - originX) * gridX;
          entCont.y = (Number(ent.position.y) - originY) * gridY;
          entCont.cullingRadius = 50;

          gfx.moveTo(-10, 0).lineTo(10, 0);
          gfx.moveTo(0, -10).lineTo(0, 10);
          gfx.stroke({ width: 3, color: 0x06b6d4, alpha: 0.9 * vAlpha });
          gfx.circle(0, 0, 4).fill({ color: "#ffffff", alpha: 0.9 * vAlpha });
          if (selectedIds.has(ent.id))
            gfx
              .circle(0, 0, 8)
              .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
        }
        entitiesContainer.addChild(entCont);
      });

      // 3. BUILD INTERACTIVE EVENT ROUTING LINES (Bypasses culling)
      const linkGfx = new PIXI.Graphics();
      linkGfx.zIndex = 10000;
      linkGfx.isGlobalGeometry = true;
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
                .stroke({
                  width: 2,
                  color: 0x3b82f6,
                  alpha: 0.8,
                  dash: [8, 6],
                });
              linkGfx
                .circle(tx, ty, 8)
                .stroke({ width: 2, color: 0x3b82f6, alpha: 1 });
            }
          }
        }
      });
    }
  });
</script>
