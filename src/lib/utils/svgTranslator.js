/**
 * @fileoverview UVTT v2 SVG Geometry Translator
 * Converts raw coordinate arrays from the Upgrader's in-memory store into 
 * strict W3C SVG vector command objects required by the UVTT v2 specification.
 */

/**
 * Translates an array of points into an array of SVG command objects.
 * 
 * @param {Array<{x: number, y: number}>} points - The raw array of coordinates.
 * @param {boolean} isBezier - Whether the line should be exported as a smooth curve.
 * @returns {Array<Object>} The Spec-compliant SVG geometry array.
 */
export function translatePathToSvg(points, isBezier = false) {
    if (!points || points.length === 0) return [];
    
    const svgPath = [];
    
    // 1. The path MUST always start with a 'move' command to establish the origin
    svgPath.push({ 
        type: 'move', 
        x: Number(points[0].x.toFixed(3)), 
        y: Number(points[0].y.toFixed(3)) 
    });

    // Handle single point anomalies gracefully
    if (points.length === 1) return svgPath;

    if (!isBezier || points.length <= 2) {
        // -----------------------------------------------------------
        // LINEAR TRANSLATION
        // -----------------------------------------------------------
        for (let i = 1; i < points.length; i++) {
            svgPath.push({ 
                type: 'line', 
                x: Number(points[i].x.toFixed(3)), 
                y: Number(points[i].y.toFixed(3)) 
            });
        }
    } else {
        // -----------------------------------------------------------
        // BÉZIER CURVE TRANSLATION (Catmull-Rom to Cubic Bézier)
        // -----------------------------------------------------------
        // We use a tension factor (0.2) to calculate smooth control points 
        // dynamically based on the previous and next points in the array.
        const tension = 0.2;
        
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = i > 0 ? points[i - 1] : points[0];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i !== points.length - 2 ? points[i + 2] : p2;

            // Calculate Control Point 1
            const cp1 = {
                x: p1.x + (p2.x - p0.x) * tension,
                y: p1.y + (p2.y - p0.y) * tension
            };

            // Calculate Control Point 2
            const cp2 = {
                x: p2.x - (p3.x - p1.x) * tension,
                y: p2.y - (p3.y - p1.y) * tension
            };

            svgPath.push({
                type: 'bezier',
                cp1: { x: Number(cp1.x.toFixed(3)), y: Number(cp1.y.toFixed(3)) },
                cp2: { x: Number(cp2.x.toFixed(3)), y: Number(cp2.y.toFixed(3)) },
                to:  { x: Number(p2.x.toFixed(3)),  y: Number(p2.y.toFixed(3))  }
            });
        }
    }

    return svgPath;
}