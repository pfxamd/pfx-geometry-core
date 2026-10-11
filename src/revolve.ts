import { EPSILON, finite, GeometryError, positive } from './errors.js';
import { type TriangleMesh, validateMesh } from './mesh.js';
import { vec3, type Vec3 } from './vector.js';

/** Cross-section for a full revolution around the positive Y axis. */
export interface RevolutionProfilePoint {
  /** Positive distance from the Y axis. */
  readonly radius: number;
  /** Position along the Y axis, strictly increasing between points. */
  readonly height: number;
}

export interface RevolutionOptions {
  /** Number of angular sectors. Integer from 3 to 256. */
  readonly radialSegments: number;
  /** Add flat discs at the first/last profile heights. Defaults to true. */
  readonly capEnds?: boolean;
}

/**
 * Full 360-degree revolution of a positive-radius, strictly height-ascending
 * polyline. Creates a faceted lateral surface plus optional flat disc caps.
 *
 * No self-intersection proof, vertex welding, or manifold guarantee.
 * Side normals are constant along a profile segment, varying with angle.
 */
export function revolveProfile(
  profile: ReadonlyArray<RevolutionProfilePoint>,
  options: RevolutionOptions,
): TriangleMesh {
  if (!Array.isArray(profile) || profile.length < 2 || profile.length > 256) {
    throw new GeometryError('INVALID_DIMENSION', 'profile must contain 2 to 256 points');
  }
  if (options === null || typeof options !== 'object' ||
      !Number.isSafeInteger(options.radialSegments) ||
      options.radialSegments < 3 || options.radialSegments > 256 ||
      (options.capEnds !== undefined && typeof options.capEnds !== 'boolean')) {
    throw new GeometryError('INVALID_DIMENSION', 'radialSegments must be 3 to 256 and capEnds must be boolean');
  }

  const points = profile.map((p, i) => {
    if (p === null || typeof p !== 'object') {
      throw new GeometryError('INVALID_DIMENSION', 'invalid profile point');
    }
    const radius = positive(p.radius, `profile[${i}].radius`);
    const height = finite(p.height, `profile[${i}].height`);
    if (radius <= EPSILON) {
      throw new GeometryError('DEGENERATE_GEOMETRY', 'profile radius too small for safe tessellation');
    }
    return { radius, height };
  });
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.height - points[i - 1]!.height <= EPSILON) {
      throw new GeometryError('INVALID_DIMENSION', 'profile heights must increase strictly');
    }
  }

  const { radialSegments } = options;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const pushVertex = (position: Vec3, normal: Vec3): number => {
    const index = positions.length / 3;
    positions.push(position.x, position.y, position.z);
    normals.push(normal.x, normal.y, normal.z);
    return index;
  };
  for (let j = 0; j < points.length - 1; j++) {
    const low = points[j]!, high = points[j + 1]!;
    const dr = high.radius - low.radius;
    const dh = high.height - low.height;
    const magnitude = Math.hypot(dr, dh);
    if (!Number.isFinite(magnitude) || magnitude <= EPSILON) {
      throw new GeometryError('DEGENERATE_GEOMETRY', 'degenerate profile segment');
    }
    const start = positions.length / 3;
    for (let i = 0; i <= radialSegments; i++) {
      const theta = 2 * Math.PI * i / radialSegments;
      const c = Math.cos(theta), s = Math.sin(theta);
      const normal = vec3(dh / magnitude * c, -dr / magnitude, dh / magnitude * s);
      pushVertex(vec3(low.radius * c, low.height, low.radius * s), normal);
      pushVertex(vec3(high.radius * c, high.height, high.radius * s), normal);
    }
    for (let i = 0; i < radialSegments; i++) {
      const a = start + 2 * i, b = a + 1;
      const c = b + 2, d = a + 2;
      indices.push(a, b, c, a, c, d);
    }
  }

  if (options.capEnds !== false) {
    for (const end of [0, 1] as const) {
      const p = end === 0 ? points[0]! : points[points.length - 1]!;
      const sign = end === 0 ? -1 : 1;
      const normal = vec3(0, sign, 0);
      const center = pushVertex(vec3(0, p.height, 0), normal);
      const ringStart = positions.length / 3;
      for (let i = 0; i <= radialSegments; i++) {
        const theta = 2 * Math.PI * i / radialSegments;
        pushVertex(vec3(p.radius * Math.cos(theta), p.height, p.radius * Math.sin(theta)), normal);
      }
      for (let i = 0; i < radialSegments; i++) {
        if (end === 0) indices.push(center, ringStart + i, ringStart + i + 1);
        else indices.push(center, ringStart + i + 1, ringStart + i);
      }
    }
  }
  const mesh: TriangleMesh = Object.freeze({
    positions: Object.freeze(positions),
    normals: Object.freeze(normals),
    indices: Object.freeze(indices),
  });
  validateMesh(mesh);
  return mesh;
}
