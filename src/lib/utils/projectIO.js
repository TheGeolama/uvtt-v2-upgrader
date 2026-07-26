/**
 * @fileoverview Universal VTT (UVTT) Input/Output Engine
 * Handles the compilation, ingestion, and encryption of map manifests and compound assets.
 * Adheres to Draft-07 of the Universal VTT schema specifications.
 */

import JSZip from 'jszip';
import { verifyAndCleanManifest } from './schema.js';
import { translatePathToSvg } from './svgTranslator.js';
import { slugify, buildEventDestination } from './uriRouter.js';

export function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); 
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000); 
}

/**
 * Native OS Save Dialog Handler with Chunked Streaming.
 * Slices large files into 1MB chunks to prevent Wails IPC out-of-memory crashes.
 */
export async function saveAsNative(blob, defaultFilename, description, extension) {
    // 1. Wails Native Go Bridge - CHUNKED STREAMING
    if (typeof window !== 'undefined' && window.go?.main?.App?.StartSaveTransfer) {
        try {
            // A. Open Dialog & Get File Handle ID
            const transferId = await window.go.main.App.StartSaveTransfer(defaultFilename, description, `*${extension}`);
            if (!transferId) return; // User clicked Cancel

            // B. Stream the file in 1MB chunks
            const chunkSize = 1024 * 1024; // 1 Megabyte
            for (let i = 0; i < blob.size; i += chunkSize) {
                const chunk = blob.slice(i, i + chunkSize);
                
                // Convert just the small chunk to Base64
                const b64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(chunk);
                });
                
                // Send chunk to Go Backend
                await window.go.main.App.AppendSaveTransfer(transferId, b64);
            }

            // C. Close the file stream
            await window.go.main.App.FinishSaveTransfer(transferId);
            console.log(`Successfully saved natively to: ${transferId}`);
            return;

        } catch (err) {
            console.error("Native chunked save failed, attempting fallbacks...", err);
        }
    }

    // 2. Browser File System Access API
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultFilename,
                types: [{ description: description, accept: { '*/*': [extension] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }
    
    // 3. Fallback Download
    downloadBlob(defaultFilename, blob);
}

export function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveAsNative(blob, filename, 'JSON File', '.json');
}

// ----------------------------------------------------
// FULL UVTT V2 COMPILE PIPELINE (The .uvtt2z Packager)
// ----------------------------------------------------

export async function exportCompoundVTT(store) {
    if (!store || !store.catalog || store.catalog.length === 0) {
        alert("No maps to export!");
        return;
    }

    const zip = new JSZip();

    const rootManifest = {
        format_version: "2.0.0",
        uvtt_version: "2.0.0",
        campaign_name: "UVTT v2 Campaign Export",
        hardware_profile: {
            minimum_pipeline: "webgl2",
            recommended_pipeline: "webgpu",
            requires_compute_shaders: false
        },
        map_catalog: []
    };

    const mapsFolder = zip.folder("maps");

    for (let i = 0; i < store.catalog.length; i++) {
        const mapDef = store.catalog[i];
        const safeSlug = slugify(mapDef.filename || `level-${i + 1}`);
        
        rootManifest.map_catalog.push({
            id: mapDef.id,
            name: mapDef.filename || `Level ${i + 1}`,
            slug: safeSlug,
            path: `maps/${safeSlug}/`,
            z_index: i
        });

        const levelFolder = mapsFolder.folder(safeSlug);
        const m = mapDef.manifest;

        const geometryPayload = {
            format_version: "2.0.0",
            resolution: m.resolution,
            geometry: {
                walls: (m.geometry.walls || []).map(w => ({
                    id: w.id,
                    type: w.properties?.type || "standard",
                    height: w.height, 
                    path: translatePathToSvg(w.path, w.isBezier),
                    directional_blocks: w.directional_blocks || { left_to_right: [], right_to_left: [] },
                    properties: w.properties
                })),
                portals: (m.geometry.portals || []).map(p => {
                    const officialType = p.properties?.type === "secret" ? "secret_door" : (p.properties?.type || "door");
                    return {
                        id: p.id,
                        type: officialType,
                        sub_type: p.properties?.sub_type || "standard",
                        state: p.properties?.state || "closed",
                        height: p.height,
                        path: translatePathToSvg(p.path, p.isBezier),
                        properties: p.properties
                    };
                }),
                overhead: (m.geometry.overhead || []).map(o => ({
                    id: o.id,
                    type: "roof",
                    height: o.height,
                    path: translatePathToSvg(o.path, o.isBezier),
                    properties: o.properties
                }))
            }
        };
        levelFolder.file("geometry.json", JSON.stringify(geometryPayload, null, 2));

        const entitiesPayload = {
            format_version: "2.0.0",
            lights: m.entities.lights || [],
            landing_zones: m.entities.landing_zones || [],
            events: (m.entities.events || []).map(e => ({
                id: e.id,
                name: e.name || "Trigger Event",
                type: e.eventType === "Teleport" ? "teleport" : "trigger",
                trigger_bounds: e.trigger_bounds,
                destination: buildEventDestination(e, store.catalog, mapDef.id),
                properties: e.properties
            })),
            audio: m.entities.audio || { zones: [] },
            emitters: m.entities.emitters || [],
            props: m.entities.props || []
        };
        levelFolder.file("entities.json", JSON.stringify(entitiesPayload, null, 2));
    }

    zip.file("manifest.json", JSON.stringify(rootManifest, null, 2));

    try {
        const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        await saveAsNative(content, "campaign_export.uvtt2z", "UVTT v2 Archive", ".uvtt2z");
    } catch (err) {
        console.error("Failed to compile .uvtt2z archive:", err);
        alert("Export failed. Check console for details.");
    }
}


// ----------------------------------------------------
// NATIVE .UVTT2A COMPOUND ASSET PIPELINE
// ----------------------------------------------------

export async function exportAssetPackage(assetName, payload, audioBlobs) {
    const zip = new JSZip();
    
    if (payload.image && payload.image.startsWith('data:image')) {
        const parts = payload.image.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const binary = atob(parts[1]);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        
        let ext = 'png';
        if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
        if (mime.includes('webp')) ext = 'webp';
        
        zip.file(`image.${ext}`, array);
        payload.image = `image.${ext}`; 
    }
    
    if (payload.auto_emits?.audio) {
        for (const az of payload.auto_emits.audio) {
            if (az.track && audioBlobs[az.track]) {
                zip.file(`audio/${az.track}`, audioBlobs[az.track]);
            }
        }
    }
    
    zip.file("asset.json", JSON.stringify(payload, null, 2));
    
    try {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const cleanName = assetName.replace(/[^a-z0-9]/gi, '_');
        await saveAsNative(zipBlob, `${cleanName}.uvtt2a`, "UVTT v2 Standalone Asset", ".uvtt2a");
    } catch (err) {
        console.error("Failed to pack asset:", err);
    }
}

export async function importAssetPackage(file) {
    try {
        const zip = await JSZip.loadAsync(file);
        const assetFile = zip.file("asset.json");
        if (!assetFile) {
            alert("Invalid UVTT2A package: missing asset.json payload.");
            return null;
        }
        
        const payload = JSON.parse(await assetFile.async("string"));
        const extractedAudio = {};
        
        if (payload.image && !payload.image.startsWith('http') && !payload.image.startsWith('data:image')) {
            const imgFile = zip.file(payload.image);
            if (imgFile) {
                const blob = await imgFile.async("blob");
                payload.image = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        }

        if (payload.auto_emits?.audio) {
            for (const az of payload.auto_emits.audio) {
                if (az.track) {
                    const af = zip.file(`audio/${az.track}`);
                    if (af) {
                        extractedAudio[az.track] = await af.async("blob");
                    }
                }
            }
        }
        
        return { payload, extractedAudio };
    } catch (err) {
        console.error("Error unpacking UVTT2A", err);
        alert("Failed to unpack compound asset package.");
        return null;
    }
}

// ----------------------------------------------------
// PROJECT SAVE & LOAD
// ----------------------------------------------------

export async function saveProject(store) {
    const projectData = {
        catalog: store.catalog,
        activeMapId: store.activeMapId
    };
    
    const defaultFilename = `${store.activeMap?.filename || 'My_Project'}.uvtt-proj`;

    if (typeof window !== 'undefined' && window.go?.main?.App?.SaveProject) {
        try {
            const payloadString = JSON.stringify(projectData);
            const savedPath = await window.go.main.App.SaveProject(payloadString, defaultFilename);
            if (savedPath) {
                console.log(`Successfully saved project natively to: ${savedPath}`);
                return; 
            }
        } catch (err) {
            console.error("Native OS Save Dialog was canceled or failed:", err);
            return;
        }
    }

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    await saveAsNative(blob, defaultFilename, "UVTT Project File", ".uvtt-proj");
}

// ----------------------------------------------------
// LEGACY & EXPORT WRAPPERS
// ----------------------------------------------------

export async function exportVTT(store) {
    if (!store.activeMap) return;
    const cleanManifest = verifyAndCleanManifest(store.activeMap.manifest);
    const blob = new Blob([JSON.stringify(cleanManifest, null, 2)], { type: 'application/json' });
    await saveAsNative(blob, `${store.activeMap.filename || 'export'}.uvtt`, "UVTT JSON Map", ".uvtt");
}

export async function exportLegacyV1(store) {
    if (!store.activeMap) return;
    const cleanManifest = verifyAndCleanManifest(store.activeMap.manifest);
    
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
    
    const blob = new Blob([JSON.stringify(cleanManifest, null, 2)], { type: 'application/json' });
    await saveAsNative(blob, `${store.activeMap.filename || 'export'}_v1_legacy.uvtt`, "Legacy V1 Map", ".uvtt");
}

// ----------------------------------------------------
// SECURE EXPORT & IMPORT (AES-GCM Encryption Pipeline)
// ----------------------------------------------------

export async function exportSecureVTT(store, isCompound = false) {
    try {
        if (!window.crypto || !window.crypto.subtle) {
            alert("SECURITY ERROR: The Web Crypto API requires a Secure Context. You must view this page via HTTPS or 'localhost'.");
            return;
        }

        if (!store.activeMap && !isCompound) return;
        if (isCompound && store.catalog.length === 0) return;

        const baseName = isCompound ? 'Compound_Dungeon' : (store.activeMap.filename || 'export');
        const defaultFilename = `${baseName}_Secure_Export.zip`;

        // 1. OPEN NATIVE DIALOG (Prevents memory build-up if user cancels)
        let transferId = null;
        let useFallback = false;

        if (typeof window !== 'undefined' && window.go?.main?.App?.StartSaveTransfer) {
            try {
                transferId = await window.go.main.App.StartSaveTransfer(defaultFilename, "Secure ZIP Archive", "*.zip");
                if (!transferId) return; // Cancelled
            } catch(err) {
                useFallback = true;
            }
        } else {
            useFallback = true;
        }

        const internalZip = new JSZip();

        const safeBase64ToBlob = (base64, mime) => {
            const binary = atob(base64);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
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
            for (const mapDef of store.catalog) {
                let levelManifest = verifyAndCleanManifest(mapDef.manifest);
                levelManifest.level_id = mapDef.id;
                levelManifest.level_name = mapDef.filename || "Unnamed Level";
                await bundleMapImage(mapDef, levelManifest);
                compoundManifest.levels.push(levelManifest);
            }
            internalZip.file("manifest.json", JSON.stringify(compoundManifest, null, 2));
        } else {
            const cleanManifest = verifyAndCleanManifest(store.activeMap.manifest);
            await bundleMapImage(store.activeMap, cleanManifest);
            internalZip.file("manifest.json", JSON.stringify(cleanManifest, null, 2));
        }
        
        if (Object.keys(store.audioBlobs).length > 0) {
            for (const [trackName, blob] of Object.entries(store.audioBlobs)) {
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
        const deliveryBlob = await deliveryZip.generateAsync({ type: "blob" });
        
        // 2. STREAM OR FALLBACK
        if (transferId) {
            const chunkSize = 1024 * 1024;
            for (let i = 0; i < deliveryBlob.size; i += chunkSize) {
                const chunk = deliveryBlob.slice(i, i + chunkSize);
                const b64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(chunk);
                });
                await window.go.main.App.AppendSaveTransfer(transferId, b64);
            }
            await window.go.main.App.FinishSaveTransfer(transferId);
            console.log(`Successfully saved secure export to: ${transferId}`);
        } else if (useFallback) {
            await saveAsNative(deliveryBlob, defaultFilename, "Secure ZIP Archive", ".zip");
        }

    } catch (error) {
        console.error("Secure Export Failed:", error);
        alert(`Export Failed: ${error.message}`);
    }
}

export async function loadProjectFromFile(store, file) {
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
                        manifest: verifyAndCleanManifest(level), 
                        imageUrl: restoredUrl
                    });
                }
            } else {
                const restoredUrl = await restoreImage(manifestData);
                newCatalog = [{
                    id: crypto.randomUUID(),
                    filename: file.name.replace('.zip', '').replace('_Secure_Export', ''),
                    manifest: verifyAndCleanManifest(manifestData), 
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
            store.audioBlobs = newAudioBlobs;

            store.catalog = newCatalog;
            store.activeMapId = newCatalog[0].id;
            store.selectedItemIds = [];
            store.initHistory();
            store.updateSpatialIndex();
            store.updateTrigger++;
            store.triggerAutoSave();
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
            store.catalog = projectData.catalog.map(mapDef => ({
                ...mapDef,
                manifest: verifyAndCleanManifest(mapDef.manifest)
            }));
            
            store.activeMapId = projectData.activeMapId;
            store.selectedItemIds = [];
            store.initHistory();
            store.updateSpatialIndex();
            store.updateTrigger++;
            store.triggerAutoSave();
        }
    } catch (e) {
        console.error("Failed to parse.", e);
    }
}

export async function extractDPI(file) {
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

export async function importImageAsMap(store, file) {
    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const detectedPpg = await extractDPI(file);
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
        store.appendLevel(newMap);
    } catch (err) {
        console.error("Failed to load image as map:", err);
        alert("Could not process image file.");
    }
}