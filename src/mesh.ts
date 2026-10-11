import { EPSILON, finite, GeometryError, positive } from './errors.js';
import { type Vec3, vec3 } from './vector.js';

/** Indexed triangle mesh in double precision; render adapters may downcast for GPU. */
export interface TriangleMesh {
  readonly positions: ReadonlyArray<number>;
  readonly normals: ReadonlyArray<number>;
  readonly indices: ReadonlyArray<number>;
}
export interface MeshBounds {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly size: Vec3;
}
/** Basic layout/index/degeneracy validation; NOT a manifold/watertightness proof. */
export function validateMesh(mesh: TriangleMesh): void {
  const { positions, normals, indices } = mesh;
  if (
    positions.length < 9 || positions.length % 3 !== 0 ||
    normals.length !== positions.length || indices.length < 3 || indices.length % 3 !== 0 ||
    !positions.every(Number.isFinite) || !normals.every(Number.isFinite)
  ) {
    throw new GeometryError('INVALID_MESH', 'Invalid mesh buffer layout or non-finite coordinates');
  }
  const vertexCount = positions.length / 3;
  const get = (index: number, offset: number): number => positions[index * 3 + offset]!;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!, b = indices[i + 1]!, c = indices[i + 2]!;
    if (![a, b, c].every((n) => Number.isSafeInteger(n) && n >= 0 && n < vertexCount)) {
      throw new GeometryError('INVALID_MESH', 'Triangle index out of bounds');
    }
    const abx = get(b, 0) - get(a, 0), aby = get(b, 1) - get(a, 1), abz = get(b, 2) - get(a, 2);
    const acx = get(c, 0) - get(a, 0), acy = get(c, 1) - get(a, 1), acz = get(c, 2) - get(a, 2);
    const crossLength = Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    if (!Number.isFinite(crossLength) || crossLength <= EPSILON) {
      throw new GeometryError('DEGENERATE_GEOMETRY', 'Mesh contains a degenerate triangle');
    }
  }
}
export function boundsOfMesh(mesh: TriangleMesh): MeshBounds {
  validateMesh(mesh);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]!, y = mesh.positions[i + 1]!, z = mesh.positions[i + 2]!;
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return Object.freeze({
    min: vec3(minX, minY, minZ), max: vec3(maxX, maxY, maxZ),
    size: vec3(maxX - minX, maxY - minY, maxZ - minZ),
  });
}
/** Centered box: 24 flat-shaded vertices, 12 outward-facing triangles. */
export function createBox(width: number, height: number, depth: number): TriangleMesh {
  const x = positive(width, 'width') / 2, y = positive(height, 'height') / 2, z = positive(depth, 'depth') / 2;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const face = (normal: Vec3, corners: readonly Vec3[]): void => {
    const start = positions.length / 3;
    for (const corner of corners) {
      positions.push(corner.x, corner.y, corner.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  face(vec3(0, 0, 1), [vec3(-x, -y, z), vec3(x, -y, z), vec3(x, y, z), vec3(-x, y, z)]);
  face(vec3(0, 0, -1), [vec3(x, -y, -z), vec3(-x, -y, -z), vec3(-x, y, -z), vec3(x, y, -z)]);
  face(vec3(1, 0, 0), [vec3(x, -y, z), vec3(x, -y, -z), vec3(x, y, -z), vec3(x, y, z)]);
  face(vec3(-1, 0, 0), [vec3(-x, -y, -z), vec3(-x, -y, z), vec3(-x, y, z), vec3(-x, y, -z)]);
  face(vec3(0, 1, 0), [vec3(-x, y, z), vec3(x, y, z), vec3(x, y, -z), vec3(-x, y, -z)]);
  face(vec3(0, -1, 0), [vec3(-x, -y, -z), vec3(x, -y, -z), vec3(x, -y, z), vec3(-x, -y, z)]);
  const mesh: TriangleMesh = Object.freeze({
    positions: Object.freeze(positions), normals: Object.freeze(normals), indices: Object.freeze(indices),
  });
  validateMesh(mesh);
  return mesh;
}
export type LengthUnit = 'm' | 'cm' | 'mm';
const UNIT_TO_METER: Readonly<Record<LengthUnit, number>> = Object.freeze({ m: 1, cm: 0.01, mm: 0.001 });
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  finite(value, 'value');
  if (!(from in UNIT_TO_METER) || !(to in UNIT_TO_METER)) {
    throw new GeometryError('INVALID_DIMENSION', 'Unknown length unit');
  }
  return finite(value * UNIT_TO_METER[from] / UNIT_TO_METER[to], 'converted length');
}
