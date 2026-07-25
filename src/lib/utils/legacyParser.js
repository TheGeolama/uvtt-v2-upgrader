/**
 * @fileoverview Legacy Format Ingestion Parser
 * Responsible for parsing and upgrading outdated or third-party map exports 
 * (such as Dungeondraft .dd2vtt files or Universal VTT v1.0 files) into the 
 * strict, normalized V2 JSON schema used by the modern mapStore engine.
 */

/**
 * Utility to generate a pseudo-random unique identifier.
 * Used as a fallback when ingested legacy items lack strict UUIDs.
 * 
 * @param {string} prefix - The category prefix (e.g., 'wall', 'light', 'prop')
 * @returns {string} A unique identifier string formatted as `prefix_xyz123`
 */
function generateId(prefix) {
    return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Ingests raw legacy map data, normalizes coordinate scales, and maps outdated 
 * JSON structures into the strict V2 map definition schema.
 * 
 * @param {string|Object} rawData - The raw parsed JSON or stringified text from a dropped file.
 * @param {string} [filename="Unknown Map"] - The name of the ingested file for cataloging.
 * @returns {Object|null} A fully normalized V2 Map Object ready to be pushed to the mapStore, or null if parsing fails.
 */
export function upgradeLegacyMap(rawData, filename = "Unknown Map") {
    try {
        // Handle both raw text blobs and pre-parsed JSON objects safely
        const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
        const mapName = filename.split('.')[0];

        // Ensure the background graphic is properly prefixed for HTML5 Canvas rendering
        let imageUrl = data.image || "";
        if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
            imageUrl = "data:image/png;base64," + imageUrl;
        }

        // Normalize resolution and coordinate origins
        const res = data.resolution || {};
        const ppg = Number(res.pixels_per_grid || res.grid_size) || 70;
        const mapWidth = Number(res.map_size?.x ?? res.map_size?.[0]) || 20;
        const mapHeight = Number(res.map_size?.y ?? res.map_size?.[1]) || 20;
        const originX = Number(res.map_origin?.x ?? res.map_origin?.[0]) || 0;
        const originY = Number(res.map_origin?.y ?? res.map_origin?.[1]) || 0;

        // ----------------------------------------------------
        // 1. Upgrade Walls (Line of Sight Geometry)
        // ----------------------------------------------------
        const walls = [];
        // Legacy systems often used 'line_of_sight' instead of 'walls'
        const los = data.line_of_sight || data.walls || [];
        for (const item of los) {
            if (Array.isArray(item) && item.length >= 2) {
                walls.push({
                    id: generateId('wall'),
                    path: item.map(pt => ({ x: Number(pt.x), y: Number(pt.y) })),
                    properties: { type: 'standard', bottom: 0.0, top: 10.0, visibility: 'visible' }
                });
            }
        }

        // ----------------------------------------------------
        // 2. Upgrade Portals (Doors and Windows)
        // ----------------------------------------------------
        const portals = [];
        const rawPortals = data.portals || [];
        for (const item of rawPortals) {
            let pts = [];
            // Older schemas sometimes used a 'bounds' array or explicit p1/p2 objects
            if (Array.isArray(item.bounds)) pts = item.bounds; 
            else if (item.line?.p1 && item.line?.p2) pts = [item.line.p1, item.line.p2];

            if (pts.length >= 2) {
                portals.push({
                    id: generateId('portal'),
                    path: pts.map(pt => ({ x: Number(pt.x), y: Number(pt.y) })),
                    properties: { 
                        type: 'door', 
                        state: item.closed ? 'closed' : 'open',
                        bottom: 0.0, 
                        top: 10.0, 
                        visibility: 'visible'
                    }
                });
            }
        }

        // ----------------------------------------------------
        // 3. Upgrade Lights (Foundry/Dungeondraft Translations)
        // ----------------------------------------------------
        const lights = [];
        const rawLights = data.lights || [];
        for (const l of rawLights) {
            lights.push({
                id: generateId('light'),
                type: 'point',
                position: { x: Number(l.position?.x || 0), y: Number(l.position?.y || 0), z: 0 },
                properties: {
                    color: l.color ? (l.color.startsWith('#') ? l.color : `#${l.color}`) : '#ffffff',
                    intensity: Number(l.intensity) || 1.0,
                    decay_model: 'inverse_square',
                    // Normalize flat range values into dual bright/dim tiers
                    radius: { 
                        bright: (Number(l.range) || 5) * 0.5, 
                        dim: Number(l.range) || 10 
                    },
                    animation: { profile: 'none', speed: 0.5, intensity_variance: 0.2 },
                    rotation: 0,
                    cone_angle: 60,
                    visibility: 'visible'
                }
            });
        }

        // ----------------------------------------------------
        // 4. Upgrade Props & Objects
        // ----------------------------------------------------
        const props = [];
        const rawObjects = data.objects || [];
        for (const o of rawObjects) {
            props.push({
                id: generateId('prop'),
                name: o.name || "Imported Prop",
                image: o.image || "", // Legacy apps like Dungeondraft use base64 or internal IDs here
                position: { x: Number(o.center?.x || 0), y: Number(o.center?.y || 0), z: 0 },
                rotation: Number(o.rotation) || 0,
                // Dungeondraft scale is typically a 1.0 multiplier; V2 uses a 100 percentage integer
                scale: (Number(o.scale) || 1) * 100, 
                properties: { visibility: 'visible' }
            });
        }

        // ----------------------------------------------------
        // 5. Construct Final V2 Payload
        // ----------------------------------------------------
        return {
            id: generateId('map'),
            filename: filename,
            name: mapName,
            imageUrl: imageUrl,
            manifest: {
                resolution: {
                    pixels_per_grid: ppg,
                    pixels_per_grid_y: ppg,
                    units_per_grid: 5,
                    map_size: [mapWidth, mapHeight],
                    map_origin: [originX, originY],
                    map_offset_x: 0,
                    map_offset_y: 0,
                    topology: { type: "square" }
                },
                geometry: { walls, portals, overhead: [] },
                entities: { 
                    lights, 
                    events: [], 
                    audio: { zones: [] }, 
                    emitters: [], 
                    landing_zones: [],
                    props
                },
                music: {}, 
                ambience: {}
            }
        };
    } catch (err) {
        console.error("Legacy Parser Error:", err);
        return null;
    }
}