/**
 * @fileoverview Data Validation and Schema Normalization Engine
 * Acts as the strict gatekeeper for the mapStore and PixiJS canvas.
 * Deeply inspects incoming raw manifest data, purges invalid or corrupted 
 * geometry (e.g., 1-point walls), and injects safe default properties 
 * to ensure 100% compliance with the V2 engine architecture.
 */

/**
 * Deep clones, verifies, and sanitizes a raw map manifest.
 * Mutates the clone by applying schema-compliant defaults to any missing properties 
 * (like Z-axis heights, visibility toggles, or event bounds) and aggressively drops 
 * mathematically invalid entities.
 * 
 * @param {Object} rawManifest - The raw, potentially unsafe map manifest payload.
 * @returns {Object} A pristine, fully V2-compliant manifest object guaranteed to be safe for rendering.
 */
export function verifyAndCleanManifest(rawManifest) {
    if (!rawManifest) return {};
    
    // Create a deeply detached clone to avoid mutating the original memory references
    const m = JSON.parse(JSON.stringify(rawManifest));
    
    // Helper to strictly verify valid numerical coordinates and prevent NaN canvas crashes
    const isNum = (v) => typeof v === 'number' && !isNaN(v);

    // ----------------------------------------------------
    // 1. CLEAN GEOMETRY (Walls, Portals, Roofs)
    // ----------------------------------------------------
    ['walls', 'portals', 'overhead'].forEach(cat => {
        if (m.geometry && m.geometry[cat]) {
            m.geometry[cat] = m.geometry[cat].filter(item => {
                // Drop mathematically invalid vectors (must be an array of at least 2 points)
                if (!item.path || !Array.isArray(item.path) || item.path.length < 2) return false;
                
                if (!item.properties) item.properties = {};
                if (!item.properties.visibility) item.properties.visibility = 'visible';
                
                // MIGRATION: Enforce 3D architectural Z-height limits in the new root `height` object
                if (!item.height) {
                    item.height = {
                        bottom: isNum(item.properties.bottom) ? item.properties.bottom : (cat === 'overhead' ? 10.0 : 0.0),
                        top: isNum(item.properties.top) ? item.properties.top : (cat === 'overhead' ? 20.0 : 10.0)
                    };
                } else {
                    if (!isNum(item.height.bottom)) item.height.bottom = (cat === 'overhead' ? 10.0 : 0.0);
                    if (!isNum(item.height.top)) item.height.top = (cat === 'overhead' ? 20.0 : 10.0);
                }
                
                // Purge legacy Z-axis properties to strictly match the Spec
                delete item.properties.bottom;
                delete item.properties.top;
                
                // Specific Geometry Defaults
                if (cat === 'portals') {
                    if (!item.properties.type) item.properties.type = 'door';
                    if (!item.properties.state) item.properties.state = 'closed';
                }
                
                // Final safety check: ensure every point in the path has valid X/Y floats
                return item.path.every(pt => isNum(pt.x) && isNum(pt.y));
            });
        }
    });

    // ----------------------------------------------------
    // 2. CLEAN ENTITIES (Lights, Events, Props, etc.)
    // ----------------------------------------------------
    if (m.entities) {
        if (!m.entities.props) m.entities.props = [];
        
        // Sanitize Dynamic Lights
        if (m.entities.lights) {
            m.entities.lights = m.entities.lights.filter(l => {
                if (!l.position || !isNum(l.position.x) || !isNum(l.position.y)) return false;
                if (!isNum(l.position.z)) l.position.z = 0;
                
                if (!l.properties) l.properties = {};
                if (!l.properties.visibility) l.properties.visibility = 'visible';
                if (!isNum(l.properties.radius?.bright)) l.properties.radius = { bright: 5, dim: 10 };
                if (!isNum(l.properties.intensity)) l.properties.intensity = 1.0;
                if (!isNum(l.properties.cone_angle)) l.properties.cone_angle = 60;
                if (!isNum(l.properties.rotation)) l.properties.rotation = 0;
                if (typeof l.properties.color !== 'string') l.properties.color = "#ffffff";
                
                return true;
            });
        }
        
        // Sanitize Landing Zones (Spawns)
        if (m.entities.landing_zones) {
            m.entities.landing_zones = m.entities.landing_zones.filter(lz => {
                const isValidCoords = lz.coordinates && Array.isArray(lz.coordinates) && isNum(lz.coordinates[0]) && isNum(lz.coordinates[1]);
                if (!lz.properties) lz.properties = {};
                if (!lz.properties.visibility) lz.properties.visibility = 'visible';
                if (isValidCoords && !isNum(lz.heading_degrees)) lz.heading_degrees = 0.0;
                return isValidCoords;
            });
        }
        
        // Sanitize Interactive Events / Triggers
        if (m.entities.events) {
            m.entities.events = m.entities.events.filter(ev => {
                // Safely up-convert legacy coordinate formats (x, y) into modern bounds objects
                if (!ev.trigger_bounds) {
                    if (isNum(ev.x) && isNum(ev.y)) {
                        ev.trigger_bounds = { center: { x: ev.x, y: ev.y }, width: 2, height: 2 };
                    } else return false; 
                }
                if (!ev.trigger_bounds.center) ev.trigger_bounds.center = { x: 0, y: 0 };
                
                // Safely convert legacy circular radii into modern square trigger boxes
                if (isNum(ev.trigger_bounds.radius) && !isNum(ev.trigger_bounds.width)) {
                    ev.trigger_bounds.width = ev.trigger_bounds.radius * 2;
                    ev.trigger_bounds.height = ev.trigger_bounds.radius * 2;
                }
                if (!isNum(ev.trigger_bounds.width)) ev.trigger_bounds.width = 1;
                if (!isNum(ev.trigger_bounds.height)) ev.trigger_bounds.height = 1;
                if (!ev.activation || typeof ev.activation !== 'string') ev.activation = 'proximity';
                if (!ev.target_entity_ids) ev.target_entity_ids = [];
                
                if (!ev.properties) ev.properties = {};
                if (!ev.properties.visibility) ev.properties.visibility = 'visible';
                
                return true;
            });
        }
        
        // Sanitize Spatial Audio Zones
        if (m.entities.audio && m.entities.audio.zones) {
            m.entities.audio.zones = m.entities.audio.zones.filter(az => {
                if (!az.center || !isNum(az.center.x) || !isNum(az.center.y)) return false;
                if (!isNum(az.radius)) az.radius = 5;
                if (!isNum(az.volume)) az.volume = 100;
                
                if (!az.properties) az.properties = {};
                if (!az.properties.visibility) az.properties.visibility = 'visible';
                
                return true;
            });
        }
        
        // Sanitize Particle Emitters (Weather / Smoke)
        if (m.entities.emitters) {
            m.entities.emitters = m.entities.emitters.filter(em => {
                if (!em.position || !isNum(em.position.x) || !isNum(em.position.y)) return false;
                if (!isNum(em.position.z)) em.position.z = 0;
                if (!isNum(em.scale)) em.scale = 100;
                
                if (!em.properties) em.properties = {};
                if (!em.properties.visibility) em.properties.visibility = 'visible';
                
                // MIGRATION: Enforce Z-height limits for weather clipping
                if (!em.height) {
                    em.height = {
                        bottom: isNum(em.properties.bottom) ? em.properties.bottom : 0.0,
                        top: isNum(em.properties.top) ? em.properties.top : 40.0
                    };
                } else {
                    if (!isNum(em.height.bottom)) em.height.bottom = 0.0;
                    if (!isNum(em.height.top)) em.height.top = 40.0;
                }
                
                delete em.properties.bottom;
                delete em.properties.top;

                return true;
            });
        }
        
        // Sanitize Object Props
        if (m.entities.props) {
            m.entities.props = m.entities.props.filter(pr => {
                if (!pr.position || !isNum(pr.position.x) || !isNum(pr.position.y)) return false;
                if (!isNum(pr.position.z)) pr.position.z = 0;
                if (!isNum(pr.scale)) pr.scale = 100;
                if (!isNum(pr.rotation)) pr.rotation = 0;
                
                if (!pr.properties) pr.properties = {};
                if (!pr.properties.visibility) pr.properties.visibility = 'visible';
                
                return true;
            });
        }
    }

    // ----------------------------------------------------
    // 3. CLEAN RESOLUTION
    // ----------------------------------------------------
    if (!m.resolution) m.resolution = {};
    if (!isNum(m.resolution.pixels_per_grid)) m.resolution.pixels_per_grid = 70;
    if (!isNum(m.resolution.grid_line_width)) m.resolution.grid_line_width = 1.5;
    if (!isNum(m.resolution.subgrid_line_width)) m.resolution.subgrid_line_width = 1.0;

    return m;
}