/**
 * legacyParser.js
 * Parses a v1 .dd2vtt/.df2vtt file, extracts the Base64 image into a Blob URL,
 * and normalizes the old geometry into the UVTT v2 SVG-style format.
 */

function base64ToBlob(base64, mimeType = 'image/webp') {
    // Strip potential data URI prefix to prevent InvalidCharacterError
    if (typeof base64 === 'string' && base64.includes(',')) {
        base64 = base64.split(',')[1];
    }
    // Remove whitespace/newlines which can also break atob()
    base64 = base64.replace(/\s/g, '');

    const byteCharacters = atob(base64);
    const byteArrays = [];

    // Process in chunks to bypass memory/URL limits
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteArray = new Uint8Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteArray[i] = slice.charCodeAt(i);
        }
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: mimeType });
}

/**
 * Snaps a given coordinate to an existing vertex if it falls within the tolerance radius.
 * This mathematically seals corners to prevent VTT light leaks.
 */
function snapCoordinates(x, y, registry, tolerance) {
    for (const pt of registry) {
        if (Math.abs(pt.x - x) <= tolerance && Math.abs(pt.y - y) <= tolerance) {
            return { x: pt.x, y: pt.y };
        }
    }
    registry.push({ x, y });
    return { x, y };
}

export async function upgradeLegacyMap(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const legacyData = JSON.parse(e.target.result);

                // 1. Memory-Safe Image Extraction
                const base64Data = legacyData.image;
                const imageBlob = base64ToBlob(base64Data, "image/webp");
                const imageUrl = URL.createObjectURL(imageBlob);

                const upgradedWalls = [];
                const upgradedPortals = [];
                const upgradedLights = [];
                const vertexRegistry = [];
                const SNAP_TOLERANCE = 0.05;

                // 2. Process Walls with Vertex Snapping
                if (legacyData.line_of_sight) {
                    legacyData.line_of_sight.forEach((losArray, index) => {
                        if (losArray.length < 2) return;
                        const v2Path = losArray.map((point, ptIndex) => {
                            const px = point.x !== undefined ? point.x : point[0];
                            const py = point.y !== undefined ? point.y : point[1];
                            const snapped = snapCoordinates(px, py, vertexRegistry, SNAP_TOLERANCE);
                            return { type: ptIndex === 0 ? "move" : "line", x: snapped.x, y: snapped.y };
                        });

                        upgradedWalls.push({
                            id: `wall_legacy_${index}_${Date.now()}`,
                            type: "standard",
                            height: { bottom: 0.0, top: 10.0 },
                            path: v2Path,
                            directional_blocks: {
                                left_to_right: ["light", "sight", "movement"],
                                right_to_left: ["light", "sight", "movement"]
                            },
                            states: { ethereal: false }
                        });
                    });
                }

                // 3. Process Portals
                if (legacyData.portals) {
                    legacyData.portals.forEach((portal, index) => {
                        if (!portal.bounds || portal.bounds.length < 2) return;
                        const v2Path = portal.bounds.map((point, ptIndex) => {
                            const px = point.x !== undefined ? point.x : point[0];
                            const py = point.y !== undefined ? point.y : point[1];
                            const snapped = snapCoordinates(px, py, vertexRegistry, SNAP_TOLERANCE);
                            return { type: ptIndex === 0 ? "move" : "line", x: snapped.x, y: snapped.y };
                        });

                        upgradedPortals.push({
                            id: `portal_legacy_${index}_${Date.now()}`,
                            type: portal.closed ? "door" : "window",
                            sub_type: "standard",
                            path: v2Path
                        });
                    });
                }

                // 4. Process Lights
                if (legacyData.lights) {
                    legacyData.lights.forEach((light, index) => {
                        upgradedLights.push({
                            id: `light_legacy_${index}_${Date.now()}`,
                            type: "point",
                            position: { x: light.position.x, y: light.position.y, z: 5.0 },
                            radius: { bright: light.range / 2, dim: light.range },
                            color: light.color.length > 7 ? `#${light.color.substring(0, 6)}` : light.color,
                            decay: "inverse_square",
                            animation: { type: "none", speed: 1.0, intensity_variance: 0.1 }
                        });
                    });
                }

                // 5. Build Final V2 Manifest
                const upgradedManifest = {
                    format_version: "2.0.0",
                    uvtt_version: "2.0.0",
                    campaign_name: file.name.replace(/\.[^/.]+$/, ""),
                    author: "Imported via UVTT v2 Upgrader",
                    license: "Proprietary",
                    hardware_profile: {
                        minimum_pipeline: "WebGL2",
                        recommended_pipeline: "WebGPU",
                        requires_compute_shaders: false
                    },
                    resolution: {
                        map_origin: { x: legacyData.resolution?.map_origin?.x || 0, y: legacyData.resolution?.map_origin?.y || 0 },
                        grid_size: { x: legacyData.resolution?.pixels_per_grid || 70, y: legacyData.resolution?.pixels_per_grid || 70 },
                        units_per_grid: 5,
                        unit_name: "ft",
                        topology: { type: "square", orientation: "flat_top", offset: "odd_row", isometric_ratio: 0.5 }
                    },
                    geometry: {
                        walls: upgradedWalls,
                        portals: upgradedPortals,
                        overhead: []
                    },
                    lights: upgradedLights,
                    
                    // --- NEW V2 ENTITIES INITIALIZED HERE ---
                    events: [],
                    audio: [],
                    landing_zones: [],
                    emitters: [], 
                    music: { uri: "", volume: 1.0, crossfade_duration: 2.0 }, 
                    ambience: { uri: "", volume: 1.0, crossfade_duration: 2.0 } 
                };

                resolve({ imageUrl, imageBlob, manifest: upgradedManifest });

            } catch (err) {
                reject(new Error("Failed to parse V1 JSON. File may be corrupted."));
            }
        };

        reader.onerror = () => reject(new Error("File read error."));
        reader.readAsText(file);
    });
}