import { QuadTree, pointsToBezier } from '$lib/utils/spatial.js';
import { saveToDB, loadFromDB } from '$lib/utils/database.js';
import { verifyAndCleanManifest } from '$lib/utils/schema.js';
import {
    downloadBlob,
    downloadJSON,
    saveProject,
    exportVTT,
    exportLegacyV1,
    exportCompoundVTT,
    exportSecureVTT,
    loadProjectFromFile,
    importImageAsMap
} from '$lib/utils/projectIO.js';

class MapStore {
    activeMapId = $state(null);
    catalog = $state([]);
    updateTrigger = $state(0);
    selectedItemIds = $state([]);
    clipboard = $state([]);
    lightingPreview = $state(false);
    activeTool = $state("select");
    draftingMode = $state("straight"); 
    audioBlobs = $state({}); 
    quadtree = $state(null);
    
    // --- CAD STATUS BAR METRICS ---
    mouseX = $state(0.00);
    mouseY = $state(0.00);
    zoomScale = $state(100);
    
    // --- GRID ALIGNMENT STATE ---
    gridAlignBoxes = $state([]);

    // --- VISION CONTROLLER STATE ---
    vision = $state({
        enabled: false,
        token: { x: 0, y: 0, radius: 5 },
        showFov: true
    });

    // --- GLOBAL ASSET LIBRARY ---
    globalAssets = $state({ images: [], audio: [] });

    _saveTimeout = null;

    // --- SCHEMA COMPLIANT DEFAULTS ---
    defaultSettings = $state({
        wall: { properties: { type: 'standard', bottom: 0.0, top: 10.0, visibility: 'visible' } },
        portal: { properties: { type: 'door', state: 'closed', bottom: 0.0, top: 10.0, visibility: 'visible' } },
        roof: { properties: { tint: '#475569', opacity: 100, hidden: false, bottom: 10.0, top: 20.0, visibility: 'visible' } },
        light: { type: 'point', position: { z: 0 }, properties: { color: '#ffffff', intensity: 1.0, decay_model: 'inverse_square', radius: { bright: 5.0, dim: 10.0 }, animation: { profile: 'none', speed: 0.5, intensity_variance: 0.2 }, rotation: 0, cone_angle: 60, visibility: 'visible' } },
        spawn: { name: 'New Spawn', shape: 'circle', is_default: false, heading_degrees: 0.0, properties: { visibility: 'visible' } },
        event: { name: 'New Event', eventType: 'State Toggle', activation: 'proximity', trigger_bounds: { radius: 0.5 }, targetSpawnId: "", autoCreateMatch: false, targetFloorId: "", target_entity_ids: [], target_action: "toggle_visibility", properties: { visibility: 'visible' } },
        audio: { track: "", volume: 100, radius: 5, inner_radius: 2.5, muffledByWalls: true, properties: { visibility: 'visible' } },
        emitter: { type: 'weather', style: 'rain', isGlobal: false, layering: 'above', tint: '#ffffff', scale: 100, direction: 180, speed: 50, intensity: 50, variance: 10, graphic: '', position: { z: 0 }, properties: { visibility: 'visible' } },
        prop: { scale: 100, rotation: 0, position: { z: 0 }, properties: { visibility: 'visible' } },
        asset: {} 
    });

    constructor() {
        loadFromDB('autosave').then(saved => {
            if (saved && saved.catalog && saved.catalog.length > 0) {
                this.catalog = saved.catalog.map(mapDef => ({
                    ...mapDef,
                    manifest: verifyAndCleanManifest(mapDef.manifest)
                }));
                this.activeMapId = saved.activeMapId || this.catalog[0].id;
                this.updateSpatialIndex();
                this.updateTrigger++;
            }
        });
    }

    get activeMap() { return this.catalog.find(m => m.id === this.activeMapId) || null; }
    get redrawTick() { return this.updateTrigger; }

    // --- GRID ALIGNMENT CONTROLLER ---
    setGridOrigin(imagePixelX, imagePixelY) {
        if (!this.activeMap) return;
        const res = this.activeMap.manifest.resolution;
        
        const gridX = Number(res.pixels_per_grid) || 70;
        const gridY = Number(res.pixels_per_grid_y) || gridX;

        const modX = ((imagePixelX % gridX) + gridX) % gridX;
        const modY = ((imagePixelY % gridY) + gridY) % gridY;

        res.map_offset_x = -modX;
        res.map_offset_y = -modY;
        
        this.pushHistory("Pinned Grid Origin");
        this.updateTrigger++;
    }

    stepGridOffset(stepsX, stepsY) {
        if (!this.activeMap) return;
        const res = this.activeMap.manifest.resolution;
        
        const gridX = Number(res.pixels_per_grid) || 70;
        const gridY = Number(res.pixels_per_grid_y) || gridX;
        
        res.map_offset_x = (Number(res.map_offset_x) || 0) + (stepsX * gridX);
        res.map_offset_y = (Number(res.map_offset_y) || 0) + (stepsY * gridY);
        
        this.pushHistory("Stepped Grid Offset");
        this.updateTrigger++;
    }

    calculateGridAlignment() {
        if (!this.activeMap || this.gridAlignBoxes.length === 0) return;
        const boxes = this.gridAlignBoxes;
        
        let sumW = 0, sumH = 0;
        let validCount = 0;

        boxes.forEach(b => {
            const w = Math.abs(b.ex - b.sx);
            const h = Math.abs(b.ey - b.sy);
            if (w > 10 && h > 10) {
                sumW += w;
                sumH += h;
                validCount++;
            }
        });

        if (validCount === 0) {
            this.gridAlignBoxes = [];
            return;
        }

        const newPpgX = Math.max(10, sumW / validCount);
        const newPpgY = Math.max(10, sumH / validCount);
        
        const anchorX = Math.min(boxes[0].sx, boxes[0].ex);
        const anchorY = Math.min(boxes[0].sy, boxes[0].ey);
        
        const res = this.activeMap.manifest.resolution;
        const oldPpgX = Number(res.pixels_per_grid) || 70;
        const oldPpgY = Number(res.pixels_per_grid_y) || oldPpgX;
        
        const pixelWidth = res.map_size[0] * oldPpgX;
        const pixelHeight = res.map_size[1] * oldPpgY;
        
        res.pixels_per_grid = newPpgX;
        res.pixels_per_grid_y = newPpgY; 
        
        res.map_size[0] = pixelWidth / newPpgX;
        res.map_size[1] = pixelHeight / newPpgY;
        
        const modX = ((anchorX % newPpgX) + newPpgX) % newPpgX;
        const modY = ((anchorY % newPpgY) + newPpgY) % newPpgY;
        
        res.map_offset_x = -modX;
        res.map_offset_y = -modY;

        this.gridAlignBoxes = [];
        this.setTool('select');
        this.pushHistory("Rubber Sheet Grid Alignment");
        this.updateTrigger++;
    }

    updateManualGrid(newPpgX, newPpgY, offX, offY) {
        if (!this.activeMap) return;
        const res = this.activeMap.manifest.resolution;
        
        const oldPpgX = Number(res.pixels_per_grid) || 70;
        const oldPpgY = Number(res.pixels_per_grid_y) || oldPpgX;
        
        const pixelWidth = res.map_size[0] * oldPpgX;
        const pixelHeight = res.map_size[1] * oldPpgY;

        if (newPpgX !== null && !isNaN(newPpgX) && newPpgX > 0) {
            res.pixels_per_grid = Number(newPpgX);
            res.map_size[0] = pixelWidth / res.pixels_per_grid;
            if (res.pixels_per_grid_y === undefined) {
                res.pixels_per_grid_y = res.pixels_per_grid;
                res.map_size[1] = pixelHeight / res.pixels_per_grid_y;
            }
        }
        
        if (newPpgY !== null && !isNaN(newPpgY) && newPpgY > 0) {
            res.pixels_per_grid_y = Number(newPpgY);
            res.map_size[1] = pixelHeight / res.pixels_per_grid_y;
        }

        if (offX !== null && !isNaN(offX)) res.map_offset_x = Number(offX);
        if (offY !== null && !isNaN(offY)) res.map_offset_y = Number(offY);

        this.pushHistory("Manual Grid Adjustment");
        this.updateTrigger++;
    }

    clearGridAlignment() {
        this.gridAlignBoxes = [];
        this.updateTrigger++;
    }

    // --- VISION CONTROLLER METHODS ---
    toggleVision() {
        this.vision.enabled = !this.vision.enabled;
        this.updateTrigger++;
    }

    updateVisionToken(x, y) {
        this.vision.token.x = x;
        this.vision.token.y = y;
        this.updateTrigger++;
    }

    updateSpatialIndex() {
        if (!this.activeMap) return;
        const m = this.activeMap.manifest;
        const size = 10000;
        this.quadtree = new QuadTree({ x: -size/2, y: -size/2, w: size, h: size });
        
        const indexEntity = (list, getPos) => list?.forEach(e => {
            const pos = getPos(e);
            if (pos) this.quadtree.insert({ pos, id: e.id });
        });
        
        indexEntity(m.entities?.lights, i => ({x: i.position.x, y: i.position.y}));
        indexEntity(m.entities?.landing_zones, i => ({x: i.coordinates[0], y: i.coordinates[1]}));
        indexEntity(m.entities?.events, i => ({x: i.trigger_bounds.center.x, y: i.trigger_bounds.center.y}));
        indexEntity(m.entities?.audio?.zones, i => ({x: i.center.x, y: i.center.y}));
        indexEntity(m.entities?.emitters, i => ({x: i.position.x, y: i.position.y}));
        indexEntity(m.entities?.props, i => ({x: i.position.x, y: i.position.y}));
    }

    // --- IO & PERSISTENCE DELEGATES ---
    triggerAutoSave() {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(async () => {
            const dataToSave = JSON.parse(JSON.stringify({
                catalog: this.catalog,
                activeMapId: this.activeMapId
            }));
            await saveToDB('autosave', dataToSave);
        }, 2000);
    }

    downloadBlob(filename, blob) { downloadBlob(filename, blob); }
    downloadJSON(filename, data) { downloadJSON(filename, data); }
    saveProject() { saveProject(this); }
    closeProject() {
        this.catalog = [];
        this.activeMapId = null;
        this.selectedItemIds = [];
        this.clipboard = [];
        this.updateTrigger++;
        this.triggerAutoSave();
    }
    exportVTT() { exportVTT(this); }
    exportLegacyV1() { exportLegacyV1(this); }
    exportCompoundVTT(isLegacy = false) { exportCompoundVTT(this, isLegacy); }
    async exportSecureVTT(isCompound = false) { await exportSecureVTT(this, isCompound); }
    async loadProjectFromFile(file) { await loadProjectFromFile(this, file); }
    async importImageAsMap(file) { await importImageAsMap(this, file); }

    // --- LEVEL MANAGEMENT ---
    setCatalog(newCatalog) {
        this.catalog = newCatalog;
        if (this.catalog.length > 0 && !this.activeMapId) {
            this.activeMapId = this.catalog[0].id;
        }
        this.initHistory();
        this.updateSpatialIndex();
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    appendLevel(mapData) {
        this.catalog = [...this.catalog, mapData];
        this.switchMap(mapData.id);
        this.updateSpatialIndex();
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    switchMap(id) {
        this.activeMapId = id;
        this.selectedItemIds = [];
        this.initHistory();
        this.updateSpatialIndex();
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    addMapLevel() {
        const newId = crypto.randomUUID();
        const newMap = {
            id: newId,
            filename: `Level ${this.catalog.length + 1}`,
            manifest: {
                resolution: { 
                    map_origin: [0, 0],
                    map_size: [50, 50],
                    pixels_per_grid: 70, 
                    grid_line_width: 1.5, 
                    subgrid_line_width: 1.0 
                },
                geometry: { walls: [], portals: [], overhead: [] },
                entities: { lights: [], landing_zones: [], events: [], emitters: [], audio: { zones: [] }, props: [] }
            },
            imageUrl: "",
            history: [],
            historyIndex: -1
        };
        this.catalog = [...this.catalog, newMap];
        this.switchMap(newId);
        this.updateSpatialIndex();
    }

    deleteMapLevel(id) {
        if (this.catalog.length <= 1) {
            alert("You cannot delete the only level in the project.");
            return;
        }
        this.catalog = this.catalog.filter(m => m.id !== id);

        this.catalog.forEach(mapDef => {
            if (mapDef.manifest?.entities?.events) {
                mapDef.manifest.entities.events.forEach(ev => {
                    if (ev.targetFloorId === id) {
                        ev.targetFloorId = "";
                        ev.targetSpawnId = ""; 
                    }
                });
            }
        });

        if (this.activeMapId === id) {
            this.switchMap(this.catalog[0].id);
        } else {
            this.updateSpatialIndex();
            this.updateTrigger++;
            this.triggerAutoSave();
        }
    }

    renameMapLevel(id, newName) {
        const mapRef = this.catalog.find(m => m.id === id);
        if (mapRef) {
            mapRef.filename = newName;
            this.updateTrigger++;
            this.triggerAutoSave();
        }
    }

    // --- TOOL & SELECTION ---
    toggleLightingPreview() {
        this.lightingPreview = !this.lightingPreview;
        this.updateTrigger++;
    }

    setTool(tool) {
        this.activeTool = tool;
        this.selectedItemIds = [];
        if (tool !== 'grid_align') {
            this.gridAlignBoxes = [];
        }
        this.updateTrigger++;
    }

    clearSelection() {
        this.selectedItemIds = [];
        this.updateTrigger++;
    }

    selectItem(id, multi = false) {
        if (multi) {
            if (!this.selectedItemIds.includes(id)) {
                this.selectedItemIds = [...this.selectedItemIds, id];
            }
        } else {
            this.selectedItemIds = [id];
        }
        this.updateTrigger++;
    }

    selectItems(ids, multi = false) {
        if (multi) {
            const newIds = ids.filter(id => !this.selectedItemIds.includes(id));
            if (newIds.length > 0) {
                this.selectedItemIds = [...this.selectedItemIds, ...newIds];
                this.updateTrigger++;
            }
        } else {
            this.selectedItemIds = [...ids];
            this.updateTrigger++;
        }
    }

    // --- HISTORY ENGINE ---
    initHistory() {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        if (!activeMap.history) {
            activeMap.history = [{
                actionName: "Initial Load",
                timestamp: Date.now(),
                snapshot: JSON.parse(JSON.stringify(activeMap.manifest))
            }];
            activeMap.historyIndex = 0;
        }
    }

    pushHistory(actionName) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        this.initHistory();

        const now = Date.now();
        const lastAction = activeMap.history[activeMap.historyIndex];

        const isRapidUpdate = lastAction && lastAction.actionName === actionName && (now - lastAction.timestamp < 1000);

        if (!isRapidUpdate) {
            activeMap.history = activeMap.history.slice(0, activeMap.historyIndex + 1);
        }

        const snapshot = JSON.parse(JSON.stringify(activeMap.manifest));

        if (isRapidUpdate) {
            activeMap.history[activeMap.historyIndex].snapshot = snapshot;
            activeMap.history[activeMap.historyIndex].timestamp = now;
        } else {
            activeMap.history.push({ actionName, timestamp: now, snapshot });
            activeMap.historyIndex++;
            if (activeMap.history.length > 50) { 
                activeMap.history.shift();
                activeMap.historyIndex--;
            }
        }
        this.updateSpatialIndex();
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    undo() {
        const activeMap = this.activeMap;
        if (!activeMap || !activeMap.history || activeMap.historyIndex <= 0) return;
        activeMap.historyIndex--;
        const state = activeMap.history[activeMap.historyIndex];
        activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
        this.selectedItemIds = [];
        this.updateSpatialIndex();
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    redo() {
        const activeMap = this.activeMap;
        if (!activeMap || !activeMap.history || activeMap.historyIndex >= activeMap.history.length - 1) return;
        activeMap.historyIndex++;
        const state = activeMap.history[activeMap.historyIndex];
        activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
        this.selectedItemIds = [];
        this.updateSpatialIndex();
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    jumpToHistory(index) {
        const activeMap = this.activeMap;
        if (!activeMap || !activeMap.history || index < 0 || index >= activeMap.history.length) return;
        activeMap.historyIndex = index;
        const state = activeMap.history[index];
        activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
        this.selectedItemIds = [];
        this.updateSpatialIndex();
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    clearHistory() {
        const activeMap = this.activeMap;
        if (!activeMap) return;

        const currentState = JSON.parse(JSON.stringify(activeMap.manifest));
        
        activeMap.history = [{
            actionName: "History Cleared",
            timestamp: Date.now(),
            snapshot: currentState
        }];
        activeMap.historyIndex = 0;

        this.updateTrigger++;
        this.triggerAutoSave();
    }

    // --- NODE MUTATIONS ---
    deleteVectorNode(exactX, exactY, thresholdSq) {
        const activeMap = this.activeMap;
        if (!activeMap) return false;
        let nodeDeleted = false;

        ['walls', 'portals', 'overhead'].forEach(cat => {
            if (!activeMap.manifest.geometry[cat]) return;
            const newItems = [...activeMap.manifest.geometry[cat]]; 
            
            for (let itemIdx = newItems.length - 1; itemIdx >= 0; itemIdx--) {
                const item = { ...newItems[itemIdx] }; 
                if (!item.path) continue;
                for (let i = 0; i < item.path.length; i++) {
                    const px = Number(item.path[i].x);
                    const py = Number(item.path[i].y);
                    const distSq = (exactX - px) ** 2 + (exactY - py) ** 2;

                    if (distSq < thresholdSq) {
                        item.path = [...item.path];
                        item.path.splice(i, 1);
                        
                        if (item.path.length < 2) {
                            newItems.splice(itemIdx, 1);
                            this.selectedItemIds = this.selectedItemIds.filter(id => id !== item.id);
                            
                            this.catalog.forEach(mapDef => {
                                mapDef.manifest?.entities?.events?.forEach(ev => {
                                    if (ev.target_entity_ids) {
                                        ev.target_entity_ids = ev.target_entity_ids.filter(tid => tid !== item.id);
                                    }
                                });
                            });
                        } else {
                            newItems[itemIdx] = item;
                        }
                        
                        nodeDeleted = true;
                        activeMap.manifest.geometry[cat] = newItems; 
                        this.pushHistory("Delete Vector Node");
                        this.updateSpatialIndex();
                        this.updateTrigger++;
                        return; 
                    }
                }
            }
        });
        return nodeDeleted;
    }

    splitVectorNode(exactX, exactY, thresholdSq) {
        const activeMap = this.activeMap;
        if (!activeMap) return false;
        let splitOccurred = false;

        ['walls', 'portals', 'overhead'].forEach(cat => {
            if (!activeMap.manifest.geometry[cat]) return;
            const newItems = [...activeMap.manifest.geometry[cat]]; 
            
            for (let itemIdx = 0; itemIdx < newItems.length; itemIdx++) {
                if (splitOccurred) continue;
                const item = { ...newItems[itemIdx] };
                if (!item.path || item.path.length < 2) continue;
                
                for (let i = 0; i < item.path.length - 1; i++) {
                    const x1 = Number(item.path[i].x);
                    const y1 = Number(item.path[i].y);
                    const x2 = Number(item.path[i + 1].x);
                    const y2 = Number(item.path[i + 1].y);
                    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
                    if (l2 === 0) continue;

                    let t = Math.max(0, Math.min(1, ((exactX - x1) * (x2 - x1) + (exactY - y1) * (y2 - y1)) / l2));
                    const projX = x1 + t * (x2 - x1);
                    const projY = y1 + t * (y2 - y1);
                    const distSq = (exactX - projX) ** 2 + (exactY - projY) ** 2;

                    if (distSq < thresholdSq) {
                        const splitPoint = { x: exactX, y: exactY };
                        const path1 = [...item.path.slice(0, i + 1), splitPoint];
                        const path2 = [splitPoint, ...item.path.slice(i + 1)];

                        item.path = path1;
                        newItems[itemIdx] = item;

                        const newItem = {
                            id: crypto.randomUUID(),
                            path: path2,
                            properties: JSON.parse(JSON.stringify(item.properties)) 
                        };
                        if (item.isBezier !== undefined) newItem.isBezier = item.isBezier;

                        newItems.splice(itemIdx + 1, 0, newItem);
                        
                        splitOccurred = true;
                        activeMap.manifest.geometry[cat] = newItems;
                        this.pushHistory("Cut Vector Segment");
                        this.updateSpatialIndex();
                        this.updateTrigger++;
                        return; 
                    }
                }
            }
        });
        return splitOccurred;
    }

    updateSingleNodePosition(id, nodeIndex, exactX, exactY) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const m = activeMap.manifest;
        
        ['walls', 'portals', 'overhead'].forEach(cat => {
            if (!m.geometry[cat]) return;
            const itemIndex = m.geometry[cat].findIndex(i => i.id === id);
            if (itemIndex > -1) {
                const newItems = [...m.geometry[cat]];
                const item = { ...newItems[itemIndex] };
                if (item.path && item.path[nodeIndex]) {
                    item.path = [...item.path];
                    item.path[nodeIndex].x = exactX;
                    item.path[nodeIndex].y = exactY;
                    newItems[itemIndex] = item;
                    m.geometry[cat] = newItems; 
                }
            }
        });

        this.activeMap.manifest = { ...m };
        this.pushHistory("Moved Vector Node");
        this.updateSpatialIndex();
        this.updateTrigger++;
    }

    // --- ENTITY CREATION & DEFAULTS ---
    updateDefaultSetting(category, keyPath, value) {
        let obj = this.defaultSettings[category];
        const keys = keyPath.split('.');
        for (let i = 0; i < keys.length - 1; i++) {
            if (obj[keys[i]] === undefined) obj[keys[i]] = {};
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        this.defaultSettings = { ...this.defaultSettings };
        this.updateTrigger++; 
    }

    addGeometry(type, path, isBezier = false) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const id = crypto.randomUUID();
        if (type === 'wall') {
            if (!activeMap.manifest.geometry.walls) activeMap.manifest.geometry.walls = [];
            activeMap.manifest.geometry.walls.push({ id, path, isBezier, properties: JSON.parse(JSON.stringify(this.defaultSettings.wall.properties)) });
        } else if (type === 'portal') {
            if (!activeMap.manifest.geometry.portals) activeMap.manifest.geometry.portals = [];
            activeMap.manifest.geometry.portals.push({ id, path, isBezier, properties: JSON.parse(JSON.stringify(this.defaultSettings.portal.properties)) });
        } else if (type === 'roof') {
            if (!activeMap.manifest.geometry.overhead) activeMap.manifest.geometry.overhead = [];
            activeMap.manifest.geometry.overhead.push({ id, path, properties: JSON.parse(JSON.stringify(this.defaultSettings.roof.properties)) });
        }
        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory(`Added ${type}`);
        this.updateSpatialIndex();
    }

    addLight(x, y) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const ds = this.defaultSettings.light;
        const light = {
            id: crypto.randomUUID(), 
            type: ds.type, 
            position: {x, y, z: ds.position.z},
            properties: JSON.parse(JSON.stringify(ds.properties))
        };
        if (!activeMap.manifest.entities.lights) activeMap.manifest.entities.lights = [];
        activeMap.manifest.entities.lights.push(light);
        
        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory("Added Light");
        this.updateSpatialIndex();
    }

    addSpawn(x, y) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const ds = this.defaultSettings.spawn;
        const spawn = { 
            id: crypto.randomUUID(), 
            coordinates: [x, y], 
            name: ds.name, 
            shape: ds.shape, 
            is_default: ds.is_default,
            heading_degrees: ds.heading_degrees,
            properties: JSON.parse(JSON.stringify(ds.properties))
        };
        
        if (ds.is_default) {
            if (activeMap.manifest.entities.landing_zones) {
                activeMap.manifest.entities.landing_zones.forEach(lz => lz.is_default = false);
                activeMap.manifest.entities.landing_zones = [...activeMap.manifest.entities.landing_zones];
            }
            this.updateDefaultSetting('spawn', 'is_default', false);
        }

        if (!activeMap.manifest.entities.landing_zones) activeMap.manifest.entities.landing_zones = [];
        activeMap.manifest.entities.landing_zones.push(spawn);
        
        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory("Added Spawn");
        this.updateSpatialIndex();
    }

    addEvent(x, y) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const ds = this.defaultSettings.event;
        const eventId = crypto.randomUUID();

        let newEvent = {
            id: eventId, 
            name: ds.name, 
            eventType: ds.eventType, 
            activation: ds.activation,
            targetSpawnId: ds.targetSpawnId,
            target_entity_ids: [...ds.target_entity_ids],
            target_action: ds.target_action,
            trigger_bounds: { center: {x, y}, width: ds.trigger_bounds.width || 1, height: ds.trigger_bounds.height || 1 },
            properties: JSON.parse(JSON.stringify(ds.properties))
        };

        const isTeleportOrStairs = ds.eventType === 'Teleport' || ds.eventType === 'Stairs/Ladder';

        if (isTeleportOrStairs && ds.autoCreateMatch) {
            const targetMapId = ds.targetFloorId || activeMap.id;
            const targetMap = this.catalog.find(m => m.id === targetMapId);

            if (targetMap) {
                const targetEventId = crypto.randomUUID();
                const localSpawnId = crypto.randomUUID();
                const targetSpawnId = crypto.randomUUID();
                
                const offset = 1; 

                newEvent.targetSpawnId = targetSpawnId;

                if (!activeMap.manifest.entities.landing_zones) activeMap.manifest.entities.landing_zones = [];
                activeMap.manifest.entities.landing_zones.push({
                    id: localSpawnId, 
                    coordinates: [x + offset, y], 
                    name: `Return from ${targetMap.filename || 'Target'}`, 
                    shape: 'circle', 
                    is_default: false,
                    heading_degrees: 0.0,
                    properties: JSON.parse(JSON.stringify(ds.properties))
                });

                if (!targetMap.manifest.entities.events) targetMap.manifest.entities.events = [];
                if (!targetMap.manifest.entities.landing_zones) targetMap.manifest.entities.landing_zones = [];

                targetMap.manifest.entities.events.push({
                    id: targetEventId, 
                    name: `Return to ${activeMap.filename || 'Origin'}`, 
                    eventType: ds.eventType, 
                    activation: ds.activation,
                    targetSpawnId: localSpawnId, 
                    target_entity_ids: [],
                    target_action: "toggle_visibility",
                    trigger_bounds: { center: {x, y}, width: ds.trigger_bounds.width || 1, height: ds.trigger_bounds.height || 1 },
                    properties: JSON.parse(JSON.stringify(ds.properties))
                });

                targetMap.manifest.entities.landing_zones.push({
                    id: targetSpawnId, 
                    coordinates: [x + offset, y], 
                    name: `Arrival from ${activeMap.filename || 'Origin'}`, 
                    shape: 'circle', 
                    is_default: false,
                    heading_degrees: 0.0,
                    properties: JSON.parse(JSON.stringify(ds.properties))
                });
            }
        }

        if (!activeMap.manifest.entities.events) activeMap.manifest.entities.events = [];
        activeMap.manifest.entities.events.push(newEvent);

        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory(ds.autoCreateMatch ? "Generated Reciprocal Links" : "Added Event");
        this.updateSpatialIndex();

        if (ds.autoCreateMatch) {
            this.updateDefaultSetting('event', 'autoCreateMatch', false);
            this.updateDefaultSetting('event', 'targetFloorId', "");
        }
    }

    addAudio(x, y) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const ds = this.defaultSettings.audio;
        const audio = { 
            id: crypto.randomUUID(), center: {x, y}, radius: ds.radius, inner_radius: ds.inner_radius,
            volume: ds.volume, muffledByWalls: ds.muffledByWalls, track: ds.track, properties: JSON.parse(JSON.stringify(ds.properties))
        };
        if (!activeMap.manifest.entities.audio) activeMap.manifest.entities.audio = { zones: [] };
        if (!activeMap.manifest.entities.audio.zones) activeMap.manifest.entities.audio.zones = [];
        activeMap.manifest.entities.audio.zones.push(audio);
        
        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory("Added Audio Zone");
        this.updateSpatialIndex();
    }

    addEmitter(x, y) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const ds = this.defaultSettings.emitter;
        const emitter = { 
            id: crypto.randomUUID(), 
            position: {x, y, z: ds.position.z}, 
            type: ds.type, style: ds.style,
            isGlobal: ds.isGlobal, layering: ds.layering, tint: ds.tint, scale: ds.scale,
            direction: ds.direction, speed: ds.speed, intensity: ds.intensity, variance: ds.variance, graphic: ds.graphic,
            properties: JSON.parse(JSON.stringify(ds.properties))
        };
        if (!activeMap.manifest.entities.emitters) activeMap.manifest.entities.emitters = [];
        activeMap.manifest.entities.emitters.push(emitter);
        
        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory("Added Emitter");
        this.updateSpatialIndex();
    }

    // --- UNIVERSAL MUTATOR ---
    updateItemProperty(id, keyPath, value) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const m = activeMap.manifest;
        
        if (keyPath === "is_default" && value === true) {
            m.entities.landing_zones?.forEach(lz => {
                if (lz.id !== id) lz.is_default = false;
            });
            m.entities.landing_zones = [...m.entities.landing_zones]; 
        }

        if (id === this.activeMapId) {
             let obj = m;
             const keys = keyPath.split('.');
             for (let i = 0; i < keys.length - 1; i++) {
                 if (!obj[keys[i]]) obj[keys[i]] = {};
                 obj = obj[keys[i]];
             }
             obj[keys[keys.length - 1]] = value;
             activeMap.manifest = { ...m }; 
             this.pushHistory("Modified Map Settings");
             this.updateTrigger++;
             return;
        }

        let foundItem = null;
        let targetGroup = null;
        let targetCat = null;
        
        for (const cat of ['walls', 'portals', 'overhead']) {
            if (m.geometry[cat]) {
                foundItem = m.geometry[cat].find(i => i.id === id);
                if (foundItem) { targetGroup = 'geometry'; targetCat = cat; break; }
            }
        }
        if (!foundItem) {
            for (const cat of ['lights', 'landing_zones', 'events', 'emitters', 'props']) {
                if (m.entities[cat]) {
                    foundItem = m.entities[cat].find(i => i.id === id);
                    if (foundItem) { targetGroup = 'entities'; targetCat = cat; break; }
                }
            }
        }
        if (!foundItem && m.entities.audio?.zones) {
            foundItem = m.entities.audio.zones.find(i => i.id === id);
            if (foundItem) { targetGroup = 'audio'; targetCat = 'zones'; }
        }

        if (foundItem) {
            const clonedItem = JSON.parse(JSON.stringify(foundItem));

            const keys = keyPath.split('.');
            let obj = clonedItem;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!obj[keys[i]]) obj[keys[i]] = {};
                obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = value;
            
            if (targetGroup === 'geometry') {
                const idx = m.geometry[targetCat].findIndex(i => i.id === id);
                m.geometry[targetCat] = [...m.geometry[targetCat].slice(0, idx), clonedItem, ...m.geometry[targetCat].slice(idx + 1)];
            } else if (targetGroup === 'entities') {
                const idx = m.entities[targetCat].findIndex(i => i.id === id);
                m.entities[targetCat] = [...m.entities[targetCat].slice(0, idx), clonedItem, ...m.entities[targetCat].slice(idx + 1)];
            } else if (targetGroup === 'audio') {
                const idx = m.entities.audio.zones.findIndex(i => i.id === id);
                m.entities.audio.zones = [...m.entities.audio.zones.slice(0, idx), clonedItem, ...m.entities.audio.zones.slice(idx + 1)];
            }

            this.activeMap.manifest = { ...m };

            this.pushHistory("Modified Property");
            this.updateSpatialIndex();
            this.updateTrigger++; 
        }
    }

    updateNodePosition(id, exactX, exactY, dx, dy) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const m = activeMap.manifest;
        
        ['walls', 'portals', 'overhead'].forEach(cat => {
            const itemIndex = m.geometry[cat]?.findIndex(i => i.id === id);
            if (itemIndex > -1) {
                const newItems = [...m.geometry[cat]];
                const item = { ...newItems[itemIndex] };
                if (item.path) {
                    item.path = item.path.map(pt => ({ x: Number(pt.x) + dx, y: Number(pt.y) + dy }));
                    newItems[itemIndex] = item;
                    m.geometry[cat] = newItems; 
                }
            }
        });

        ['lights', 'landing_zones', 'events', 'emitters', 'props'].forEach(cat => {
            const item = m.entities[cat]?.find(i => i.id === id);
            if (item) {
                if (item.position) { item.position.x = exactX; item.position.y = exactY; }
                if (item.coordinates) { item.coordinates[0] = exactX; item.coordinates[1] = exactY; }
                if (item.trigger_bounds?.center) { item.trigger_bounds.center.x = exactX; item.trigger_bounds.center.y = exactY; }
                m.entities[cat] = [...m.entities[cat]]; 
            }
        });

        const aud = m.entities.audio?.zones?.find(i => i.id === id);
        if (aud && aud.center) { 
            aud.center.x = exactX; aud.center.y = exactY; 
            m.entities.audio.zones = [...m.entities.audio.zones]; 
        }

        this.activeMap.manifest = { ...m };
        this.pushHistory("Moved Item");
        this.updateSpatialIndex();
    }

    translateSelection(dx, dy) {
        const activeMap = this.activeMap;
        if (!activeMap || this.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;
        
        this.selectedItemIds.forEach(id => {
            ['walls', 'portals', 'overhead'].forEach(cat => {
                const itemIndex = m.geometry[cat]?.findIndex(i => i.id === id);
                if (itemIndex > -1) {
                    const newItems = [...m.geometry[cat]];
                    const item = { ...newItems[itemIndex] };
                    if (item.path) {
                        item.path = item.path.map(pt => ({ x: Number(pt.x) + dx, y: Number(pt.y) + dy }));
                        newItems[itemIndex] = item;
                        m.geometry[cat] = newItems;
                    }
                }
            });
            ['lights', 'landing_zones', 'events', 'emitters', 'props'].forEach(cat => {
                const item = m.entities[cat]?.find(i => i.id === id);
                if (item) {
                    if (item.position) { item.position.x += dx; item.position.y += dy; }
                    if (item.coordinates) { item.coordinates[0] += dx; item.coordinates[1] += dy; }
                    if (item.trigger_bounds?.center) { item.trigger_bounds.center.x += dx; item.trigger_bounds.center.y += dx; }
                    m.entities[cat] = [...m.entities[cat]]; 
                }
            });
            const aud = m.entities.audio?.zones?.find(i => i.id === id);
            if (aud && aud.center) { 
                aud.center.x += dx; aud.center.y += dy; 
                m.entities.audio.zones = [...m.entities.audio.zones];
            }
        });
        
        this.activeMap.manifest = { ...m };
        this.pushHistory("Translated Selection");
        this.updateSpatialIndex();
    }

    deleteSelected() {
        const activeMap = this.activeMap;
        if (!activeMap || this.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;
        const deletedIds = new Set(this.selectedItemIds);

        const removeById = (arr) => {
            if (!Array.isArray(arr)) return arr;
            let changed = false;
            for (let i = arr.length - 1; i >= 0; i--) {
                if (this.selectedItemIds.includes(arr[i].id)) {
                    arr.splice(i, 1);
                    changed = true;
                }
            }
            return changed ? [...arr] : arr; 
        };

        if (m.geometry) {
            m.geometry.walls = removeById(m.geometry.walls);
            m.geometry.portals = removeById(m.geometry.portals);
            m.geometry.overhead = removeById(m.geometry.overhead);
        }
        if (m.entities) {
            m.entities.lights = removeById(m.entities.lights);
            m.entities.landing_zones = removeById(m.entities.landing_zones);
            m.entities.events = removeById(m.entities.events);
            m.entities.emitters = removeById(m.entities.emitters);
            m.entities.props = removeById(m.entities.props);
            if (m.entities.audio) m.entities.audio.zones = removeById(m.entities.audio.zones);
        }

        this.catalog.forEach(mapDef => {
            if (mapDef.manifest?.entities?.events) {
                mapDef.manifest.entities.events.forEach(ev => {
                    if (ev.target_entity_ids && Array.isArray(ev.target_entity_ids)) {
                        ev.target_entity_ids = ev.target_entity_ids.filter(tid => !deletedIds.has(tid));
                    }
                    if (deletedIds.has(ev.targetSpawnId)) ev.targetSpawnId = "";
                });
            }
        });

        this.activeMap.manifest = { ...m };
        this.selectedItemIds = [];
        this.pushHistory("Deleted Selection");
        this.updateSpatialIndex();
        this.updateTrigger++;
    }

    convertCategory(id, targetCategory, portalType = 'door') {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const m = activeMap.manifest;
        let foundItem = null;
        ['walls', 'portals'].forEach(cat => {
            const itemIndex = m.geometry[cat]?.findIndex(i => i.id === id);
            if (itemIndex > -1) {
                foundItem = m.geometry[cat].splice(itemIndex, 1)[0];
                m.geometry[cat] = [...m.geometry[cat]]; 
            }
        });
        if (foundItem) {
            if (targetCategory === 'portals') {
                if (!foundItem.properties) foundItem.properties = {};
                foundItem.properties.type = portalType;
                foundItem.properties.state = 'closed';
            } else {
                if (foundItem.properties) { delete foundItem.properties.type; delete foundItem.properties.state; }
            }
            if (!m.geometry[targetCategory]) m.geometry[targetCategory] = [];
            m.geometry[targetCategory].push(foundItem);
            m.geometry[targetCategory] = [...m.geometry[targetCategory]]; 
            
            this.activeMap.manifest = { ...m };
            this.pushHistory("Converted Entity");
            this.updateSpatialIndex();
        }
    }

    smoothSelectedWalls() {
        const activeMap = this.activeMap;
        if (!activeMap || this.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;
        this.selectedItemIds.forEach(id => {
            const wallIndex = m.geometry.walls?.findIndex(i => i.id === id);
            if (wallIndex > -1) {
                const newWalls = [...m.geometry.walls];
                const wall = { ...newWalls[wallIndex] };
                if (wall.path && wall.path.length > 2) {
                    wall.path = pointsToBezier(wall.path);
                    wall.isBezier = true; 
                    newWalls[wallIndex] = wall;
                    m.geometry.walls = newWalls; 
                }
            }
        });
        this.activeMap.manifest = { ...m };
        this.pushHistory("Smoothed Spline");
        this.updateTrigger++;
    }

    copySelected() {
        const activeMap = this.activeMap;
        if (!activeMap || this.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;
        this.clipboard = [];
        this.selectedItemIds.forEach(id => {
            ['walls', 'portals', 'overhead'].forEach(cat => {
                const item = m.geometry[cat]?.find(i => i.id === id);
                if (item) this.clipboard.push({ category: cat, data: JSON.parse(JSON.stringify(item)), group: 'geometry' });
            });
            ['lights', 'landing_zones', 'events', 'emitters', 'props'].forEach(cat => {
                const item = m.entities[cat]?.find(i => i.id === id);
                if (item) this.clipboard.push({ category: cat, data: JSON.parse(JSON.stringify(item)), group: 'entities' });
            });
            const aud = m.entities.audio?.zones?.find(i => i.id === id);
            if (aud) this.clipboard.push({ category: 'zones', data: JSON.parse(JSON.stringify(aud)), group: 'audio' });
        });
    }

    pasteClipboard(x, y) {
        const activeMap = this.activeMap;
        if (!activeMap || this.clipboard.length === 0) return;
        const m = activeMap.manifest;
        const newSelection = [];
        const offset = 0.5;

        this.clipboard.forEach(clip => {
            const clone = JSON.parse(JSON.stringify(clip.data));
            clone.id = crypto.randomUUID();
            if (clip.group === 'geometry') {
                clone.path.forEach(pt => { pt.x = Number(pt.x) + offset; pt.y = Number(pt.y) + offset; });
                if(!m.geometry[clip.category]) m.geometry[clip.category] = [];
                m.geometry[clip.category].push(clone);
                m.geometry[clip.category] = [...m.geometry[clip.category]]; 
            } else if (clip.group === 'entities') {
                if (clone.position) { clone.position.x += offset; clone.position.y += offset; }
                if (clone.coordinates) { clone.coordinates[0] += offset; clone.coordinates[1] += offset; clone.is_default = false; }
                if (clone.trigger_bounds?.center) { clone.trigger_bounds.center.x += offset; clone.trigger_bounds.center.y += offset; }
                if(!m.entities[clip.category]) m.entities[clip.category] = [];
                m.entities[clip.category].push(clone);
                m.entities[clip.category] = [...m.entities[clip.category]]; 
            } else if (clip.group === 'audio') {
                if (clone.center) { clone.center.x += offset; clone.center.y += offset; }
                if(!m.entities.audio) m.entities.audio = { zones: [] };
                if(!m.entities.audio.zones) m.entities.audio.zones = [];
                m.entities.audio.zones.push(clone);
                m.entities.audio.zones = [...m.entities.audio.zones]; 
            }
            newSelection.push(clone.id);
        });
        
        this.activeMap.manifest = { ...m };
        this.selectedItemIds = newSelection;
        this.pushHistory("Pasted Items");
        this.updateSpatialIndex();
    }

    // --- GLOBAL ASSET LIBRARY BRIDGE ---
    async mountAssetLibrary() {
        if (window.go && window.go.main && window.go.main.App && window.go.main.App.SelectAssetDirectory) {
            try {
                const assets = await window.go.main.App.SelectAssetDirectory();
                if (assets && assets.length > 0) {
                    const images = assets.filter(a => a.type === 'image');
                    const audio = assets.filter(a => a.type === 'audio');
                    this.globalAssets = { images, audio };

                    const audioPromises = audio.map(async (a) => {
                        try {
                            const res = await fetch(a.data);
                            const blob = await res.blob();
                            this.audioBlobs[a.name] = blob;
                        } catch (e) {
                            console.error(`Failed to fetch local audio: ${a.name}`);
                        }
                    });
                    
                    await Promise.all(audioPromises);
                    this.updateTrigger++;
                }
            } catch (err) {
                console.error("Failed to load asset directory:", err);
            }
        } else {
            alert("Asset Library requires the native Wails Desktop build running.");
        }
    }

    addProp(x, y, imageURL, name) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const ds = this.defaultSettings.prop;
        const prop = {
            id: crypto.randomUUID(),
            name: name,
            image: imageURL,
            position: { x, y, z: ds.position.z },
            rotation: ds.rotation,
            scale: ds.scale,
            properties: JSON.parse(JSON.stringify(ds.properties))
        };
        if (!activeMap.manifest.entities.props) activeMap.manifest.entities.props = [];
        activeMap.manifest.entities.props.push(prop);
        
        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory("Added Prop Asset");
        this.updateSpatialIndex();
        this.updateTrigger++;
    }
}

export const mapStore = new MapStore();