/**
 * @fileoverview UVTT v2 URI Router & Slugification Engine
 * Converts in-memory UUIDs, floor IDs, and spawn pointers into 
 * strict OVTC Spec-compliant URIs (`internal://` and `relative://`).
 */

/**
 * Standardizes any string into a URL-safe, cross-platform slug.
 * Example: "Level 02: Ghul's Dungeon!" -> "level-02-ghuls-dungeon"
 * 
 * @param {string} text - The input name or filename.
 * @returns {string} The URL-safe slugified string.
 */
export function slugify(text) {
    if (!text || typeof text !== 'string') return 'unnamed';
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')   // Replace non-alphanumeric chars with hyphens
        .replace(/^-+|-+$/g, '');       // Trim leading and trailing hyphens
}

/**
 * Parses an in-memory Event entity and generates a Spec-compliant destination object.
 * 
 * @param {Object} event - The in-memory event entity from mapStore.
 * @param {Array<Object>} catalog - The full project map catalog.
 * @param {string} currentMapId - The active map level UUID.
 * @returns {Object|null} Formatted Spec `destination` block or null if no spawn target exists.
 */
export function buildEventDestination(event, catalog = [], currentMapId = '') {
    const targetSpawnId = event.targetSpawnId || '';
    if (!targetSpawnId) return null;

    // 1. Resolve target floor (defaults to current map if blank)
    const targetFloorId = event.targetFloorId || currentMapId;
    const targetMap = catalog.find(m => m.id === targetFloorId);

    // 2. Check if the target is an internal level within the same project catalog
    const isInternalMap = catalog.some(m => m.id === targetFloorId);

    let uri = '';
    let transitionType = 'intra_map';

    if (isInternalMap && targetMap) {
        // Compound Archive Route: internal://map_slug#landing_zone_id
        const mapSlug = slugify(targetMap.filename || targetMap.id);
        uri = `internal://${mapSlug}#${targetSpawnId}`;
        transitionType = targetFloorId === currentMapId ? 'intra_map' : 'inter_map';
    } else if (event.externalPackageName) {
        // Federated Network Route: relative://target_package.uvtt2z#landing_zone_id
        const packageSlug = slugify(event.externalPackageName);
        uri = `relative://${packageSlug}.uvtt2z#${targetSpawnId}`;
        transitionType = 'inter_map';
    } else {
        // Fallback for unresolved internal links
        const mapSlug = slugify(targetFloorId);
        uri = `internal://${mapSlug}#${targetSpawnId}`;
    }

    return {
        type: transitionType,
        uri: uri,
        prediction_trigger_radius: Number(event.trigger_bounds?.width || 1.0) * 1.5
    };
}

/**
 * Reverse-parses a Spec URI back into in-memory IDs during file ingestion.
 * 
 * @param {string} uri - The input URI string (e.g. "internal://level-1#lz_staircase").
 * @param {Array<Object>} catalog - The active catalog to match slugs against.
 * @returns {{ targetFloorId: string, targetSpawnId: string }}
 */
export function parseUriToStorePointers(uri, catalog = []) {
    if (!uri || typeof uri !== 'string') {
        return { targetFloorId: '', targetSpawnId: '' };
    }

    // Split scheme from payload
    const parts = uri.split('://');
    if (parts.length < 2) return { targetFloorId: '', targetSpawnId: uri };

    const payload = parts[1]; // e.g. "level-1#lz_staircase"
    const [mapSlug, spawnId] = payload.split('#');

    // Attempt to match mapSlug back to an active catalog level ID
    const matchedMap = catalog.find(m => slugify(m.filename || m.id) === mapSlug);

    return {
        targetFloorId: matchedMap ? matchedMap.id : mapSlug,
        targetSpawnId: spawnId || ''
    };
}