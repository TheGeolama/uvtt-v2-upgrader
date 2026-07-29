/**
 * @fileoverview Central Map Engine State Store (Svelte 5)
 * Radically refactored and modularized. Holds core state and delegates heavy operations.
 */

import { QuadTree } from '$lib/utils/spatial.js';
import { saveToDB, loadFromDB } from '$lib/utils/database.js';
import { verifyAndCleanManifest } from '$lib/utils/schema.js';
import { HistoryManager } from './historyManager.svelte.js';
import { GridEngine } from './gridEngine.svelte.js';
import { GeometryMutator } from './geometryMutator.svelte.js';
import { ValidatorStore } from './validatorStore.svelte.js';
import { AssetPackager } from './assetPackager.svelte.js';
import { GlobalAssetStore } from './globalAssetStore.svelte.js';
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
    // --- CORE SVELTE 5 REACTIVE STATE ---
    activeMapId = $state(null);
    catalog = $state([]);
    updateTrigger = $state(0);
    selectedItemIds = $state([]);
    clipboard = $state([]);
    lightingPreview = $state(false);
    isSimulationModeActive = $state(false); 
    activeTool = $state("select");
    draftingMode = $state("straight"); 
    audioBlobs = $state({}); 
    quadtree = $state(null); 
    
    // --- CAD STATUS BAR METRICS ---
    mouseX = $state(0.00);
    mouseY = $state(0.00);
    zoomScale = $state(100);
    cameraX = $state(0.00); 
    cameraY = $state(0.00); 
    
    // --- GRID ALIGNMENT STATE ---
    gridAlignBoxes = $state([]);

    // --- VISION CONTROLLER STATE ---
    vision = $state({
        enabled: false,
        token: { x: 0, y: 0, radius: 5 },
        showFov: true,
        mode: 'infinite'
    });

    // --- CONTEXT MENU STATE ---
    contextMenu = $state({ show: false, x: 0, y: 0 });

    _saveTimeout = null;

    // --- SCHEMA COMPLIANT DEFAULTS ---
    defaultSettings = $state({
        wall: { height: { bottom: 0.0, top: 10.0 }, properties: { type: 'standard', visibility: 'visible' } },
        portal: { height: { bottom: 0.0, top: 10.0 }, properties: { type: 'door', state: 'closed', visibility: 'visible' } },
        roof: { height: { bottom: 10.0, top: 20.0 }, properties: { tint: '#475569', opacity: 100, hidden: false, visibility: 'visible' } },
        light: { type: 'point', position: { z: 0 }, properties: { color: '#ffffff', intensity: 1.0, decay_model: 'inverse_square', radius: { bright: 5.0, dim: 10.0 }, animation: { profile: 'none', speed: 0.5, intensity_variance: 0.2 }, rotation: 0, cone_angle: 60, visibility: 'visible' } },
        spawn: { name: 'New Spawn', shape: 'circle', is_default: false, heading_degrees: 0.0, properties: { visibility: 'visible' } },
        event: { name: 'New Event', eventType: 'State Toggle', activation: 'proximity', trigger_bounds: { radius: 0.5 }, targetSpawnId: "", autoCreateMatch: false, targetFloorId: "", target_entity_ids: [], target_action: "toggle_visibility", properties: { visibility: 'visible' } },
        audio: { track: "", volume: 100, radius: 5, inner_radius: 2.5, muffledByWalls: true, properties: { visibility: 'visible' } },
        emitter: { type: 'weather', style: 'rain', height: { bottom: 0.0, top: 40.0 }, isGlobal: false, layering: 'above', tint: '#ffffff', scale: 100, direction: 180, speed: 50, intensity: 50, variance: 10, graphic: '', position: { z: 0 }, properties: { visibility: 'visible' } },
        prop: { scale: 100, rotation: 0, position: { z: 0 }, properties: { visibility: 'visible', z_index: 0, locked: false } },
        asset: {} 
    });

    constructor() {
        this.historyManager = new HistoryManager(this);
        this.gridEngine = new GridEngine(this);
        this.geometryMutator = new GeometryMutator(this);
        this.validatorStore = new ValidatorStore(this);
        this.assetPackager = new AssetPackager(this);
        this.globalAssetStore = new GlobalAssetStore(this);

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

        this.globalAssetStore.initGlobalAssets();
    }

    get activeMap() { return this.catalog.find(m => m.id === this.activeMapId) || null; }
    get redrawTick() { return this.updateTrigger; }

    // ========================================================================
    // DELEGATED ALIASES (Ensures UI components don't break during refactor)
    // ========================================================================
    initHistory() { this.historyManager.initHistory(); }
    pushHistory(actionName) { this.historyManager.pushHistory(actionName); }
    undo() { this.historyManager.undo(); }
    redo() { this.historyManager.redo(); }
    jumpToHistory(index) { this.historyManager.jumpToHistory(index); }
    clearHistory() { this.historyManager.clearHistory(); }

    setGridOrigin(x, y) { this.gridEngine.setGridOrigin(x, y); }
    stepGridOffset(x, y) { this.gridEngine.stepGridOffset(x, y); }
    calculateGridAlignment(s) { this.gridEngine.calculateGridAlignment(s); }
    updateManualGrid(nx, ny, ox, oy) { this.gridEngine.updateManualGrid(nx, ny, ox, oy); }
    clearGridAlignment() { this.gridEngine.clearGridAlignment(); }

    deleteVectorNode(x, y, t) { return this.geometryMutator.deleteVectorNode(x, y, t); }
    splitVectorNode(x, y, t) { return this.geometryMutator.splitVectorNode(x, y, t); }
    updateSingleNodePosition(id, idx, x, y) { this.geometryMutator.updateSingleNodePosition(id, idx, x, y); }
    addGeometry(type, path, isB) { this.geometryMutator.addGeometry(type, path, isB); }
    convertCategory(id, t, p) { this.geometryMutator.convertCategory(id, t, p); }
    smoothSelectedWalls() { this.geometryMutator.smoothSelectedWalls(); }

    healGeometry() { this.validatorStore.healGeometry(); }

    packCompoundAsset() { this.assetPackager.packCompoundAsset(); }
    async loadCompoundAssetFromFile(f, x, y) { return await this.assetPackager.loadCompoundAssetFromFile(f, x, y); }
    spawnCompoundAsset(x, y, p, a) { this.assetPackager.spawnCompoundAsset(x, y, p, a); }

    get globalAssets() { return this.globalAssetStore.globalAssets; }
    get mountedAssetDirectory() { return this.globalAssetStore.mountedAssetDirectory; }
    async mountAssetLibrary() { return await this.globalAssetStore.mountAssetLibrary(); }
    async refreshAssetLibrary() { return await this.globalAssetStore.refreshAssetLibrary(); }
    addProp(x, y, i, n) { this.globalAssetStore.addProp(x, y, i, n); }

    // ========================================================================
    // CORE STORE METHODS
    // ========================================================================
    getItem(id) {
        if (!this.activeMap) return null;
        const m = this.activeMap.manifest;
        let found = null;
        for (const cat of ['walls', 'portals', 'overhead']) {
            found = m.geometry[cat]?.find(i => i.id === id);
            if (found) return found;
        }
        for (const cat of ['lights', 'landing_zones', 'events', 'emitters', 'props']) {
            found = m.entities[cat]?.find(i => i.id === id);
            if (found) return found;
        }
        found = m.entities.audio?.zones?.find(i => i.id === id);
        return found || null;
    }

    openContextMenu(x, y) {
        this.contextMenu = { show: true, x, y };
        this.updateTrigger++;
    }

    closeContextMenu() {
        if (this.contextMenu.show) {
            this.contextMenu.show = false;
            this.updateTrigger++;
        }
    }

    adjustZIndex(delta) {
        this.selectedItemIds.forEach(id => {
            const item = this.getItem(id);
            if (item && item.properties) {
                const currentZ = Number(item.properties.z_index) || 0;
                this.updateItemProperty(id, 'properties.z_index', currentZ + delta);
            }
        });
        this.closeContextMenu();
    }

    toggleSelectionVisibility() {
        this.selectedItemIds.forEach(id => {
            const item = this.getItem(id);
            if (item && item.properties) {
                const newVis = item.properties.visibility === 'hidden' ? 'visible' : 'hidden';
                this.updateItemProperty(id, 'properties.visibility', newVis);
            }
        });
        this.closeContextMenu();
    }

    toggleSelectionLock() {
        this.selectedItemIds.forEach(id => {
            const item = this.getItem(id);
            if (item && item.properties) {
                const isLocked = !!item.properties.locked;
                this.updateItemProperty(id, 'properties.locked', !isLocked);
            }
        });
        this.closeContextMenu();
    }

    toggleVision() {
        this.vision.enabled = !this.vision.enabled;
        this.updateTrigger++;
    }
    
    toggleLightingPreview() {
        this.lightingPreview = !this.lightingPreview;
        this.updateTrigger++;
    }

    toggleSimulationMode() {
        this.isSimulationModeActive = !this.isSimulationModeActive;
        if (this.isSimulationModeActive) {
            this.selectedItemIds = [];
            this.activeTool = "select"; 
            this.closeContextMenu();
        }
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
    
    async saveProject() { return await saveProject(this); }
    closeProject() {
        this.catalog = [];
        this.activeMapId = null;
        this.selectedItemIds = [];
        this.clipboard = [];
        this.updateTrigger++;
        this.triggerAutoSave();
    }
    
    async exportVTT() { return await exportVTT(this); }
    async exportLegacyV1() { return await exportLegacyV1(this); }
    async exportCompoundVTT(isLegacy = false) { return await exportCompoundVTT(this, isLegacy); }
    async exportSecureVTT(isCompound = false) { return await exportSecureVTT(this, isCompound); }
    async loadProjectFromFile(file) { return await loadProjectFromFile(this, file); }
    async importImageAsMap(file) { return await importImageAsMap(this, file); }

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

    setTool(tool) {
        this.activeTool = tool;
        this.selectedItemIds = [];
        this.closeContextMenu();
        if (tool !== 'grid_align') {
            this.gridAlignBoxes = [];
        }
        this.updateTrigger++;
    }

    clearSelection() {
        this.selectedItemIds = [];
        this.closeContextMenu();
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
            height: JSON.parse(JSON.stringify(ds.height)),
            properties: JSON.parse(JSON.stringify(ds.properties))
        };
        if (!activeMap.manifest.entities.emitters) activeMap.manifest.entities.emitters = [];
        activeMap.manifest.entities.emitters.push(emitter);
        
        this.activeMap.manifest = { ...activeMap.manifest };
        this.pushHistory("Added Emitter");
        this.updateSpatialIndex();
    }

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
        
        const itemLockCheck = this.getItem(id);
        if (itemLockCheck && itemLockCheck.properties?.locked) return;
        
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
            const itemLockCheck = this.getItem(id);
            if (itemLockCheck && itemLockCheck.properties?.locked) return;
            
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
        this.closeContextMenu();
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
}

export const mapStore = new MapStore();