import { orient2d, orient3d } from 'robust-predicates';
import { GeometryError, finite } from './errors.js';
import { type Vec3 } from './vector.js';

export type OrientationSign = -1 | 0 | 1;
export type Point2D = readonly [number, number];

function signOf(value: number): OrientationSign {
  if (!Number.isFinite(value)) {
    throw new GeometryError('INVALID_NUMBER', 'Orientation determinant overflowed');
  }
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/**
 * Adaptive-precision 2D orientation. Values are finite IEEE-754 doubles.
 * Positive is counterclockwise in the core's +Y-up convention.
 * The library uses a Y-down sign convention, so we reverse its result.
 */
export function orientation2D(a: Point2D, b: Point2D, c: Point2D): OrientationSign {
  if (!a || !b || !c || a.length !== 2 || b.length !== 2 || c.length !== 2) {
    throw new GeometryError('INVALID_DIMENSION', '2D orientation needs three pairs');
  }
  for (const p of [a, b, c]) {
    finite(p[0]!, 'coordinate x');
    finite(p[1]!, 'coordinate y');
  }
  return signOf(-orient2d(a[0], a[1], b[0], b[1], c[0], c[1]));
}

/**
 * Adaptive-precision point-versus-plane orientation.
 * Positive means d lies above the oriented ABC plane in core +Y-up
 * coordinates. The upstream predicate has the opposite sign.
 * Zero denotes coplanarity for the represented floating-point coordinates.
 */
export function orientation3D(
  a: Vec3, b: Vec3, c: Vec3, d: Vec3,
): OrientationSign {
  const points=[a,b,c,d];
  for (const p of points) {
    if (!p || typeof p !== 'object') {
      throw new GeometryError('INVALID_DIMENSION','3D orientation requires four points');
    }
    finite(p.x, 'coordinate x');
    finite(p.y, 'coordinate y');
    finite(p.z, 'coordinate z');
  }
  return signOf(-orient3d(
    a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,d.x,d.y,d.z,
  ));
}
