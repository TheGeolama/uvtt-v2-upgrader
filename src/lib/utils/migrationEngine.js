/**
 * @fileoverview UVTT Schema Migration Engine
 * Production-grade, high-performance Svelte 5 / esbuild compliant utility class.
 * Responsible for translating map data across multi-tiered version schemas.
 * Handles up-sampling legacy formats into the modern master format,
 * and down-sampling (lossy export) modern maps back into legacy formats with curve-flattening.
 */

export class UvttMigrationEngine {
    /**
     * Normalizes any incoming data format into the standard UVTT v2 memory structure.
     * Specifically wraps raw V1 manifests (which lacked outer project metadata) into 
     * the modern Svelte store wrapper format.
     * 
     * @param {Object} rawPayload - The parsed JSON payload from an imported file.
     * @param {string} determinedVersion - The detected schema version (e.g., "1.0.0", "2.0.0").
     * @returns {Object} A fully structured V2 master map object.
     */
    static normalizeToMaster(rawPayload, determinedVersion) {
        if (determinedVersion === "1.0.0") {
            // Raw V1 is normalized using the standard parser logic, adding the missing outer envelope
            const filename = rawPayload.filename || "imported_map.dd2vtt";
            return rawPayload.manifest ? rawPayload : {
                id: rawPayload.id || "map_" + Math.random().toString(36).slice(2, 9),
                name: rawPayload.name || "Imported Map",
                filename: filename,
                imageUrl: rawPayload.imageUrl || rawPayload.image || "",
                image: rawPayload.imageUrl || rawPayload.image || "",
                manifest: rawPayload
            };
        }
        // If it's already a modern V2 payload, return it untouched
        return rawPayload;
    }

    /**
     * Down-samples the modern V2 master memory structure into legacy format profiles.
     * WARNING: Exporting to v1.0.0 is a strictly lossy operation. Advanced features 
     * like Z-axis height, spatial audio, weather emitters, and interactive events are pruned.
     * 
     * @param {Object} masterState - The current V2 map object from the state store.
     * @param {string} targetVersion - The requested export version (e.g., "1.0.0").
     * @returns {Object} The compiled manifest matching the target legacy schema.
     */
    static compileToTarget(masterState, targetVersion) {
        const manifest = masterState.manifest || masterState;

        if (targetVersion === "1.0.0") {
            const widthPx = manifest.resolution?.map_size?.[0] * (manifest.resolution?.pixels_per_grid || 70) || 1400;
            const heightPx = manifest.resolution?.map_size?.[1] * (manifest.resolution?.pixels_per_grid || 70) || 1400;
            const pixelsPerGrid = manifest.resolution?.pixels_per_grid || 70;

            const walls = manifest.geometry?.walls || [];
            const portals = manifest.geometry?.portals || [];
            const lights = manifest.entities?.lights || [];

            // 1. Flatten SVG paths (including modern smooth Bézier curves) into raw polygonal line segments
            const v1LineOfSight = [];
            walls.forEach(w => {
                const flattenedPoly = this.flattenSvgPath(w.path);
                if (flattenedPoly.length > 0) {
                    v1LineOfSight.push({ poly: flattenedPoly });
                }
            });

            // 2. Flatten Portals (Doors / Windows) into raw segments
            const v1Portals = [];
            portals.forEach(p => {
                const flattenedPoly = this.flattenSvgPath(p.path);
                if (flattenedPoly.length > 0) {
                    v1Portals.push({
                        bounds: flattenedPoly,
                        closed: p.properties?.closed !== false
                    });
                }
            });

            // 3. Compile lights back to flat coordinates and collapse dual-radii into a single range
            const v1Lights = [];
            lights.forEach(l => {
                v1Lights.push({
                    position: { x: l.position?.x || 0, y: l.position?.y || 0 },
                    range: l.dim_radius || 10.0,
                    // Strip the hash and append full opacity hex 'ff' for older renderer standards
                    color: (l.color || "#ffffff").replace(/^#/, '') + "ff" 
                });
            });

            // 4. Return standard monolithic V1 format structure
            return {
                format: 1,
                __uvtt_migration_fallback: "Original features (Z-axis, Audio, Weather, Events) pruned during downgrade to v1.0.0",
                resolution: {
                    map_origin: { x: 0, y: 0 },
                    map_size: {
                        x: manifest.resolution?.map_size?.[0] || 20,
                        y: manifest.resolution?.map_size?.[1] || 20
                    },
                    pixels_per_grid: pixelsPerGrid,
                    units_per_grid: manifest.resolution?.units_per_grid || 5
                },
                line_of_sight: v1LineOfSight,
                portals: v1Portals,
                lights: v1Lights,
                image: masterState.imageUrl || masterState.image || ""
            };
        }

        // Return native V2 manifest structure if no down-sampling was requested
        return manifest;
    }

    /**
     * Mathematical SVG path subdivision.
     * Older 2D rendering engines (like V1 VTTs) cannot natively draw true mathematical curves.
     * This utility evaluates parametric cubic equations to shatter a continuous Bezier curve 
     * into a dense array of rigid, straight line segments.
     * 
     * @param {Array<Object>} path - Array of V2 SVG path nodes ({type: "move"|"line"|"bezier", x, y, cp1, cp2}).
     * @returns {Array<Object>} A flattened, continuous array of rigid {x,y} coordinate objects.
     */
    static flattenSvgPath(path) {
        if (!path || path.length === 0) return [];
        const result = [];
        let currentX = 0;
        let currentY = 0;

        path.forEach(seg => {
            if (seg.type === "move") {
                currentX = seg.x;
                currentY = seg.y;
                result.push({ x: currentX, y: currentY });
            } else if (seg.type === "line") {
                currentX = seg.x;
                currentY = seg.y;
                result.push({ x: currentX, y: currentY });
            } else if (seg.type === "bezier") {
                // Parameterized evaluation of cubic curves (Shattered into 10 linear steps)
                const p0x = currentX;
                const p0y = currentY;
                const p1x = seg.cp1?.x || currentX;
                const p1y = seg.cp1?.y || currentY;
                const p2x = seg.cp2?.x || seg.x;
                const p2y = seg.cp2?.y || seg.y;
                const p3x = seg.x;
                const p3y = seg.y;

                const segmentsCount = 10;
                for (let i = 1; i <= segmentsCount; i++) {
                    const t = i / segmentsCount;
                    const mt = 1 - t;

                    // Standard Cubic Bezier curve formula
                    // P(t) = (1-t)^3 * P0 + 3(1-t)^2 * t * P1 + 3(1-t) * t^2 * P2 + t^3 * P3
                    const x = mt * mt * mt * p0x + 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t * p3x;
                    const y = mt * mt * mt * p0y + 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t * p3y;

                    result.push({ x, y });
                }
                
                // Update the simulated "cursor" position for the next path segment
                currentX = p3x;
                currentY = p3y;
            }
        });

        return result;
    }
}