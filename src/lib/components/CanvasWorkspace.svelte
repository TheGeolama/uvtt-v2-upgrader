<script>
  import { onMount, onDestroy } from "svelte";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { upgradeLegacyMap } from "$lib/utils/legacyParser.js";
  import * as PIXI from "pixi.js";

  let canvasContainer;
  let pixiApp;
  let viewportContainer;
  let mapSprite;
  let gridContainer;
  let geometryContainer;
  let entitiesContainer;
  let shadowContainer;

  // --- REACTIVE VIEWPORT STATE ---
  let scale = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  let currentMapId = null;
  let isPanning = $state(false);
  let dragStart = { x: 0, y: 0 };
  let originalPan = { x: 0, y: 0 };
  let draggedItemId = null;
  let lastDragGrid = null;
  let currentGridX = 0;
  let currentGridY = 0;

  let isSpacePressed = $state(false);
  let isBoxSelecting = false;
  let boxSelectStart = null;
  let boxSelectEnd = null;
  let boxSelectGfx = null;

  // --- GRID ALIGNMENT STATE ---
  let isGridAligning = false;
  let alignBoxStart = null;
  let alignBoxEnd = null;
  let alignBoxGfx = null;

  let activeMap = $derived(mapStore.activeMap);
  let activeTool = $derived(mapStore.activeTool);
  let lightingPreview = $derived(mapStore.lightingPreview);
  let vision = $derived(mapStore.vision);

  let isPixiReady = $state(false);
  let isDraggingVisionToken = $state(false);

  let draftingPath = $state([]);
  let draftingPreview = $state(null);
  let draftingLayerGfx = null;

  // --- MEMORY MANAGEMENT ---
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
    console.log("Texture cache purged.");
  }

  // --- WINDOW RESIZE TRACKING ---
  let lastWindowWidth = 0;
  let lastWindowHeight = 0;

  onMount(async () => {
    if (!canvasContainer) return;

    lastWindowWidth = window.innerWidth;
    lastWindowHeight = window.innerHeight;

    pixiApp = new PIXI.Application();
    await pixiApp.init({
      resizeTo: window,
      backgroundColor: 0x05080e,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });

    pixiApp.canvas.style.position = "absolute";
    pixiApp.canvas.style.top = "0";
    pixiApp.canvas.style.left = "0";
    pixiApp.canvas.style.zIndex = "1";
    canvasContainer.appendChild(pixiApp.canvas);

    viewportContainer = new PIXI.Container();
    pixiApp.stage.addChild(viewportContainer);

    mapSprite = new PIXI.Sprite();
    viewportContainer.addChild(mapSprite);

    gridContainer = new PIXI.Container();
    viewportContainer.addChild(gridContainer);

    entitiesContainer = new PIXI.Container();
    viewportContainer.addChild(entitiesContainer);

    shadowContainer = new PIXI.Container();
    viewportContainer.addChild(shadowContainer);

    geometryContainer = new PIXI.Container();
    viewportContainer.addChild(geometryContainer);
    isPixiReady = true;
  });

  onDestroy(() => {
    clearTextureCache();
    if (pixiApp) pixiApp.destroy(true);
  });

  $effect(() => {
    const tick = mapStore.redrawTick;
    if (!isPixiReady || !activeMap) return;

    const safeManifest = JSON.parse(JSON.stringify(activeMap.manifest));

    if (currentMapId !== activeMap.id) {
      clearTextureCache();
      currentMapId = activeMap.id;
      loadMapImage(activeMap.imageUrl, safeManifest);
      centerMap(safeManifest);
    }

    applyOffsetsAndScale(safeManifest);
    drawCanvas(safeManifest);
  });

  function handleResize() {
    if (!activeMap) return;

    const cw = window.innerWidth;
    const ch = window.innerHeight;

    if (lastWindowWidth > 0 && lastWindowHeight > 0) {
      const dx = (cw - lastWindowWidth) / 2;
      const dy = (ch - lastWindowHeight) / 2;

      panX += dx;
      panY += dy;
      updateViewport();
    }

    lastWindowWidth = cw;
    lastWindowHeight = ch;
  }

  async function loadMapImage(url, manifest) {
    if (!url) {
      mapSprite.texture = PIXI.Texture.EMPTY;
      return;
    }
    try {
      const texture = await PIXI.Assets.load(url);
      mapSprite.texture = texture;
      applyOffsetsAndScale(manifest);
    } catch (err) {
      console.error("Failed to load texture", err);
    }
  }

  function applyOffsetsAndScale(manifest) {
    if (!mapSprite || mapSprite.texture === PIXI.Texture.EMPTY) return;
    const res = manifest.resolution;
    const mapWidth = res.map_size[0] * res.pixels_per_grid;
    const mapHeight = res.map_size[1] * res.pixels_per_grid;

    mapSprite.width = mapWidth;
    mapSprite.height = mapHeight;
    mapSprite.position.set(
      Number(res.map_offset_x) || 0,
      Number(res.map_offset_y) || 0,
    );
  }

  function centerMap(manifest) {
    if (!viewportContainer) return;
    const res = manifest.resolution;
    const mapWidth = res.map_size[0] * res.pixels_per_grid;
    const mapHeight = res.map_size[1] * res.pixels_per_grid;

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    scale = Math.min((cw - 100) / mapWidth, (ch - 100) / mapHeight, 1);
    panX = (cw - mapWidth * scale) / 2;
    panY = (ch - mapHeight * scale) / 2;

    mapStore.zoomScale = Math.round(scale * 100);
    updateViewport();
  }

  function updateViewport() {
    if (viewportContainer) {
      viewportContainer.scale.set(scale);
      viewportContainer.position.set(panX, panY);
    }
  }

  function drawCanvas(manifest) {
    if (
      !gridContainer ||
      !geometryContainer ||
      !entitiesContainer ||
      !shadowContainer
    )
      return;
    gridContainer.removeChildren().forEach((c) => c.destroy());
    geometryContainer.removeChildren().forEach((c) => c.destroy());
    entitiesContainer.removeChildren().forEach((c) => c.destroy());
    shadowContainer.removeChildren().forEach((c) => c.destroy());

    const res = manifest.resolution;
    const gridSize = Number(res.pixels_per_grid) || 70;
    const unitsPerGrid = Math.max(1, Number(res.units_per_grid) || 5);
    const originX = Number(res.map_origin[0]) || 0;
    const originY = Number(res.map_origin[1]) || 0;
    const mapWidth = res.map_size[0] * gridSize;
    const mapHeight = res.map_size[1] * gridSize;

    const subGridGfx = new PIXI.Graphics();
    gridContainer.addChild(subGridGfx);
    const subGridSize = gridSize / unitsPerGrid;
    for (let x = 0; x <= mapWidth; x += subGridSize) {
      subGridGfx.moveTo(x, 0).lineTo(x, mapHeight);
    }
    for (let y = 0; y <= mapHeight; y += subGridSize) {
      subGridGfx.moveTo(0, y).lineTo(mapWidth, y);
    }
    subGridGfx.stroke({
      width: 1,
      color: res.grid_color || 0xffffff,
      alpha: 0.05,
    });

    const mainGridGfx = new PIXI.Graphics();
    gridContainer.addChild(mainGridGfx);
    for (let x = 0; x <= mapWidth; x += gridSize) {
      mainGridGfx.moveTo(x, 0).lineTo(x, mapHeight);
    }
    for (let y = 0; y <= mapHeight; y += gridSize) {
      mainGridGfx.moveTo(0, y).lineTo(mapWidth, y);
    }
    mainGridGfx.stroke({
      width: 1.5,
      color: res.grid_color || 0xffffff,
      alpha: 0.2,
    });

    const selectedIds = new Set(mapStore.selectedItemIds);
    const entGfx = new PIXI.Graphics();
    entitiesContainer.addChild(entGfx);

    const viewportBounds = {
      x: -panX / scale / gridSize + originX,
      y: -panY / scale / gridSize + originY,
      w: window.innerWidth / scale / gridSize,
      h: window.innerHeight / scale / gridSize,
    };
    const visibleEntities = mapStore.quadtree?.retrieve(viewportBounds) || [];

    (manifest.entities?.props || []).forEach((prop) => {
      if (!visibleEntities.find((v) => v.id === prop.id)) return;

      const px = (Number(prop.position.x) - originX) * gridSize;
      const py = (Number(prop.position.y) - originY) * gridSize;
      try {
        const texture = getTexture(prop.image);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.x = px;
        sprite.y = py;
        sprite.rotation = (Number(prop.rotation) || 0) * (Math.PI / 180);
        sprite.scale.set((Number(prop.scale) || 100) / 100);
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
      if (ent.properties?.radius) {
        const px = (Number(ent.position.x) - originX) * gridSize;
        const py = (Number(ent.position.y) - originY) * gridSize;
        const bRad = (Number(ent.properties.radius.bright) || 5) * gridSize;
        const dRad = (Number(ent.properties.radius.dim) || 10) * gridSize;
        const color = ent.properties.color || "#ffffff";
        entGfx
          .circle(px, py, dRad)
          .fill({ color, alpha: 0.05 })
          .stroke({ width: 1, color, alpha: 0.2 });
        entGfx
          .circle(px, py, bRad)
          .fill({ color, alpha: 0.1 })
          .stroke({ width: 1.5, color, alpha: 0.4 });
        entGfx.circle(px, py, 4).fill({ color: "#ffffff", alpha: 0.9 });
        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      } else if (ent.center) {
        const px = (Number(ent.center.x) - originX) * gridSize;
        const py = (Number(ent.center.y) - originY) * gridSize;
        const rad = (Number(ent.radius) || 5) * gridSize;
        entGfx
          .circle(px, py, rad)
          .fill({ color: 0x3b82f6, alpha: 0.05 })
          .stroke({ width: 2, color: 0x3b82f6, alpha: 0.4 });
        entGfx.circle(px, py, 4).fill({ color: "#ffffff", alpha: 0.9 });
        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      } else if (ent.trigger_bounds) {
        const px = (Number(ent.trigger_bounds.center.x) - originX) * gridSize;
        const py = (Number(ent.trigger_bounds.center.y) - originY) * gridSize;
        const rad = (Number(ent.trigger_bounds.radius) || 2) * gridSize;
        entGfx
          .rect(px - rad, py - rad, rad * 2, rad * 2)
          .fill({ color: 0xa855f7, alpha: 0.1 })
          .stroke({ width: 2, color: 0xa855f7, alpha: 0.6 });
        entGfx.circle(px, py, 4).fill({ color: "#ffffff", alpha: 0.9 });
        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      } else if (ent.coordinates) {
        const px = (Number(ent.coordinates[0]) - originX) * gridSize;
        const py = (Number(ent.coordinates[1]) - originY) * gridSize;
        const half = gridSize / 2;
        const color = ent.is_default ? 0x22c55e : 0xeab308;
        if (ent.shape === "circle")
          entGfx
            .circle(px, py, half)
            .fill({ color, alpha: 0.2 })
            .stroke({ width: 2, color, alpha: 0.8 });
        else
          entGfx
            .rect(px - half, py - half, gridSize, gridSize)
            .fill({ color, alpha: 0.2 })
            .stroke({ width: 2, color, alpha: 0.8 });
        entGfx.circle(px, py, 4).fill({ color: "#ffffff", alpha: 0.9 });
        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      } else if (ent.position && ent.scale !== undefined) {
        const px = (Number(ent.position.x) - originX) * gridSize;
        const py = (Number(ent.position.y) - originY) * gridSize;
        entGfx.moveTo(px - 10, py).lineTo(px + 10, py);
        entGfx.moveTo(px, py - 10).lineTo(px, py + 10);
        entGfx.stroke({ width: 3, color: 0x06b6d4, alpha: 0.9 });
        entGfx.circle(px, py, 4).fill({ color: "#ffffff", alpha: 0.9 });
        if (selectedIds.has(ent.id))
          entGfx
            .circle(px, py, 8)
            .stroke({ width: 3, color: "#00f0ff", alpha: 1 });
      }
    });

    (manifest.geometry.overhead || []).forEach((roof) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);
      const tint = roof.properties?.tint || "#475569";
      const opacity = (roof.properties?.opacity ?? 100) / 100;
      const isHidden = roof.properties?.hidden || false;
      const renderOpacity = isHidden ? opacity * 0.5 : opacity;
      const strokeColor = isHidden ? 0xef4444 : tint;
      if (selectedIds.has(roof.id)) {
        tracePath(gfx, roof.path, gridSize, originX, originY, true);
        gfx.stroke({
          width: 10,
          color: 0xffffff,
          alpha: 0.8,
          join: "round",
          cap: "round",
        });
      }
      tracePath(gfx, roof.path, gridSize, originX, originY, true);
      if (roof.path && roof.path.length > 2) {
        gfx.fill({ color: tint, alpha: renderOpacity });
        gfx.stroke({
          width: 2,
          color: strokeColor,
          alpha: isHidden ? 0.8 : renderOpacity,
        });
      } else {
        gfx.stroke({ width: 4, color: tint, alpha: renderOpacity });
      }
    });

    (manifest.geometry.walls || []).forEach((wall) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);
      if (selectedIds.has(wall.id)) {
        tracePath(gfx, wall.path, gridSize, originX, originY);
        gfx.stroke({
          width: 12,
          color: 0xffffff,
          alpha: 0.5,
          join: "round",
          cap: "round",
        });
      }
      tracePath(gfx, wall.path, gridSize, originX, originY);
      gfx.stroke({
        width: 5,
        color: 0x00f0ff,
        alpha: 0.9,
        join: "round",
        cap: "round",
      });
    });

    (manifest.geometry.portals || []).forEach((portal) => {
      const gfx = new PIXI.Graphics();
      geometryContainer.addChild(gfx);
      let pColor = 0xffa500;
      if (portal.properties?.type === "window") pColor = 0x3b82f6;
      else if (portal.properties?.type === "secret") pColor = 0xa855f7;

      if (selectedIds.has(portal.id)) {
        tracePath(gfx, portal.path, gridSize, originX, originY);
        gfx.stroke({
          width: 12,
          color: 0xffffff,
          alpha: 0.5,
          join: "round",
          cap: "round",
        });
      }
      tracePath(gfx, portal.path, gridSize, originX, originY);
      gfx.stroke({
        width: 5,
        color: pColor,
        alpha: 0.9,
        join: "round",
        cap: "round",
      });
    });

    drawDraftingLayer();
    drawGridAlignBoxes();
    if (vision?.enabled)
      drawVisionLoS(manifest, originX, originY, gridSize, mapWidth, mapHeight);
    else if (lightingPreview)
      drawDynamicLighting(
        manifest,
        originX,
        originY,
        gridSize,
        mapWidth,
        mapHeight,
      );
  }

  function drawBoxSelection() {
    if (!geometryContainer || !activeMap) return;
    if (boxSelectGfx) {
      boxSelectGfx.destroy();
      boxSelectGfx = null;
    }
    if (isBoxSelecting && boxSelectStart && boxSelectEnd) {
      boxSelectGfx = new PIXI.Graphics();
      geometryContainer.addChild(boxSelectGfx);
      const res = activeMap.manifest.resolution;
      const gridSize = Number(res.pixels_per_grid) || 70;
      const originX = Number(res.map_origin[0]) || 0;
      const originY = Number(res.map_origin[1]) || 0;
      const sx = (boxSelectStart.x - originX) * gridSize;
      const sy = (boxSelectStart.y - originY) * gridSize;
      const ex = (boxSelectEnd.x - originX) * gridSize;
      const ey = (boxSelectEnd.y - originY) * gridSize;
      boxSelectGfx.rect(
        Math.min(sx, ex),
        Math.min(sy, ey),
        Math.abs(ex - sx),
        Math.abs(ey - sy),
      );
      boxSelectGfx.fill({ color: 0x00f0ff, alpha: 0.1 });
      boxSelectGfx.stroke({ width: 1, color: 0x00f0ff, alpha: 0.8 });
    }
  }

  function drawGridAlignBoxes() {
    if (!geometryContainer || !activeMap) return;
    if (alignBoxGfx) {
      alignBoxGfx.destroy();
      alignBoxGfx = null;
    }

    if (
      mapStore.gridAlignBoxes.length > 0 ||
      (isGridAligning && alignBoxStart && alignBoxEnd)
    ) {
      alignBoxGfx = new PIXI.Graphics();
      geometryContainer.addChild(alignBoxGfx);

      const res = activeMap.manifest.resolution;
      const offX = Number(res.map_offset_x) || 0;
      const offY = Number(res.map_offset_y) || 0;

      mapStore.gridAlignBoxes.forEach((b) => {
        alignBoxGfx.rect(
          Math.min(b.sx, b.ex) + offX,
          Math.min(b.sy, b.ey) + offY,
          Math.abs(b.ex - b.sx),
          Math.abs(b.ey - b.sy),
        );
        alignBoxGfx.fill({ color: 0x22c55e, alpha: 0.2 });
        alignBoxGfx.stroke({ width: 2, color: 0x22c55e, alpha: 0.8 });
      });

      if (isGridAligning && alignBoxStart && alignBoxEnd) {
        alignBoxGfx.rect(
          Math.min(alignBoxStart.x, alignBoxEnd.x) + offX,
          Math.min(alignBoxStart.y, alignBoxEnd.y) + offY,
          Math.abs(alignBoxEnd.x - alignBoxStart.x),
          Math.abs(alignBoxEnd.y - alignBoxStart.y),
        );
        alignBoxGfx.fill({ color: 0xeab308, alpha: 0.3 });
        alignBoxGfx.stroke({
          width: 2,
          color: 0xeab308,
          alpha: 0.9,
          dash: [5, 5],
        });
      }
    }
  }

  function drawDraftingLayer() {
    if (!geometryContainer || !activeMap) return;
    if (draftingLayerGfx) {
      draftingLayerGfx.destroy();
      draftingLayerGfx = null;
    }
    if (draftingPath.length > 0) {
      draftingLayerGfx = new PIXI.Graphics();
      geometryContainer.addChild(draftingLayerGfx);
      const res = activeMap.manifest.resolution;
      const gridSize = Number(res.pixels_per_grid) || 70;
      const originX = Number(res.map_origin[0]) || 0;
      const originY = Number(res.map_origin[1]) || 0;
      const pts = draftingPreview
        ? [...draftingPath, draftingPreview]
        : [...draftingPath];
      const dColor =
        activeTool === "wall"
          ? 0x00f0ff
          : activeTool === "roof"
            ? 0x22c55e
            : 0xffa500;
      tracePath(
        draftingLayerGfx,
        pts,
        gridSize,
        originX,
        originY,
        activeTool === "roof",
      );
      draftingLayerGfx.stroke({
        width: 4,
        color: dColor,
        alpha: 0.6,
        join: "round",
        cap: "round",
      });
      if (activeTool === "roof" && pts.length > 2)
        draftingLayerGfx.fill({ color: dColor, alpha: 0.2 });
    }
  }

  function tracePath(gfx, path, gridSize, originX, originY, closePath = false) {
    if (!path || path.length < 2) return;
    for (let i = 0; i < path.length; i++) {
      const px = (Number(path[i].x) - originX) * gridSize;
      const py = (Number(path[i].y) - originY) * gridSize;
      if (isNaN(px) || isNaN(py)) continue;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    if (closePath && path.length > 2) gfx.closePath();
  }

  // --- CORE MATH HELPERS ---
  function buildCollisionSegments(
    manifest,
    originX,
    originY,
    gridSize,
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
            x: (w.path[i].x - originX) * gridSize,
            y: (w.path[i].y - originY) * gridSize,
          },
          p2: {
            x: (w.path[i + 1].x - originX) * gridSize,
            y: (w.path[i + 1].y - originY) * gridSize,
          },
        });
      }
    });

    (manifest.geometry?.portals || []).forEach((p) => {
      if (!p.path || p.path.length < 2 || p.properties?.state === "open")
        return;
      for (let i = 0; i < p.path.length - 1; i++) {
        segments.push({
          p1: {
            x: (p.path[i].x - originX) * gridSize,
            y: (p.path[i].y - originY) * gridSize,
          },
          p2: {
            x: (p.path[i + 1].x - originX) * gridSize,
            y: (p.path[i + 1].y - originY) * gridSize,
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

  function drawVisionLoS(
    manifest,
    originX,
    originY,
    gridSize,
    mapWidth,
    mapHeight,
  ) {
    const shadowGfx = new PIXI.Graphics();
    shadowContainer.addChild(shadowGfx);
    const segments = buildCollisionSegments(
      manifest,
      originX,
      originY,
      gridSize,
      mapWidth,
      mapHeight,
    );

    shadowGfx
      .moveTo(0, 0)
      .lineTo(mapWidth, 0)
      .lineTo(mapWidth, mapHeight)
      .lineTo(0, mapHeight)
      .closePath();

    const tx = (vision.token.x - originX) * gridSize;
    const ty = (vision.token.y - originY) * gridSize;
    const radius = (vision.token.radius || 20) * gridSize;

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
      .circle(tx, ty, gridSize * 0.4)
      .fill({ color: 0x3b82f6, alpha: 0.8 })
      .stroke({ width: 3, color: 0xffffff, alpha: 1 });
    tokenGfx.circle(tx, ty, gridSize * 0.1).fill({ color: 0xffffff });
  }

  function drawDynamicLighting(
    manifest,
    originX,
    originY,
    gridSize,
    mapWidth,
    mapHeight,
  ) {
    const shadowGfx = new PIXI.Graphics();
    shadowContainer.addChild(shadowGfx);
    const segments = buildCollisionSegments(
      manifest,
      originX,
      originY,
      gridSize,
      mapWidth,
      mapHeight,
    );
    shadowGfx
      .moveTo(0, 0)
      .lineTo(mapWidth, 0)
      .lineTo(mapWidth, mapHeight)
      .lineTo(0, mapHeight)
      .closePath();

    (manifest.entities?.lights || []).forEach((light) => {
      const lx = (Number(light.position?.x) - originX) * gridSize;
      const ly = (Number(light.position?.y) - originY) * gridSize;
      if (isNaN(lx) || isNaN(ly)) return;
      const radius = (Number(light.properties?.radius?.dim) || 10) * gridSize;
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

  // --- STRICT VECTOR AND CENTER SNAPPING MATH ---
  function getVectorSnapPoint(px, py, walls, snapDistance) {
    let closestDist = snapDistance * snapDistance;
    let snapPoint = null;
    for (const wall of walls) {
      if (!wall.path || wall.path.length < 2) continue;
      for (let i = 0; i < wall.path.length - 1; i++) {
        const x1 = Number(wall.path[i].x);
        const y1 = Number(wall.path[i].y);
        const x2 = Number(wall.path[i + 1].x);
        const y2 = Number(wall.path[i + 1].y);
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (l2 === 0) continue;
        let t = Math.max(
          0,
          Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2),
        );
        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);
        const distSq = (px - projX) ** 2 + (py - projY) ** 2;
        if (distSq < closestDist) {
          closestDist = distSq;
          snapPoint = { x: projX, y: projY };
        }
      }
    }
    return snapPoint;
  }

  function getGridCoordinates(clientX, clientY, e_shiftKey, currentToolAction) {
    if (!activeMap)
      return { exactX: 0, exactY: 0, snapX: 0, snapY: 0, gridSize: 70 };
    const rect = canvasContainer.getBoundingClientRect();
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;

    const manifest = activeMap.manifest;
    const gridSize = Number(manifest.resolution?.pixels_per_grid) || 70;
    const unitsPerGrid = Math.max(
      1,
      Number(manifest.resolution?.units_per_grid) || 5,
    );
    const originX = Number(manifest.resolution?.map_origin?.[0]) || 0;
    const originY = Number(manifest.resolution?.map_origin?.[1]) || 0;
    const exactX = (rawX - panX) / scale / gridSize + originX;
    const exactY = (rawY - panY) / scale / gridSize + originY;

    let snapX = exactX;
    let snapY = exactY;
    let isVectorSnapped = false;

    let draggedCategory = null;
    if (currentToolAction === "select" && draggedItemId) {
      if (manifest.entities?.lights?.some((i) => i.id === draggedItemId))
        draggedCategory = "light";
      else if (
        manifest.entities?.audio?.zones?.some((i) => i.id === draggedItemId)
      )
        draggedCategory = "audio";
      else if (manifest.entities?.emitters?.some((i) => i.id === draggedItemId))
        draggedCategory = "emitter";
      else if (
        manifest.entities?.landing_zones?.some((i) => i.id === draggedItemId)
      )
        draggedCategory = "spawn";
      else if (manifest.entities?.events?.some((i) => i.id === draggedItemId))
        draggedCategory = "event";
      else if (manifest.entities?.props?.some((i) => i.id === draggedItemId))
        draggedCategory = "prop";
    }

    const effectiveAction = draggedCategory || currentToolAction;
    const isFreeTool = ["light", "audio", "emitter", "prop"].includes(
      effectiveAction,
    );
    const isCenterSnapTool = ["spawn", "event"].includes(effectiveAction);
    const shouldSnap = isFreeTool ? e_shiftKey : !e_shiftKey;
    if (isCenterSnapTool && shouldSnap) {
      snapX = Math.floor(exactX) + 0.5;
      snapY = Math.floor(exactY) + 0.5;
      isVectorSnapped = true;
    } else if (effectiveAction === "portal" && shouldSnap) {
      const snapDist = 0.5 / unitsPerGrid;
      const edgeSnap = getVectorSnapPoint(
        exactX,
        exactY,
        manifest.geometry?.walls || [],
        snapDist,
      );
      if (edgeSnap) {
        snapX = edgeSnap.x;
        snapY = edgeSnap.y;
        isVectorSnapped = true;
      }
    }

    if (shouldSnap && !isVectorSnapped) {
      snapX = Math.round(exactX * unitsPerGrid) / unitsPerGrid;
      snapY = Math.round(exactY * unitsPerGrid) / unitsPerGrid;
    }

    return { exactX, exactY, snapX, snapY, gridSize };
  }

  // --- DROP EVENT HANDLERS ---
  function handleDrop(e) {
    e.preventDefault();

    // 1. Check for physical files dropped from the OS (Windows/Mac)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split(".").pop().toLowerCase();

      if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        mapStore.importImageAsMap(file);
        return;
      } else if (["dd2vtt", "uvtt", "json", "txt"].includes(ext)) {
        file.text().then((text) => {
          const parsedMap = upgradeLegacyMap(text, file.name);
          if (parsedMap) mapStore.appendLevel(parsedMap);
        });
        return;
      }
    }

    // 2. Fallback to existing internal drag-and-drop (Asset Library Props)
    const dataStr = e.dataTransfer.getData("application/json");
    if (!dataStr) return;

    try {
      const data = JSON.parse(dataStr);
      if (data.type === "asset_prop") {
        const coords = getGridCoordinates(e.clientX, e.clientY, true, "select");
        mapStore.addProp(coords.exactX, coords.exactY, data.image, data.name);
        if (activeTool !== "select") mapStore.setTool("select");
      }
    } catch (err) {
      console.warn("Invalid drop data payload");
    }
  }

  function handlePointerDown(e) {
    if (!viewportContainer || !activeMap) return;

    if (e.button === 0 && vision?.enabled) {
      const coords = getGridCoordinates(e.clientX, e.clientY, false, "select");
      const distSq =
        (coords.exactX - vision.token.x) ** 2 +
        (coords.exactY - vision.token.y) ** 2;
      if (distSq < 1.0) {
        isDraggingVisionToken = true;
        return;
      }
    }

    if (e.button === 2 && e.altKey && draftingPath.length === 0) {
      const coords = getGridCoordinates(
        e.clientX,
        e.clientY,
        e.shiftKey,
        activeTool,
      );
      const thresholdSq = (15 / scale / coords.gridSize) ** 2;
      const nodeDeleted = mapStore.deleteVectorNode(
        coords.exactX,
        coords.exactY,
        thresholdSq,
      );
      if (nodeDeleted) return;
    }

    if (
      e.button === 1 ||
      (e.button === 2 && draftingPath.length === 0 && !e.altKey) ||
      (e.button === 0 && isSpacePressed)
    ) {
      isPanning = true;
      dragStart = { x: e.clientX, y: e.clientY };
      originalPan = { x: panX, y: panY };
      return;
    }

    if (e.button === 2 && draftingPath.length > 1) {
      mapStore.addGeometry(activeTool, [...draftingPath]);
      draftingPath = [];
      draftingPreview = null;
      drawDraftingLayer();
      return;
    }

    if (e.button === 0) {
      const isTempSelect = (e.ctrlKey || e.metaKey) && activeTool !== "select";
      const currentToolAction = isTempSelect ? "select" : activeTool;

      // --- GRID ALIGNMENT INTERCEPT ---
      if (currentToolAction === "grid_align") {
        const rect = canvasContainer.getBoundingClientRect();
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;
        const worldX = (rawX - panX) / scale;
        const worldY = (rawY - panY) / scale;

        const res = activeMap.manifest.resolution;
        const currentOffX = Number(res.map_offset_x) || 0;
        const currentOffY = Number(res.map_offset_y) || 0;

        isGridAligning = true;
        // Record positions relative to the raw image (world position minus current offset)
        alignBoxStart = { x: worldX - currentOffX, y: worldY - currentOffY };
        alignBoxEnd = { x: worldX - currentOffX, y: worldY - currentOffY };
        return;
      }

      const coords = getGridCoordinates(
        e.clientX,
        e.clientY,
        e.shiftKey,
        currentToolAction,
      );
      currentGridX = coords.snapX;
      currentGridY = coords.snapY;

      if (e.altKey && currentToolAction === "select") {
        const thresholdSq = (15 / scale / coords.gridSize) ** 2;
        const splitOccurred = mapStore.splitVectorNode(
          coords.exactX,
          coords.exactY,
          thresholdSq,
        );
        if (splitOccurred) return;
      }

      if (["wall", "portal", "roof"].includes(currentToolAction)) {
        draftingPath = [...draftingPath, { x: currentGridX, y: currentGridY }];
        drawDraftingLayer();
        return;
      }
      if (
        ["light", "audio", "event", "emitter", "spawn"].includes(
          currentToolAction,
        )
      ) {
        mapStore[
          `add${currentToolAction.charAt(0).toUpperCase() + currentToolAction.slice(1)}`
        ](currentGridX, currentGridY);
        return;
      }

      if (currentToolAction === "select") {
        const manifest = activeMap.manifest;
        let closestItem = null;
        let minGridDistSq = (15 / scale / coords.gridSize) ** 2;
        const searchRange = {
          x: coords.exactX - 1,
          y: coords.exactY - 1,
          w: 2,
          h: 2,
        };
        const candidates = mapStore.quadtree?.retrieve(searchRange) || [];

        const checkEntityCollision = (items, getPos) => {
          for (const item of items) {
            if (!candidates.find((c) => c.id === item.id)) continue;
            const pos = getPos(item);
            if (!pos || isNaN(pos.x) || isNaN(pos.y)) continue;
            const distSq =
              (coords.exactX - pos.x) ** 2 + (coords.exactY - pos.y) ** 2;
            if (distSq < minGridDistSq) {
              minGridDistSq = distSq;
              closestItem = item;
            }
          }
        };
        const checkGeometryCollision = (items) => {
          for (const item of items) {
            const path = item.path || [];
            if (path.length < 2) continue;
            for (let i = 0; i < path.length - 1; i++) {
              const x1 = Number(path[i].x);
              const y1 = Number(path[i].y);
              const x2 = Number(path[i + 1].x);
              const y2 = Number(path[i + 1].y);
              const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
              if (l2 === 0) continue;
              let t = Math.max(
                0,
                Math.min(
                  1,
                  ((coords.exactX - x1) * (x2 - x1) +
                    (coords.exactY - y1) * (y2 - y1)) /
                    l2,
                ),
              );
              const projX = x1 + t * (x2 - x1);
              const projY = y1 + t * (y2 - y1);
              const distSq =
                (coords.exactX - projX) ** 2 + (coords.exactY - projY) ** 2;
              if (distSq < minGridDistSq) {
                minGridDistSq = distSq;
                closestItem = item;
              }
            }
          }
        };

        checkEntityCollision(manifest.entities?.lights || [], (i) => ({
          x: Number(i.position?.x),
          y: Number(i.position?.y),
        }));
        checkEntityCollision(manifest.entities?.audio?.zones || [], (i) => ({
          x: Number(i.center?.x),
          y: Number(i.center?.y),
        }));
        checkEntityCollision(manifest.entities?.events || [], (i) => ({
          x: Number(i.trigger_bounds?.center?.x),
          y: Number(i.trigger_bounds?.center?.y),
        }));
        checkEntityCollision(manifest.entities?.landing_zones || [], (i) => ({
          x: Number(i.coordinates?.[0]),
          y: Number(i.coordinates?.[1]),
        }));
        checkEntityCollision(manifest.entities?.emitters || [], (i) => ({
          x: Number(i.position?.x),
          y: Number(i.position?.y),
        }));
        checkEntityCollision(manifest.entities?.props || [], (i) => ({
          x: Number(i.position?.x),
          y: Number(i.position?.y),
        }));
        checkGeometryCollision(manifest.geometry?.walls || []);
        checkGeometryCollision(manifest.geometry?.portals || []);
        checkGeometryCollision(manifest.geometry?.overhead || []);

        if (closestItem) {
          const isMulti = isTempSelect
            ? e.shiftKey
            : e.shiftKey || e.ctrlKey || e.metaKey;
          mapStore.selectItem(closestItem.id, isMulti);
          draggedItemId = closestItem.id;
          lastDragGrid = { x: currentGridX, y: currentGridY };
        } else {
          const isMulti = isTempSelect
            ? e.shiftKey
            : e.shiftKey || e.ctrlKey || e.metaKey;
          if (!isMulti) mapStore.clearSelection();
          isBoxSelecting = true;
          boxSelectStart = { x: coords.exactX, y: coords.exactY };
          boxSelectEnd = { x: coords.exactX, y: coords.exactY };
        }
      }
    }
  }

  function handlePointerMove(e) {
    if (!activeMap) return;
    const isTempSelect = (e.ctrlKey || e.metaKey) && activeTool !== "select";
    const currentToolAction = isTempSelect ? "select" : activeTool;
    const coords = getGridCoordinates(
      e.clientX,
      e.clientY,
      e.shiftKey,
      currentToolAction,
    );
    mapStore.mouseX = coords.exactX.toFixed(2);
    mapStore.mouseY = coords.exactY.toFixed(2);

    if (isPanning) {
      panX = originalPan.x + (e.clientX - dragStart.x);
      panY = originalPan.y + (e.clientY - dragStart.y);
      updateViewport();
      return;
    }
    if (isDraggingVisionToken) {
      mapStore.updateVisionToken(coords.exactX, coords.exactY);
      return;
    }

    // --- GRID ALIGNMENT VISUALS ---
    if (isGridAligning) {
      const rect = canvasContainer.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const worldX = (rawX - panX) / scale;
      const worldY = (rawY - panY) / scale;

      const res = activeMap.manifest.resolution;
      const currentOffX = Number(res.map_offset_x) || 0;
      const currentOffY = Number(res.map_offset_y) || 0;

      alignBoxEnd = { x: worldX - currentOffX, y: worldY - currentOffY };
      drawGridAlignBoxes();
      return;
    }

    currentGridX = coords.snapX;
    currentGridY = coords.snapY;
    if (isBoxSelecting) {
      boxSelectEnd = { x: coords.exactX, y: coords.exactY };
      drawBoxSelection();
      return;
    }
    if (["wall", "portal", "roof"].includes(currentToolAction)) {
      draftingPreview = { x: currentGridX, y: currentGridY };
      drawDraftingLayer();
    } else if (draftingPreview) {
      draftingPreview = null;
      drawDraftingLayer();
    }
    if (draggedItemId && currentToolAction === "select" && lastDragGrid) {
      const dx = currentGridX - lastDragGrid.x;
      const dy = currentGridY - lastDragGrid.y;
      mapStore.updateNodePosition(
        draggedItemId,
        currentGridX,
        currentGridY,
        dx,
        dy,
      );
      lastDragGrid = { x: currentGridX, y: currentGridY };
    }
  }

  function handlePointerUp(e) {
    if (isDraggingVisionToken) {
      isDraggingVisionToken = false;
      return;
    }
    isPanning = false;
    draggedItemId = null;
    lastDragGrid = null;

    // --- COMMIT GRID ALIGNMENT BOX ---
    if (isGridAligning && alignBoxStart && alignBoxEnd) {
      if (
        Math.abs(alignBoxEnd.x - alignBoxStart.x) > 5 &&
        Math.abs(alignBoxEnd.y - alignBoxStart.y) > 5
      ) {
        mapStore.gridAlignBoxes.push({
          sx: alignBoxStart.x,
          sy: alignBoxStart.y,
          ex: alignBoxEnd.x,
          ey: alignBoxEnd.y,
        });
        mapStore.updateTrigger++; // Force Svelte to react to the new array item
      }
      isGridAligning = false;
      alignBoxStart = null;
      alignBoxEnd = null;
      drawGridAlignBoxes();
      return;
    }

    if (isBoxSelecting && boxSelectStart && boxSelectEnd) {
      const minX = Math.min(boxSelectStart.x, boxSelectEnd.x);
      const maxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
      const minY = Math.min(boxSelectStart.y, boxSelectEnd.y);
      const maxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
      const manifest = activeMap.manifest;
      const hits = [];
      const inBox = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
      const checkEntities = (items, getPos) =>
        items.forEach((item) => {
          const p = getPos(item);
          if (p && inBox(p.x, p.y)) hits.push(item.id);
        });
      const checkGeometries = (items) =>
        items.forEach((item) => {
          if (
            item.path &&
            item.path.some((pt) => inBox(Number(pt.x), Number(pt.y)))
          )
            hits.push(item.id);
        });
      checkEntities(manifest.entities?.lights || [], (i) => ({
        x: Number(i.position?.x),
        y: Number(i.position?.y),
      }));
      checkEntities(manifest.entities?.audio?.zones || [], (i) => ({
        x: Number(i.center?.x),
        y: Number(i.center?.y),
      }));
      checkEntities(manifest.entities?.events || [], (i) => ({
        x: Number(i.trigger_bounds?.center?.x),
        y: Number(i.trigger_bounds?.center?.y),
      }));
      checkEntities(manifest.entities?.landing_zones || [], (i) => ({
        x: Number(i.coordinates?.[0]),
        y: Number(i.coordinates?.[1]),
      }));
      checkEntities(manifest.entities?.emitters || [], (i) => ({
        x: Number(i.position?.x),
        y: Number(i.position?.y),
      }));
      checkEntities(manifest.entities?.props || [], (i) => ({
        x: Number(i.position?.x),
        y: Number(i.position?.y),
      }));
      checkGeometries(manifest.geometry?.walls || []);
      checkGeometries(manifest.geometry?.portals || []);
      checkGeometries(manifest.geometry?.overhead || []);
      if (hits.length > 0) mapStore.selectItems(hits, true);
      isBoxSelecting = false;
      boxSelectStart = null;
      boxSelectEnd = null;
      if (boxSelectGfx) {
        boxSelectGfx.destroy();
        boxSelectGfx = null;
      }
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const rect = canvasContainer.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const zoom = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = scale * zoom;
    panX = pointerX - (pointerX - panX) * (newScale / scale);
    panY = pointerY - (pointerY - panY) * (newScale / scale);
    scale = newScale;
    mapStore.zoomScale = Math.round(scale * 100);
    updateViewport();
  }

  function handleKeyDown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.code === "Space") {
      e.preventDefault();
      isSpacePressed = true;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? mapStore.redo() : mapStore.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      mapStore.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      mapStore.copySelected();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      mapStore.pasteClipboard(currentGridX, currentGridY);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      mapStore.duplicateSelected();
    }
    if (e.key === "Escape") {
      if (isGridAligning || mapStore.gridAlignBoxes.length > 0) {
        isGridAligning = false;
        alignBoxStart = null;
        alignBoxEnd = null;
        mapStore.clearGridAlignment();
        if (alignBoxGfx) {
          alignBoxGfx.destroy();
          alignBoxGfx = null;
        }
      } else if (isBoxSelecting) {
        isBoxSelecting = false;
        boxSelectStart = null;
        boxSelectEnd = null;
        if (boxSelectGfx) {
          boxSelectGfx.destroy();
          boxSelectGfx = null;
        }
      } else if (draftingPath.length > 0) {
        draftingPath = [];
        draftingPreview = null;
        drawDraftingLayer();
      } else mapStore.clearSelection();
    }
    if (e.key === "Enter" && draftingPath.length > 1) {
      mapStore.addGeometry(activeTool, [...draftingPath]);
      draftingPath = [];
      draftingPreview = null;
      drawDraftingLayer();
    }
    if (e.key === "Delete" || e.key === "Backspace") mapStore.deleteSelected();
  }

  function handleKeyUp(e) {
    if (e.code === "Space") isSpacePressed = false;
  }
</script>

<svelte:window
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
  onblur={() => (isSpacePressed = false)}
  onresize={handleResize}
/>

<div
  bind:this={canvasContainer}
  role="application"
  class="pixi-workspace {isSpacePressed && !isPanning
    ? 'space-pressed'
    : ''} {isPanning ? 'is-panning' : ''} {activeTool === 'grid_align'
    ? 'grid-align-mode'
    : ''}"
  ondragover={(e) => e.preventDefault()}
  ondragenter={(e) => e.preventDefault()}
  ondrop={handleDrop}
  onwheel={handleWheel}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointerleave={handlePointerUp}
  oncontextmenu={(e) => e.preventDefault()}
></div>

<style>
  .pixi-workspace {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    position: absolute;
    top: 0;
    left: 0;
    background: #05080e;
    cursor: crosshair;
  }
  .pixi-workspace.space-pressed {
    cursor: grab;
  }
  .pixi-workspace.is-panning {
    cursor: grabbing !important;
  }
  .pixi-workspace.grid-align-mode {
    cursor: cell;
  }
</style>
