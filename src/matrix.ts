import { EPSILON, finite, GeometryError } from './errors.js';
import { cross3, dot3, normalize3, subtract3, type Vec3, vec3 } from './vector.js';

/** Immutable column-major 4x4 matrix: column vectors, M * v. */
export type Mat4 = ReadonlyArray<number>;

export function mat4(values: ReadonlyArray<number>): Mat4 {
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new GeometryError('INVALID_MATRIX', 'Matrix must contain exactly 16 finite elements');
  }
  return Object.freeze([...values]);
}
export function identity4(): Mat4 {
  return mat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function multiply4(a: Mat4, b: Mat4): Mat4 {
  const left = mat4(a), right = mat4(b), result = Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let i = 0; i < 4; i++) sum += left[i * 4 + row]! * right[col * 4 + i]!;
      result[col * 4 + row] = sum;
    }
  }
  return mat4(result);
}
export function translation4(offset: Vec3): Mat4 {
  return mat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, offset.x, offset.y, offset.z, 1]);
}
export function scaling4(scale: Vec3): Mat4 {
  return mat4([scale.x, 0, 0, 0, 0, scale.y, 0, 0, 0, 0, scale.z, 0, 0, 0, 0, 1]);
}
export function rotationX4(radians: number): Mat4 {
  finite(radians, 'radians');
  const c = Math.cos(radians), s = Math.sin(radians);
  return mat4([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
export function rotationY4(radians: number): Mat4 {
  finite(radians, 'radians');
  const c = Math.cos(radians), s = Math.sin(radians);
  return mat4([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
export function rotationZ4(radians: number): Mat4 {
  finite(radians, 'radians');
  const c = Math.cos(radians), s = Math.sin(radians);
  return mat4([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function transformPoint4(matrix: Mat4, point: Vec3): Vec3 {
  const m = mat4(matrix);
  const w = m[3]! * point.x + m[7]! * point.y + m[11]! * point.z + m[15]!;
  if (!Number.isFinite(w) || Math.abs(w) <= EPSILON) {
    throw new GeometryError('DEGENERATE_GEOMETRY', 'Point has zero homogeneous w');
  }
  return vec3(
    (m[0]! * point.x + m[4]! * point.y + m[8]! * point.z + m[12]!) / w,
    (m[1]! * point.x + m[5]! * point.y + m[9]! * point.z + m[13]!) / w,
    (m[2]! * point.x + m[6]! * point.y + m[10]! * point.z + m[14]!) / w,
  );
}
/** Linear 3x3 only. Not suitable for nonuniform-scale normals or projective transforms. */
export function transformDirection4(matrix: Mat4, direction: Vec3): Vec3 {
  const m = mat4(matrix);
  return vec3(
    m[0]! * direction.x + m[4]! * direction.y + m[8]! * direction.z,
    m[1]! * direction.x + m[5]! * direction.y + m[9]! * direction.z,
    m[2]! * direction.x + m[6]! * direction.y + m[10]! * direction.z,
  );
}
/** Right-handed view matrix; camera looks toward local -Z. */
export function lookAt4(eye: Vec3, target: Vec3, up: Vec3 = vec3(0, 1, 0)): Mat4 {
  const z = normalize3(subtract3(eye, target));
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return mat4([
    x.x, y.x, z.x, 0,
    x.y, y.y, z.y, 0,
    x.z, y.z, z.z, 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
  ]);
}
