/**
 * @fileoverview Spatial Mathematics and Indexing Utilities
 * Provides the QuadTree data structure for highly optimized 2D spatial queries,
 * as well as mathematical geometry functions for smoothing vector paths[cite: 10].
 */

/**
 * A QuadTree implementation for 2D spatial partitioning.
 * Used by the mapStore to rapidly query entities for mouse hover, bounding box selections,
 * and collision detection without iterating over the entire map array (O(n) -> O(log n))[cite: 10].
 */
export class QuadTree {
    /**
     * Initializes a new QuadTree node[cite: 10].
     * 
     * @param {Object} bounds - The rectangular bounds of this node {x, y, w, h}.
     * @param {number} [capacity=4] - The maximum number of entities this node can hold before subdividing[cite: 10].
     */
    constructor(bounds, capacity = 4) {
        this.bounds = bounds;
        this.capacity = capacity;
        this.entities = [];
        this.divided = false;
    }

    /**
     * Subdivides the current QuadTree node into four smaller quadrants (NW, NE, SW, SE)[cite: 10].
     * Triggered automatically when the node exceeds its entity capacity[cite: 10].
     */
    subdivide() {
        const { x, y, w, h } = this.bounds;
        const hw = w / 2;
        const hh = h / 2;
        this.nw = new QuadTree({ x, y, w: hw, h: hh }, this.capacity);
        this.ne = new QuadTree({ x: x + hw, y, w: hw, h: hh }, this.capacity);
        this.sw = new QuadTree({ x, y: y + hh, w: hw, h: hh }, this.capacity);
        this.se = new QuadTree({ x: x + hw, y: y + hh, w: hw, h: hh }, this.capacity);
        this.divided = true;
    }

    /**
     * Inserts an entity into the QuadTree.
     * If the node is full, it subdivides and passes the entity down to the appropriate child quadrant[cite: 10].
     * 
     * @param {Object} entity - The entity to insert. Must contain a `pos` object with `x` and `y` coordinates[cite: 10].
     * @returns {boolean} True if the entity was successfully inserted, false if it falls outside this node's bounds[cite: 10].
     */
    insert(entity) {
        if (!this.contains(entity)) return false;
        
        if (this.entities.length < this.capacity) {
            this.entities.push(entity);
            return true;
        }
        
        if (!this.divided) this.subdivide();
        
        return (
            this.nw.insert(entity) || 
            this.ne.insert(entity) || 
            this.sw.insert(entity) || 
            this.se.insert(entity)
        );
    }

    /**
     * Checks if a specific entity's exact coordinates fall within this node's spatial bounds[cite: 10].
     * 
     * @param {Object} entity - The entity to check.
     * @returns {boolean} True if the entity is within bounds[cite: 10].
     */
    contains(entity) {
        const { x, y } = entity.pos;
        return x >= this.bounds.x && x <= this.bounds.x + this.bounds.w &&
               y >= this.bounds.y && y <= this.bounds.y + this.bounds.h;
    }

    /**
     * Queries the QuadTree for all entities that fall within a given rectangular range[cite: 10].
     * 
     * @param {Object} range - The query bounding box {x, y, w, h}.
     * @param {Array} [found=[]] - The accumulated array of found entities (used during recursion)[cite: 10].
     * @returns {Array} An array of all entities located within the query range[cite: 10].
     */
    retrieve(range, found = []) {
        if (!this.intersects(range)) return found;
        
        for (const entity of this.entities) {
            if (this.inRange(entity, range)) found.push(entity);
        }
        
        if (this.divided) {
            this.nw.retrieve(range, found);
            this.ne.retrieve(range, found);
            this.sw.retrieve(range, found);
            this.se.retrieve(range, found);
        }
        
        return found;
    }

    /**
     * Determines if a query range geometrically intersects with this node's bounds[cite: 10].
     * Used to quickly discard entirely irrelevant branches of the tree during a search[cite: 10].
     * 
     * @param {Object} range - The query bounding box {x, y, w, h}.
     * @returns {boolean} True if the rectangles overlap[cite: 10].
     */
    intersects(range) {
        return !(range.x > this.bounds.x + this.bounds.w || range.x + range.w < this.bounds.x ||
                 range.y > this.bounds.y + this.bounds.h || range.y + range.h < this.bounds.y);
    }

    /**
     * Verifies if a specific entity's coordinates fall inside the query range[cite: 10].
     * 
     * @param {Object} entity - The entity to check.
     * @param {Object} range - The query bounding box {x, y, w, h}.
     * @returns {boolean} True if the entity is inside the query box[cite: 10].
     */
    inRange(entity, range) {
        const { x, y } = entity.pos;
        return x >= range.x && x <= range.x + range.w && y >= range.y && y <= range.y + range.h;
    }
}

/**
 * Converts a rigid array of linear points into a smoothed Cubic Bezier path[cite: 10].
 * Uses a Catmull-Rom spline approach to mathematically generate control points (cp1, cp2) 
 * that pull the curve smoothly through each original vertex without overshooting[cite: 10].
 * 
 * @param {Array<{x: number, y: number}>} points - The raw sequence of vector nodes.
 * @returns {Array<{x: number, y: number, cp1?: Object, cp2?: Object}>} The smoothed path array formatted for SVG/Canvas rendering[cite: 10].
 */
export function pointsToBezier(points) {
    // Mathematical prerequisite: cannot curve a line with fewer than 3 points[cite: 10]
    if (points.length < 3) return points;
    
    let p = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[0];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i !== points.length - 2 ? points[i + 2] : p2;
        
        // Calculate tension control points using 1/6th of the distance to adjacent nodes[cite: 10]
        const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        
        p.push({ x: p1.x, y: p1.y, cp1, cp2 });
    }
    
    // Always perfectly pin the absolute end coordinate[cite: 10]
    p.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
    
    return p;
}