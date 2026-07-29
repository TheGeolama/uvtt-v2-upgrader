export class GeometryMutator {
    constructor(store) {
        this.store = store;
    }

    addGeometry(type, path, isBezier = false) {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;
        const id = crypto.randomUUID();
        if (type === 'wall') {
            if (!activeMap.manifest.geometry.walls) activeMap.manifest.geometry.walls = [];
            activeMap.manifest.geometry.walls.push({ id, path, isBezier, height: JSON.parse(JSON.stringify(this.store.defaultSettings.wall.height)), properties: JSON.parse(JSON.stringify(this.store.defaultSettings.wall.properties)) });
        } else if (type === 'portal') {
            if (!activeMap.manifest.geometry.portals) activeMap.manifest.geometry.portals = [];
            activeMap.manifest.geometry.portals.push({ id, path, isBezier, height: JSON.parse(JSON.stringify(this.store.defaultSettings.portal.height)), properties: JSON.parse(JSON.stringify(this.store.defaultSettings.portal.properties)) });
        } else if (type === 'roof') {
            if (!activeMap.manifest.geometry.overhead) activeMap.manifest.geometry.overhead = [];
            activeMap.manifest.geometry.overhead.push({ id, path, height: JSON.parse(JSON.stringify(this.store.defaultSettings.roof.height)), properties: JSON.parse(JSON.stringify(this.store.defaultSettings.roof.properties)) });
        }
        this.store.activeMap.manifest = { ...activeMap.manifest };
        this.store.pushHistory(`Added ${type}`);
        this.store.updateSpatialIndex();
    }

    deleteVectorNode(exactX, exactY, thresholdSq) {
        const activeMap = this.store.activeMap;
        if (!activeMap) return false;
        let nodeDeleted = false;

        ['walls', 'portals', 'overhead'].forEach(cat => {
            if (!activeMap.manifest.geometry[cat]) return;
            const newItems = [...activeMap.manifest.geometry[cat]]; 
            
            for (let itemIdx = newItems.length - 1; itemIdx >= 0; itemIdx--) {
                const item = { ...newItems[itemIdx] }; 
                if (!item.path) continue;
                for (let i = 0; i < item.path.length; i++) {
                    const px = Number(item.path[i].x);
                    const py = Number(item.path[i].y);
                    const distSq = (exactX - px) ** 2 + (exactY - py) ** 2;

                    if (distSq < thresholdSq) {
                        item.path = [...item.path];
                        item.path.splice(i, 1);
                        
                        if (item.path.length < 2) {
                            newItems.splice(itemIdx, 1);
                            this.store.selectedItemIds = this.store.selectedItemIds.filter(id => id !== item.id);
                            
                            this.store.catalog.forEach(mapDef => {
                                mapDef.manifest?.entities?.events?.forEach(ev => {
                                    if (ev.target_entity_ids) {
                                        ev.target_entity_ids = ev.target_entity_ids.filter(tid => tid !== item.id);
                                    }
                                });
                            });
                        } else {
                            newItems[itemIdx] = item;
                        }
                        
                        nodeDeleted = true;
                        activeMap.manifest.geometry[cat] = newItems; 
                        this.store.pushHistory("Delete Vector Node");
                        this.store.updateSpatialIndex();
                        this.store.updateTrigger++;
                        return; 
                    }
                }
            }
        });
        return nodeDeleted;
    }

    splitVectorNode(exactX, exactY, thresholdSq) {
        const activeMap = this.store.activeMap;
        if (!activeMap) return false;
        let splitOccurred = false;

        ['walls', 'portals', 'overhead'].forEach(cat => {
            if (!activeMap.manifest.geometry[cat]) return;
            const newItems = [...activeMap.manifest.geometry[cat]]; 
            
            for (let itemIdx = 0; itemIdx < newItems.length; itemIdx++) {
                if (splitOccurred) continue;
                const item = { ...newItems[itemIdx] };
                if (!item.path || item.path.length < 2) continue;
                
                for (let i = 0; i < item.path.length - 1; i++) {
                    const x1 = Number(item.path[i].x);
                    const y1 = Number(item.path[i].y);
                    const x2 = Number(item.path[i + 1].x);
                    const y2 = Number(item.path[i + 1].y);
                    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
                    if (l2 === 0) continue;

                    let t = Math.max(0, Math.min(1, ((exactX - x1) * (x2 - x1) + (exactY - y1) * (y2 - y1)) / l2));
                    const projX = x1 + t * (x2 - x1);
                    const projY = y1 + t * (y2 - y1);
                    const distSq = (exactX - projX) ** 2 + (exactY - projY) ** 2;

                    if (distSq < thresholdSq) {
                        const splitPoint = { x: exactX, y: exactY };
                        const path1 = [...item.path.slice(0, i + 1), splitPoint];
                        const path2 = [splitPoint, ...item.path.slice(i + 1)];

                        item.path = path1;
                        newItems[itemIdx] = item;

                        const newItem = {
                            id: crypto.randomUUID(),
                            path: path2,
                            height: JSON.parse(JSON.stringify(item.height)), 
                            properties: JSON.parse(JSON.stringify(item.properties)) 
                        };
                        if (item.isBezier !== undefined) newItem.isBezier = item.isBezier;

                        newItems.splice(itemIdx + 1, 0, newItem);
                        
                        splitOccurred = true;
                        activeMap.manifest.geometry[cat] = newItems;
                        this.store.pushHistory("Cut Vector Segment");
                        this.store.updateSpatialIndex();
                        this.store.updateTrigger++;
                        return; 
                    }
                }
            }
        });
        return splitOccurred;
    }

    updateSingleNodePosition(id, nodeIndex, exactX, exactY) {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;
        const m = activeMap.manifest;
        
        ['walls', 'portals', 'overhead'].forEach(cat => {
            if (!m.geometry[cat]) return;
            const itemIndex = m.geometry[cat].findIndex(i => i.id === id);
            if (itemIndex > -1) {
                const newItems = [...m.geometry[cat]];
                const item = { ...newItems[itemIndex] };
                if (item.path && item.path[nodeIndex]) {
                    item.path = [...item.path];
                    item.path[nodeIndex].x = exactX;
                    item.path[nodeIndex].y = exactY;
                    newItems[itemIndex] = item;
                    m.geometry[cat] = newItems; 
                }
            }
        });

        this.store.activeMap.manifest = { ...m };
        this.store.pushHistory("Moved Vector Node");
        this.store.updateSpatialIndex();
        this.store.updateTrigger++;
    }

    convertCategory(id, targetCategory, portalType = 'door') {
        const activeMap = this.store.activeMap;
        if (!activeMap) return;
        const m = activeMap.manifest;
        let foundItem = null;
        ['walls', 'portals'].forEach(cat => {
            const itemIndex = m.geometry[cat]?.findIndex(i => i.id === id);
            if (itemIndex > -1) {
                foundItem = m.geometry[cat].splice(itemIndex, 1)[0];
                m.geometry[cat] = [...m.geometry[cat]]; 
            }
        });
        if (foundItem) {
            if (targetCategory === 'portals') {
                if (!foundItem.properties) foundItem.properties = {};
                foundItem.properties.type = portalType;
                foundItem.properties.state = 'closed';
            } else {
                if (foundItem.properties) { delete foundItem.properties.type; delete foundItem.properties.state; }
            }
            if (!m.geometry[targetCategory]) m.geometry[targetCategory] = [];
            m.geometry[targetCategory].push(foundItem);
            m.geometry[targetCategory] = [...m.geometry[targetCategory]]; 
            
            this.store.activeMap.manifest = { ...m };
            this.store.pushHistory("Converted Entity");
            this.store.updateSpatialIndex();
        }
    }

    smoothSelectedWalls() {
        const activeMap = this.store.activeMap;
        if (!activeMap || this.store.selectedItemIds.length === 0) return;
        const m = activeMap.manifest;
        let modified = false;

        this.store.selectedItemIds.forEach(id => {
            const wallIndex = m.geometry.walls?.findIndex(i => i.id === id);
            if (wallIndex > -1) {
                const newWalls = [...m.geometry.walls];
                const wall = { ...newWalls[wallIndex] };
                
                if (wall.path && wall.path.length >= 3) {
                    let smoothedPath = wall.path.map(pt => ({ x: Number(pt.x), y: Number(pt.y) }));
                    
                    const newPath = [];
                    for (let i = 0; i < smoothedPath.length - 1; i++) {
                        const p0 = smoothedPath[i];
                        const p1 = smoothedPath[i + 1];
                        newPath.push({ x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 });
                        newPath.push({ x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 });
                    }
                    
                    smoothedPath = [
                        { x: smoothedPath[0].x, y: smoothedPath[0].y },
                        ...newPath,
                        { x: smoothedPath[smoothedPath.length - 1].x, y: smoothedPath[smoothedPath.length - 1].y }
                    ];

                    wall.path = smoothedPath;
                    wall.isBezier = true; 
                    newWalls[wallIndex] = wall;
                    m.geometry.walls = newWalls;
                    modified = true;
                }
            }
        });
        
        if (modified) {
            this.store.activeMap.manifest = { ...m };
            this.store.pushHistory("Applied Smoothing Pass");
            this.store.updateTrigger++;
        }
    }
}