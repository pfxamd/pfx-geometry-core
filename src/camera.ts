import { EPSILON, finite, GeometryError, positive } from './errors.js';
import { lookAt4, mat4, multiply4, type Mat4 } from './matrix.js';
import { type Vec3, vec3 } from './vector.js';

export interface PerspectiveOptions {
  readonly fovYRadians: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
}
export interface Camera extends PerspectiveOptions {
  readonly view: Mat4;
  readonly projection: Mat4;
}
/** WebGL-compatible perspective projection with clip Z in [-1, 1]. */
export function perspective4(options: PerspectiveOptions): Mat4 {
  const { fovYRadians, aspect, near, far } = options;
  finite(fovYRadians, 'fovYRadians');
  positive(aspect, 'aspect');
  positive(near, 'near');
  positive(far, 'far');
  if (fovYRadians <= 0 || fovYRadians >= Math.PI || far <= near) {
    throw new GeometryError('INVALID_CAMERA', 'Require 0 < fovYRadians < PI and 0 < near < far');
  }
  const focal = 1 / Math.tan(fovYRadians / 2);
  const reciprocalRange = 1 / (near - far);
  return mat4([
    focal / aspect, 0, 0, 0,
    0, focal, 0, 0,
    0, 0, (far + near) * reciprocalRange, -1,
    0, 0, 2 * far * near * reciprocalRange, 0,
  ]);
}
export function perspectiveCamera(
  options: PerspectiveOptions & { readonly eye: Vec3; readonly target: Vec3; readonly up?: Vec3 },
): Camera {
  return Object.freeze({
    fovYRadians: options.fovYRadians,
    aspect: options.aspect,
    near: options.near,
    far: options.far,
    view: lookAt4(options.eye, options.target, options.up),
    projection: perspective4(options),
  });
}
export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly ndc: Vec3;
  readonly visible: boolean;
}
/** Top-left pixel origin; points outside frustum remain projectable with visible=false. */
export function projectPoint(
  point: Vec3,
  camera: Pick<Camera, 'view' | 'projection'>,
  viewport: { readonly width: number; readonly height: number },
): ProjectedPoint {
  positive(viewport.width, 'viewport.width');
  positive(viewport.height, 'viewport.height');
  const m = multiply4(camera.projection, camera.view);
  const x = m[0]! * point.x + m[4]! * point.y + m[8]! * point.z + m[12]!;
  const y = m[1]! * point.x + m[5]! * point.y + m[9]! * point.z + m[13]!;
  const z = m[2]! * point.x + m[6]! * point.y + m[10]! * point.z + m[14]!;
  const w = m[3]! * point.x + m[7]! * point.y + m[11]! * point.z + m[15]!;
  if (!Number.isFinite(w) || Math.abs(w) <= EPSILON) {
    throw new GeometryError('DEGENERATE_GEOMETRY', 'Cannot project onto camera plane (w = 0)');
  }
  const ndc = vec3(x / w, y / w, z / w);
  return Object.freeze({
    x: (ndc.x + 1) * 0.5 * viewport.width,
    y: (1 - ndc.y) * 0.5 * viewport.height,
    depth: (ndc.z + 1) * 0.5,
    ndc,
    visible: w > 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1,
  });
}
