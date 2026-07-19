import JSZip from 'jszip';

// --- QUAD TREE SPATIAL INDEXING ---
class QuadTree {
    constructor(bounds, capacity = 4) {
        this.bounds = bounds;
        this.capacity = capacity;
        this.entities = [];
        this.divided = false;
    }

    subdivide() {
        const { x, y, w, h } = this.bounds;
        const hw = w / 2;
        const hh = h / 2;
        this.nw = new QuadTree({ x, y, w: hw, h: hh }, this.capacity);
        this.ne = new QuadTree({ x: x + hw, y, w: hw, h: hh }, this.capacity);
        this.sw = new QuadTree({ x, y: y + hh, w: hw, h: hh }, this.capacity);
        this.se = new QuadTree({ x: x + hw, y: y + hh, w: hw, h: hh }, this.capacity);
        this.divided = true;
    }

    insert(entity) {
        if (!this.contains(entity)) return false;
        if (this.entities.length < this.capacity) {
            this.entities.push(entity);
            return true;
        }
        if (!this.divided) this.subdivide();
        return (this.nw.insert(entity) || this.ne.insert(entity) || this.sw.insert(entity) || this.se.insert(entity));
    }

    contains(entity) {
        const { x, y } = entity.pos;
        return x >= this.bounds.x && x <= this.bounds.x + this.bounds.w &&
               y >= this.bounds.y && y <= this.bounds.y + this.bounds.h;
    }

    retrieve(range, found = []) {
        if (!this.intersects(range)) return found;
        for (const entity of this.entities) {
            if (this.inRange(entity, range)) found.push(entity);
        }
        if (this.divided) {
            this.nw.retrieve(range, found);
            this.ne.retrieve(range, found);
            this.sw.retrieve(range, found);
            this.se.retrieve(range, found);
        }
        return found;
    }

    intersects(range) {
        return !(range.x > this.bounds.x + this.bounds.w || range.x + range.w < this.bounds.x ||
                 range.y > this.bounds.y + this.bounds.h || range.y + range.h < this.bounds.y);
    }

    inRange(entity, range) {
        const { x, y } = entity.pos;
        return x >= range.x && x <= range.x + range.w && y >= range.y && y <= range.y + range.h;
    }
}

// --- DATABASE AUTO-SAVE HELPER ---
const DB_NAME = 'uvtt_db';
const STORE_NAME = 'project_store';

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToDB(key, data) {
    try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data, key);
    } catch (e) {
        console.error("Auto-save failed:", e);
    }
}

async function loadFromDB(key) {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

// --- MATH HELPERS FOR BEZIER ---
function pointsToBezier(points) {
    if (points.length < 3) return points;
    let p = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[0];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i !== points.length - 2 ? points[i + 2] : p2;
        const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        p.push({ x: p1.x, y: p1.y, cp1, cp2 });
    }
    p.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
    return p;
}

// --- SCHEMA VERIFIER & SCRUBBER ---
function verifyAndCleanManifest(rawManifest) {
    const m = JSON.parse(JSON.stringify(rawManifest));
    const isNum = (v) => typeof v === 'number' && !isNaN(v);

    ['walls', 'portals', 'overhead'].forEach(cat => {
        if (m.geometry && m.geometry[cat]) {
            m.geometry[cat] = m.geometry[cat].filter(item => {
                if (!item.path || !Array.isArray(item.path) || item.path.length < 2) return false;
                if (!item.properties) item.properties = {};
                if (!isNum(item.properties.bottom)) item.properties.bottom = (cat === 'overhead' ? 10.0 : 0.0);
                if (!isNum(item.properties.top)) item.properties.top = (cat === 'overhead' ? 20.0 : 10.0);
                return item.path.every(pt => isNum(pt.x) && isNum(pt.y));
            });
        }
    });

    if (m.entities) {
        if (!m.entities.props) m.entities.props = [];
        if (m.entities.lights) {
            m.entities.lights = m.entities.lights.filter(l => {
                if (!l.position || !isNum(l.position.x) || !isNum(l.position.y)) return false;
                if (!l.properties) l.properties = {};
                if (!isNum(l.properties.radius?.bright)) l.properties.radius = { bright: 5, dim: 10 };
                if (!isNum(l.properties.intensity)) l.properties.intensity = 1.0;
                if (typeof l.properties.color !== 'string') l.properties.color = "#ffffff";
                return true;
            });
        }
        if (m.entities.landing_zones) {
            m.entities.landing_zones = m.entities.landing_zones.filter(lz => {
                const isValidCoords = lz.coordinates && Array.isArray(lz.coordinates) && isNum(lz.coordinates[0]) && isNum(lz.coordinates[1]);
                if (isValidCoords && !isNum(lz.heading_degrees)) lz.heading_degrees = 0.0;
                return isValidCoords;
            });
        }
        if (m.entities.events) {
            m.entities.events = m.entities.events.filter(ev => {
                if (!ev.trigger_bounds || !ev.trigger_bounds.center || !isNum(ev.trigger_bounds.center.x) || !isNum(ev.trigger_bounds.center.y)) return false;
                if (!isNum(ev.trigger_bounds.radius)) ev.trigger_bounds.radius = 1;
                if (!ev.activation || typeof ev.activation !== 'string') ev.activation = 'proximity';
                return true;
            });
        }
        if (m.entities.audio && m.entities.audio.zones) {
            m.entities.audio.zones = m.entities.audio.zones.filter(az => {
                if (!az.center || !isNum(az.center.x) || !isNum(az.center.y)) return false;
                if (!isNum(az.radius)) az.radius = 5;
                if (!isNum(az.volume)) az.volume = 100;
                return true;
            });
        }
        if (m.entities.emitters) {
            m.entities.emitters = m.entities.emitters.filter(em => {
                if (!em.position || !isNum(em.position.x) || !isNum(em.position.y)) return false;
                if (!isNum(em.scale)) em.scale = 100;
                return true;
			});
        }
        if (m.entities.props) {
            m.entities.props = m.entities.props.filter(pr => {
                if (!pr.position || !isNum(pr.position.x) || !isNum(pr.position.y)) return false;
                return true;
            });
        }
    }

    if (!m.resolution) m.resolution = {};
    if (!isNum(m.resolution.pixels_per_grid)) m.resolution.pixels_per_grid = 70;
    if (!isNum(m.resolution.grid_line_width)) m.resolution.grid_line_width = 1.5;
    if (!isNum(m.resolution.subgrid_line_width)) m.resolution.subgrid_line_width = 1.0;

    return m;
}

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
        wall: { properties: { type: 'standard', bottom: 0.0, top: 10.0 } },
        portal: { properties: { type: 'door', state: 'closed', bottom: 0.0, top: 10.0 } },
        roof: { properties: { tint: '#475569', opacity: 100, hidden: false, bottom: 10.0, top: 20.0 } },
        light: { type: 'point', position: { z: 0 }, properties: { color: '#ffffff', intensity: 1.0, decay_model: 'inverse_square', radius: { bright: 5.0, dim: 10.0 }, animation: { profile: 'none', speed: 0.5, intensity_variance: 0.2 }, rotation: 0, cone_angle: 60 } },
        spawn: { name: 'New Spawn', shape: 'circle', is_default: false, heading_degrees: 0.0 },
        event: { name: 'New Event', eventType: 'Trap/Door Trigger', activation: 'proximity', trigger_bounds: { radius: 0.5 }, targetSpawnId: "", autoCreateMatch: false, targetFloorId: "" },
        audio: { track: "", volume: 100, radius: 5, inner_radius: 2.5, muffledByWalls: true },
        emitter: { type: 'weather', style: 'rain', isGlobal: false, layering: 'above', tint: '#ffffff', scale: 100, direction: 180, speed: 50, intensity: 50, variance: 10, graphic: '', position: { z: 0 } },
        prop: { scale: 100, rotation: 0, position: { z: 0 } },
        asset: {} 
    });

    constructor() {
        loadFromDB('autosave').then(saved => {
            if (saved && saved.catalog && saved.catalog.length > 0) {
                this.catalog = saved.catalog;
                this.activeMapId = saved.activeMapId || saved.catalog[0].id;
                this.updateSpatialIndex();
                this.updateTrigger++;
            }
        });
    }

    get activeMap() { return this.catalog.find(m => m.id === this.activeMapId) || null; }
    get redrawTick() { return this.updateTrigger; }

    // --- GRID ALIGNMENT CONTROLLER ---
    calculateGridAlignment() {
        if (!this.activeMap || this.gridAlignBoxes.length === 0) return;
        const boxes = this.gridAlignBoxes;
        
        let sumW = 0, sumH = 0;
        let validCount = 0;

        // Calculate independent X and Y scales
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

        const modX = ((anchorX % newPpgX) + newPpgX) % newPpgX;
        const modY = ((anchorY % newPpgY) + newPpgY) % newPpgY;
        
        const res = this.activeMap.manifest.resolution;
        const oldPpgX = Number(res.pixels_per_grid) || 70;
        const oldPpgY = Number(res.pixels_per_grid_y) || oldPpgX;
        
        // Preserve absolute pixel dimensions
        const pixelWidth = res.map_size[0] * oldPpgX;
        const pixelHeight = res.map_size[1] * oldPpgY;
        
        res.pixels_per_grid = newPpgX;
        res.pixels_per_grid_y = newPpgY; // Non-square grid tracking
        res.map_size[0] = pixelWidth / newPpgX;
        res.map_size[1] = pixelHeight / newPpgY;
        
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
            
            // If they are setting X but Y doesn't exist yet, bind them
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

    // --- IO & PERSISTENCE ---
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

    downloadBlob(filename, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a); 
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000); 
    }

    downloadJSON(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this.downloadBlob(filename, blob);
    }

    saveProject() {
        const projectData = JSON.parse(JSON.stringify({
            catalog: this.catalog,
            activeMapId: this.activeMapId
        }));
        this.downloadJSON('my_map.uvtt-proj', projectData);
    }

    closeProject() {
        this.catalog = [];
        this.activeMapId = null;
        this.selectedItemIds = [];
        this.clipboard = [];
        this.updateTrigger++;
        this.triggerAutoSave();
    }

    exportVTT() {
        if (!this.activeMap) return;
        const cleanManifest = verifyAndCleanManifest(this.activeMap.manifest);
        this.downloadJSON(`${this.activeMap.filename || 'export'}.uvtt`, cleanManifest);
    }

    exportLegacyV1() {
        if (!this.activeMap) return;
        const cleanManifest = verifyAndCleanManifest(this.activeMap.manifest);
        
        if (cleanManifest.entities) {
            if (cleanManifest.entities.lights) {
                cleanManifest.entities.lights = cleanManifest.entities.lights.map(l => {
                    const v1Light = { id: l.id };
                    if (l.position) v1Light.position = [l.position.x, l.position.y];
                    if (l.properties) {
                        v1Light.color = l.properties.color || "#ffffff";
                        v1Light.range = l.properties.radius?.dim || 10;
                        v1Light.intensity = l.properties.intensity || 1.0;
                    }
                    return v1Light;
                });
            }
            if (cleanManifest.entities.landing_zones) {
                cleanManifest.entities.spawns = cleanManifest.entities.landing_zones;
                delete cleanManifest.entities.landing_zones;
            }
            if (cleanManifest.entities.events) {
                cleanManifest.entities.events = cleanManifest.entities.events.map(ev => {
                    if (ev.trigger_bounds && ev.trigger_bounds.center) {
                        ev.x = ev.trigger_bounds.center.x;
                        ev.y = ev.trigger_bounds.center.y;
                        delete ev.trigger_bounds;
                    }
                    return ev;
                });
            }
            delete cleanManifest.entities.props;
        }
        this.downloadJSON(`${this.activeMap.filename || 'export'}_v1_legacy.uvtt`, cleanManifest);
    }

    exportCompoundVTT(isLegacy = false) {
        if (this.catalog.length === 0) return;
        const compoundManifest = {
            type: "compound_dungeon",
            export_version: isLegacy ? 1 : 2,
            levels: []
        };

        this.catalog.forEach(mapDef => {
            let levelManifest = verifyAndCleanManifest(mapDef.manifest);
            levelManifest.level_id = mapDef.id;
            levelManifest.level_name = mapDef.filename || "Unnamed Level";

            if (isLegacy && levelManifest.entities) {
                if (levelManifest.entities.lights) {
                    levelManifest.entities.lights = levelManifest.entities.lights.map(l => {
                        const v1Light = { id: l.id };
                        if (l.position) v1Light.position = [l.position.x, l.position.y];
                        if (l.properties) {
                            v1Light.color = l.properties.color || "#ffffff";
                            v1Light.range = l.properties.radius?.dim || 10;
                            v1Light.intensity = l.properties.intensity || 1.0;
                        }
                        return v1Light;
                    });
                }
                if (levelManifest.entities.landing_zones) {
                    levelManifest.entities.spawns = levelManifest.entities.landing_zones;
                    delete levelManifest.entities.landing_zones;
                }
                if (levelManifest.entities.events) {
                    levelManifest.entities.events = levelManifest.entities.events.map(ev => {
                        if (ev.trigger_bounds && ev.trigger_bounds.center) {
                            ev.x = ev.trigger_bounds.center.x;
                            ev.y = ev.trigger_bounds.center.y;
                            delete ev.trigger_bounds;
                        }
                        return ev;
                    });
                }
                delete levelManifest.entities.props;
            }
            compoundManifest.levels.push(levelManifest);
        });

        this.downloadJSON(`Compound_Dungeon_${isLegacy ? 'v1' : 'v2'}.uvtt`, compoundManifest);
    }

    async exportSecureVTT(isCompound = false) {
        try {
            if (!window.crypto || !window.crypto.subtle) {
                alert("SECURITY ERROR: The Web Crypto API requires a Secure Context. You must view this page via HTTPS or 'localhost'.");
                return;
            }

            if (!this.activeMap && !isCompound) return;
            if (isCompound && this.catalog.length === 0) return;

            const baseName = isCompound ? 'Compound_Dungeon' : (this.activeMap.filename || 'export');
            const internalZip = new JSZip();

            const safeBase64ToBlob = (base64, mime) => {
                const binary = atob(base64);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    array[i] = binary.charCodeAt(i);
                }
                return new Blob([array], { type: mime });
            };

            const bundleMapImage = async (mapDef, manifestToUpdate) => {
                const sourceData = mapDef.imageUrl || mapDef.manifest.image;
                if (!sourceData) return;

                try {
                    let originalBlob;
                    if (sourceData.startsWith('data:image')) {
                        const parts = sourceData.split(',');
                        const mime = parts[0].match(/:(.*?);/)[1];
                        originalBlob = safeBase64ToBlob(parts[1], mime);
                    } else if (sourceData.startsWith('blob:') || sourceData.startsWith('http')) {
                        const res = await fetch(sourceData);
                        originalBlob = await res.blob();
                    } else {
                        originalBlob = safeBase64ToBlob(sourceData, 'image/png');
                    }

                    let finalBlob = originalBlob;
                    let ext = 'png';

                    try {
                        const img = new Image();
                        const blobUrl = URL.createObjectURL(originalBlob);
                        
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            img.src = blobUrl;
                        });

                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        URL.revokeObjectURL(blobUrl);

                        const webpBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.9));
                        if (webpBlob) {
                            finalBlob = webpBlob;
                            ext = 'webp';
                        }
                    } catch (transcodeErr) {
                        console.warn(`WebP transcode failed. Falling back to source format.`, transcodeErr);
                        if (originalBlob.type === 'image/jpeg') ext = 'jpg';
                    }

                    const filename = `map_${mapDef.id}.${ext}`;
                    internalZip.file(`assets/images/${filename}`, finalBlob);
                    manifestToUpdate.image = `assets/images/${filename}`;

                } catch (e) {
                    console.error("Failed to bundle image", e);
                }
            };

            if (isCompound) {
                const compoundManifest = { type: "compound_dungeon", export_version: 2, levels: [] };
                for (const mapDef of this.catalog) {
                    let levelManifest = verifyAndCleanManifest(mapDef.manifest);
                    levelManifest.level_id = mapDef.id;
                    levelManifest.level_name = mapDef.filename || "Unnamed Level";
                    await bundleMapImage(mapDef, levelManifest);
                    compoundManifest.levels.push(levelManifest);
                }
                internalZip.file("manifest.json", JSON.stringify(compoundManifest, null, 2));
            } else {
                const cleanManifest = verifyAndCleanManifest(this.activeMap.manifest);
                await bundleMapImage(this.activeMap, cleanManifest);
                internalZip.file("manifest.json", JSON.stringify(cleanManifest, null, 2));
            }
            
            if (Object.keys(this.audioBlobs).length > 0) {
                for (const [trackName, blob] of Object.entries(this.audioBlobs)) {
                    internalZip.file(`assets/audio/${trackName}`, blob);
                }
            }

            const internalZipBuffer = await internalZip.generateAsync({ type: "arraybuffer" });
            const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
            const exportedKey = await window.crypto.subtle.exportKey("jwk", key);
            const keyString = JSON.stringify(exportedKey, null, 2);
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, internalZipBuffer);

            const encryptedPayload = new Uint8Array(iv.length + ciphertext.byteLength);
            encryptedPayload.set(iv, 0);
            encryptedPayload.set(new Uint8Array(ciphertext), iv.length);

            const deliveryZip = new JSZip();
            deliveryZip.file(`${baseName}.uvtt2k`, keyString); 
            deliveryZip.file(`${baseName}.uvtt2z`, encryptedPayload);

            const deliveryBuffer = await deliveryZip.generateAsync({ type: "blob" });
            this.downloadBlob(`${baseName}_Secure_Export.zip`, deliveryBuffer);

        } catch (error) {
            console.error("Secure Export Failed:", error);
            alert(`Export Failed: ${error.message}`);
        }
    }

    async loadProjectFromFile(file) {
        if (!file) return;

        if (file.name.toLowerCase().endsWith('.zip')) {
            try {
                if (!window.crypto || !window.crypto.subtle) {
                    alert("SECURITY ERROR: Web Crypto API requires HTTPS or localhost.");
                    return;
                }

                const fileBuffer = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(fileBuffer);
                const keyFile = Object.values(zip.files).find(f => f.name.endsWith('.uvtt2k'));
                const payloadFile = Object.values(zip.files).find(f => f.name.endsWith('.uvtt2z'));

                if (!keyFile || !payloadFile) {
                    alert("Invalid Secure Archive.");
                    return;
                }

                const keyString = await keyFile.async("string");
                const jwk = JSON.parse(keyString);
                const cryptoKey = await window.crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, ["decrypt"]);

                const encryptedBuffer = await payloadFile.async("arraybuffer");
                const iv = encryptedBuffer.slice(0, 12);
                const ciphertext = encryptedBuffer.slice(12);

                const decryptedBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, cryptoKey, ciphertext);
                const internalZip = await JSZip.loadAsync(decryptedBuffer);
                const manifestFile = internalZip.file("manifest.json");
                
                if (!manifestFile) { alert("No manifest found."); return; }

                const manifestString = await manifestFile.async("string");
                const manifestData = JSON.parse(manifestString);
                
                const restoreImage = async (manifestRef) => {
                    if (!manifestRef.image) return "";
                    const imgFile = internalZip.file(manifestRef.image);
                    if (imgFile) {
                        const blob = await imgFile.async("blob");
                        return URL.createObjectURL(blob);
                    }
                    return "";
                };

                let newCatalog = [];
                if (manifestData.type === "compound_dungeon") {
                    for (const level of manifestData.levels) {
                        const restoredUrl = await restoreImage(level);
                        newCatalog.push({
                            id: level.level_id || crypto.randomUUID(),
                            filename: level.level_name || "Imported Level",
                            manifest: level,
                            imageUrl: restoredUrl
                        });
                    }
                } else {
                    const restoredUrl = await restoreImage(manifestData);
                    newCatalog = [{
                        id: crypto.randomUUID(),
                        filename: file.name.replace('.zip', '').replace('_Secure_Export', ''),
                        manifest: manifestData,
                        imageUrl: restoredUrl 
                    }];
                }

                const newAudioBlobs = {};
                const audioPromises = [];
                internalZip.folder("assets/audio")?.forEach((relativePath, audioFile) => {
                    if (!audioFile.dir) {
                        audioPromises.push((async () => {
                            newAudioBlobs[relativePath] = await audioFile.async("blob");
                        })());
                    }
                });
                await Promise.all(audioPromises);
                this.audioBlobs = newAudioBlobs;

                this.catalog = newCatalog;
                this.activeMapId = newCatalog[0].id;
                this.selectedItemIds = [];
                this.initHistory();
                this.updateSpatialIndex();
                this.updateTrigger++;
                this.triggerAutoSave();
                return;

            } catch (e) {
                console.error("Secure import failed:", e);
                alert(`Decryption Failed.`);
                return;
            }
        }

        try {
            const text = await file.text();
            const projectData = JSON.parse(text);
            if (projectData.catalog) {
                this.catalog = projectData.catalog;
                this.activeMapId = projectData.activeMapId;
                this.selectedItemIds = [];
                this.initHistory();
                this.updateSpatialIndex();
                this.updateTrigger++;
                this.triggerAutoSave();
            }
        } catch (e) {
            console.error("Failed to parse.", e);
        }
    }

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

    // --- LIGHTWEIGHT BINARY EXIF/pHYs DPI EXTRACTOR ---
    async extractDPI(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const view = new DataView(e.target.result);
                try {
                    if (view.getUint16(0) === 0xFFD8) {
                        let offset = 2;
                        while (offset < view.byteLength) {
                            const marker = view.getUint16(offset);
                            const len = view.getUint16(offset + 2);
                            if (marker === 0xFFE0) { 
                                if (view.getUint32(offset + 4) === 0x4A464946) {
                                    const units = view.getUint8(offset + 11);
                                    const xDen = view.getUint16(offset + 12);
                                    if (units === 1 && xDen > 10) return resolve(xDen); 
                                    if (units === 2 && xDen > 10) return resolve(Math.round(xDen * 2.54)); 
                                }
                            }
                            offset += len + 2;
                        }
                    } 
                    else if (view.getUint32(0) === 0x89504E47) {
                        let offset = 8;
                        while (offset < view.byteLength) {
                            const len = view.getUint32(offset);
                            const type = view.getUint32(offset + 4);
                            if (type === 0x70485973) { 
                                const ppuX = view.getUint32(offset + 8);
                                const unit = view.getUint8(offset + 16);
                                if (unit === 1 && ppuX > 10) return resolve(Math.round(ppuX * 0.0254)); 
                            }
                            offset += len + 12;
                        }
                    }
                } catch(err) {
                    console.warn("DPI Extraction skipped:", err);
                }
                resolve(70); 
            };
            reader.readAsArrayBuffer(file.slice(0, 65536));
        });
    }

    async importImageAsMap(file) {
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const detectedPpg = await this.extractDPI(file);
            const ppg = isNaN(detectedPpg) ? 70 : detectedPpg; 

            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = dataUrl;
            });

            const mapWidth = Math.ceil(img.width / ppg);
            const mapHeight = Math.ceil(img.height / ppg);

            const newId = crypto.randomUUID();
            const newMap = {
                id: newId,
                filename: file.name.split('.')[0] || "Imported Map",
                manifest: {
                    resolution: { 
                        map_origin: [0, 0],
                        map_size: [mapWidth, mapHeight],
                        pixels_per_grid: ppg, 
                        pixels_per_grid_y: ppg, 
                        grid_line_width: 1.5, 
                        subgrid_line_width: 1.0 
                    },
                    geometry: { walls: [], portals: [], overhead: [] },
                    entities: { lights: [], landing_zones: [], events: [], emitters: [], audio: { zones: [] }, props: [] }
                },
                imageUrl: dataUrl,
                history: [],
                historyIndex: -1
            };
            this.appendLevel(newMap);
        } catch (err) {
            console.error("Failed to load image as map:", err);
            alert("Could not process image file.");
        }
    }

    deleteMapLevel(id) {
        if (this.catalog.length <= 1) {
            alert("You cannot delete the only level in the project.");
            return;
        }
        this.catalog = this.catalog.filter(m => m.id !== id);
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

    // --- NODE MUTATIONS ---
    deleteVectorNode(exactX, exactY, thresholdSq) {
        const activeMap = this.activeMap;
        if (!activeMap) return false;
        let nodeDeleted = false;

        ['walls', 'portals', 'overhead'].forEach(cat => {
            const items = activeMap.manifest.geometry[cat];
            if (!items) return;
            for (let itemIdx = items.length - 1; itemIdx >= 0; itemIdx--) {
                const item = items[itemIdx];
                if (nodeDeleted || !item.path) continue;
                for (let i = 0; i < item.path.length; i++) {
                    const px = Number(item.path[i].x);
                    const py = Number(item.path[i].y);
                    const distSq = (exactX - px) ** 2 + (exactY - py) ** 2;

                    if (distSq < thresholdSq) {
                        item.path.splice(i, 1);
                        item.path = [...item.path]; 
                        
                        if (item.path.length < 2) {
                            items.splice(itemIdx, 1);
                            this.selectedItemIds = this.selectedItemIds.filter(id => id !== item.id);
                        }
                        
                        nodeDeleted = true;
                        activeMap.manifest.geometry[cat] = [...items]; 
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
            const items = activeMap.manifest.geometry[cat];
            if (!items) return;
            for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
                const item = items[itemIdx];
                if (splitOccurred || !item.path) continue;
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
                        item.path.splice(i + 1, 0, { x: exactX, y: exactY });
                        item.path = [...item.path]; 
                        splitOccurred = true;
                        activeMap.manifest.geometry[cat] = [...items]; 
                        this.pushHistory("Split Vector");
                        this.updateSpatialIndex();
                        this.updateTrigger++;
                        return;
                    }
                }
            }
        });
        return splitOccurred;
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
            heading_degrees: ds.heading_degrees 
        };
        
        if (ds.is_default) {
            if (activeMap.manifest.entities.landing_zones) {
                activeMap.manifest.entities.landing_zones.forEach(lz => lz.is_default = false);
            }
            this.updateDefaultSetting('spawn', 'is_default', false);
        }

        if (!activeMap.manifest.entities.landing_zones) activeMap.manifest.entities.landing_zones = [];
        activeMap.manifest.entities.landing_zones.push(spawn);
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
            trigger_bounds: { center: {x, y}, radius: ds.trigger_bounds.radius }
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
                    heading_degrees: 0.0
                });

                if (!targetMap.manifest.entities.events) targetMap.manifest.entities.events = [];
                if (!targetMap.manifest.entities.landing_zones) targetMap.manifest.entities.landing_zones = [];

                targetMap.manifest.entities.events.push({
                    id: targetEventId, 
                    name: `Return to ${activeMap.filename || 'Origin'}`, 
                    eventType: ds.eventType, 
                    activation: ds.activation,
                    targetSpawnId: localSpawnId, 
                    trigger_bounds: { center: {x, y}, radius: ds.trigger_bounds.radius }
                });

                targetMap.manifest.entities.landing_zones.push({
                    id: targetSpawnId, 
                    coordinates: [x + offset, y], 
                    name: `Arrival from ${activeMap.filename || 'Origin'}`, 
                    shape: 'circle', 
                    is_default: false,
                    heading_degrees: 0.0
                });
            }
        }

        if (!activeMap.manifest.entities.events) activeMap.manifest.entities.events = [];
        activeMap.manifest.entities.events.push(newEvent);

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
            volume: ds.volume, muffledByWalls: ds.muffledByWalls, track: ds.track 
        };
        if (!activeMap.manifest.entities.audio) activeMap.manifest.entities.audio = { zones: [] };
        if (!activeMap.manifest.entities.audio.zones) activeMap.manifest.entities.audio.zones = [];
        activeMap.manifest.entities.audio.zones.push(audio);
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
            direction: ds.direction, speed: ds.speed, intensity: ds.intensity, variance: ds.variance, graphic: ds.graphic
        };
        if (!activeMap.manifest.entities.emitters) activeMap.manifest.entities.emitters = [];
        activeMap.manifest.entities.emitters.push(emitter);
        this.pushHistory("Added Emitter");
        this.updateSpatialIndex();
    }

    // --- MUTATIONS ---
    updateItemProperty(id, keyPath, value) {
        const activeMap = this.activeMap;
        if (!activeMap) return;
        const m = activeMap.manifest;
        
        if (keyPath === "is_default" && value === true) {
            m.entities.landing_zones?.forEach(lz => {
                if (lz.id !== id) lz.is_default = false;
            });
        }

        if (id === this.activeMapId) {
             let obj = m;
             const keys = keyPath.split('.');
             for (let i = 0; i < keys.length - 1; i++) {
                 if (!obj[keys[i]]) obj[keys[i]] = {};
                 obj = obj[keys[i]];
             }
             obj[keys[keys.length - 1]] = value;
             this.pushHistory("Modified Map Settings");
             this.updateTrigger++;
             return;
        }

        let foundItem = null;
        for (const cat of ['walls', 'portals', 'overhead']) {
            if (m.geometry[cat]) {
                foundItem = m.geometry[cat].find(i => i.id === id);
                if (foundItem) break;
            }
        }
        if (!foundItem) {
            for (const cat of ['lights', 'landing_zones', 'events', 'emitters', 'props']) {
                if (m.entities[cat]) {
                    foundItem = m.entities[cat].find(i => i.id === id);
                    if (foundItem) break;
                }
            }
        }
        if (!foundItem && m.entities.audio?.zones) {
            foundItem = m.entities.audio.zones.find(i => i.id === id);
        }

        if (foundItem) {
            const keys = keyPath.split('.');
            let obj = foundItem;
            for (let i = 0; i < keys.length - 1; i++) {
                if (!obj[keys[i]]) obj[keys[i]] = {};
                obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = value;
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
            const item = m.geometry[cat]?.find(i => i.id === id);
            if (item && item.path) item.path.forEach(pt => { pt.x = Number(pt.x) + dx; pt.y = Number(pt.y) + dy; });
        });

        const light = m.entities.lights?.find(i => i.id === id);
        if (light && light.position) { light.position.x = exactX; light.position.y = exactY; }
        
        const spawn = m.entities.landing_zones?.find(i => i.id === id);
        if (spawn && spawn.coordinates) { spawn.coordinates[0] = exactX; spawn.coordinates[1] = exactY; }
        
        const evt = m.entities.events?.find(i => i.id === id);
        if (evt && evt.trigger_bounds?.center) { evt.trigger_bounds.center.x = exactX; evt.trigger_bounds.center.y = exactY; }
        
        const aud = m.entities.audio?.zones?.find(i => i.id === id);
        if (aud && aud.center) { aud.center.x = exactX; aud.center.y = exactY; }
        
        const em = m.entities.emitters?.find(i => i.id === id);
        if (em && em.position) { em.position.x = exactX; em.position.y = exactY; }

        const prop = m.entities.props?.find(i => i.id === id);
        if (prop && prop.position) { prop.position.x = exactX; prop.position.y = exactY; }

        this.pushHistory("Moved Item");
        this.updateSpatialIndex();
    }

    translateSelection(dx, dy) {
        const activeMap = this.activeMap;
        if (!activeMap || this.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;
        this.selectedItemIds.forEach(id => {
            ['walls', 'portals', 'overhead'].forEach(cat => {
                const item = m.geometry[cat]?.find(i => i.id === id);
                if (item && item.path) {
                    item.path.forEach(pt => { pt.x += dx; pt.y += dy; });
                }
            });
            ['lights', 'landing_zones', 'events', 'emitters', 'props'].forEach(cat => {
                const item = m.entities[cat]?.find(i => i.id === id);
                if (item) {
                    if (item.position) { item.position.x += dx; item.position.y += dy; }
                    if (item.coordinates) { item.coordinates[0] += dx; item.coordinates[1] += dy; }
                    if (item.trigger_bounds?.center) { item.trigger_bounds.center.x += dx; item.trigger_bounds.center.y += dy; }
                }
            });
            const aud = m.entities.audio?.zones?.find(i => i.id === id);
            if (aud && aud.center) { aud.center.x += dx; aud.center.y += dy; }
        });
        this.pushHistory("Translated Selection");
        this.updateSpatialIndex();
    }

    deleteSelected() {
        const activeMap = this.activeMap;
        if (!activeMap || this.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;

        const removeById = (arr) => {
            if (!Array.isArray(arr)) return;
            for (let i = arr.length - 1; i >= 0; i--) {
                if (this.selectedItemIds.includes(arr[i].id)) {
                    arr.splice(i, 1);
                }
            }
        };

        if (m.geometry) {
            removeById(m.geometry.walls);
            removeById(m.geometry.portals);
            removeById(m.geometry.overhead);
        }
        if (m.entities) {
            removeById(m.entities.lights);
            removeById(m.entities.landing_zones);
            removeById(m.entities.events);
            removeById(m.entities.emitters);
            removeById(m.entities.props);
            if (m.entities.audio) {
                removeById(m.entities.audio.zones);
            }
        }

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
            if (itemIndex > -1) foundItem = m.geometry[cat].splice(itemIndex, 1)[0];
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
            this.pushHistory("Converted Entity");
            this.updateSpatialIndex();
        }
    }

    smoothSelectedWalls() {
        const activeMap = this.activeMap;
        if (!activeMap || this.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;
        this.selectedItemIds.forEach(id => {
            const wall = m.geometry.walls?.find(i => i.id === id);
            if (wall && wall.path.length > 2) {
                wall.path = pointsToBezier(wall.path);
                wall.isBezier = true; 
            }
        });
        this.pushHistory("Smoothed Spline");
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
            } else if (clip.group === 'entities') {
                if (clone.position) { clone.position.x += offset; clone.position.y += offset; }
                if (clone.coordinates) { clone.coordinates[0] += offset; clone.coordinates[1] += offset; clone.is_default = false; }
                if (clone.trigger_bounds?.center) { clone.trigger_bounds.center.x += offset; clone.trigger_bounds.center.y += offset; }
                if(!m.entities[clip.category]) m.entities[clip.category] = [];
                m.entities[clip.category].push(clone);
            } else if (clip.group === 'audio') {
                if (clone.center) { clone.center.x += offset; clone.center.y += offset; }
                if(!m.entities.audio) m.entities.audio = { zones: [] };
                if(!m.entities.audio.zones) m.entities.audio.zones = [];
                m.entities.audio.zones.push(clone);
            }
            newSelection.push(clone.id);
        });
        this.selectedItemIds = newSelection;
        this.pushHistory("Pasted Items");
        this.updateSpatialIndex();
    }

    duplicateSelected() {
        this.copySelected();
        this.pasteClipboard(0, 0);
    }
}

export const mapStore = new MapStore();