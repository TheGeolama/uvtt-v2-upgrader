import JSZip from 'jszip';
import { verifyAndCleanManifest } from './schema.js';

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

export function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(filename, blob);
}

/**
 * FULL UVTT V2 COMPILE PIPELINE
 * Dynamically converts the In-Memory Normalized Model into the strict, official schemas.
 */
export async function buildUVTT2Archive(catalog, audioBlobs = {}) {
    const zip = new JSZip();
    const mapCatalogIndex = [];

    // Loop through the catalog to build map files
    for (let i = 0; i < catalog.length; i++) {
        const mapDef = catalog[i];
        const m = mapDef.manifest;
        const slug = mapDef.filename ? mapDef.filename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : `map-${i}`;

        // Add to Global Manifest Index
        mapCatalogIndex.push({
            id: mapDef.id,
            name: mapDef.filename,
            slug: slug,
            path: `maps/${slug}/`,
            z_index: i
        });

        // ----------------------------------------------------
        // 1. BUILD GEOMETRY.JSON (Strict SVG Path Translations)
        // ----------------------------------------------------
        const geometryPayload = {
            format_version: "2.0.0",
            resolution: {
                map_origin: { x: 0.0, y: 0.0 },
                grid_size: { x: m.resolution?.pixels_per_grid || 70, y: m.resolution?.pixels_per_grid || 70 },
                units_per_grid: 5.0,
                unit_name: "ft",
                topology: { type: "square", orientation: "flat_top", offset: "odd_row" }
            },
            geometry: { walls: [], portals: [], overhead: [] }
        };

        (m.geometry?.walls || []).forEach(w => {
            const svgPath = [];
            w.path.forEach((pt, idx) => {
                if (idx === 0) {
                    svgPath.push({ type: "move", x: pt.x, y: pt.y });
                } else if (pt.cp1 && pt.cp2) {
                    svgPath.push({ type: "bezier", cp1: { x: pt.cp1.x, y: pt.cp1.y }, cp2: { x: pt.cp2.x, y: pt.cp2.y }, to: { x: pt.x, y: pt.y } });
                } else {
                    svgPath.push({ type: "line", x: pt.x, y: pt.y });
                }
            });

            geometryPayload.geometry.walls.push({
                id: w.id,
                type: w.properties?.type || "standard",
                height: { bottom: w.properties?.bottom ?? 0.0, top: w.properties?.top ?? 10.0 }, // 3D Compliance
                directional_blocks: {
                    left_to_right: ["light", "sight", "movement"], 
                    right_to_left: ["light", "sight", "movement"]
                },
                path: svgPath,
                states: { ethereal: false, disbelieved_by: [] }
            });
        });

        (m.geometry?.portals || []).forEach(p => {
            if (!p.path || p.path.length < 2) return;
            // Map our 'secret' enum to the strict 'secret_door'
            const officialType = p.properties?.type === "secret" ? "secret_door" : (p.properties?.type || "door");
            
            geometryPayload.geometry.portals.push({
                id: p.id,
                type: officialType,
                state: p.properties?.state || "closed",
                height: { bottom: p.properties?.bottom ?? 0.0, top: p.properties?.top ?? 10.0 },
                blocks: ["light", "sight", "movement"],
                line: {
                    p1: { x: p.path[0].x, y: p.path[0].y },
                    p2: { x: p.path[1].x, y: p.path[1].y }
                },
                permeability: { weather_particles: false, audio_muffling: 1.0 }
            });
        });

        (m.geometry?.overhead || []).forEach(r => {
            geometryPayload.geometry.overhead.push({
                id: r.id,
                type: "roof",
                height: { bottom: r.properties?.bottom ?? 10.0, top: r.properties?.top ?? 20.0 },
                polygon: r.path.map(pt => ({ x: pt.x, y: pt.y })),
                image: { uri: "" }
            });
        });

        // ----------------------------------------------------
        // 2. BUILD ENTITIES.JSON (Property Flattening & URI Routing)
        // ----------------------------------------------------
        const entitiesPayload = {
            format_version: "2.0.0",
            lights: [],
            landing_zones: [],
            events: [],
            audio: { zones: [] },
            emitters: [],
            props: [] // FIX: Ensured props array exists for the archive
        };

        (m.entities?.lights || []).forEach(l => {
            const lightObj = {
                id: l.id,
                type: l.type || "point",
                position: { x: l.position.x, y: l.position.y, z: l.position.z || 0.0 },
                color: l.properties?.color || "#ffffff",
                bright_radius: l.properties?.radius?.bright || 5.0,
                dim_radius: l.properties?.radius?.dim || 10.0,
                decay: l.properties?.decay_model || "inverse_square"
            };
            if (l.type === "directional") {
                lightObj.cone = { rotation: l.properties?.rotation || 0.0, arc: l.properties?.cone_angle || 60.0 };
            }
            if (l.properties?.animation?.profile && l.properties.animation.profile !== "none") {
                lightObj.animation = {
                    type: l.properties.animation.profile,
                    speed: l.properties.animation.speed || 1.0,
                    intensity_variance: l.properties.animation.intensity_variance || 0.2
                };
            }
            entitiesPayload.lights.push(lightObj);
        });

        (m.entities?.landing_zones || []).forEach(lz => {
            entitiesPayload.landing_zones.push({
                id: lz.id,
                name: lz.name || "Spawn Point",
                is_default: lz.is_default || false,
                coordinates: [lz.coordinates[0], lz.coordinates[1]],
                heading_degrees: lz.heading_degrees ?? 0.0, // Forced compliance
                properties: { description: "", camera_zoom_level: 1.0 }
            });
        });

        (m.entities?.events || []).forEach(ev => {
            const isTeleport = ev.eventType === "Teleport" || ev.eventType === "Stairs/Ladder";
            
            const eventObj = {
                id: ev.id,
                type: isTeleport ? "teleport" : "trap",
                trigger_bounds: {
                    shape: "rectangle",
                    center: { x: ev.trigger_bounds?.center?.x || 0.0, y: ev.trigger_bounds?.center?.y || 0.0 },
                    width: ev.trigger_bounds?.width || 1.0,
                    height: ev.trigger_bounds?.height || 1.0
                },
                conditions: {
                    requires_interaction: ev.activation === "interaction",
                    allowed_modes: ["walking", "running"]
                }
            };

            // URI Topological Routing Math
            if (isTeleport) {
                let destType = "intra_map";
                let targetSlug = slug;
                let extension = "";

                if (ev.targetFloorId && ev.targetFloorId !== mapDef.id) {
                    const targetMap = catalog.find(cm => cm.id === ev.targetFloorId);
                    if (targetMap) {
                        targetSlug = targetMap.filename ? targetMap.filename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : `map-${targetMap.id}`;
                        destType = "inter_map";
                        extension = ".uvtt2z"; 
                    }
                }

                const protocol = destType === "inter_map" ? "relative://" : "internal://";

                eventObj.destination = {
                    type: destType,
                    uri: `${protocol}${targetSlug}${extension}#${ev.targetSpawnId}`,
                    fade_transition: "crossfade_black",
                    prediction_trigger_radius: 2.0
                };
            }
            entitiesPayload.events.push(eventObj);
        });

        (m.entities?.audio?.zones || []).forEach(az => {
            entitiesPayload.audio.zones.push({
                id: az.id,
                shape: "circle",
                center: { x: az.center.x, y: az.center.y },
                radius: az.inner_radius || 2.5,     // Engine inner maps to spec core radius
                fade_radius: az.radius || 5.0,      // Engine max fade maps to spec fade_radius
                volume_max: (az.volume || 100) / 100.0,
                audio_uri: az.track ? `assets/audio/${az.track}` : "",
                muffled_by_geometry: az.muffledByWalls ?? true // Spec Patch: Acoustic Occlusion
            });
        });

        (m.entities?.emitters || []).forEach(em => {
            const emitterObj = {
                id: em.id,
                type: em.type === "weather" ? (em.style || "rain") : em.type,
                is_global: em.isGlobal || false, // Spec Patch: Global Overrides
                properties: {
                    intensity: (em.intensity || 50) / 100.0,
                    speed: em.speed || 50.0,
                    angle: em.direction || 180.0,
                    color: em.tint || "#ffffff",
                    render_layer: em.layering === "above" ? "above_overhead" : "below_overhead" // Spec Patch: Z-Index Layering
                }
            };
            
            // If it isn't global, we supply the mandatory bounds
            if (!em.isGlobal) {
                emitterObj.bounds = { shape: "circle", points: [] }; // simplified bounding box
            }
            
            entitiesPayload.emitters.push(emitterObj);
        });

        // FIX: Inject Props into the Archive
        (m.entities?.props || []).forEach(prop => {
            entitiesPayload.props.push({
                id: prop.id,
                name: prop.name || "Prop",
                image: prop.image || "",
                position: { 
                    x: prop.position?.x || 0.0, 
                    y: prop.position?.y || 0.0, 
                    z: prop.position?.z || 0.0 
                },
                rotation: Number(prop.rotation) || 0.0,
                scale: Number(prop.scale) || 100.0,
                properties: {
                    visibility: prop.properties?.visibility || 'visible'
                }
            });
        });

        // Write map data into Zip layout
        zip.file(`maps/${slug}/geometry.json`, JSON.stringify(geometryPayload, null, 2));
        zip.file(`maps/${slug}/entities.json`, JSON.stringify(entitiesPayload, null, 2));
    }

    // ----------------------------------------------------
    // 3. BUILD GLOBAL MANIFEST.JSON
    // ----------------------------------------------------
    const globalManifest = {
        format_version: "2.0.0",
        uvtt_version: "2.0.0",
        campaign_name: "Exported UVTT v2 Campaign",
        author: "UVTT v2 Compiler",
        hardware_profile: {
            minimum_pipeline: "webgl2",
            recommended_pipeline: "webgpu",
            requires_compute_shaders: false
        },
        environment: { global_wind: { speed: 5.0, angle: 45.0, gust_variance: 0.15 } },
        map_catalog: mapCatalogIndex
    };

    zip.file("manifest.json", JSON.stringify(globalManifest, null, 2));

    // Append localized Audio Files into the correct directory
    for (const [trackName, blob] of Object.entries(audioBlobs)) {
        zip.file(`assets/audio/${trackName}`, blob);
    }

    // ----------------------------------------------------
    // 4. GENERATE SECURE RECEIPT (manifest.hash)
    // ----------------------------------------------------
    const fileHashes = [];
    if (window.crypto && window.crypto.subtle) {
        for (const relativePath in zip.files) {
            if (!zip.files[relativePath].dir) {
                try {
                    const fileData = await zip.file(relativePath).async("uint8array");
                    const hashBuffer = await window.crypto.subtle.digest('SHA-256', fileData);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    fileHashes.push(`${relativePath}:${hashHex}`);
                } catch (e) {
                    console.warn(`Failed to hash ${relativePath}`, e);
                }
            }
        }
    } else {
        fileHashes.push("# SECURITY WARNING: Client lacked HTTPS/WebCrypto API to hash files.");
    }
    
    zip.file("manifest.hash", fileHashes.join("\n"));

    return zip.generateAsync({ type: "blob" });
}

// ----------------------------------------------------
// NATIVE .UVTT2A COMPOUND ASSET PIPELINE
// ----------------------------------------------------
export async function exportAssetPackage(assetName, payload, audioBlobs) {
    const zip = new JSZip();
    
    // De-embed base64 graphics to keep JSON lightweight
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
    
    // Bundle any attached local audio blobs
    if (payload.auto_emits?.audio) {
        for (const az of payload.auto_emits.audio) {
            if (az.track && audioBlobs[az.track]) {
                zip.file(`audio/${az.track}`, audioBlobs[az.track]);
            }
        }
    }
    
    zip.file("asset.json", JSON.stringify(payload, null, 2));
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`${assetName.replace(/[^a-z0-9]/gi, '_')}.uvtt2a`, zipBlob);
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
        
        // Re-hydrate the graphic blob back into a base64 Data URL for the canvas
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

        // Extract localized audio back into independent blobs
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

export async function saveProject(store) {
    const projectData = {
        catalog: store.catalog,
        activeMapId: store.activeMapId
    };
    
    const defaultFilename = `${store.activeMap?.filename || 'My_Project'}.uvtt-proj`;

    // 1. Native OS Hook (Desktop Pro build via Wails)
    if (typeof window !== 'undefined' && window.go?.main?.App?.SaveProject) {
        try {
            const payloadString = JSON.stringify(projectData);
            const savedPath = await window.go.main.App.SaveProject(payloadString, defaultFilename);
            if (savedPath) {
                console.log(`Successfully saved project natively to: ${savedPath}`);
                return; // Early return, OS handled the file write completely
            }
        } catch (err) {
            console.error("Native OS Save Dialog was canceled or failed:", err);
            // If the user simply closed the dialog, we shouldn't force a browser download.
            return;
        }
    }

    // 2. Legacy Browser Fallback (If not running in the Wails wrapper)
    downloadJSON(defaultFilename, projectData);
}

export function exportVTT(store) {
    if (!store.activeMap) return;
    const cleanManifest = verifyAndCleanManifest(store.activeMap.manifest);
    downloadJSON(`${store.activeMap.filename || 'export'}.uvtt`, cleanManifest);
}

export function exportLegacyV1(store) {
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
    downloadJSON(`${store.activeMap.filename || 'export'}_v1_legacy.uvtt`, cleanManifest);
}

export function exportCompoundVTT(store, isLegacy = false) {
    if (store.catalog.length === 0) return;
    const compoundManifest = {
        type: "compound_dungeon",
        export_version: isLegacy ? 1 : 2,
        levels: []
    };

    store.catalog.forEach(mapDef => {
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

    downloadJSON(`Compound_Dungeon_${isLegacy ? 'v1' : 'v2'}.uvtt`, compoundManifest);
}

export async function exportSecureVTT(store, isCompound = false) {
    try {
        if (!window.crypto || !window.crypto.subtle) {
            alert("SECURITY ERROR: The Web Crypto API requires a Secure Context. You must view this page via HTTPS or 'localhost'.");
            return;
        }

        if (!store.activeMap && !isCompound) return;
        if (isCompound && store.catalog.length === 0) return;

        const baseName = isCompound ? 'Compound_Dungeon' : (store.activeMap.filename || 'export');
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

        const deliveryBuffer = await deliveryZip.generateAsync({ type: "blob" });
        downloadBlob(`${baseName}_Secure_Export.zip`, deliveryBuffer);

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