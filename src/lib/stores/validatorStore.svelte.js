export class ValidatorStore {
    constructor(store) {
        this.store = store;
    }

    healGeometry() {
        const activeMap = this.store.activeMap;
        if (!activeMap || !activeMap.manifest.geometry) return;

        const m = activeMap.manifest;
        const threshold = 0.1; // 0.1 grid units tolerance for microscopic gaps
        const thresholdSq = threshold * threshold;
        let mergeCount = 0;

        const allVertices = [];
        
        ['walls', 'portals', 'overhead'].forEach(cat => {
            if (!m.geometry[cat]) return;
            m.geometry[cat].forEach(item => {
                if (!item.path) return;
                item.path.forEach(pt => {
                    allVertices.push(pt); 
                });
            });
        });

        // O(n^2) comparison - safe because map vertex counts are generally in the low thousands
        for (let i = 0; i < allVertices.length; i++) {
            const pt1 = allVertices[i];
            const x1 = Number(pt1.x);
            const y1 = Number(pt1.y);

            for (let j = i + 1; j < allVertices.length; j++) {
                const pt2 = allVertices[j];
                const x2 = Number(pt2.x);
                const y2 = Number(pt2.y);

                if (x1 === x2 && y1 === y2) continue;

                const distSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;

                if (distSq < thresholdSq) {
                    pt2.x = x1;
                    pt2.y = y1;
                    mergeCount++;
                }
            }
        }

        if (mergeCount > 0) {
            ['walls', 'portals', 'overhead'].forEach(cat => {
                if (m.geometry[cat]) m.geometry[cat] = [...m.geometry[cat]];
            });
            this.store.activeMap.manifest = { ...m };
            this.store.pushHistory(`Healed Geometry (${mergeCount} vertices merged)`);
            this.store.updateSpatialIndex();
            this.store.updateTrigger++;
        }
    }
}