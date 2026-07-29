export class GridEngine {
    constructor(store) {
        this.store = store;
    }

    setGridOrigin(imagePixelX, imagePixelY) {
        if (!this.store.activeMap) return;
        const res = this.store.activeMap.manifest.resolution;
        
        const gridX = Number(res.pixels_per_grid) || 70;
        const gridY = Number(res.pixels_per_grid_y) || gridX;

        const modX = ((imagePixelX % gridX) + gridX) % gridX;
        const modY = ((imagePixelY % gridY) + gridY) % gridY;

        res.map_offset_x = -modX;
        res.map_offset_y = -modY;
        
        this.store.pushHistory("Pinned Grid Origin");
        this.store.updateTrigger++;
    }

    stepGridOffset(stepsX, stepsY) {
        if (!this.store.activeMap) return;
        const res = this.store.activeMap.manifest.resolution;
        
        const gridX = Number(res.pixels_per_grid) || 70;
        const gridY = Number(res.pixels_per_grid_y) || gridX;
        
        res.map_offset_x = (Number(res.map_offset_x) || 0) + (stepsX * gridX);
        res.map_offset_y = (Number(res.map_offset_y) || 0) + (stepsY * gridY);
        
        this.store.pushHistory("Stepped Grid Offset");
        this.store.updateTrigger++;
    }

    /**
     * Applies rubber-sheeting math based on user-drawn calibration boxes.
     * @param {number} squares - The number of grid squares each box represents. Default is 1.
     */
    calculateGridAlignment(squares = 1) {
        if (!this.store.activeMap || this.store.gridAlignBoxes.length === 0 || squares <= 0) return;
        const boxes = this.store.gridAlignBoxes;
        
        let sumW = 0, sumH = 0;
        let validCount = 0;

        boxes.forEach(b => {
            const w = Math.abs(b.ex - b.sx);
            const h = Math.abs(b.ey - b.sy);
            if (w > 10 && h > 10) {
                sumW += w;
                sumH += h;
                validCount++;
            }
        });

        if (validCount === 0) {
            this.store.gridAlignBoxes = [];
            return;
        }

        const averageBoxWidth = sumW / validCount;
        const averageBoxHeight = sumH / validCount;

        const newPpgX = Math.max(10, averageBoxWidth / squares);
        const newPpgY = Math.max(10, averageBoxHeight / squares);
        
        const anchorX = Math.min(boxes[0].sx, boxes[0].ex);
        const anchorY = Math.min(boxes[0].sy, boxes[0].ey);
        
        const res = this.store.activeMap.manifest.resolution;
        const oldPpgX = Number(res.pixels_per_grid) || 70;
        const oldPpgY = Number(res.pixels_per_grid_y) || oldPpgX;
        
        const pixelWidth = (res.map_size[0] || 50) * oldPpgX;
        const pixelHeight = (res.map_size[1] || 50) * oldPpgY;
        
        res.pixels_per_grid = newPpgX;
        res.pixels_per_grid_y = newPpgY; 
        
        res.map_size[0] = pixelWidth / newPpgX;
        res.map_size[1] = pixelHeight / newPpgY;
        
        const modX = ((anchorX % newPpgX) + newPpgX) % newPpgX;
        const modY = ((anchorY % newPpgY) + newPpgY) % newPpgY;
        
        res.map_offset_x = -modX;
        res.map_offset_y = -modY;

        this.store.gridAlignBoxes = [];
        this.store.setTool('select');
        this.store.pushHistory("Rubber Sheet Grid Alignment");
        this.store.updateTrigger++;
    }

    updateManualGrid(newPpgX, newPpgY, offX, offY) {
        if (!this.store.activeMap) return;
        const res = this.store.activeMap.manifest.resolution;
        
        const oldPpgX = Number(res.pixels_per_grid) || 70;
        const oldPpgY = Number(res.pixels_per_grid_y) || oldPpgX;
        
        const pixelWidth = res.map_size[0] * oldPpgX;
        const pixelHeight = res.map_size[1] * oldPpgY;

        if (newPpgX !== null && !isNaN(newPpgX) && newPpgX > 0) {
            res.pixels_per_grid = Number(newPpgX);
            res.map_size[0] = pixelWidth / res.pixels_per_grid;
            if (res.pixels_per_grid_y === undefined) {
                res.pixels_per_grid_y = res.pixels_per_grid;
                res.map_size[1] = pixelHeight / res.pixels_per_grid_y;
            }
        }
        
        if (newPpgY !== null && !isNaN(newPpgY) && newPpgY > 0) {
            res.pixels_per_grid_y = Number(newPpgY);
            res.map_size[1] = pixelHeight / res.pixels_per_grid_y;
        }

        if (offX !== null && !isNaN(offX)) res.map_offset_x = Number(offX);
        if (offY !== null && !isNaN(offY)) res.map_offset_y = Number(offY);

        this.store.pushHistory("Manual Grid Adjustment");
        this.store.updateTrigger++;
    }

    clearGridAlignment() {
        this.store.gridAlignBoxes = [];
        this.store.updateTrigger++;
    }
}