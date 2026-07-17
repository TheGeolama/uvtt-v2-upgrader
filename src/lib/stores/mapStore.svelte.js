import JSZip from 'jszip';

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
                return item.path.every(pt => isNum(pt.x) && isNum(pt.y));
            });
        }
    });

    if (m.entities) {
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
                return lz.coordinates && Array.isArray(lz.coordinates) && isNum(lz.coordinates[0]) && isNum(lz.coordinates[1]);
            });
        }
        if (m.entities.events) {
            m.entities.events = m.entities.events.filter(ev => {
                if (!ev.trigger_bounds || !ev.trigger_bounds.center || !isNum(ev.trigger_bounds.center.x) || !isNum(ev.trigger_bounds.center.y)) return false;
                if (!isNum(ev.trigger_bounds.radius)) ev.trigger_bounds.radius = 1;
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
    }

    if (!m.resolution) m.resolution = {};
    if (!isNum(m.resolution.pixels_per_grid)) m.resolution.pixels_per_grid = 70;
    if (!isNum(m.resolution.grid_line_width)) m.resolution.grid_line_width = 1.5;
    if (!isNum(m.resolution.subgrid_line_width)) m.resolution.subgrid_line_width = 1.0;

    return m;
}

export const mapStore = createMapStore();

function createMapStore() {
    let activeMapId = $state(null);
    let catalog = $state([]);
    let updateTrigger = $state(0);
    let selectedItemIds = $state([]);
    let clipboard = $state([]);
    let lightingPreview = $state(false);
    let activeTool = $state("select");
    let draftingMode = $state("straight"); 
    let audioBlobs = $state({}); 

    let _saveTimeout = null;

    loadFromDB('autosave').then(saved => {
        if (saved && saved.catalog && saved.catalog.length > 0) {
            catalog = saved.catalog;
            activeMapId = saved.activeMapId || saved.catalog[0].id;
            updateTrigger++;
        }
    });

    return {
        get activeMapId() { return activeMapId; },
        set activeMapId(id) { activeMapId = id; },
        get catalog() { return catalog; },
        get updateTrigger() { return updateTrigger; },
        get redrawTick() { return updateTrigger; },
        get selectedItemIds() { return selectedItemIds; },
        set selectedItemIds(ids) { selectedItemIds = ids; },
        get lightingPreview() { return lightingPreview; },
        get activeTool() { return activeTool; },
        get audioBlobs() { return audioBlobs; },

        get activeMap() {
            return catalog.find(m => m.id === activeMapId) || null;
        },

        // --- IO & PERSISTENCE ---
        triggerAutoSave() {
            clearTimeout(_saveTimeout);
            _saveTimeout = setTimeout(async () => {
                const dataToSave = JSON.parse(JSON.stringify({
                    catalog,
                    activeMapId
                }));
                await saveToDB('autosave', dataToSave);
            }, 2000);
        },

        downloadBlob(filename, blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a); 
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000); 
        },

        downloadJSON(filename, data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            this.downloadBlob(filename, blob);
        },

        saveProject() {
            const projectData = JSON.parse(JSON.stringify({
                catalog,
                activeMapId
            }));
            this.downloadJSON('my_map.uvtt-proj', projectData);
        },

        closeProject() {
            catalog = [];
            activeMapId = null;
            selectedItemIds = [];
            clipboard = [];
            updateTrigger++;
            this.triggerAutoSave();
        },

        exportVTT() {
            if (!this.activeMap) return;
            const cleanManifest = verifyAndCleanManifest(this.activeMap.manifest);
            this.downloadJSON(`${this.activeMap.filename || 'export'}.uvtt`, cleanManifest);
        },

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
            }
            this.downloadJSON(`${this.activeMap.filename || 'export'}_v1_legacy.uvtt`, cleanManifest);
        },

        exportCompoundVTT(isLegacy = false) {
            if (catalog.length === 0) return;
            const compoundManifest = {
                type: "compound_dungeon",
                export_version: isLegacy ? 1 : 2,
                levels: []
            };

            catalog.forEach(mapDef => {
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
                }
                compoundManifest.levels.push(levelManifest);
            });

            this.downloadJSON(`Compound_Dungeon_${isLegacy ? 'v1' : 'v2'}.uvtt`, compoundManifest);
        },

        async exportSecureVTT(isCompound = false) {
            try {
                if (!window.crypto || !window.crypto.subtle) {
                    alert("SECURITY ERROR: The Web Crypto API requires a Secure Context. You must view this page via HTTPS or 'localhost'.");
                    return;
                }

                if (!this.activeMap && !isCompound) return;
                if (isCompound && catalog.length === 0) return;

                const baseName = isCompound ? 'Compound_Dungeon' : (this.activeMap.filename || 'export');
                const internalZip = new JSZip();

                // --- 1. MEMORY-SAFE ASSET BUNDLER ---
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

                        // Case A: Data URI
                        if (sourceData.startsWith('data:image')) {
                            const parts = sourceData.split(',');
                            const mime = parts[0].match(/:(.*?);/)[1];
                            originalBlob = safeBase64ToBlob(parts[1], mime);
                        } 
                        // Case B: blob: URL or http
                        else if (sourceData.startsWith('blob:') || sourceData.startsWith('http')) {
                            const res = await fetch(sourceData);
                            originalBlob = await res.blob();
                        } 
                        // Case C: Raw Base64 string (Dungeondraft standard)
                        else {
                            originalBlob = safeBase64ToBlob(sourceData, 'image/png');
                        }

                        // --- WEBP TRANSCODING ---
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
                            console.warn(`WebP transcode failed/skipped for map ${mapDef.id}. Falling back to source format.`, transcodeErr);
                            // Fallback gracefully without breaking the loop
                            if (originalBlob.type === 'image/jpeg') ext = 'jpg';
                        }

                        // Write to JSZip and strictly update manifest
                        const filename = `map_${mapDef.id}.${ext}`;
                        internalZip.file(`assets/images/${filename}`, finalBlob);
                        manifestToUpdate.image = `assets/images/${filename}`;

                    } catch (e) {
                        console.error("Failed to bundle image for map", mapDef.id, e);
                    }
                };

                // --- 2. BUILD THE JSON MANIFEST & INJECT IMAGES ---
                if (isCompound) {
                    const compoundManifest = {
                        type: "compound_dungeon",
                        export_version: 2,
                        levels: []
                    };
                    for (const mapDef of catalog) {
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
                
                // --- 3. BUNDLE AUDIO FILES (If any exist) ---
                if (Object.keys(audioBlobs).length > 0) {
                    for (const [trackName, blob] of Object.entries(audioBlobs)) {
                        internalZip.file(`assets/audio/${trackName}`, blob);
                    }
                }

                // Generate payload buffer
                const internalZipBuffer = await internalZip.generateAsync({ type: "arraybuffer" });

                // Generate AES-GCM Key
                const key = await window.crypto.subtle.generateKey(
                    { name: "AES-GCM", length: 256 },
                    true,
                    ["encrypt", "decrypt"]
                );

                const exportedKey = await window.crypto.subtle.exportKey("jwk", key);
                const keyString = JSON.stringify(exportedKey, null, 2);

                // Encrypt Payload
                const iv = window.crypto.getRandomValues(new Uint8Array(12));
                const ciphertext = await window.crypto.subtle.encrypt(
                    { name: "AES-GCM", iv: iv },
                    key,
                    internalZipBuffer
                );

                const encryptedPayload = new Uint8Array(iv.length + ciphertext.byteLength);
                encryptedPayload.set(iv, 0);
                encryptedPayload.set(new Uint8Array(ciphertext), iv.length);

                // Create Final Delivery Zip
                const deliveryZip = new JSZip();
                deliveryZip.file(`${baseName}.uvtt2k`, keyString); 
                deliveryZip.file(`${baseName}.uvtt2z`, encryptedPayload);

                const deliveryBuffer = await deliveryZip.generateAsync({ type: "blob" });
                this.downloadBlob(`${baseName}_Secure_Export.zip`, deliveryBuffer);

            } catch (error) {
                console.error("Secure Export Failed:", error);
                alert(`Export Failed: ${error.message || 'Check the console for details.'}`);
            }
        },

        async loadProjectFromFile(file) {
            if (!file) return;

            // --- DECRYPTION & IMPORT PIPELINE ---
            if (file.name.toLowerCase().endsWith('.zip')) {
                try {
                    if (!window.crypto || !window.crypto.subtle) {
                        alert("SECURITY ERROR: Web Crypto API requires HTTPS or localhost to decrypt.");
                        return;
                    }

                    const fileBuffer = await file.arrayBuffer();
                    const zip = await JSZip.loadAsync(fileBuffer);
                    
                    const keyFile = Object.values(zip.files).find(f => f.name.endsWith('.uvtt2k'));
                    const payloadFile = Object.values(zip.files).find(f => f.name.endsWith('.uvtt2z'));

                    if (!keyFile || !payloadFile) {
                        alert("Invalid Secure Archive: The .zip must contain both the .uvtt2k key and the .uvtt2z payload.");
                        return;
                    }

                    const keyString = await keyFile.async("string");
                    const jwk = JSON.parse(keyString);
                    
                    const cryptoKey = await window.crypto.subtle.importKey(
                        "jwk",
                        jwk,
                        { name: "AES-GCM" },
                        true,
                        ["decrypt"]
                    );

                    const encryptedBuffer = await payloadFile.async("arraybuffer");
                    const iv = encryptedBuffer.slice(0, 12);
                    const ciphertext = encryptedBuffer.slice(12);

                    const decryptedBuffer = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv: new Uint8Array(iv) },
                        cryptoKey,
                        ciphertext
                    );

                    const internalZip = await JSZip.loadAsync(decryptedBuffer);
                    const manifestFile = internalZip.file("manifest.json");
                    
                    if (!manifestFile) {
                        alert("Decryption successful, but no manifest.json found inside the archive.");
                        return;
                    }

                    const manifestString = await manifestFile.async("string");
                    const manifestData = JSON.parse(manifestString);
                    
                    // --- ASSET RESTORER HELPER ---
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

                    // --- RESTORE AUDIO BLOBS ---
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
                    audioBlobs = newAudioBlobs;

                    catalog = newCatalog;
                    activeMapId = newCatalog[0].id;
                    selectedItemIds = [];
                    this.initHistory();
                    updateTrigger++;
                    this.triggerAutoSave();
                    return;

                } catch (e) {
                    console.error("Secure import failed:", e);
                    alert(`Decryption Failed: ${e.message || "The key is invalid or the archive is corrupted."}`);
                    return;
                }
            }

            // --- STANDARD .UVTT-PROJ PIPELINE ---
            try {
                const text = await file.text();
                const projectData = JSON.parse(text);
                if (projectData.catalog) {
                    catalog = projectData.catalog;
                    activeMapId = projectData.activeMapId;
                    selectedItemIds = [];
                    this.initHistory();
                    updateTrigger++;
                    this.triggerAutoSave();
                }
            } catch (e) {
                console.error("Failed to parse project file.", e);
                alert("Failed to parse project file. Ensure it is a valid .uvtt-proj or .zip file.");
            }
        },

        setCatalog(newCatalog) {
            catalog = newCatalog;
            if (catalog.length > 0 && !activeMapId) {
                activeMapId = catalog[0].id;
            }
            this.initHistory();
            updateTrigger++;
            this.triggerAutoSave();
        },

        switchMap(id) {
            activeMapId = id;
            selectedItemIds = [];
            this.initHistory();
            updateTrigger++;
            this.triggerAutoSave();
        },

        toggleLightingPreview() {
            lightingPreview = !lightingPreview;
            updateTrigger++;
        },

        setTool(tool) {
            activeTool = tool;
            selectedItemIds = [];
            updateTrigger++;
        },

        clearSelection() {
            selectedItemIds = [];
            updateTrigger++;
        },

        selectItem(id, multi = false) {
            if (multi) {
                if (!selectedItemIds.includes(id)) {
                    selectedItemIds = [...selectedItemIds, id];
                }
            } else {
                selectedItemIds = [id];
            }
            updateTrigger++;
        },

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
        },

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
            updateTrigger++;
            this.triggerAutoSave();
        },

        undo() {
            const activeMap = this.activeMap;
            if (!activeMap || !activeMap.history || activeMap.historyIndex <= 0) return;
            activeMap.historyIndex--;
            const state = activeMap.history[activeMap.historyIndex];
            activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
            selectedItemIds = [];
            updateTrigger++;
            this.triggerAutoSave();
        },

        redo() {
            const activeMap = this.activeMap;
            if (!activeMap || !activeMap.history || activeMap.historyIndex >= activeMap.history.length - 1) return;
            activeMap.historyIndex++;
            const state = activeMap.history[activeMap.historyIndex];
            activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
            selectedItemIds = [];
            updateTrigger++;
            this.triggerAutoSave();
        },

        jumpToHistory(index) {
            const activeMap = this.activeMap;
            if (!activeMap || !activeMap.history || index < 0 || index >= activeMap.history.length) return;
            activeMap.historyIndex = index;
            const state = activeMap.history[index];
            activeMap.manifest = JSON.parse(JSON.stringify(state.snapshot));
            selectedItemIds = [];
            updateTrigger++;
            this.triggerAutoSave();
        },

        // --- ENTITY CREATION (Nested Schema) ---
        addGeometry(type, path, isBezier = false) {
            const activeMap = this.activeMap;
            if (!activeMap) return;
            const id = crypto.randomUUID();
            if (type === 'wall') {
                if (!activeMap.manifest.geometry.walls) activeMap.manifest.geometry.walls = [];
                activeMap.manifest.geometry.walls.push({ id, path, isBezier });
            } else if (type === 'portal') {
                if (!activeMap.manifest.geometry.portals) activeMap.manifest.geometry.portals = [];
                activeMap.manifest.geometry.portals.push({ id, path, isBezier, properties: { type: 'door', state: 'closed' } });
            } else if (type === 'roof') {
                if (!activeMap.manifest.geometry.overhead) activeMap.manifest.geometry.overhead = [];
                activeMap.manifest.geometry.overhead.push({ id, path });
            }
            selectedItemIds = [id];
            this.pushHistory(`Added ${type}`);
        },

        addLight(x, y) {
            const activeMap = this.activeMap;
            if (!activeMap) return;
            const light = {
                id: crypto.randomUUID(), 
                type: 'point', 
                position: {x, y, z: 0},
                properties: {
                    color: '#ffffff', 
                    intensity: 1.0,
                    decay_model: 'inverse_square',
                    radius: { bright: 5.0, dim: 10.0 },
                    animation: { profile: 'none', speed: 0.0, intensity_variance: 0.0 },
                    rotation: 0, 
                    cone_angle: 60
                }
            };
            if (!activeMap.manifest.entities.lights) activeMap.manifest.entities.lights = [];
            activeMap.manifest.entities.lights.push(light);
            selectedItemIds = [light.id];
            this.pushHistory("Added Light");
        },

        addSpawn(x, y) {
            const activeMap = this.activeMap;
            if (!activeMap) return;
            const spawn = { id: crypto.randomUUID(), coordinates: [x, y], name: 'New Spawn', shape: 'circle', is_default: false };
            if (!activeMap.manifest.entities.landing_zones) activeMap.manifest.entities.landing_zones = [];
            activeMap.manifest.entities.landing_zones.push(spawn);
            selectedItemIds = [spawn.id];
            this.pushHistory("Added Spawn");
        },

        addEvent(x, y) {
            const activeMap = this.activeMap;
            if (!activeMap) return;
            const event = {
                id: crypto.randomUUID(), name: 'New Event', eventType: 'Trap/Door Trigger', targetSpawnId: null,
                trigger_bounds: { center: {x, y}, radius: 0.5 }
            };
            if (!activeMap.manifest.entities.events) activeMap.manifest.entities.events = [];
            activeMap.manifest.entities.events.push(event);
            selectedItemIds = [event.id];
            this.pushHistory("Added Event");
        },

        addAudio(x, y) {
            const activeMap = this.activeMap;
            if (!activeMap) return;
            const audio = { 
                id: crypto.randomUUID(), center: {x, y}, radius: 5, inner_radius: 2.5,
                volume: 100, muffledByWalls: true, track: "" 
            };
            if (!activeMap.manifest.entities.audio) activeMap.manifest.entities.audio = { zones: [] };
            if (!activeMap.manifest.entities.audio.zones) activeMap.manifest.entities.audio.zones = [];
            activeMap.manifest.entities.audio.zones.push(audio);
            selectedItemIds = [audio.id];
            this.pushHistory("Added Audio Zone");
        },

        addEmitter(x, y) {
            const activeMap = this.activeMap;
            if (!activeMap) return;
            const emitter = { 
                id: crypto.randomUUID(), 
                position: {x, y, z: 0}, 
                type: 'weather', style: 'rain',
                isGlobal: false, layering: 'above', tint: '#ffffff', scale: 100,
                direction: 180, speed: 50, intensity: 50, variance: 10, graphic: ''
            };
            if (!activeMap.manifest.entities.emitters) activeMap.manifest.entities.emitters = [];
            activeMap.manifest.entities.emitters.push(emitter);
            selectedItemIds = [emitter.id];
            this.pushHistory("Added Emitter");
        },

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

            if (id === activeMapId) {
                 let obj = m;
                 const keys = keyPath.split('.');
                 for (let i = 0; i < keys.length - 1; i++) {
                     if (!obj[keys[i]]) obj[keys[i]] = {};
                     obj = obj[keys[i]];
                 }
                 obj[keys[keys.length - 1]] = value;
                 this.pushHistory("Modified Map Settings");
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
                for (const cat of ['lights', 'landing_zones', 'events', 'emitters']) {
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
            }
        },

        updateNodePosition(id, exactX, exactY, dx, dy) {
            const activeMap = this.activeMap;
            if (!activeMap) return;
            const m = activeMap.manifest;
            
            ['walls', 'portals', 'overhead'].forEach(cat => {
                const item = m.geometry[cat]?.find(i => i.id === id);
                if (item && item.path) item.path.forEach(pt => { pt.x = Number(pt.x) + dx; pt.y = Number(pt.y) + dy; });
            });

            const light = m.entities.lights?.find(i => i.id === id);
            if (light && light.position) { light.position.x += dx; light.position.y += dy; }
            
            const spawn = m.entities.landing_zones?.find(i => i.id === id);
            if (spawn && spawn.coordinates) { spawn.coordinates[0] += dx; spawn.coordinates[1] += dy; }
            
            const evt = m.entities.events?.find(i => i.id === id);
            if (evt && evt.trigger_bounds?.center) { evt.trigger_bounds.center.x += dx; evt.trigger_bounds.center.y += dy; }
            
            const aud = m.entities.audio?.zones?.find(i => i.id === id);
            if (aud && aud.center) { aud.center.x += dx; aud.center.y += dy; }
            
            const em = m.entities.emitters?.find(i => i.id === id);
            if (em && em.position) { em.position.x += dx; em.position.y += dy; }

            this.pushHistory("Moved Item");
        },

        translateSelection(dx, dy) {
            const activeMap = this.activeMap;
            if (!activeMap || selectedItemIds.length === 0) return;
            const m = activeMap.manifest;
            selectedItemIds.forEach(id => {
                ['walls', 'portals'].forEach(cat => {
                    const item = m.geometry[cat]?.find(i => i.id === id);
                    if (item && item.path) {
                        item.path.forEach(pt => { pt.x += dx; pt.y += dy; });
                    }
                });
                ['lights', 'landing_zones', 'events', 'emitters'].forEach(cat => {
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
        },

        deleteSelected() {
            const activeMap = this.activeMap;
            if (!activeMap || selectedItemIds.length === 0) return;
            const m = activeMap.manifest;

            const removeById = (arr) => {
                if (!Array.isArray(arr)) return;
                for (let i = arr.length - 1; i >= 0; i--) {
                    if (selectedItemIds.includes(arr[i].id)) {
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
                if (m.entities.audio) {
                    removeById(m.entities.audio.zones);
                }
            }

            selectedItemIds = [];
            this.pushHistory("Deleted Selection");
            updateTrigger++;
        },

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
            }
        },

        smoothSelectedWalls() {
            const activeMap = this.activeMap;
            if (!activeMap || selectedItemIds.length === 0) return;
            const m = activeMap.manifest;
            selectedItemIds.forEach(id => {
                const wall = m.geometry.walls?.find(i => i.id === id);
                if (wall && wall.path.length > 2) {
                    wall.path = pointsToBezier(wall.path);
                    wall.isBezier = true; 
                }
            });
            this.pushHistory("Smoothed Spline");
        },

        copySelected() {
            const activeMap = this.activeMap;
            if (!activeMap || selectedItemIds.length === 0) return;
            const m = activeMap.manifest;
            clipboard = [];
            selectedItemIds.forEach(id => {
                ['walls', 'portals', 'overhead'].forEach(cat => {
                    const item = m.geometry[cat]?.find(i => i.id === id);
                    if (item) clipboard.push({ category: cat, data: JSON.parse(JSON.stringify(item)), group: 'geometry' });
                });
                ['lights', 'landing_zones', 'events', 'emitters'].forEach(cat => {
                    const item = m.entities[cat]?.find(i => i.id === id);
                    if (item) clipboard.push({ category: cat, data: JSON.parse(JSON.stringify(item)), group: 'entities' });
                });
                const aud = m.entities.audio?.zones?.find(i => i.id === id);
                if (aud) clipboard.push({ category: 'zones', data: JSON.parse(JSON.stringify(aud)), group: 'audio' });
            });
        },

        pasteClipboard(x, y) {
            const activeMap = this.activeMap;
            if (!activeMap || clipboard.length === 0) return;
            const m = activeMap.manifest;
            const newSelection = [];
            const offset = 0.5;

            clipboard.forEach(clip => {
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
            selectedItemIds = newSelection;
            this.pushHistory("Pasted Items");
        },

        duplicateSelected() {
            this.copySelected();
            this.pasteClipboard(0, 0);
        }
    };
}