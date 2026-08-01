/**
 * @fileoverview Universal VTT (UVTT) Input/Output Engine
 * Handles the compilation, ingestion, and encryption of map manifests and compound assets.
 * Adheres to Draft-08 of the Universal VTT schema specifications.
 */

import JSZip from 'jszip';
import { verifyAndCleanManifest } from './schema.js';
import { translatePathToSvg } from './svgTranslator.js';
import { slugify, buildEventDestination } from './uriRouter.js';

// ----------------------------------------------------
// THE UNIVERSAL TRANSPORT ADAPTER
// Bridges SPA and Desktop environments to prevent Runtime Leakage.
// ----------------------------------------------------
const Transport = {
    get isWails() { return typeof window !== 'undefined' && window.go?.main?.App; },
    get isLocalServer() { return typeof window !== 'undefined' && window.__SPA_SERVER_MODE__; },

    async invoke(methodName, ...args) {
        if (this.isWails && window.go.main.App[methodName]) {
            return await window.go.main.App[methodName](...args);
        }
        if (this.isLocalServer) {
            try {
                const res = await fetch(`/api/${methodName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ args })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (e) {
                console.warn(`SPA REST Fallback failed for ${methodName}`, e);
                throw e;
            }
        }
        throw new Error("No high-performance backend transport available.");
    }
};

// ----------------------------------------------------
// CORE FILE SYSTEM HANDLERS
// ----------------------------------------------------

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

export async function saveAsNative(blob, defaultFilename, description, extension) {
    try {
        const transferId = await Transport.invoke('StartSaveTransfer', defaultFilename, description, `*${extension}`);
        if (!transferId) return; 

        const chunkSize = 1024 * 1024; 
        for (let i = 0; i < blob.size; i += chunkSize) {
            const chunk = blob.slice(i, i + chunkSize);
            const b64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(chunk);
            });
            await Transport.invoke('AppendSaveTransfer', transferId, b64);
        }

        await Transport.invoke('FinishSaveTransfer', transferId);
        console.log(`Successfully saved natively to: ${transferId}`);
        return;
    } catch (err) {
        console.warn("Backend transport unavailable. Engaging HTML5 sandboxed fallbacks...");
    }

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
            console.warn("showSaveFilePicker failed (likely Firefox/Safari constraint). Falling back to Blob download.", err);
        }
    }
    
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
    const referencedAudio = new Set(); 

    const rootManifest = {
        format_version: "2.0.0",
        uvtt_version: "2.0.0",
        campaign_name: store.catalog.length > 1 ? "Complex Dungeon Export" : "UVTT v2 Export",
        hardware_profile: {
            minimum_pipeline: "webgl2",
            recommended_pipeline: "webgpu",
            requires_compute_shaders: false
        },
        map_catalog: []
    };

    // THE FIX: DRAFT-08 SPECIFICATION UPGRADE
    // Initialize empty dictionaries so data can be strictly keyed by Map ID.
    const keyedGeometry = {};
    const keyedEntities = {};

    for (let i = 0; i < store.catalog.length; i++) {
        const mapDef = store.catalog[i];
        const safeSlug = slugify(mapDef.filename || `level-${i + 1}`);
        const m = mapDef.manifest;

        if (m.entities?.audio?.zones) {
            m.entities.audio.zones.forEach(az => {
                if (az.track) referencedAudio.add(az.track);
            });
        }

        const sourceData = mapDef.imageUrl || m.image;
        let finalImagePath = "";
        
        if (sourceData) {
            try {
                const res = await fetch(sourceData);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const originalBlob = await res.blob();

                let finalBlob = originalBlob;
                let ext = 'png';
                if (originalBlob.type === 'image/jpeg') ext = 'jpg';
                if (originalBlob.type === 'image/webp') ext = 'webp';

                try {
                    const img = new Image();
                    const blobUrl = URL.createObjectURL(originalBlob);
                    
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = blobUrl;
                    });

                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(blobUrl);

                    const webpBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.95));
                    if (webpBlob) {
                        finalBlob = webpBlob;
                        ext = 'webp';
                    }
                } catch (transcodeErr) {
                    console.warn(`WebP transcode failed. Falling back to source format.`, transcodeErr);
                }

                finalImagePath = `assets/maps/${safeSlug}_basemap.${ext}`;
                zip.file(finalImagePath, finalBlob);
                
            } catch (e) {
                console.error(`Failed to process map image for ${safeSlug}`, e);
            }
        }

        rootManifest.map_catalog.push({
            id: mapDef.id,
            name: mapDef.filename || `Level ${i + 1}`,
            slug: safeSlug,
            path: "", 
            z_index: i,
            image: finalImagePath
        });

        // Initialize the dictionary keys for this specific map ID
        keyedGeometry[mapDef.id] = {
            resolution: m.resolution || { pixels_per_grid: 70 },
            walls: [],
            portals: [],
            overhead: []
        };

        keyedEntities[mapDef.id] = {
            lights: [],
            landing_zones: [],
            events: [],
            emitters: [],
            props: [],
            audio: { zones: [] }
        };

        if (m.geometry) {
            (m.geometry.walls || []).forEach(w => keyedGeometry[mapDef.id].walls.push({
                ...w, path: translatePathToSvg(w.path, w.isBezier)
            }));
            (m.geometry.portals || []).forEach(p => keyedGeometry[mapDef.id].portals.push({
                ...p, 
                type: p.properties?.type === "secret" ? "secret_door" : (p.properties?.type || "door"),
                path: translatePathToSvg(p.path, p.isBezier)
            }));
            (m.geometry.overhead || []).forEach(o => keyedGeometry[mapDef.id].overhead.push({
                ...o, path: translatePathToSvg(o.path, o.isBezier)
            }));
        }

        if (m.entities) {
            (m.entities.lights || []).forEach(l => keyedEntities[mapDef.id].lights.push({ ...l }));
            (m.entities.landing_zones || []).forEach(lz => keyedEntities[mapDef.id].landing_zones.push({ ...lz }));
            (m.entities.events || []).forEach(e => keyedEntities[mapDef.id].events.push({
                ...e, 
                type: e.eventType === "Teleport" ? "teleport" : "trigger",
                destination: buildEventDestination(e, store.catalog, mapDef.id)
            }));
            (m.entities.audio?.zones || []).forEach(az => keyedEntities[mapDef.id].audio.zones.push({ ...az }));
            (m.entities.emitters || []).forEach(em => keyedEntities[mapDef.id].emitters.push({ ...em }));
            (m.entities.props || []).forEach(pr => keyedEntities[mapDef.id].props.push({ ...pr }));
        }
    }

    zip.file("geometry.json", JSON.stringify(keyedGeometry, null, 2));
    zip.file("entities.json", JSON.stringify(keyedEntities, null, 2));
    zip.file("manifest.json", JSON.stringify(rootManifest, null, 2));

    if (store.audioBlobs) {
        for (const trackName of referencedAudio) {
            if (store.audioBlobs[trackName]) {
                zip.file(`assets/audio/${trackName}`, store.audioBlobs[trackName]);
            }
        }
    }

    try {
        const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        const finalFilename = store.catalog.length > 1 ? "Complex_Dungeon_Export.uvtt2z" : `${rootManifest.map_catalog[0].slug}.uvtt2z`;
        await saveAsNative(content, finalFilename, "UVTT v2 Archive", ".uvtt2z");
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
        try {
            const res = await fetch(payload.image);
            const originalBlob = await res.blob();
            
            let ext = 'png';
            if (originalBlob.type === 'image/jpeg') ext = 'jpg';
            if (originalBlob.type === 'image/webp') ext = 'webp';
            
            zip.file(`image.${ext}`, originalBlob);
            payload.image = `image.${ext}`; 
        } catch (err) {
            console.error("Failed to parse asset image:", err);
        }
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
        
        if (payload.image && !payload.image.startsWith('http') && !payload.image.startsWith('data:image') && !payload.image.startsWith('blob:')) {
            const imgFile = zip.file(payload.image);
            if (imgFile) {
                const blob = await imgFile.async("blob");
                payload.image = URL.createObjectURL(blob);
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

    try {
        const payloadString = JSON.stringify(projectData);
        const savedPath = await Transport.invoke('SaveProject', payloadString, defaultFilename);
        if (savedPath) {
            console.log(`Successfully saved project natively to: ${savedPath}`);
            return; 
        }
    } catch (err) {
        // Fallback to HTML5 Blob download via saveAsNative
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

        let transferId = null;
        let useFallback = false;

        try {
            transferId = await Transport.invoke('StartSaveTransfer', defaultFilename, "Secure ZIP Archive", "*.zip");
            if (!transferId) return; 
        } catch(err) {
            useFallback = true;
        }

        const internalZip = new JSZip();

        const bundleMapImage = async (mapDef, manifestToUpdate) => {
            const sourceData = mapDef.imageUrl || mapDef.manifest.image;
            if (!sourceData) return;

            try {
                const res = await fetch(sourceData);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const originalBlob = await res.blob();

                let finalBlob = originalBlob;
                let ext = 'png';
                if (originalBlob.type === 'image/jpeg') ext = 'jpg';
                if (originalBlob.type === 'image/webp') ext = 'webp';

                try {
                    const img = new Image();
                    const blobUrl = URL.createObjectURL(originalBlob);
                    
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = blobUrl;
                    });

                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(blobUrl);

                    const webpBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.95));
                    if (webpBlob) {
                        finalBlob = webpBlob;
                        ext = 'webp';
                    }
                } catch (transcodeErr) {
                    console.warn(`WebP transcode failed. Falling back to source format.`, transcodeErr);
                }

                const filename = `map_${mapDef.id}.${ext}`;
                internalZip.file(`assets/maps/${filename}`, finalBlob);
                manifestToUpdate.image = `assets/maps/${filename}`;

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
                await Transport.invoke('AppendSaveTransfer', transferId, b64);
            }
            await Transport.invoke('FinishSaveTransfer', transferId);
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