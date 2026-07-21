/**
 * Utility module for platform-specific VTT exports and strict UVTT v2 compliance.
 * Translates internal V2 Manifest schema into proprietary formats and formal archives.
 */

import JSZip from 'jszip';

const sanitizeId = (id) => id.replace(/-/g, '_');
const slugify = (str) => (str || "unnamed-map").toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function exportToFoundryVTT(manifest) {
    const gridSize = manifest.resolution?.pixels_per_grid || 70;
    
    const scene = {
        name: manifest.level_name || "Exported Scene",
        width: (manifest.resolution?.map_size?.[0] || 50) * gridSize,
        height: (manifest.resolution?.map_size?.[1] || 50) * gridSize,
        grid: {
            size: gridSize,
            color: manifest.resolution?.grid_color || "#ffffff",
            type: 1 // 1 = Square grid in Foundry
        },
        walls: [],
        lights: [],
        tokens: [],
        tiles: [],     
        drawings: [],  
        notes: [],
        flags: {
            uvtt: { version: 2 }
        }
    };

    // Foundry Walls & Portals
    const processGeometry = (items, type, sense, sound) => {
        (items || []).forEach(item => {
            if (!item.path || item.path.length < 2) return;
            // Foundry processes walls as individual line segments, not continuous paths
            for (let i = 0; i < item.path.length - 1; i++) {
                scene.walls.push({
                    _id: sanitizeId(item.id) + `_${i}`,
                    c: [
                        item.path[i].x * gridSize,
                        item.path[i].y * gridSize,
                        item.path[i + 1].x * gridSize,
                        item.path[i + 1].y * gridSize
                    ],
                    light: type === "window" ? 0 : 20, // 20 blocks light, 0 allows it to pass
                    sight: sense,
                    sound: sound,
                    door: type === "door" || type === "secret" ? 1 : 0,
                    ds: item.properties?.state === "open" ? 1 : 0
                });
            }
        });
    };

    processGeometry(manifest.geometry?.walls, "wall", 20, 20);
    processGeometry(manifest.geometry?.portals, "door", 20, 20);

    // Foundry Lights 
    (manifest.entities?.lights || []).forEach(l => {
        const isHidden = l.properties?.visibility === 'gm_only' || l.properties?.visibility === 'hidden';
        scene.lights.push({
            _id: sanitizeId(l.id),
            x: l.position.x * gridSize,
            y: l.position.y * gridSize,
            hidden: isHidden,
            config: {
                dim: l.properties.radius?.dim * (5 / (manifest.resolution?.units_per_grid || 5)), 
                bright: l.properties.radius?.bright * (5 / (manifest.resolution?.units_per_grid || 5)),
                color: l.properties.color || "#ffffff",
                intensity: l.properties.intensity || 1.0,
                angle: l.properties.cone_angle || 360,
                rotation: l.properties.rotation || 0
            }
        });
    });

    // Foundry Tokens (Spawns / Landing Zones)
    (manifest.entities?.landing_zones || []).forEach(lz => {
        scene.tokens.push({
            _id: sanitizeId(lz.id),
            name: lz.name || "Spawn Point",
            x: lz.coordinates[0] * gridSize,
            y: lz.coordinates[1] * gridSize,
            hidden: true
        });
    });

    // Foundry Tiles (Props)
    (manifest.entities?.props || []).forEach(prop => {
        const isHidden = prop.properties?.visibility === 'gm_only' || prop.properties?.visibility === 'hidden';
        const width = (Number(prop.scale) / 100) * gridSize;
        scene.tiles.push({
            _id: sanitizeId(prop.id),
            texture: { src: prop.image },
            width: width,
            height: width,
            x: (prop.position.x * gridSize) - (width / 2),
            y: (prop.position.y * gridSize) - (width / 2),
            rotation: Number(prop.rotation) || 0,
            hidden: isHidden,
            flags: { uvtt: { original_visibility: prop.properties?.visibility } }
        });
    });

    // Foundry Drawings (Events and Smart States)
    (manifest.entities?.events || []).forEach(evt => {
        const wPx = (Number(evt.trigger_bounds?.width) || 1) * gridSize;
        const hPx = (Number(evt.trigger_bounds?.height) || 1) * gridSize;
        const cx = evt.trigger_bounds?.center?.x * gridSize;
        const cy = evt.trigger_bounds?.center?.y * gridSize;

        scene.drawings.push({
            _id: sanitizeId(evt.id),
            text: evt.name || "Trigger Zone",
            shape: { type: "r", width: wPx, height: hPx }, // 'r' = Rectangle
            x: cx - (wPx / 2),
            y: cy - (hPx / 2),
            hidden: true,
            flags: {
                uvtt: {
                    type: "event",
                    eventType: evt.eventType,
                    activation: evt.activation,
                    target_action: evt.target_action,
                    target_entity_ids: evt.target_entity_ids || [],
                    targetFloorId: evt.targetFloorId || "",
                    targetSpawnId: evt.targetSpawnId || ""
                }
            }
        });
    });

    return scene;
}

export function exportToRoll20(manifest) {
    const gridSize = manifest.resolution?.pixels_per_grid || 70;
    const toPx = (val) => val * gridSize;

    const roll20Data = {
        version: "2.0",
        name: manifest.level_name || "Exported Map",
        width: manifest.resolution?.map_size?.[0] || 50,
        height: manifest.resolution?.map_size?.[1] || 50,
        grid_size: gridSize,
        paths: [],
        objects: []
    };

    // Roll20 Dynamic Lighting Walls 
    const processRoll20Paths = (items, color, strokeWidth) => {
        (items || []).forEach(item => {
            if (!item.path || item.path.length < 2) return;
            
            const pathArray = item.path.map((pt, index) => [
                index === 0 ? "M" : "L",
                toPx(pt.x),
                toPx(pt.y)
            ]);

            roll20Data.paths.push({
                type: "path",
                layer: "walls",
                path: JSON.stringify(pathArray),
                stroke: color,
                stroke_width: strokeWidth
            });
        });
    };

    processRoll20Paths(manifest.geometry?.walls, "#0000ff", 3);
    processRoll20Paths(manifest.geometry?.portals, "#ff9900", 5);

    // Roll20 Lights 
    (manifest.entities?.lights || []).forEach(l => {
        roll20Data.objects.push({
            type: "graphic",
            layer: "map",
            subtype: "token",
            left: toPx(l.position.x),
            top: toPx(l.position.y),
            width: gridSize,
            height: gridSize,
            light_radius: (l.properties.radius?.dim || 10) * 5, 
            light_dimradius: (l.properties.radius?.bright || 5) * 5,
            light_otherplayers: true,
            light_hassight: false,
            name: "Light Source"
        });
    });

    // Roll20 Spawns 
    (manifest.entities?.landing_zones || []).forEach(lz => {
        roll20Data.objects.push({
            type: "graphic",
            layer: "gmlayer",
            subtype: "token",
            left: toPx(lz.coordinates[0]),
            top: toPx(lz.coordinates[1]),
            width: gridSize,
            height: gridSize,
            name: lz.name || "Spawn"
        });
    });

    // Roll20 Props
    (manifest.entities?.props || []).forEach(prop => {
        const isGMOnly = prop.properties?.visibility === 'gm_only' || prop.properties?.visibility === 'hidden';
        const width = (Number(prop.scale) / 100) * gridSize;
        
        roll20Data.objects.push({
            type: "graphic",
            layer: isGMOnly ? "gmlayer" : "objects",
            imgsrc: prop.image,
            width: width,
            height: width,
            rotation: Number(prop.rotation) || 0,
            top: toPx(prop.position.y),
            left: toPx(prop.position.x),
            gmnotes: encodeURIComponent(JSON.stringify({ uvtt_id: prop.id, visibility: prop.properties?.visibility }))
        });
    });

    // Roll20 Events (Sized as precise rectangular trigger zones)
    (manifest.entities?.events || []).forEach(evt => {
        const cx = toPx(evt.trigger_bounds?.center?.x || 0);
        const cy = toPx(evt.trigger_bounds?.center?.y || 0);
        const wPx = (Number(evt.trigger_bounds?.width) || 1) * gridSize;
        const hPx = (Number(evt.trigger_bounds?.height) || 1) * gridSize;
        
        roll20Data.objects.push({
            type: "graphic",
            layer: "gmlayer",
            name: evt.name || "Trigger",
            top: cy,
            left: cx,
            width: wPx, 
            height: hPx,
            gmnotes: encodeURIComponent(JSON.stringify({
                type: "uvtt_event",
                eventType: evt.eventType,
                target_action: evt.target_action,
                target_entity_ids: evt.target_entity_ids || []
            }))
        });
    });

    return roll20Data;
}

export function exportToFantasyGrounds(manifest) {
    const gridSize = manifest.resolution?.pixels_per_grid || 70;
    
    const fgData = {
        map: {
            name: manifest.level_name || "Exported Map",
            gridsize: gridSize,
            width: (manifest.resolution?.map_size?.[0] || 50) * gridSize,
            height: (manifest.resolution?.map_size?.[1] || 50) * gridSize,
            occluders: []
        }
    };

    // Fantasy Grounds Line of Sight (Occluders)
    const processFGOccluders = (items, type) => {
        (items || []).forEach(item => {
            if (!item.path || item.path.length < 2) return;
            
            fgData.map.occluders.push({
                id: sanitizeId(item.id),
                type: type, // FG Types: 'wall', 'door', 'window', 'terrain'
                points: item.path.map(pt => `${pt.x * gridSize},${pt.y * gridSize}`).join(",")
            });
        });
    };

    processFGOccluders(manifest.geometry?.walls, "wall");
    processFGOccluders(manifest.geometry?.portals, "door");
    processFGOccluders(manifest.geometry?.overhead, "terrain");

    return fgData;
}

export async function packageForPlatform(platform, manifest, imageBlob) {
    let payload;
    switch(platform) {
        case 'foundry':
            payload = exportToFoundryVTT(manifest);
            break;
        case 'roll20':
            payload = exportToRoll20(manifest);
            break;
        case 'fg':
            payload = exportToFantasyGrounds(manifest);
            break;
        default:
            throw new Error("Unsupported platform");
    }
    
    return {
        filename: `${manifest.level_name || 'Map_Export'}_${platform}.json`,
        data: JSON.stringify(payload, null, 2)
    };
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
        const slug = slugify(mapDef.filename) || `map-${i}`;

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
            emitters: []
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
                        targetSlug = slugify(targetMap.filename);
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