import { EPSILON, finite, GeometryError, positive } from './errors.js';
import { type TriangleMesh, validateMesh } from './mesh.js';
import { vec3, type Vec3 } from './vector.js';

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Extrudes a strictly convex, counter-clockwise XY polygon along +Z from
 * z=0 to z=depth. All faces have outward winding and face-specific normals.
 *
 * Only strictly convex polygons are supported. No holes, concave profiles,
 * bevels, smoothing or arbitrary-path sweeps.
 */
export function extrudeConvexPolygon(
  polygon: ReadonlyArray<Point2>,
  depth: number,
): TriangleMesh {
  positive(depth, 'depth');
  if (depth <= EPSILON) {
    throw new GeometryError('DEGENERATE_GEOMETRY', 'extrusion depth too small');
  }
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 256) {
    throw new GeometryError('INVALID_DIMENSION', 'polygon must contain 3 to 256 points');
  }
  const points = polygon.map((p, i) => {
    if (p === null || typeof p !== 'object') {
      throw new GeometryError('INVALID_DIMENSION', 'invalid polygon point');
    }
    return { x: finite(p.x, `polygon[${i}].x`), y: finite(p.y, `polygon[${i}].y`) };
  });

  // Strict CCW convexity rejects clockwise loops, collinear edges, repeated
  // vertices, and all concave/simple self-intersecting input contours.
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const c = points[(i + 2) % points.length]!;
    const abx = b.x - a.x, aby = b.y - a.y;
    const bcx = c.x - b.x, bcy = c.y - b.y;
    const cross = abx * bcy - aby * bcx;
    if (!Number.isFinite(cross) || cross <= EPSILON) {
      throw new GeometryError('INVALID_DIMENSION', 'polygon must be strictly convex and counter-clockwise');
    }
  }
  const area = Math.abs(points.reduce((acc, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return acc + p.x * q.y - q.x * p.y;
  }, 0) * 0.5);
  if (!Number.isFinite(area) || area <= EPSILON) {
    throw new GeometryError('DEGENERATE_GEOMETRY', 'polygon has negligible area');
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3, normal: Vec3): void => {
    const start = positions.length / 3;
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    indices.push(start, start + 1, start + 2);
  };

  const frontNormal = vec3(0, 0, 1);
  const backNormal = vec3(0, 0, -1);
  // Triangle fan is safe because convexity was verified.
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[0]!, b = points[i]!, c = points[i + 1]!;
    triangle(vec3(a.x, a.y, depth), vec3(b.x, b.y, depth), vec3(c.x, c.y, depth), frontNormal);
    triangle(vec3(a.x, a.y, 0), vec3(c.x, c.y, 0), vec3(b.x, b.y, 0), backNormal);
  }

  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const magnitude = Math.hypot(dx, dy);
    if (!Number.isFinite(magnitude) || magnitude <= EPSILON) {
      throw new GeometryError('DEGENERATE_GEOMETRY', 'polygon edge too short');
    }
    const normal = vec3(dy / magnitude, -dx / magnitude, 0);
    const loA = vec3(a.x, a.y, 0), loB = vec3(b.x, b.y, 0);
    const hiA = vec3(a.x, a.y, depth), hiB = vec3(b.x, b.y, depth);
    triangle(loA, loB, hiB, normal);
    triangle(loA, hiB, hiA, normal);
  }

  const mesh: TriangleMesh = Object.freeze({
    positions: Object.freeze(positions),
    normals: Object.freeze(normals),
    indices: Object.freeze(indices),
  });
  validateMesh(mesh);
  return mesh;
}
