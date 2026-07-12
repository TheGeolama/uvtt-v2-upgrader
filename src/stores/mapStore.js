import { writable } from 'svelte/store';

const initialState = {
    catalog: [], 
    activeMapIndex: -1,
    imageUrl: null,
    imageBlob: null,
    audioBlobs: {}, 
    manifest: null,
    activeTool: 'pan', 
    selectedItemIds: [],
    showGrid: true
};

export const mapStore = writable(initialState);

export const mapActions = {
    setCatalog: (parsedMaps) => {
        if (!parsedMaps || parsedMaps.length === 0) return;
        
        parsedMaps.forEach(mapObj => {
            const manifest = mapObj.manifest;
            if (!manifest.lights) manifest.lights = [];
            if (!manifest.events) manifest.events = [];
            if (!manifest.audio) manifest.audio = []; 
            if (!manifest.geometry.overhead) manifest.geometry.overhead = [];
            if (!manifest.landing_zones) manifest.landing_zones = [];
            if (!manifest.emitters) manifest.emitters = []; 
            
            if (!manifest.resolution.topology) {
                manifest.resolution.topology = {
                    type: "square",
                    orientation: "flat_top",
                    offset: "odd_row",
                    isometric_ratio: 0.5
                };
            }

            if (!manifest.music) manifest.music = { uri: "", volume: 1.0, crossfade_duration: 2.0 };
            if (!manifest.ambience) manifest.ambience = { uri: "", volume: 1.0, crossfade_duration: 2.0 };
            
            if (!manifest.environment) {
                manifest.environment = {
                    global_wind: { speed: 5.0, angle: 45.0, gust_variance: 0.15 }
                };
            }

            if (!mapObj.audioBlobs) mapObj.audioBlobs = {};
        });

        mapStore.update(s => ({
            ...s,
            catalog: parsedMaps,
            activeMapIndex: 0,
            imageUrl: parsedMaps[0].imageUrl,
            imageBlob: parsedMaps[0].imageBlob,
            audioBlobs: parsedMaps[0].audioBlobs || {},
            manifest: parsedMaps[0].manifest,
            selectedItemIds: [],
            activeTool: 'pan'
        }));
    },

    switchMap: (index) => {
        mapStore.update(s => {
            if (index < 0 || index >= s.catalog.length || index === s.activeMapIndex) return s;

            const updatedCatalog = [...s.catalog];
            if (s.activeMapIndex >= 0) {
                updatedCatalog[s.activeMapIndex].manifest = JSON.parse(JSON.stringify(s.manifest));
                updatedCatalog[s.activeMapIndex].audioBlobs = { ...s.audioBlobs };
            }

            return {
                ...s,
                catalog: updatedCatalog,
                activeMapIndex: index,
                imageUrl: updatedCatalog[index].imageUrl,
                imageBlob: updatedCatalog[index].imageBlob,
                audioBlobs: updatedCatalog[index].audioBlobs || {},
                manifest: updatedCatalog[index].manifest,
                selectedItemIds: [],
                activeTool: 'pan'
            };
        });
    },

    addAudioAsset: (filename, blob) => {
        mapStore.update(s => {
            const newAudioBlobs = { ...s.audioBlobs, [filename]: blob };
            return { ...s, audioBlobs: newAudioBlobs };
        });
    },
    
    setTool: (tool) => {
        mapStore.update(s => ({ 
            ...s, 
            activeTool: tool, 
            selectedItemIds: [] 
        }));
    },

    toggleSelection: (id, isMulti = false) => {
        mapStore.update(s => {
            if (!isMulti) return { ...s, selectedItemIds: [id] };
            
            const newIds = [...s.selectedItemIds];
            const index = newIds.indexOf(id);
            if (index === -1) newIds.push(id);
            else newIds.splice(index, 1);
            
            return { ...s, selectedItemIds: newIds };
        });
    },

    clearSelection: () => {
        mapStore.update(s => ({ ...s, selectedItemIds: [] }));
    },

    toggleGrid: () => {
        mapStore.update(s => ({ ...s, showGrid: !s.showGrid }));
    },

    updateManifestProperty: (propertyPath, value) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            
            const keys = propertyPath.split('.');
            let currentRef = manifest;
            for (let i = 0; i < keys.length - 1; i++) {
                if (currentRef[keys[i]] === undefined) currentRef[keys[i]] = {}; 
                currentRef = currentRef[keys[i]];
            }
            currentRef[keys[keys.length - 1]] = value;
            
            return { ...s, manifest };
        });
    },

    updateItemProperty: (id, category, propertyPath, value) => {
        mapStore.update(s => {
            if (!s.manifest) return s;

            const manifest = JSON.parse(JSON.stringify(s.manifest));
            let targetArray;
            if (category === 'portal') targetArray = manifest.geometry.portals;
            else if (category === 'wall') targetArray = manifest.geometry.walls;
            else if (category === 'light') targetArray = manifest.lights;
            else if (category === 'event') targetArray = manifest.events;
            else if (category === 'audio') targetArray = manifest.audio; 
            else if (category === 'overhead') targetArray = manifest.geometry.overhead; 
            else if (category === 'spawn') targetArray = manifest.landing_zones;
            else if (category === 'emitter') targetArray = manifest.emitters;
            else return s;

            const itemIndex = targetArray.findIndex(item => item.id === id);
            
            if (itemIndex !== -1) {
                const keys = propertyPath.split('.');
                let currentRef = targetArray[itemIndex];

                for (let i = 0; i < keys.length - 1; i++) {
                    if (currentRef[keys[i]] === undefined) currentRef[keys[i]] = {}; 
                    currentRef = currentRef[keys[i]];
                }
                currentRef[keys[keys.length - 1]] = value;
            }
            
            return { ...s, manifest };
        });
    },

    changeBoundaryShape: (id, category, newShape) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            
            let targetArray;
            if (category === 'event') targetArray = manifest.events;
            else if (category === 'audio') targetArray = manifest.audio;
            else if (category === 'overhead') targetArray = manifest.geometry.overhead;
            else if (category === 'emitter') targetArray = manifest.emitters;
            if (!targetArray) return s;

            const itemIndex = targetArray.findIndex(e => e.id === id);
            if (itemIndex === -1) return s;

            const item = targetArray[itemIndex];
            const boundsTarget = category === 'event' ? item.trigger_bounds : item.bounds;
            
            boundsTarget.shape = newShape;

            if (newShape === 'circle') {
                boundsTarget.radius = boundsTarget.radius || 1.0;
            } else if (newShape === 'rectangle') {
                boundsTarget.width = boundsTarget.width || 2.0;
                boundsTarget.height = boundsTarget.height || 2.0;
            }

            return { ...s, manifest };
        });
    },

    addLight: (x, y) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            if (!manifest.lights) manifest.lights = [];

            const newLight = {
                id: `light_${Date.now()}`,
                type: "point",
                position: { x, y },
                radius: { bright: 20.0, dim: 40.0 },
                color: "#ffaa00",
                decay: "inverse_square",
                animation: { type: "none", speed: 1.0, intensity_variance: 0.1 }
            };

            manifest.lights.push(newLight);
            return { ...s, manifest, selectedItemIds: [newLight.id], activeTool: 'select' };
        });
    },

    addEvent: (x, y) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            if (!manifest.events) manifest.events = [];

            const newEvent = {
                id: `event_${Date.now()}`,
                type: "teleport",
                trigger_bounds: {
                    shape: "rectangle", 
                    center: { x, y },
                    width: 1.0,
                    height: 1.0 
                },
                conditions: { requires_interaction: true },
                destination: {
                    type: "intra_map",
                    target_coordinates: { x: 0.0, y: 0.0, z: 0.0 },
                    uri: "" 
                }
            };

            manifest.events.push(newEvent);
            return { ...s, manifest, selectedItemIds: [newEvent.id], activeTool: 'select' };
        });
    },

    addAudio: (x, y) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            if (!manifest.audio) manifest.audio = [];

            const newAudio = {
                id: `audio_${Date.now()}`,
                type: "localized",
                bounds: {
                    shape: "circle", 
                    center: { x, y },
                    radius: 2.0 
                },
                source: "", 
                volume: 1.0,
                fade_distance: 2.0 
            };

            manifest.audio.push(newAudio);
            return { ...s, manifest, selectedItemIds: [newAudio.id], activeTool: 'select' };
        });
    },

    addOverhead: (x, y) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            if (!manifest.geometry.overhead) manifest.geometry.overhead = [];

            const newOverhead = {
                id: `roof_${Date.now()}`,
                type: "roof",
                bounds: {
                    shape: "rectangle", 
                    center: { x, y },
                    width: 4.0, 
                    height: 4.0 
                },
                height: { bottom: 10.0, top: 25.0 },
                image: { uri: "" } 
            };

            manifest.geometry.overhead.push(newOverhead);
            return { ...s, manifest, selectedItemIds: [newOverhead.id], activeTool: 'select' };
        });
    },

    addEmitter: (x, y) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            if (!manifest.emitters) manifest.emitters = [];

            const newEmitter = {
                id: `emitter_${Date.now()}`,
                type: "rain",
                bounds: {
                    shape: "rectangle", 
                    center: { x, y },
                    width: 4.0, 
                    height: 4.0 
                },
                properties: {
                    intensity: 0.5,
                    speed: 1.0,
                    angle: 45.0,
                    color: "#ffffff",
                    collision_mode: "none", // NEW: Added collision physics routing
                    wind_influence: {
                        inherit_global: true,
                        influence_scale: 1.0
                    }
                }
            };

            manifest.emitters.push(newEmitter);
            return { ...s, manifest, selectedItemIds: [newEmitter.id], activeTool: 'select' };
        });
    },

    addSpawn: (x, y) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            if (!manifest.landing_zones) manifest.landing_zones = [];

            const newSpawn = {
                id: `lz_${Date.now()}`,
                name: "New Entry Point",
                is_default: manifest.landing_zones.length === 0, 
                position: { x, y, z: 0.0 },
                facing: { x: 0.0, y: 1.0 }, 
                properties: {
                    description: "",
                    camera_zoom_level: 1.0
                }
            };

            manifest.landing_zones.push(newSpawn);
            return { ...s, manifest, selectedItemIds: [newSpawn.id], activeTool: 'select' };
        });
    },

    deleteSelectedItem: () => {
        mapStore.update(s => {
            if (!s.manifest || s.selectedItemIds.length !== 1) return s;
            const id = s.selectedItemIds[0];
            const manifest = JSON.parse(JSON.stringify(s.manifest));

            if (manifest.lights) manifest.lights = manifest.lights.filter(l => l.id !== id);
            if (manifest.events) manifest.events = manifest.events.filter(e => e.id !== id);
            if (manifest.audio) manifest.audio = manifest.audio.filter(a => a.id !== id);
            if (manifest.geometry.overhead) manifest.geometry.overhead = manifest.geometry.overhead.filter(o => o.id !== id);
            if (manifest.landing_zones) manifest.landing_zones = manifest.landing_zones.filter(z => z.id !== id);
            if (manifest.emitters) manifest.emitters = manifest.emitters.filter(em => em.id !== id);
            if (manifest.geometry.walls) manifest.geometry.walls = manifest.geometry.walls.filter(w => w.id !== id);
            if (manifest.geometry.portals) manifest.geometry.portals = manifest.geometry.portals.filter(p => p.id !== id);

            return { ...s, manifest, selectedItemIds: [] };
        });
    },

    mergeSelectedWalls: () => {
        mapStore.update(s => {
            if (s.selectedItemIds.length < 2) return s;
            if (!s.manifest) return s;

            const manifest = JSON.parse(JSON.stringify(s.manifest));
            const wallsToMerge = manifest.geometry.walls.filter(w => s.selectedItemIds.includes(w.id));
            if (wallsToMerge.length < 2) return s; 

            let rawPath = [];
            wallsToMerge.forEach((w) => {
                rawPath.push(...w.path);
            });

            if (rawPath.length === 0) return s;

            let stitchedPath = [rawPath[0]];
            for (let i = 1; i < rawPath.length; i++) {
                const curr = rawPath[i];
                const prev = stitchedPath[stitchedPath.length - 1];
                
                if (curr.type === 'move') {
                    const isConnected = Math.abs(curr.x - prev.x) < 0.01 && Math.abs(curr.y - prev.y) < 0.01;
                    if (isConnected) continue;
                }
                stitchedPath.push(curr);
            }

            let optimizedPath = [stitchedPath[0]];
            for (let i = 1; i < stitchedPath.length; i++) {
                const curr = stitchedPath[i];
                
                if (curr.type === 'line' && i < stitchedPath.length - 1) {
                    const next = stitchedPath[i + 1];
                    if (next.type === 'line') {
                        const prev = optimizedPath[optimizedPath.length - 1];
                        const area = prev.x * (curr.y - next.y) + curr.x * (next.y - prev.y) + next.x * (prev.y - curr.y);
                        
                        if (Math.abs(area) < 0.01) continue; 
                    }
                }
                optimizedPath.push(curr);
            }

            const mergedWall = { ...wallsToMerge[0] };
            mergedWall.id = `wall_merged_${Date.now()}`;
            mergedWall.path = optimizedPath;

            manifest.geometry.walls = manifest.geometry.walls.filter(w => !s.selectedItemIds.includes(w.id));
            manifest.geometry.walls.push(mergedWall);

            return { ...s, manifest, selectedItemIds: [mergedWall.id] };
        });
    },

    convertCategory: (id, currentCategory) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            
            const sourceArray = currentCategory === 'portal' ? manifest.geometry.portals : manifest.geometry.walls;
            const destArray = currentCategory === 'portal' ? manifest.geometry.walls : manifest.geometry.portals;

            const itemIndex = sourceArray.findIndex(item => item.id === id);
            if (itemIndex === -1) return s;

            const item = sourceArray.splice(itemIndex, 1)[0];

            if (currentCategory === 'wall') {
                item.type = 'door';
                delete item.height;
                delete item.states;
            } else {
                item.type = 'standard';
                item.height = { bottom: 0, top: 10 };
            }

            destArray.push(item);
            return { ...s, manifest };
        });
    },

    splitVector: (id, category, clickX, clickY) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            const targetArray = category === 'portal' ? manifest.geometry.portals : manifest.geometry.walls;
            
            const itemIndex = targetArray.findIndex(item => item.id === id);
            if (itemIndex === -1) return s;
            
            const item = targetArray[itemIndex];
            if (item.path.length < 2) return s;

            const unitsPerGrid = manifest.resolution?.units_per_grid || 5;
            const subGridStep = 1.0 / unitsPerGrid; 

            let minDist = Infinity;
            let splitIndex = -1;
            let splitPt = null;

            for (let i = 1; i < item.path.length; i++) {
                const p1 = item.path[i - 1];
                const p2 = item.path[i];
                if (p2.type !== 'line') continue; 

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const l2 = dx*dx + dy*dy;
                if (l2 === 0) continue;

                const segmentLength = Math.sqrt(l2);
                let t = ((clickX - p1.x) * dx + (clickY - p1.y) * dy) / l2;
                t = Math.max(0, Math.min(1, t)); 
                
                const distanceAlongLine = t * segmentLength;
                const snappedDistance = Math.round(distanceAlongLine / subGridStep) * subGridStep;
                
                let snappedT = snappedDistance / segmentLength;
                snappedT = Math.max(0, Math.min(1, snappedT));

                const projX = p1.x + snappedT * dx;
                const projY = p1.y + snappedT * dy;

                const dist = Math.sqrt((clickX - projX)**2 + (clickY - projY)**2);
                if (dist < minDist) {
                    minDist = dist;
                    splitIndex = i;
                    splitPt = { x: projX, y: projY };
                }
            }

            if (splitIndex === -1 || !splitPt) return s;

            const idTimestamp = Date.now();
            const item1 = { 
                ...item, 
                id: `${item.id}_a_${idTimestamp}`, 
                path: [...item.path.slice(0, splitIndex), { type: 'line', x: splitPt.x, y: splitPt.y }] 
            };
            const item2 = { 
                ...item, 
                id: `${item.id}_b_${idTimestamp}`, 
                path: [{ type: 'move', x: splitPt.x, y: splitPt.y }, ...item.path.slice(splitIndex)] 
            };

            targetArray.splice(itemIndex, 1, item1, item2);
            return { ...s, manifest, selectedItemIds: [item1.id, item2.id] };
        });
    },

    smoothSelectedWalls: () => {
        mapStore.update(s => {
            if (!s.manifest || s.selectedItemIds.length === 0) return s;
            
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            const tension = 0.2; 
            
            s.selectedItemIds.forEach(id => {
                const wallIndex = manifest.geometry.walls.findIndex(w => w.id === id);
                if (wallIndex === -1) return;
                
                const wall = manifest.geometry.walls[wallIndex];
                if (wall.path.length < 3) return; 
                
                const oldPath = wall.path;
                const newPath = [oldPath[0]]; 
                
                for (let i = 1; i < oldPath.length; i++) {
                    const curr = oldPath[i];
                    if (curr.type === 'bezier') {
                        newPath.push(curr); 
                        continue;
                    }
                    
                    const prev = oldPath[i - 1];
                    const prevPrev = oldPath[i - 2] || prev;
                    const next = oldPath[i + 1] || curr;
                    
                    const cp1x = prev.x + (curr.x - prevPrev.x) * tension;
                    const cp1y = prev.y + (curr.y - prevPrev.y) * tension;
                    const cp2x = curr.x - (next.x - prev.x) * tension;
                    const cp2y = curr.y - (next.y - prev.y) * tension;
                    
                    newPath.push({ type: 'bezier', cp1: { x: cp1x, y: cp1y }, cp2: { x: cp2x, y: cp2y }, x: curr.x, y: curr.y });
                }
                wall.path = newPath;
            });
            return { ...s, manifest };
        });
    },

    reverseVector: (id, category) => {
        mapStore.update(s => {
            if (!s.manifest) return s;
            const manifest = JSON.parse(JSON.stringify(s.manifest));
            const targetArray = category === 'portal' ? manifest.geometry.portals : manifest.geometry.walls;

            const itemIndex = targetArray.findIndex(item => item.id === id);
            if (itemIndex === -1) return s;

            const item = targetArray[itemIndex];
            const oldPath = item.path;
            
            if (!oldPath || oldPath.length < 2) return s;

            const newPath = [];
            
            const lastNode = oldPath[oldPath.length - 1];
            newPath.push({ type: 'move', x: lastNode.x, y: lastNode.y });

            for (let i = oldPath.length - 1; i >= 1; i--) {
                const curr = oldPath[i];
                const prev = oldPath[i - 1];

                if (curr.type === 'line' || curr.type === 'move') {
                    newPath.push({ type: 'line', x: prev.x, y: prev.y });
                } else if (curr.type === 'bezier') {
                    newPath.push({
                        type: 'bezier',
                        cp1: { x: curr.cp2.x, y: curr.cp2.y },
                        cp2: { x: curr.cp1.x, y: curr.cp1.y },
                        x: prev.x,
                        y: prev.y
                    });
                }
            }

            item.path = newPath;
            return { ...s, manifest };
        });
    }
};