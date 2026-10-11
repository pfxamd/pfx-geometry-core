import { EPSILON, finite, GeometryError } from './errors.js';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Right-handed: +X right, +Y up, +Z toward viewer. */
export function vec3(x: number, y: number, z: number): Vec3 {
  return Object.freeze({ x: finite(x, 'x'), y: finite(y, 'y'), z: finite(z, 'z') });
}
export function add3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}
export function subtract3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function scale3(v: Vec3, scalar: number): Vec3 {
  finite(scalar, 'scalar');
  return vec3(v.x * scalar, v.y * scalar, v.z * scalar);
}
export function dot3(a: Vec3, b: Vec3): number {
  return finite(a.x * b.x + a.y * b.y + a.z * b.z, 'dot product');
}
export function cross3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
export function length3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}
export function distance3(a: Vec3, b: Vec3): number {
  return length3(subtract3(a, b));
}
export function normalize3(v: Vec3): Vec3 {
  const magnitude = length3(v);
  if (!Number.isFinite(magnitude) || magnitude <= EPSILON) {
    throw new GeometryError('DEGENERATE_GEOMETRY', 'Cannot normalize a zero or near-zero vector');
  }
  return scale3(v, 1 / magnitude);
}
export function angleBetween3(a: Vec3, b: Vec3): number {
  const aN = normalize3(a), bN = normalize3(b);
  return Math.acos(Math.max(-1, Math.min(1, dot3(aN, bN))));
}
