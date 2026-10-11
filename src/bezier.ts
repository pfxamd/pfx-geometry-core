import { finite, GeometryError } from './errors.js';
import { type Vec3, vec3 } from './vector.js';

export type CubicBezierControls = readonly [Vec3, Vec3, Vec3, Vec3];

function parameter(value: number, name: string): number {
  finite(value, name);
  if (value < 0 || value > 1)
    throw new GeometryError('INVALID_DIMENSION', `${name} must be between 0 and 1`);
  return value;
}
function checkControls(points: ReadonlyArray<Vec3>): void {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(p =>
    p !== null && typeof p === 'object' &&
    Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)))
    throw new GeometryError('INVALID_DIMENSION', 'Cubic Bezier requires four finite 3D control points');
}
function pointAt(points: CubicBezierControls, t: number): Vec3 {
  const a = 1 - t, a2 = a*a, t2 = t*t;
  const w0 = a2*a, w1 = 3*a2*t, w2 = 3*a*t2, w3 = t2*t;
  return vec3(
    points[0].x*w0 + points[1].x*w1 + points[2].x*w2 + points[3].x*w3,
    points[0].y*w0 + points[1].y*w1 + points[2].y*w2 + points[3].y*w3,
    points[0].z*w0 + points[1].z*w1 + points[2].z*w2 + points[3].z*w3,
  );
}
function derivativeAt(points: CubicBezierControls, t: number): Vec3 {
  const a = 1-t, w0 = 3*a*a, w1 = 6*a*t, w2 = 3*t*t;
  return vec3(
    (points[1].x-points[0].x)*w0 + (points[2].x-points[1].x)*w1 + (points[3].x-points[2].x)*w2,
    (points[1].y-points[0].y)*w0 + (points[2].y-points[1].y)*w1 + (points[3].y-points[2].y)*w2,
    (points[1].z-points[0].z)*w0 + (points[2].z-points[1].z)*w1 + (points[3].z-points[2].z)*w2,
  );
}
/** Exact cubic Bernstein evaluation, with t in [0,1] and no extrapolation. */
export function cubicBezier3(controls: CubicBezierControls, t: number): Vec3 {
  checkControls(controls);
  return pointAt(controls, parameter(t,'t'));
}
/** Analytical dP/dt; not normalized and may equal zero at a stationary point. */
export function cubicBezierDerivative3(controls: CubicBezierControls, t: number): Vec3 {
  checkControls(controls);
  return derivativeAt(controls, parameter(t,'t'));
}
/** Returns segments + 1 points, including endpoints, max 4096 segments. */
export function sampleCubicBezier3(controls: CubicBezierControls, segments: number): ReadonlyArray<Vec3> {
  checkControls(controls);
  if (!Number.isSafeInteger(segments) || segments < 1 || segments > 4096)
    throw new GeometryError('INVALID_DIMENSION', 'segments must be an integer in [1, 4096]');
  const samples: Vec3[] = [];
  for (let i=0;i<=segments;i++) samples.push(pointAt(controls,i/segments));
  return Object.freeze(samples);
}
/** Internal helpers: parameters and controls must be validated before evaluating. */
export const bezierInternal = Object.freeze({pointAt,derivativeAt,checkControls,parameter});
