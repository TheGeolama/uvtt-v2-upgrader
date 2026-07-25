/**
 * @fileoverview PixiJS Vision & Fog of War Engine
 * A dedicated vanilla JavaScript class that handles the heavy lifting of Line of Sight (LoS) 
 * rendering and Fog of War (FoW) generation using PixiJS RenderTextures and custom blend modes[cite: 19].
 */

import * as PIXI from 'pixi.js';

export class VisionEngine {
    /**
     * Initializes the Vision Engine and prepares the off-screen WebGL RenderTextures[cite: 19].
     * 
     * @param {PIXI.Application} app - The core PixiJS application instance[cite: 19].
     * @param {number} mapWidth - The total width of the map in absolute pixels[cite: 19].
     * @param {number} mapHeight - The total height of the map in absolute pixels[cite: 19].
     * @param {PIXI.Container} parentContainer - The viewport container where the FoW sprite will be attached[cite: 19].
     */
    constructor(app, mapWidth, mapHeight, parentContainer) {
        this.app = app;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.walls = [];
        this.parentContainer = parentContainer;

        // 1. The Render Texture holds our Fog of War / Darkness mask[cite: 19]
        this.fowTexture = PIXI.RenderTexture.create({
            width: mapWidth,
            height: mapHeight
        });

        // 2. The Sprite that visually displays the FoW texture on the canvas[cite: 19]
        this.fowSprite = new PIXI.Sprite(this.fowTexture);
        this.fowSprite.alpha = 0.95; // Darkness opacity for Player View[cite: 19]
        
        // 3. Graphics object used to draw the visible light polygons[cite: 19]
        this.lightGraphics = new PIXI.Graphics();
        // Pixi v8 blend mode string used to punch "holes" in the darkness texture[cite: 19]
        this.lightGraphics.blendMode = 'erase';

        // 4. Background rect used to completely reset the Fog to pitch black every frame[cite: 19]
        this.darknessRect = new PIXI.Graphics();
        this.darknessRect.rect(0, 0, mapWidth, mapHeight).fill(0x000000);
        
        // Add FoW sprite directly to the pan/zoom viewport[cite: 19]
        if (this.parentContainer) {
            this.parentContainer.addChild(this.fowSprite);
        }
    }

    /**
     * Ingests and caches the physical architecture of the map[cite: 19].
     * Injects an outer bounding box to ensure light rays do not calculate into infinity[cite: 19].
     * 
     * @param {Array<{p1: {x: number, y: number}, p2: {x: number, y: number}}>} pixelWalls - Array of line segments in absolute pixel coordinates[cite: 19].
     */
    updateGeometry(pixelWalls) {
        this.walls = [...pixelWalls];
        
        // Always include the map boundaries so rays don't fire into infinity[cite: 19]
        this.walls.push(
            { p1: { x: 0, y: 0 }, p2: { x: this.mapWidth, y: 0 } },
            { p1: { x: this.mapWidth, y: 0 }, p2: { x: this.mapWidth, y: this.mapHeight } },
            { p1: { x: this.mapWidth, y: this.mapHeight }, p2: { x: 0, y: this.mapHeight } },
            { p1: { x: 0, y: this.mapHeight }, p2: { x: 0, y: 0 } }
        );
    }

    /**
     * Master render loop for the vision system. Called dynamically as the camera or tokens move[cite: 19].
     * 
     * @param {Array<{x: number, y: number, radius: number}>} lightSources - Array of light or token vision parameters[cite: 19].
     */
    renderVision(lightSources) {
        if (!this.app || !this.app.renderer) return;

        // Step 1: Reset the Render Texture by flooding it with solid darkness[cite: 19]
        this.app.renderer.render({ 
            container: this.darknessRect, 
            target: this.fowTexture, 
            clear: true 
        });

        this.lightGraphics.clear();

        // Step 2: Calculate vision polygon for each light source[cite: 19]
        for (const source of lightSources) {
            const polygon = this.calculateVisibilityPolygon(source.x, source.y, source.radius);
            
            if (polygon.length > 0) {
                // Draw the polygonal vision wedge using the 'erase' blend mode[cite: 19]
                this.lightGraphics.poly(polygon);
                this.lightGraphics.fill({ color: 0xFFFFFF, alpha: 1.0 });
            }
        }

        // Step 3: Render the erased holes directly into the Fog of War texture[cite: 19]
        this.app.renderer.render({ 
            container: this.lightGraphics, 
            target: this.fowTexture, 
            clear: false 
        });
    }

    /**
     * 2D Sweep-Line Raycasting Algorithm[cite: 19].
     * Sweeps 360 degrees, firing mathematical rays at every known wall vertex to map out 
     * the exact geometric shape of the visible area[cite: 19].
     * 
     * @param {number} ox - The X origin of the light source[cite: 19].
     * @param {number} oy - The Y origin of the light source[cite: 19].
     * @param {number} radius - The maximum vision distance[cite: 19].
     * @returns {Array<number>} A flat, 1D array of alternating X/Y coordinates formatted for PIXI.Graphics.poly()[cite: 19].
     */
    calculateVisibilityPolygon(ox, oy, radius) {
        let points = [];
        let angles = [];

        // Collect angles to all wall endpoints[cite: 19]
        for (const wall of this.walls) {
            for (const p of [wall.p1, wall.p2]) {
                const angle = Math.atan2(p.y - oy, p.x - ox);
                // Cast three rays per vertex: a direct hit, and slightly offset to see past corners[cite: 19]
                angles.push(angle - 0.00001, angle, angle + 0.00001);
            }
        }

        // Remove duplicate angles and sort them rotationally (clockwise)[cite: 19]
        angles = [...new Set(angles)].sort((a, b) => a - b);

        // Cast rays[cite: 19]
        for (const angle of angles) {
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            
            const rx = ox + dx * radius;
            const ry = oy + dy * radius;

            let closestIntersect = null;
            let minT1 = 1.0; 

            for (const wall of this.walls) {
                const intersect = this.getIntersection(
                    ox, oy, rx, ry,
                    wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y
                );

                if (intersect && intersect.t1 < minT1) {
                    minT1 = intersect.t1;
                    closestIntersect = { x: intersect.x, y: intersect.y };
                }
            }

            if (closestIntersect) {
                points.push(closestIntersect);
            } else {
                points.push({ x: rx, y: ry });
            }
        }

        // Flatten the array for PixiJS (requires [x1, y1, x2, y2, ...])[cite: 19]
        const flatPolygon = [];
        for (const p of points) {
            flatPolygon.push(p.x, p.y);
        }

        return flatPolygon;
    }

    /**
     * Calculates the exact intersection point between two mathematical line segments[cite: 19].
     * 
     * @param {number} r1x - Ray origin X[cite: 19].
     * @param {number} r1y - Ray origin Y[cite: 19].
     * @param {number} r2x - Ray destination X[cite: 19].
     * @param {number} r2y - Ray destination Y[cite: 19].
     * @param {number} s1x - Wall segment start X[cite: 19].
     * @param {number} s1y - Wall segment start Y[cite: 19].
     * @param {number} s2x - Wall segment end X[cite: 19].
     * @param {number} s2y - Wall segment end Y[cite: 19].
     * @returns {{x: number, y: number, t1: number}|null} The intersection coordinates and distance ratio, or null if parallel[cite: 19].
     */
    getIntersection(r1x, r1y, r2x, r2y, s1x, s1y, s2x, s2y) {
        const r_dx = r2x - r1x;
        const r_dy = r2y - r1y;
        const s_dx = s2x - s1x;
        const s_dy = s2y - s1y;

        const denominator = r_dx * s_dy - r_dy * s_dx;
        if (denominator === 0) return null; // Collinear or parallel[cite: 19]

        const u_num = (s1x - r1x) * r_dy - (s1y - r1y) * r_dx;
        const t_num = (s1x - r1x) * s_dy - (s1y - r1y) * s_dx;

        const u = u_num / denominator;
        const t1 = t_num / denominator;

        if (t1 >= 0 && t1 <= 1 && u >= 0 && u <= 1) {
            return {
                x: r1x + r_dx * t1,
                y: r1y + r_dy * t1,
                t1: t1
            };
        }
        return null;
    }
    
    /**
     * Safely destroys all WebGL graphics, sprites, and textures.
     * Crucial for preventing massive VRAM memory leaks when closing or switching maps[cite: 19].
     */
    destroy() {
        if (this.fowSprite && this.fowSprite.parent) {
            this.fowSprite.parent.removeChild(this.fowSprite);
        }
        if (this.fowTexture) this.fowTexture.destroy(true);
        if (this.fowSprite) this.fowSprite.destroy();
        if (this.lightGraphics) this.lightGraphics.destroy();
        if (this.darknessRect) this.darknessRect.destroy();
    }
}