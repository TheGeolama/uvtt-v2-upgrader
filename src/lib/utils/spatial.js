export class QuadTree {
    constructor(bounds, capacity = 4) {
        this.bounds = bounds;
        this.capacity = capacity;
        this.entities = [];
        this.divided = false;
    }

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

    insert(entity) {
        if (!this.contains(entity)) return false;
        if (this.entities.length < this.capacity) {
            this.entities.push(entity);
            return true;
        }
        if (!this.divided) this.subdivide();
        return (this.nw.insert(entity) || this.ne.insert(entity) || this.sw.insert(entity) || this.se.insert(entity));
    }

    contains(entity) {
        const { x, y } = entity.pos;
        return x >= this.bounds.x && x <= this.bounds.x + this.bounds.w &&
               y >= this.bounds.y && y <= this.bounds.y + this.bounds.h;
    }

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

    intersects(range) {
        return !(range.x > this.bounds.x + this.bounds.w || range.x + range.w < this.bounds.x ||
                 range.y > this.bounds.y + this.bounds.h || range.y + range.h < this.bounds.y);
    }

    inRange(entity, range) {
        const { x, y } = entity.pos;
        return x >= range.x && x <= range.x + range.w && y >= range.y && y <= range.y + range.h;
    }
}

export function pointsToBezier(points) {
    if (points.length < 3) return points;
    let p = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[0];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i !== points.length - 2 ? points[i + 2] : p2;
        const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        p.push({ x: p1.x, y: p1.y, cp1, cp2 });
    }
    p.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
    return p;
}