<script>
  import { onMount, onDestroy } from "svelte";
  import { mapStore } from "$lib/stores/mapStore.svelte.js";
  import { upgradeLegacyMap } from "$lib/utils/legacyParser.js";
  import { audioEngine } from "$lib/utils/spatialAudio.js";
  import * as PIXI from "pixi.js";
  import GridLayer from "./canvas/GridLayer.svelte";
  import GeometryLayer from "./canvas/GeometryLayer.svelte";
  import EntitiesLayer from "./canvas/EntitiesLayer.svelte";
  import ShadowLayer from "./canvas/ShadowLayer.svelte";
  import OverlayLayer from "./canvas/OverlayLayer.svelte";
  import { VisionEngine } from "./canvas/VisionEngine.js";

  let canvasContainer;
  let pixiApp;
  let viewportContainer = $state.raw();
  let overlayContainer = $state.raw();
  let mapSprite;
  let visionEngine = $state.raw(null);

  // --- REACTIVE VIEWPORT STATE ---
  let scale = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let currentMapId = null;
  let currentMapUrl = ""; // Tracks the loaded texture URL for safe unloading
  let isPanning = $state(false);

  let dragStart = { x: 0, y: 0 };
  let originalPan = { x: 0, y: 0 };

  // DRAG STATE
  let draggedItemId = null;
  let draggedNodeIndex = null;
  let lastDragGrid = null;
  let currentGridX = 0;
  let currentGridY = 0;

  // --- REACTIVE OVERLAY STATE (Passed to OverlayLayer) ---
  let isBoxSelecting = $state(false);
  let boxSelectStart = $state(null);
  let boxSelectEnd = $state(null);
  let isGridAligning = $state(false);
  let alignBoxStart = $state(null);
  let alignBoxEnd = $state(null);
  let draftingPath = $state([]);
  let draftingPreview = $state(null);

  let isSpacePressed = $state(false);
  let isPixiReady = $state(false);
  let isDraggingVisionToken = $state(false);

  // Coordinate HUD is now hidden by default
  let showGridHUD = $state(false);

  let activeMap = $derived(mapStore.activeMap);
  let activeTool = $derived(mapStore.activeTool);
  let vision = $derived(mapStore.vision);

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

    // Overlay is appended last so it sits on top of injected Svelte Layers
    overlayContainer = new PIXI.Container();
    viewportContainer.addChild(overlayContainer);

    isPixiReady = true;
  });

  onDestroy(() => {
    if (visionEngine) {
      visionEngine.destroy();
    }
    if (mapSprite) {
      mapSprite.texture = PIXI.Texture.EMPTY;
    }
    if (pixiApp) {
      pixiApp.destroy(true);
    }
    // Shut down active nodes to prevent memory/audio leaks when switching away
    audioEngine.stopAll();
  });

  // --- MAP LOADING & RENDERING EFFECT ---
  $effect(() => {
    const tick = mapStore.redrawTick;
    if (!isPixiReady || !activeMap) return;

    const safeManifest = JSON.parse(JSON.stringify(activeMap.manifest));

    if (currentMapId !== activeMap.id) {
      currentMapId = activeMap.id;
      loadMapImage(activeMap.imageUrl, safeManifest);
      centerMap(safeManifest);
    }

    applyOffsetsAndScale(safeManifest);
  });

  // --- REAL-TIME SPATIAL AUDIO & DYNAMIC LIGHTING EFFECT ---
  $effect(() => {
    // We bind explicitly to these runes. If any of them change, this effect instantly re-fires.
    const tick = mapStore.updateTrigger;
    const px = panX;
    const py = panY;
    const s = scale;

    if (!isPixiReady || !activeMap) return;

    const manifest = activeMap.manifest;
    const audioZones = manifest.entities?.audio?.zones || [];

    // Grab the FULL geometry object (Walls, Portals, Roofs)
    const geometry = manifest.geometry || {
      walls: [],
      portals: [],
      overhead: [],
    };
    const audioBlobs = mapStore.audioBlobs || {};

    let listenerX = 0;
    let listenerY = 0;

    if (vision?.enabled && vision.token) {
      // PLAYER PREVIEW MODE: Listen from the selected token's exact coordinates
      listenerX = vision.token.x;
      listenerY = vision.token.y;
    } else {
      // GM MODE: Calculate the exact center of the current camera viewport
      const gridX = Number(manifest.resolution?.pixels_per_grid) || 70;
      const gridY = Number(manifest.resolution?.pixels_per_grid_y) || gridX;
      const originX = Number(manifest.resolution?.map_origin?.[0]) || 0;
      const originY = Number(manifest.resolution?.map_origin?.[1]) || 0;
      const cw = window.innerWidth;
      const ch = window.innerHeight;

      listenerX = (cw / 2 - px) / s / gridX + originX;
      listenerY = (ch / 2 - py) / s / gridY + originY;
    }

    // Pass the full geometry to the audio engine so it can calculate doors/windows
    audioEngine.syncZones(
      audioZones,
      audioBlobs,
      listenerX,
      listenerY,
      geometry,
      () => {
        // This callback fires the millisecond a new track finishes decoding
        mapStore.updateTrigger++;
      },
    );

    // ---- VISION ENGINE SYNC ----
    if (visionEngine) {
      const gridX = Number(manifest.resolution?.pixels_per_grid) || 70;
      const gridY = Number(manifest.resolution?.pixels_per_grid_y) || gridX;
      const originX = Number(manifest.resolution?.map_origin?.[0]) || 0;
      const originY = Number(manifest.resolution?.map_origin?.[1]) || 0;

      const toPixelX = (gx) => (gx - originX) * gridX;
      const toPixelY = (gy) => (gy - originY) * gridY;

      let pixelWalls = [];
      const addGeom = (items, isPortal) => {
        items.forEach((item) => {
          if (isPortal) {
            // Aggressively check both the root object and nested properties for closure state
            const t = String(
              item.type || item.properties?.type || item.portalType || "",
            ).toLowerCase();
            const s = String(
              item.status || item.properties?.status || "",
            ).toLowerCase();
            const c =
              item.closed !== undefined ? item.closed : item.properties?.closed;

            if (
              t.includes("window") ||
              s.includes("window") ||
              s.includes("open") ||
              s.includes("broken") ||
              c === false ||
              c === "false"
            ) {
              return; // Let light pass through! Do not add this geometry to the light blockers.
            }
          }

          if (!item.path || item.path.length < 2) return;
          for (let i = 0; i < item.path.length - 1; i++) {
            pixelWalls.push({
              p1: { x: toPixelX(item.path[i].x), y: toPixelY(item.path[i].y) },
              p2: {
                x: toPixelX(item.path[i + 1].x),
                y: toPixelY(item.path[i + 1].y),
              },
            });
          }
        });
      };

      addGeom(geometry.walls || [], false);
      addGeom(geometry.portals || [], true);

      visionEngine.updateGeometry(pixelWalls);

      if (vision?.enabled && vision.token) {
        visionEngine.fowSprite.alpha = 0.95; // Player view mask opacity
        visionEngine.renderVision([
          {
            x: toPixelX(vision.token.x),
            y: toPixelY(vision.token.y),
            radius: 3000, // Large radius to simulate full sightline to boundaries
          },
        ]);
      } else {
        // GM View - clear fog of war
        visionEngine.fowSprite.alpha = 0.0;
        visionEngine.renderVision([]);
      }
    }
  });

  function handleResize() {
    if (!activeMap) return;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    if (lastWindowWidth > 0 && lastWindowHeight > 0) {
      panX += (cw - lastWindowWidth) / 2;
      panY += (ch - lastWindowHeight) / 2;
      updateViewport();
    }

    lastWindowWidth = cw;
    lastWindowHeight = ch;
  }

  async function loadMapImage(url, manifest) {
    // 1. Immediately clear the sprite so the render loop doesn't crash on a dead texture
    if (mapSprite) {
      mapSprite.texture = PIXI.Texture.EMPTY;
    }

    // 2. Safely unload the previous background texture from PIXI memory
    if (currentMapUrl && currentMapUrl !== url) {
      try {
        await PIXI.Assets.unload(currentMapUrl);
      } catch (e) {
        console.warn("Could not explicitly unload previous map asset", e);
      }
    }
    currentMapUrl = url;

    if (!url) return;

    // 3. Load the new texture and apply it
    try {
      mapSprite.texture = await PIXI.Assets.load(url);
      applyOffsetsAndScale(manifest);

      // 4. Initialize Vision Engine to exact map pixel bounds
      if (visionEngine) {
        visionEngine.destroy();
        visionEngine = null;
      }
      const res = manifest.resolution;
      const gridX = Number(res.pixels_per_grid) || 70;
      const gridY = Number(res.pixels_per_grid_y) || gridX;
      const mapW = res.map_size[0] * gridX;
      const mapH = res.map_size[1] * gridY;

      visionEngine = new VisionEngine(pixiApp, mapW, mapH, viewportContainer);

      // Ensure overlay stays on top of the newly appended Fog of War
      if (viewportContainer && overlayContainer) {
        viewportContainer.setChildIndex(
          overlayContainer,
          viewportContainer.children.length - 1,
        );
      }
    } catch (err) {
      console.error("Failed to load texture", err);
    }
  }

  function applyOffsetsAndScale(manifest) {
    if (!mapSprite || mapSprite.texture === PIXI.Texture.EMPTY) return;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;
    mapSprite.width = res.map_size[0] * gridX;
    mapSprite.height = res.map_size[1] * gridY;
    mapSprite.position.set(
      Number(res.map_offset_x) || 0,
      Number(res.map_offset_y) || 0,
    );
  }

  function centerMap(manifest) {
    if (!viewportContainer) return;
    const res = manifest.resolution;
    const gridX = Number(res.pixels_per_grid) || 70;
    const gridY = Number(res.pixels_per_grid_y) || gridX;

    const mapWidth = res.map_size[0] * gridX;
    const mapHeight = res.map_size[1] * gridY;
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
      return { exactX: 0, exactY: 0, snapX: 0, snapY: 0, gridX: 70, gridY: 70 };
    const rect = canvasContainer.getBoundingClientRect();
    const manifest = activeMap.manifest;
    const gridX = Number(manifest.resolution?.pixels_per_grid) || 70;
    const gridY = Number(manifest.resolution?.pixels_per_grid_y) || gridX;
    const unitsPerGrid = Math.max(
      1,
      Number(manifest.resolution?.units_per_grid) || 5,
    );
    const originX = Number(manifest.resolution?.map_origin?.[0]) || 0;
    const originY = Number(manifest.resolution?.map_origin?.[1]) || 0;
    const exactX = (clientX - rect.left - panX) / scale / gridX + originX;
    const exactY = (clientY - rect.top - panY) / scale / gridY + originY;

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
      const edgeSnap = getVectorSnapPoint(
        exactX,
        exactY,
        manifest.geometry?.walls || [],
        0.5 / unitsPerGrid,
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

    return { exactX, exactY, snapX, snapY, gridX, gridY };
  }

  function handleDrop(e) {
    e.preventDefault();

    // 1. Bypass HTML5 payload limits - Check internal window memory first
    if (
      window.__uvttDraggedAsset &&
      window.__uvttDraggedAsset.type === "asset_prop"
    ) {
      const data = window.__uvttDraggedAsset;
      const coords = getGridCoordinates(e.clientX, e.clientY, true, "select");

      mapStore.addProp(coords.exactX, coords.exactY, data.image, data.name);

      // --- SMART TOKEN SCALING ---
      // Auto-scale the dropped image so its longest edge fits exactly 1 grid square (e.g., 5x5ft)
      const propsArray = activeMap?.manifest?.entities?.props || [];
      if (propsArray.length > 0 && data.naturalWidth && data.naturalHeight) {
        const newProp = propsArray[propsArray.length - 1];
        const maxDim = Math.max(data.naturalWidth, data.naturalHeight);

        // Calculate scale percentage (e.g., 70px grid / 140px native image = 0.5 * 100 = 50% scale)
        const gridFitScale = (coords.gridX / maxDim) * 100;
        newProp.scale = Math.round(gridFitScale);

        // Force rendering layers to sync the new scale instantly
        mapStore.updateTrigger++;
      }

      if (activeTool !== "select") mapStore.setTool("select");
      window.__uvttDraggedAsset = null; // Clean up memory
      return; // Exit early so it doesn't trigger the file drop logic!
    }

    // 2. Legacy fallback just in case
    const dataStr = e.dataTransfer.getData("application/json");
    if (dataStr) {
      try {
        const data = JSON.parse(dataStr);
        if (data.type === "asset_prop") {
          const coords = getGridCoordinates(
            e.clientX,
            e.clientY,
            true,
            "select",
          );
          mapStore.addProp(coords.exactX, coords.exactY, data.image, data.name);
          if (activeTool !== "select") mapStore.setTool("select");
          return;
        }
      } catch (err) {}
    }

    // 3. Handle external OS file drops
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
  }

  function handlePointerDown(e) {
    if (!viewportContainer || !activeMap) return;
    // AUDIO ENGINE INIT
    // Browsers strictly block Web Audio until the user clicks/interacts with the page
    if (!audioEngine.isInitialized) {
      audioEngine.init();
    } else {
      audioEngine.resume();
    }

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

    if (e.button === 2 && draftingPath.length === 0) {
      const coords = getGridCoordinates(
        e.clientX,
        e.clientY,
        false,
        activeTool,
      );
      const thresholdSq = (15 / scale / coords.gridX) ** 2;
      if (e.altKey) {
        if (mapStore.splitVectorNode(coords.exactX, coords.exactY, thresholdSq))
          return;
      } else if (e.shiftKey) {
        if (
          mapStore.deleteVectorNode(coords.exactX, coords.exactY, thresholdSq)
        )
          return;
      }
    }

    if (e.button === 0 && e.altKey && activeTool === "select") {
      const coords = getGridCoordinates(e.clientX, e.clientY, false, "select");
      if (
        mapStore.deleteVectorNode(
          coords.exactX,
          coords.exactY,
          (15 / scale / coords.gridX) ** 2,
        )
      )
        return;
    }

    if (
      e.button === 1 ||
      (e.button === 2 &&
        draftingPath.length === 0 &&
        !e.altKey &&
        !e.shiftKey) ||
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
      return;
    }

    if (e.button === 0) {
      const isTempSelect = (e.ctrlKey || e.metaKey) && activeTool !== "select";
      const currentToolAction = isTempSelect ? "select" : activeTool;

      if (currentToolAction === "grid_align") {
        const rect = canvasContainer.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - panX) / scale;
        const worldY = (e.clientY - rect.top - panY) / scale;
        const offX = Number(activeMap.manifest.resolution.map_offset_x) || 0;
        const offY = Number(activeMap.manifest.resolution.map_offset_y) || 0;
        isGridAligning = true;
        alignBoxStart = { x: worldX - offX, y: worldY - offY };
        alignBoxEnd = { x: worldX - offX, y: worldY - offY };
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

      if (["wall", "portal", "roof"].includes(currentToolAction)) {
        draftingPath = [...draftingPath, { x: currentGridX, y: currentGridY }];
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
        let closestItem = null,
          closestNodeIndex = null;
        let minGridDistSq = (15 / scale / coords.gridX) ** 2;
        const candidates =
          mapStore.quadtree?.retrieve({
            x: coords.exactX - 1,
            y: coords.exactY - 1,
            w: 2,
            h: 2,
          }) || [];

        const checkGeometryNodes = (items) => {
          items.forEach((item) => {
            if (!item.path) return;
            item.path.forEach((pt, i) => {
              const distSq =
                (coords.exactX - Number(pt.x)) ** 2 +
                (coords.exactY - Number(pt.y)) ** 2;
              if (distSq < minGridDistSq) {
                minGridDistSq = distSq;
                closestItem = item;
                closestNodeIndex = i;
              }
            });
          });
        };

        checkGeometryNodes(manifest.geometry?.walls || []);
        checkGeometryNodes(manifest.geometry?.portals || []);
        checkGeometryNodes(manifest.geometry?.overhead || []);

        draggedNodeIndex = closestNodeIndex;

        if (!closestItem) {
          const checkEntityCollision = (items, getPos) => {
            items.forEach((item) => {
              if (!candidates.find((c) => c.id === item.id)) return;
              const pos = getPos(item);
              if (!pos || isNaN(pos.x) || isNaN(pos.y)) return;

              const distSq =
                (coords.exactX - pos.x) ** 2 + (coords.exactY - pos.y) ** 2;
              if (distSq < minGridDistSq) {
                minGridDistSq = distSq;
                closestItem = item;
              }
            });
          };
          const checkGeomSegments = (items) => {
            items.forEach((item) => {
              if (!item.path || item.path.length < 2) return;
              for (let i = 0; i < item.path.length - 1; i++) {
                const x1 = Number(item.path[i].x),
                  y1 = Number(item.path[i].y);
                const x2 = Number(item.path[i + 1].x),
                  y2 = Number(item.path[i + 1].y);
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
                const distSq =
                  (coords.exactX - (x1 + t * (x2 - x1))) ** 2 +
                  (coords.exactY - (y1 + t * (y2 - y1))) ** 2;
                if (distSq < minGridDistSq) {
                  minGridDistSq = distSq;
                  closestItem = item;
                }
              }
            });
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
          checkGeomSegments(manifest.geometry?.walls || []);
          checkGeomSegments(manifest.geometry?.portals || []);
          checkGeomSegments(manifest.geometry?.overhead || []);
        }

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
      // Force audio and vision nodes to update continuously while dragging!
      mapStore.updateTrigger++;
      return;
    }

    if (isGridAligning) {
      const rect = canvasContainer.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - panX) / scale;
      const worldY = (e.clientY - rect.top - panY) / scale;
      alignBoxEnd = {
        x: worldX - (Number(activeMap.manifest.resolution.map_offset_x) || 0),
        y: worldY - (Number(activeMap.manifest.resolution.map_offset_y) || 0),
      };
      return;
    }

    currentGridX = coords.snapX;
    currentGridY = coords.snapY;
    if (isBoxSelecting) {
      boxSelectEnd = { x: coords.exactX, y: coords.exactY };
      return;
    }

    if (["wall", "portal", "roof"].includes(currentToolAction)) {
      draftingPreview = { x: currentGridX, y: currentGridY };
    } else if (draftingPreview) {
      draftingPreview = null;
    }

    if (draggedItemId && currentToolAction === "select" && lastDragGrid) {
      if (draggedNodeIndex !== null) {
        mapStore.updateSingleNodePosition(
          draggedItemId,
          draggedNodeIndex,
          currentGridX,
          currentGridY,
        );
      } else {
        mapStore.updateNodePosition(
          draggedItemId,
          currentGridX,
          currentGridY,
          currentGridX - lastDragGrid.x,
          currentGridY - lastDragGrid.y,
        );
      }
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
    draggedNodeIndex = null;
    lastDragGrid = null;
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
        mapStore.updateTrigger++;
      } else {
        mapStore.setGridOrigin(alignBoxStart.x, alignBoxStart.y);
      }
      isGridAligning = false;
      alignBoxStart = null;
      alignBoxEnd = null;
      return;
    }

    if (isBoxSelecting && boxSelectStart && boxSelectEnd) {
      const minX = Math.min(boxSelectStart.x, boxSelectEnd.x),
        maxX = Math.max(boxSelectStart.x, boxSelectEnd.x);
      const minY = Math.min(boxSelectStart.y, boxSelectEnd.y),
        maxY = Math.max(boxSelectStart.y, boxSelectEnd.y);
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
      } else if (isBoxSelecting) {
        isBoxSelecting = false;
        boxSelectStart = null;
        boxSelectEnd = null;
      } else if (draftingPath.length > 0) {
        draftingPath = [];
        draftingPreview = null;
      } else {
        mapStore.clearSelection();
      }
    }
    if (e.key === "Enter" && draftingPath.length > 1) {
      mapStore.addGeometry(activeTool, [...draftingPath]);
      draftingPath = [];
      draftingPreview = null;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      mapStore.deleteSelected();
    }
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

{#if activeMap && isPixiReady}
  <GridLayer parentContainer={viewportContainer} />
  <GeometryLayer parentContainer={viewportContainer} />
  <EntitiesLayer parentContainer={viewportContainer} {panX} {panY} {scale} />
  <ShadowLayer parentContainer={viewportContainer} />

  <OverlayLayer
    parentContainer={overlayContainer}
    {isBoxSelecting}
    {boxSelectStart}
    {boxSelectEnd}
    {isGridAligning}
    {alignBoxStart}
    {alignBoxEnd}
    {draftingPath}
    {draftingPreview}
  />

  {@const exactX = Number(mapStore.mouseX || 0)}
  {@const exactY = Number(mapStore.mouseY || 0)}
  {@const macroCol = Math.floor(exactX)}
  {@const macroRow = Math.floor(exactY)}
  {@const manifest = activeMap.manifest}
  {@const gridX = Number(manifest.resolution?.pixels_per_grid) || 70}
  {@const gridY = Number(manifest.resolution?.pixels_per_grid_y) || gridX}
  {@const originX = Number(manifest.resolution?.map_origin?.[0]) || 0}
  {@const originY = Number(manifest.resolution?.map_origin?.[1]) || 0}

  {#if showGridHUD}
    <div
      class="cell-reticle"
      style="left: {(macroCol - originX) * gridX * scale +
        panX}px; top: {(macroRow - originY) * gridY * scale +
        panY}px; width: {gridX * scale}px; height: {gridY * scale}px;"
    >
      <span class="reticle-text">{exactX.toFixed(2)}, {exactY.toFixed(2)}</span>
    </div>
  {/if}

  <div class="coordinate-hud">
    {#if showGridHUD}
      <div class="coord-label">
        X <span class="coord-val">{exactX.toFixed(2)}</span>
      </div>
      <div class="coord-label">
        Y <span class="coord-val">{exactY.toFixed(2)}</span>
      </div>
      <div class="hud-divider"></div>
    {/if}
    <button
      class="hud-toggle-btn"
      onclick={() => (showGridHUD = !showGridHUD)}
      title="Toggle Grid Coordinates">{showGridHUD ? "👁️" : "🎯"}</button
    >
  </div>
{/if}

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
    cursor:
      url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48bGluZSB4MT0iMTYiIHkxPSIwIiB4Mj0iMTYiIHkyPSIzMiIgc3Ryb2tlPSJyZ2JhKDAsMCwwLDAuNikiIHN0cm9rZS13aWR0aD0iMyIvPjxsaW5lIHgxPSIwIiB5MT0iMTYiIHgyPSIzMiIgeTI9IjE2IiBzdHJva2U9InJnYmEoMCwwLDAsMC42KSIgc3Ryb2tlLXdpZHRoPSIzIi8+PGxpbmUgeDE9IjE2IiB5MT0iMCIgeDI9IjE2IiB5Mj0iMzIiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIxIi8+PGxpbmUgeDE9IjAiIHkxPSIxNiIgeDI9IjMyIiB5Mj0iMTYiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+")
        16 16,
      crosshair;
  }
  .cell-reticle {
    position: absolute;
    border: 2px solid rgba(56, 189, 248, 0.6);
    background: rgba(56, 189, 248, 0.1);
    pointer-events: none;
    z-index: 20;
    display: flex;
    box-sizing: border-box;
  }
  .reticle-text {
    background: rgba(15, 23, 42, 0.9);
    color: #38bdf8;
    font-size: 10px;
    font-weight: bold;
    padding: 2px 6px;
    border-bottom-right-radius: 4px;
    font-family: monospace;
  }
  .coordinate-hud {
    position: absolute;
    bottom: 24px;
    right: 24px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid #334155;
    padding: 8px;
    border-radius: 8px;
    display: flex;
    gap: 12px;
    align-items: center;
    z-index: 20;
  }
  .coord-label {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 600;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .coord-val {
    color: #38bdf8;
    font-size: 14px;
    font-family: monospace;
  }
  .hud-divider {
    width: 1px;
    height: 16px;
    background: #334155;
  }
  .hud-toggle-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 4px;
  }
  .hud-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
</style>
